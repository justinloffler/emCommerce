/**
 * Shipping zone CRUD and rate calculation route handlers.
 */

import type { RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";
import { ulid } from "ulidx";

import type {
	ShippingZoneCreateInput, ShippingZoneUpdateInput,
	ShippingZoneDeleteInput, ShippingZoneListInput, ShippingRatesInput,
} from "../schemas/shipping.js";
import type { ShippingZone } from "../types.js";
import { getShippingRates } from "../engine/shipping-engine.js";
import { listShippingProviders } from "../payments/shipping-registry.js";

function zones(ctx: RouteContext): StorageCollection<ShippingZone> {
	return ctx.storage["shipping-zones"] as StorageCollection<ShippingZone>;
}

export async function shippingZoneListHandler(ctx: RouteContext<ShippingZoneListInput>) {
	const result = await zones(ctx).query({
		orderBy: { sortOrder: "asc" },
		limit: ctx.input.limit,
		cursor: ctx.input.cursor,
	});
	return { items: result.items.map((i) => ({ id: i.id, ...i.data })), hasMore: result.hasMore, cursor: result.cursor };
}

export async function shippingZoneCreateHandler(ctx: RouteContext<ShippingZoneCreateInput>) {
	const input = ctx.input;
	const now = new Date().toISOString();
	const id = ulid();
	const zone: ShippingZone = {
		name: input.name, regions: input.regions ?? [], methods: input.methods ?? [],
		sortOrder: input.sortOrder ?? 0, createdAt: now, updatedAt: now,
	};
	await zones(ctx).put(id, zone);
	return { id, ...zone };
}

export async function shippingZoneUpdateHandler(ctx: RouteContext<ShippingZoneUpdateInput>) {
	const input = ctx.input;
	const existing = await zones(ctx).get(input.id);
	if (!existing) throw PluginRouteError.notFound("Shipping zone not found");

	const updated: ShippingZone = {
		...existing,
		name: input.name ?? existing.name,
		regions: input.regions ?? existing.regions,
		methods: input.methods ?? existing.methods,
		sortOrder: input.sortOrder ?? existing.sortOrder,
		updatedAt: new Date().toISOString(),
	};
	await zones(ctx).put(input.id, updated);
	return { id: input.id, ...updated };
}

export async function shippingZoneDeleteHandler(ctx: RouteContext<ShippingZoneDeleteInput>) {
	const existing = await zones(ctx).get(ctx.input.id);
	if (!existing) throw PluginRouteError.notFound("Shipping zone not found");
	await zones(ctx).delete(ctx.input.id);
	return { deleted: true };
}

export async function shippingRatesHandler(ctx: RouteContext<ShippingRatesInput>) {
	const input = ctx.input;
	const address = {
		firstName: "", lastName: "", company: null,
		addressLine1: "", addressLine2: null, city: input.city ?? "",
		stateCode: input.stateCode ?? null, postalCode: input.postalCode,
		countryCode: input.countryCode, phone: null,
	};

	// Flat-rate methods from stored shipping zones
	const zoneResult = await getShippingRates(
		address, input.weight, input.subtotal, false,
		{ shippingZones: zones(ctx) },
	);

	const methods = zoneResult?.methods ?? [];

	// Augment with live carrier rates from external providers
	const providers = listShippingProviders();
	for (const provider of providers) {
		try {
			const liveRates = await provider.getRates({
				toAddress: {
					countryCode: input.countryCode,
					stateCode: input.stateCode ?? null,
					postalCode: input.postalCode,
					city: input.city ?? "",
				},
				weight: input.weight,
				subtotal: input.subtotal,
			});
			for (const rate of liveRates) {
				methods.push({
					id: rate.id,
					name: `${rate.carrier} — ${rate.service}${rate.estimatedDays ? ` (${rate.estimatedDays}d)` : ""}`,
					cost: rate.amount,
					type: "live_rate",
				});
			}
		} catch {
			// Provider errors are non-fatal — continue with remaining methods
		}
	}

	if (methods.length === 0 && !zoneResult) {
		return { zoneId: null, zoneName: "No zone found", methods: [] };
	}

	return {
		zoneId: zoneResult?.zoneId ?? null,
		zoneName: zoneResult?.zoneName ?? "Live Rates",
		methods,
	};
}

/**
 * Public route: return client-side publishable keys for Stripe + PayPal.
 * Only exposes keys safe to ship to the browser.
 */
export async function paymentConfigHandler(ctx: RouteContext) {
	const [stripePublishableKey, paypalClientId] = await Promise.all([
		ctx.kv.get("settings:stripePublishableKey"),
		ctx.kv.get("settings:paypalClientId"),
	]);
	return {
		stripePublishableKey: stripePublishableKey ?? null,
		paypalClientId: paypalClientId ?? null,
	};
}
