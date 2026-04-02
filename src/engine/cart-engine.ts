/**
 * Cart calculation engine.
 *
 * Takes a cart + context and produces a fully computed cart summary
 * with resolved prices, tax, shipping, and coupon discounts.
 * Pure function — no side effects.
 */

import type { StorageCollection } from "emdash";
import type {
	Cart,
	CartItem,
	Product,
	Variant,
	Coupon,
	DiscountLine,
} from "../types.js";
import type { PricingStorageAccess } from "./pricing-engine.js";
import { resolvePrice } from "./pricing-engine.js";
import { applyPercentageReduction } from "./currency.js";

// ─── Cart Summary ───────────────────────────────────────────────

export interface CartSummary {
	items: CartItemSummary[];
	subtotal: number;
	discountTotal: number;
	discountBreakdown: DiscountLine[];
	shippingTotal: number;
	taxTotal: number;
	total: number;
	itemCount: number;
	currencyCode: string;
}

export interface CartItemSummary {
	productId: string;
	variantId: string | null;
	name: string;
	sku: string | null;
	quantity: number;
	unitPrice: number;
	originalPrice: number;
	lineTotal: number;
	attributes: Record<string, string>;
	imageId: string | null;
}

export interface CartCalculationContext {
	pricingStorage: PricingStorageAccess;
	coupons: StorageCollection<Coupon>;
	customerGroupId: string | null;
	customerId: string | null;
	countryCode: string | null;
}

// ─── Calculate Cart ─────────────────────────────────────────────

/**
 * Compute the full cart summary with resolved prices and coupon discounts.
 * Tax and shipping are calculated by their respective engines and added externally.
 */
export async function calculateCart(
	cart: Cart,
	ctx: CartCalculationContext,
): Promise<CartSummary> {
	const now = new Date();
	const items: CartItemSummary[] = [];
	let subtotal = 0;

	// Resolve price for each item
	for (const cartItem of cart.items) {
		const product = await ctx.pricingStorage.products.get(cartItem.productId);
		if (!product) continue;

		let variantData: Variant | null = null;
		if (cartItem.variantId) {
			variantData = await ctx.pricingStorage.variants.get(cartItem.variantId) ?? null;
		}

		const resolved = await resolvePrice(
			{
				productId: cartItem.productId,
				variantId: cartItem.variantId,
				quantity: cartItem.quantity,
				customerId: ctx.customerId,
				customerGroupId: ctx.customerGroupId,
				countryCode: ctx.countryCode ?? cart.shippingAddress?.countryCode ?? null,
				currencyCode: cart.currencyCode,
				date: now,
			},
			ctx.pricingStorage,
		);

		const lineTotal = resolved.unitPrice * cartItem.quantity;
		subtotal += lineTotal;

		items.push({
			productId: cartItem.productId,
			variantId: cartItem.variantId,
			name: product.name,
			sku: variantData?.sku ?? product.sku,
			quantity: cartItem.quantity,
			unitPrice: resolved.unitPrice,
			originalPrice: resolved.originalPrice,
			lineTotal,
			attributes: variantData?.attributes ?? {},
			imageId: variantData?.imageId ?? (product.images[0] ?? null),
		});
	}

	// Apply coupons
	const { discountTotal, discountBreakdown } = await applyCoupons(
		cart.couponCodes,
		items,
		subtotal,
		ctx,
	);

	const itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);

	// Tax and shipping are 0 here — they're layered on by checkout
	return {
		items,
		subtotal,
		discountTotal,
		discountBreakdown,
		shippingTotal: 0,
		taxTotal: 0,
		total: Math.max(0, subtotal - discountTotal),
		itemCount,
		currencyCode: cart.currencyCode,
	};
}

// ─── Coupon Application ─────────────────────────────────────────

