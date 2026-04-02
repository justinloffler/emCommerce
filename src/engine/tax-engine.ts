/**
 * Tax calculation engine.
 *
 * Matches tax rules from most-specific to least-specific:
 *   1. Country + State + Postal code pattern
 *   2. Country + State
 *   3. Country only
 *
 * Compound taxes are calculated on (subtotal + prior non-compound taxes).
 */

import type { StorageCollection } from "emdash";
import type { TaxRule, TaxLine } from "../types.js";
import { applyPercentageReduction } from "./currency.js";

export interface TaxStorageAccess {
	taxRules: StorageCollection<TaxRule>;
}

export interface TaxContext {
	taxClassId: string;
	countryCode: string;
	stateCode: string | null;
	postalCode: string | null;
}

/**
 * Calculate tax for a given amount and context.
 * Returns a breakdown of all applicable tax lines.
 */
export async function calculateTax(
	amount: number,
	ctx: TaxContext,
	storage: TaxStorageAccess,
): Promise<{ total: number; lines: TaxLine[] }> {
	const rules = await findMatchingRules(ctx, storage);

	if (rules.length === 0) {
		return { total: 0, lines: [] };
	}

	// Sort by priority (lower first), then separate compound vs non-compound
	rules.sort((a, b) => a.priority - b.priority);

	const nonCompound = rules.filter((r) => !r.compound);
	const compound = rules.filter((r) => r.compound);

	const lines: TaxLine[] = [];
	let totalTax = 0;

	// Non-compound taxes: calculated on the base amount
	for (const rule of nonCompound) {
		const taxAmount = applyPercentageReduction(amount, rule.rate);
		totalTax += taxAmount;
		lines.push({
			name: rule.name,
			rate: rule.rate,
			amount: taxAmount,
		});
	}

	// Compound taxes: calculated on (amount + non-compound taxes)
	const compoundBase = amount + totalTax;
	for (const rule of compound) {
		const taxAmount = applyPercentageReduction(compoundBase, rule.rate);
		totalTax += taxAmount;
		lines.push({
			name: rule.name,
			rate: rule.rate,
			amount: taxAmount,
		});
	}

	return { total: totalTax, lines };
}

/**
 * Find matching tax rules for the given context, ordered by specificity.
 * Returns the most specific match set.
 */
async function findMatchingRules(
	ctx: TaxContext,
	storage: TaxStorageAccess,
): Promise<TaxRule[]> {
	// Query all rules for this tax class and country
	const result = await storage.taxRules.query({
		where: { taxClassId: ctx.taxClassId, countryCode: ctx.countryCode },
		limit: 100,
	});

	const allRules = result.items.map((i) => i.data);

	// Try most specific first: country + state + postal code
	if (ctx.stateCode && ctx.postalCode) {
		const matched = allRules.filter(
			(r) =>
				r.stateCode === ctx.stateCode &&
				r.postalCodePattern &&
				matchPostalCode(ctx.postalCode!, r.postalCodePattern),
		);
		if (matched.length > 0) return matched;
	}

	// Country + state
	if (ctx.stateCode) {
		const matched = allRules.filter(
			(r) => r.stateCode === ctx.stateCode && !r.postalCodePattern,
		);
		if (matched.length > 0) return matched;
	}

	// Country only
	const matched = allRules.filter((r) => !r.stateCode && !r.postalCodePattern);
	return matched;
}

/**
 * Match a postal code against a pattern.
 * Supports: exact match, wildcard (*), and ranges (12300-12399).
 */
function matchPostalCode(code: string, pattern: string): boolean {
	// Exact match
	if (code === pattern) return true;

	// Wildcard: "123*" matches "12345"
	if (pattern.endsWith("*")) {
		return code.startsWith(pattern.slice(0, -1));
	}

	// Range: "12300-12399"
	if (pattern.includes("-")) {
		const [min, max] = pattern.split("-");
		return code >= min && code <= max;
	}

	return false;
}
