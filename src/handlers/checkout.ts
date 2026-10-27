/**
 * Checkout route handlers.
 *
 * Creates orders, initiates payment, and confirms after client-side payment completion.
 */

import type { RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";
import { cartCalculationContext, requireHttp } from "./context.js";
import { ulid } from "ulidx";

import type { CheckoutCreateInput, CheckoutConfirmInput } from "../schemas/checkout.js";
import type { Cart, Coupon, Order, Product, Variant, TaxRule, ShippingZone } from "../types.js";
import { calculateCart } from "../engine/cart-engine.js";
import { calculateTax } from "../engine/tax-engine.js";
import { getShippingCost } from "../engine/shipping-engine.js";
import { reserveStock } from "../engine/inventory.js";
import { initGateways, getGateway } from "../payments/gateway-registry.js";

function carts(ctx: RouteContext): StorageCollection<Cart> {
	return ctx.storage.carts as StorageCollection<Cart>;
}
function orders(ctx: RouteContext): StorageCollection<Order> {
	return ctx.storage.orders as StorageCollection<Order>;
}

/**
 * Create an order from a cart and initiate payment.
 * Returns the payment client secret for frontend completion.
 */
export async function checkoutCreateHandler(ctx: RouteContext<CheckoutCreateInput>) {
	const input = ctx.input;

	// Find cart
	const cartResult = await carts(ctx).query({ where: { sessionId: input.sessionId }, limit: 1 });
	if (cartResult.items.length === 0) throw PluginRouteError.notFound("Cart not found");
	const cartId = cartResult.items[0].id;
	const cart = cartResult.items[0].data;

	if (cart.items.length === 0) throw PluginRouteError.badRequest("Cart is empty");

	// Calculate cart totals
	const calcCtx = cartCalculationContext(ctx, { countryCode: input.billingAddress.countryCode });
	const cartSummary = await calculateCart(cart, calcCtx);

	// Calculate shipping
	const shippingAddress = input.shippingAddress ?? input.billingAddress;
	const shippingCost = await getShippingCost(
		input.shippingMethodId,
		shippingAddress,
		0, // weight calculated from items
		cartSummary.subtotal,
		cart.couponCodes.length > 0, // simplified free shipping check
		{ shippingZones: ctx.storage["shipping-zones"] as StorageCollection<ShippingZone> },
	);

	// Calculate tax
	let taxTotal = 0;
	const taxLines: Order["taxBreakdown"] = [];
	const defaultTaxClass = await getDefaultTaxClassId(ctx);

	if (defaultTaxClass) {
		const taxResult = await calculateTax(
			cartSummary.subtotal - cartSummary.discountTotal,
			{
				taxClassId: defaultTaxClass,
				countryCode: shippingAddress.countryCode,
				stateCode: shippingAddress.stateCode,
				postalCode: shippingAddress.postalCode,
			},
			{ taxRules: ctx.storage["tax-rules"] as StorageCollection<TaxRule> },
		);
		taxTotal = taxResult.total;
		taxLines.push(...taxResult.lines);
	}

	const total = cartSummary.subtotal - cartSummary.discountTotal + shippingCost + taxTotal;

	// Reserve stock
	const stockResult = await reserveStock(cart.items, {
		products: ctx.storage.products as StorageCollection<Product>,
		variants: ctx.storage.variants as StorageCollection<Variant>,
	});
	if (!stockResult.success) {
		throw PluginRouteError.conflict("Insufficient stock for some items");
	}

	// Generate order number
	const orderNumber = generateOrderNumber();

	// Create order
	const now = new Date().toISOString();
	const orderId = ulid();
	const order: Order = {
		orderNumber,
		status: "pending_payment",
		customerId: null,
		customerEmail: input.email,
		customerNote: input.customerNote ?? null,
		billingAddress: input.billingAddress,
		shippingAddress: input.shippingAddress,
		items: cartSummary.items.map((item) => ({
			productId: item.productId,
			variantId: item.variantId,
			name: item.name,
			sku: item.sku,
			quantity: item.quantity,
			unitPrice: item.unitPrice,
			originalPrice: item.originalPrice,
			total: item.lineTotal,
			taxAmount: 0,
			taxClassId: defaultTaxClass ?? "",
			attributes: item.attributes,
		})),
		subtotal: cartSummary.subtotal,
		shippingTotal: shippingCost,
		shippingMethod: input.shippingMethodId,
		taxTotal,
		taxBreakdown: taxLines,
		discountTotal: cartSummary.discountTotal,
		discountBreakdown: cartSummary.discountBreakdown,
		total,
		currencyCode: cart.currencyCode,
		paymentMethod: input.paymentGateway,
		paymentIntentId: null,
		paymentStatus: "pending",
		refunds: [],
		adminNotes: [],
		ipAddress: null,
		customFields: {},
		createdAt: now,
		updatedAt: now,
		completedAt: null,
	};

	await orders(ctx).put(orderId, order);

	// Initialize payment gateway and create intent
	initGateways({ http: requireHttp(ctx), kv: ctx.kv });
	const gateway = getGateway(input.paymentGateway);
	if (!gateway) throw PluginRouteError.badRequest(`Unknown payment gateway: ${input.paymentGateway}`);

	const defaultCurrency = (await ctx.kv.get<string>("settings:defaultCurrency")) ?? "USD";
	const paymentResult = await gateway.createPaymentIntent({
		amount: total,
		currency: defaultCurrency,
		orderId,
		customerEmail: input.email,
		metadata: { orderNumber },
	});

	// Update order with payment intent ID
	order.paymentIntentId = paymentResult.intentId;
	order.paymentStatus = "authorized";
	await orders(ctx).put(orderId, order);

	return {
		orderId,
		orderNumber,
		total,
		clientSecret: paymentResult.clientSecret,
		paymentGateway: input.paymentGateway,
	};
}

/**
 * Confirm payment after client-side completion.
 * Transitions order to "processing" and clears the cart.
 */
export async function checkoutConfirmHandler(ctx: RouteContext<CheckoutConfirmInput>) {
	const input = ctx.input;

	const order = await orders(ctx).get(input.orderId);
	if (!order) throw PluginRouteError.notFound("Order not found");
	if (order.status !== "pending_payment") {
		throw PluginRouteError.badRequest("Order is not pending payment");
	}

	// Update order status
	const now = new Date().toISOString();
	order.status = "processing";
	order.paymentStatus = "captured";
	order.paymentIntentId = input.paymentIntentId;
	order.updatedAt = now;
	order.adminNotes.push({
		id: ulid(),
		content: "Payment confirmed. Order is now processing.",
		isSystem: true,
		createdAt: now,
	});

	await orders(ctx).put(input.orderId, order);

	// Clear the cart (find by customer email or session)
	// The cart cleanup is best-effort
	const cartResult = await carts(ctx).query({ limit: 100 });
	for (const cartItem of cartResult.items) {
		if (cartItem.data.userId === order.customerId || !order.customerId) {
			await carts(ctx).delete(cartItem.id);
			break;
		}
	}

	return {
		orderId: input.orderId,
		orderNumber: order.orderNumber,
		status: order.status,
	};
}

// ─── Helpers ────────────────────────────────────────────────────

function generateOrderNumber(): string {
	const now = new Date();
	const year = now.getFullYear().toString().slice(-2);
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const random = Math.floor(Math.random() * 100000).toString().padStart(5, "0");
	return `EM-${year}${month}-${random}`;
}

async function getDefaultTaxClassId(ctx: RouteContext): Promise<string | null> {
	// SQLite can't bind booleans — query all, filter in-memory
	const result = await (ctx.storage["tax-classes"] as StorageCollection).query({ limit: 50 });
	const def = result.items.find((i) => (i.data as any).isDefault);
	return def?.id ?? null;
}
