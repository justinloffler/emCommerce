/**
 * Shipping rate calculation engine.
 *
 * Matches shipping zones by customer address, then evaluates
 * available shipping methods within the matched zone.
 */

import type { StorageCollection } from "emdash";
import type { ShippingZone, ShippingMethod, Address } from "../types.js";

export interface ShippingStorageAccess {
	shippingZones: StorageCollection<ShippingZone>;
}

export interface ShippingRateResult {
	zoneId: string;
	zoneName: string;
	methods: AvailableShippingMethod[];
}

export interface AvailableShippingMethod {
	id: string;
	name: string;
	cost: number;
	type: string;
}

/**
 * Get available shipping methods and their calculated costs.
 */
export async function getShippingRates(
	address: Address,
	orderWeight: number,
	orderSubtotal: number,
	hasFreeShippingCoupon: boolean,
	storage: ShippingStorageAccess,
): Promise<ShippingRateResult | null> {
	const zone = await findMatchingZone(address, storage);
	if (!zone) return null;

	const methods: AvailableShippingMethod[] = [];

	for (const method of zone.data.methods) {
		if (!method.enabled) continue;

		const cost = calculateMethodCost(method, orderWeight, orderSubtotal, hasFreeShippingCoupon);
		if (cost !== null) {
			methods.push({
				id: method.id,
				name: method.name,
				cost,
				type: method.type,
			});
		}
	}

	return {
		zoneId: zone.id,
		zoneName: zone.data.name,
		methods,
	};
}

/**
 * Calculate cost for a specific shipping method by its ID.
 *
 * Returns null when the method doesn't exist, is disabled, isn't available in
 * the zone matching this address, or isn't eligible for this order — callers
 * must treat that as an error rather than free shipping.
 */
export async function getShippingCost(
	methodId: string,
	address: Address,
	orderWeight: number,
	orderSubtotal: number,
	hasFreeShippingCoupon: boolean,
	storage: ShippingStorageAccess,
): Promise<{ cost: number; name: string } | null> {
	const zone = await findMatchingZone(address, storage);
	if (!zone) return null;

	const method = zone.data.methods.find((m) => m.id === methodId);
	if (!method || !method.enabled) return null;

	const cost = calculateMethodCost(method, orderWeight, orderSubtotal, hasFreeShippingCoupon);
	return cost === null ? null : { cost, name: method.name };
}

// ─── Zone Matching ──────────────────────────────────────────────

async function findMatchingZone(
	address: Address,
	storage: ShippingStorageAccess,
): Promise<{ id: string; data: ShippingZone } | null> {
	// Get all zones sorted by sortOrder
	const result = await storage.shippingZones.query({
		orderBy: { sortOrder: "asc" },
		limit: 100,
	});

	const country = address.countryCode.toUpperCase();
	const state = address.stateCode?.toUpperCase() ?? null;

	// Find the first zone whose regions match the address. Zones with no
	// regions ("Rest of World") are only used as a fallback below, so they
	// can't shadow a more specific zone regardless of sort order.
	for (const item of result.items) {
		const zone = item.data;
		if (zone.regions.length === 0) continue;

		const matches = zone.regions.some((region) => {
			if (region.countryCode.toUpperCase() !== country) return false;
			if (region.stateCode && region.stateCode.toUpperCase() !== state) return false;
			return true;
		});

		if (matches) {
			return { id: item.id, data: zone };
		}
	}

	// No zone found — try "Rest of World" (empty regions, typically last)
	for (const item of result.items) {
		if (item.data.regions.length === 0) {
			return { id: item.id, data: item.data };
		}
	}

	return null;
}

// ─── Method Cost Calculation ────────────────────────────────────

function calculateMethodCost(
	method: ShippingMethod,
	orderWeight: number,
	orderSubtotal: number,
	hasFreeShippingCoupon: boolean,
): number | null {
	switch (method.type) {
		case "flat_rate":
			return method.cost ?? 0;

		case "free_shipping": {
			if (hasFreeShippingCoupon) return 0;
			if (method.freeShippingMinimum !== null && orderSubtotal >= method.freeShippingMinimum) {
				return 0;
			}
			// Not eligible
			return null;
		}

		case "weight_based": {
			if (!method.weightRates) return null;
			const rate = method.weightRates.find(
				(r) =>
					orderWeight >= r.minWeight &&
					(r.maxWeight === null || orderWeight < r.maxWeight),
			);
			return rate?.cost ?? null;
		}

		case "price_based": {
			if (!method.priceRates) return null;
			const rate = method.priceRates.find(
				(r) =>
					orderSubtotal >= r.minPrice &&
					(r.maxPrice === null || orderSubtotal < r.maxPrice),
			);
			return rate?.cost ?? null;
		}

		default:
			return null;
	}
}
