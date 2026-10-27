/**
 * Cart route handlers.
 *
 * Public routes for storefront cart operations.
 */

import type { RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";
import { cartCalculationContext } from "./context.js";
import { ulid } from "ulidx";

import { CART_EXPIRY_DAYS } from "../constants.js";
import type {
	CartAddInput,
	CartCouponInput,
	CartGetInput,
	CartRemoveInput,
	CartSetAddressInput,
	CartSetShippingMethodInput,
	CartUpdateInput,
} from "../schemas/cart.js";
import type { Cart, CartItem, Coupon, Product, Variant } from "../types.js";
import { calculateCart, validateCoupon } from "../engine/cart-engine.js";

// ─── Storage Accessors ──────────────────────────────────────────

function carts(ctx: RouteContext): StorageCollection<Cart> {
	return ctx.storage.carts as StorageCollection<Cart>;
}

function products(ctx: RouteContext): StorageCollection<Product> {
	return ctx.storage.products as StorageCollection<Product>;
}

function variants(ctx: RouteContext): StorageCollection<Variant> {
	return ctx.storage.variants as StorageCollection<Variant>;
}

// ─── Helpers ────────────────────────────────────────────────────

async function getOrCreateCart(sessionId: string, ctx: RouteContext): Promise<{ id: string; cart: Cart }> {
	const result = await carts(ctx).query({
		where: { sessionId },
		limit: 1,
	});

	if (result.items.length > 0) {
		return { id: result.items[0].id, cart: result.items[0].data };
	}

	// Create new cart
	const now = new Date();
	const expiresAt = new Date(now.getTime() + CART_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
	const defaultCurrency = (await ctx.kv.get<string>("settings:defaultCurrency")) ?? "USD";

	const id = ulid();
	const cart: Cart = {
		sessionId,
		userId: null,
		items: [],
		couponCodes: [],
		shippingMethodId: null,
		shippingAddress: null,
		billingAddress: null,
		currencyCode: defaultCurrency,
		note: null,
		expiresAt: expiresAt.toISOString(),
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
	};

	await carts(ctx).put(id, cart);
	return { id, cart };
}

function buildCalculationContext(ctx: RouteContext) {
	return cartCalculationContext(ctx);
}

async function saveAndCalculate(id: string, cart: Cart, ctx: RouteContext) {
	cart.updatedAt = new Date().toISOString();
	await carts(ctx).put(id, cart);

	try {
		const calcCtx = buildCalculationContext(ctx);
		const summary = await calculateCart(cart, calcCtx);
		return { cartId: id, ...summary, couponCodes: cart.couponCodes };
	} catch (err) {
		ctx.log.error("Cart calculation failed", { error: String(err), stack: (err as Error).stack });
		// Return basic cart without computed prices on error
		return {
			cartId: id,
			items: cart.items.map((i) => ({ ...i, name: "", sku: null, unitPrice: 0, originalPrice: 0, lineTotal: 0, attributes: {}, imageId: null })),
			subtotal: 0, discountTotal: 0, discountBreakdown: [], shippingTotal: 0, taxTotal: 0, total: 0,
			itemCount: cart.items.reduce((s, i) => s + i.quantity, 0),
			currencyCode: cart.currencyCode, couponCodes: cart.couponCodes,
		};
	}
}

// ─── Get Cart ───────────────────────────────────────────────────

export async function cartGetHandler(ctx: RouteContext<CartGetInput>) {
	const { id, cart } = await getOrCreateCart(ctx.input.sessionId, ctx);

	const calcCtx = buildCalculationContext(ctx);
	const summary = await calculateCart(cart, calcCtx);

	return { cartId: id, ...summary, couponCodes: cart.couponCodes };
}

// ─── Add Item ───────────────────────────────────────────────────

export async function cartAddHandler(ctx: RouteContext<CartAddInput>) {
	const input = ctx.input;

	// Validate product exists and is active
	let product;
	try {
		product = await products(ctx).get(input.productId);
	} catch (e) {
		ctx.log.error("Failed to fetch product", { error: String(e) });
		throw PluginRouteError.badRequest("Failed to look up product");
	}
	if (!product || product.status !== "active") {
		throw PluginRouteError.notFound("Product not found or not available");
	}

	// Validate variant if provided
	if (input.variantId) {
		const variant = await variants(ctx).get(input.variantId);
		if (!variant || !variant.enabled || variant.productId !== input.productId) {
			throw PluginRouteError.notFound("Variant not found or not available");
		}
	}

	let cartData;
	try {
		cartData = await getOrCreateCart(input.sessionId, ctx);
	} catch (e) {
		ctx.log.error("Failed to get/create cart", { error: String(e) });
		throw PluginRouteError.badRequest("Failed to initialize cart");
	}
	const { id, cart } = cartData;

	// Check if item already in cart
	const existingIdx = cart.items.findIndex(
		(i) => i.productId === input.productId && i.variantId === (input.variantId ?? null),
	);

	if (existingIdx >= 0) {
		cart.items[existingIdx].quantity += input.quantity;
	} else {
		cart.items.push({
			productId: input.productId,
			variantId: input.variantId ?? null,
			quantity: input.quantity,
		});
	}

	return saveAndCalculate(id, cart, ctx);
}

// ─── Update Item Quantity ───────────────────────────────────────

export async function cartUpdateHandler(ctx: RouteContext<CartUpdateInput>) {
	const input = ctx.input;
	const { id, cart } = await getOrCreateCart(input.sessionId, ctx);

	const idx = cart.items.findIndex(
		(i) => i.productId === input.productId && i.variantId === (input.variantId ?? null),
	);

	if (idx < 0) {
		throw PluginRouteError.notFound("Item not in cart");
	}

	if (input.quantity === 0) {
		cart.items.splice(idx, 1);
	} else {
		cart.items[idx].quantity = input.quantity;
	}

	return saveAndCalculate(id, cart, ctx);
}

// ─── Remove Item ────────────────────────────────────────────────

export async function cartRemoveHandler(ctx: RouteContext<CartRemoveInput>) {
	const input = ctx.input;
	const { id, cart } = await getOrCreateCart(input.sessionId, ctx);

	cart.items = cart.items.filter(
		(i) => !(i.productId === input.productId && i.variantId === (input.variantId ?? null)),
	);

	return saveAndCalculate(id, cart, ctx);
}

// ─── Apply Coupon ───────────────────────────────────────────────

export async function cartApplyCouponHandler(ctx: RouteContext<CartCouponInput>) {
	const input = ctx.input;
	const { id, cart } = await getOrCreateCart(input.sessionId, ctx);

	// Check for duplicate
	if (cart.couponCodes.includes(input.code)) {
		throw PluginRouteError.conflict("Coupon already applied");
	}

	// Validate coupon
	const calcCtx = buildCalculationContext(ctx);
	const subtotal = cart.items.reduce((sum, i) => sum + i.quantity, 0); // rough estimate
	const validation = await validateCoupon(input.code, subtotal, calcCtx);
	if (!validation.valid) {
		throw PluginRouteError.badRequest(validation.reason ?? "Invalid coupon");
	}

	// Check stacking
	if (cart.couponCodes.length > 0) {
		const couponResult = await calcCtx.coupons.query({
			where: { code: input.code },
			limit: 1,
		});
		if (couponResult.items.length > 0 && !couponResult.items[0].data.allowStacking) {
			throw PluginRouteError.badRequest("This coupon cannot be combined with other coupons");
		}
	}

	cart.couponCodes.push(input.code);
	return saveAndCalculate(id, cart, ctx);
}

// ─── Remove Coupon ──────────────────────────────────────────────

export async function cartRemoveCouponHandler(ctx: RouteContext<CartCouponInput>) {
	const input = ctx.input;
	const { id, cart } = await getOrCreateCart(input.sessionId, ctx);

	cart.couponCodes = cart.couponCodes.filter((c) => c !== input.code);
	return saveAndCalculate(id, cart, ctx);
}

// ─── Set Address ────────────────────────────────────────────────

export async function cartSetAddressHandler(ctx: RouteContext<CartSetAddressInput>) {
	const input = ctx.input;
	const { id, cart } = await getOrCreateCart(input.sessionId, ctx);

	const address = {
		firstName: input.firstName,
		lastName: input.lastName,
		company: input.company ?? null,
		addressLine1: input.addressLine1,
		addressLine2: input.addressLine2 ?? null,
		city: input.city,
		stateCode: input.stateCode ?? null,
		postalCode: input.postalCode,
		countryCode: input.countryCode,
		phone: input.phone ?? null,
	};

	if (input.type === "billing") {
		cart.billingAddress = address;
	} else {
		cart.shippingAddress = address;
	}

	return saveAndCalculate(id, cart, ctx);
}

// ─── Set Shipping Method ────────────────────────────────────────

export async function cartSetShippingMethodHandler(ctx: RouteContext<CartSetShippingMethodInput>) {
	const input = ctx.input;
	const { id, cart } = await getOrCreateCart(input.sessionId, ctx);

	cart.shippingMethodId = input.shippingMethodId;
	return saveAndCalculate(id, cart, ctx);
}
