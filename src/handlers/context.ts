/**
 * Shared helpers for building engine contexts from an emdash PluginContext.
 */

import type { HttpAccess, PluginContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";

import type { CartCalculationContext } from "../engine/cart-engine.js";
import type { PricingStorageAccess } from "../engine/pricing-engine.js";
import type { CatalogPriceRule, Coupon, Product, SpecificPrice, Variant } from "../types.js";

/** Typed access to the collections the pricing engine reads. */
export function pricingStorage(ctx: PluginContext): PricingStorageAccess {
	return {
		products: ctx.storage.products as StorageCollection<Product>,
		variants: ctx.storage.variants as StorageCollection<Variant>,
		specificPrices: ctx.storage["specific-prices"] as StorageCollection<SpecificPrice>,
		catalogPriceRules: ctx.storage["catalog-price-rules"] as StorageCollection<CatalogPriceRule>,
	};
}

/** Build the context the cart engine needs to price a cart. */
export function cartCalculationContext(
	ctx: PluginContext,
	overrides: Partial<Omit<CartCalculationContext, "pricingStorage" | "coupons">> = {},
): CartCalculationContext {
	return {
		pricingStorage: pricingStorage(ctx),
		coupons: ctx.storage.coupons as StorageCollection<Coupon>,
		customerGroupId: overrides.customerGroupId ?? null,
		customerId: overrides.customerId ?? null,
		countryCode: overrides.countryCode ?? null,
	};
}

/**
 * Return `ctx.http`, which emdash only provides when the plugin declares the
 * `network:request` capability. Throws a 500-class route error otherwise.
 */
export function requireHttp(ctx: PluginContext): HttpAccess {
	if (!ctx.http) {
		throw PluginRouteError.internal("Outbound HTTP is unavailable (network:request capability missing)");
	}
	return ctx.http;
}