async function applyCoupons(
	codes: string[],
	items: CartItemSummary[],
	subtotal: number,
	ctx: CartCalculationContext,
): Promise<{ discountTotal: number; discountBreakdown: DiscountLine[] }> {
	if (codes.length === 0) {
		return { discountTotal: 0, discountBreakdown: [] };
	}

	const now = new Date().toISOString();
	let discountTotal = 0;
	const discountBreakdown: DiscountLine[] = [];

	for (const code of codes) {
		const result = await ctx.coupons.query({
			where: { code },
			limit: 1,
		});
		if (result.items.length === 0) continue;

		const coupon = result.items[0].data;

		// Validate coupon is active
		if (!coupon.enabled) continue;
		if (coupon.startDate && now < coupon.startDate) continue;
		if (coupon.endDate && now > coupon.endDate) continue;
		if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) continue;
		if (coupon.minimumAmount !== null && subtotal < coupon.minimumAmount) continue;

		let discount = 0;

		switch (coupon.type) {
			case "percentage": {
				let applicableTotal = subtotal;
				if (coupon.productIds || coupon.categoryIds) {
					applicableTotal = filterApplicableTotal(items, coupon);
				}
				discount = applyPercentageReduction(applicableTotal, coupon.value);
				if (coupon.maximumDiscount !== null) {
					discount = Math.min(discount, coupon.maximumDiscount);
				}
				break;
			}
			case "fixed_cart": {
				discount = Math.min(coupon.value, subtotal);
				break;
			}
			case "fixed_product": {
				for (const item of items) {
					if (matchesCouponRestrictions(item, coupon)) {
						discount += coupon.value * item.quantity;
					}
				}
				discount = Math.min(discount, subtotal);
				break;
			}
			case "free_shipping": {
				// Handled externally in shipping calculation
				break;
			}
			case "bogo": {
				// Buy one get one: for each pair of qualifying items, discount the cheaper one
				const qualifying = items.filter((i) => matchesCouponRestrictions(i, coupon));
				for (const item of qualifying) {
					const freeQty = Math.floor(item.quantity / 2);
					discount += item.unitPrice * freeQty;
				}
				break;
			}
		}

		if (discount > 0) {
			discountTotal += discount;
			discountBreakdown.push({
				source: "coupon",
				name: code,
				amount: discount,
			});
		}
	}

	return { discountTotal, discountBreakdown };
}

function matchesCouponRestrictions(item: CartItemSummary, coupon: Coupon): boolean {
	if (coupon.productIds && !coupon.productIds.includes(item.productId)) return false;
	// Category restriction would require product lookup — simplified for now
	return true;
}

function filterApplicableTotal(items: CartItemSummary[], coupon: Coupon): number {
	return items
		.filter((item) => matchesCouponRestrictions(item, coupon))
		.reduce((sum, item) => sum + item.lineTotal, 0);
}

// ─── Cart Validation ────────────────────────────────────────────

/**
 * Validate a coupon code can be applied to a cart.
 */
export async function validateCoupon(
	code: string,
	subtotal: number,
	ctx: CartCalculationContext,
): Promise<{ valid: boolean; reason?: string }> {
	const result = await ctx.coupons.query({
		where: { code },
		limit: 1,
	});

	if (result.items.length === 0) {
		return { valid: false, reason: "Coupon code not found" };
	}

	const coupon = result.items[0].data;
	const now = new Date().toISOString();

	if (!coupon.enabled) return { valid: false, reason: "Coupon is not active" };
	if (coupon.startDate && now < coupon.startDate) return { valid: false, reason: "Coupon is not yet valid" };
	if (coupon.endDate && now > coupon.endDate) return { valid: false, reason: "Coupon has expired" };
	if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
		return { valid: false, reason: "Coupon usage limit reached" };
	}
	if (coupon.minimumAmount !== null && subtotal < coupon.minimumAmount) {
		return { valid: false, reason: "Order does not meet minimum amount" };
	}

	return { valid: true };
}
