/**
 * Tax calculation engine.
 *
 * Matches tax rules from most-specific to least-specific:
 *   1. Country + State + Postal code pattern
 *   2. Country + State
 *   3. Country only
 *
 * Compound taxes are calculated on (amount + prior non-compound taxes).
 *
 * Supports both tax-exclusive pricing (tax is added on top) and
 * tax-inclusive pricing (tax is extracted from the gross amount).
 */

import type { StorageCollection } from "emdash";
import type { TaxRule, TaxLine } from "../types.js";
import { applyRateRounded } from "./currency.js";

export interface TaxStorageAccess {
	taxRules: StorageCollection<TaxRule>;
}

export interface TaxContext {
	taxClassId: string;
	countryCode: string;
	stateCode: string | null;
	postalCode: string | null;
}

export interface TaxResult {
	total: number;
	lines: TaxLine[];
}

/**
 * Calculate tax to add on top of a tax-exclusive amount.
 */
export async function calculateTax(
	amount: number,
	ctx: TaxContext,
	storage: TaxStorageAccess,
): Promise<TaxResult> {
	const rules = await findMatchingRules(ctx, storage);
	return computeTax(amount, rules);
}

/**
 * Pure tax computation for a tax-exclusive amount and a set of matched rules.
 */
export function computeTax(amount: number, rules: TaxRule[]): TaxResult {
	if (rules.length === 0 || amount <= 0) return { total: 0, lines: [] };

	const sorted = [...rules].sort((a, b) => a.priority - b.priority);
	const nonCompound = sorted.filter((r) => !r.compound);
	const compound = sorted.filter((r) => r.compound);

	const lines: TaxLine[] = [];
	let totalTax = 0;

	// Non-compound taxes: calculated on the base amount
	for (const rule of nonCompound) {
		const taxAmount = applyRateRounded(amount, rule.rate);
		totalTax += taxAmount;
		lines.push({ name: rule.name, rate: rule.rate, amount: taxAmount });
	}

	// Compound taxes: calculated on (amount + non-compound taxes)
	const compoundBase = amount + totalTax;
	for (const rule of compound) {
		const taxAmount = applyRateRounded(compoundBase, rule.rate);
		totalTax += taxAmount;
		lines.push({ name: rule.name, rate: rule.rate, amount: taxAmount });
	}

	return { total: totalTax, lines };
}

/**
 * Extract the tax contained in a tax-inclusive (gross) amount.
 *
 * Finds the net amount N such that N + tax(N) = gross, then reports the
 * tax lines for N. Any rounding difference is absorbed by the largest line
 * so that net + tax always equals the gross amount exactly.
 */
export function extractInclusiveTax(gross: number, rules: TaxRule[]): TaxResult & { net: number } {
	if (rules.length === 0 || gross <= 0) return { total: 0, lines: [], net: gross };

	// Effective combined rate (handles compound rules) measured on a large base
	const PROBE = 100_000_000;
	const probeTax = computeTax(PROBE, rules).total;
	const net = Math.round((gross * PROBE) / (PROBE + probeTax));

	const { lines } = computeTax(net, rules);
	const expectedTax = gross - net;
	const lineSum = lines.reduce((s, l) => s + l.amount, 0);
	const diff = expectedTax - lineSum;
	if (diff !== 0 && lines.length > 0) {
		let largest = 0;
		for (let i = 1; i < lines.length; i++) {
			if (lines[i].amount > lines[largest].amount) largest = i;
		}
		lines[largest] = { ...lines[largest], amount: lines[largest].amount + diff };
	}

	return { total: expectedTax, lines, net };
}

/**
 * Find matching tax rules for the given context, ordered by specificity.
 * Returns the most specific match set.
 */
export async function findMatchingRules(
	ctx: TaxContext,
	storage: TaxStorageAccess,
): Promise<TaxRule[]> {
	const result = await storage.taxRules.query({
		where: { taxClassId: ctx.taxClassId, countryCode: ctx.countryCode },
		limit: 100,
	});
	return selectMostSpecificRules(
		result.items.map((i) => i.data),
		ctx,
	);
}

/**
 * Pure rule selection: most specific tier wins.
 */
export function selectMostSpecificRules(allRules: TaxRule[], ctx: TaxContext): TaxRule[] {
	const normalizedState = ctx.stateCode?.toUpperCase() ?? null;
	const stateMatches = (r: TaxRule) => r.stateCode?.toUpperCase() === normalizedState;

	// Country + state + postal code
	if (normalizedState && ctx.postalCode) {
		const matched = allRules.filter(
			(r) =>
				stateMatches(r) &&
				r.postalCodePattern &&
				matchPostalCode(ctx.postalCode!, r.postalCodePattern),
		);
		if (matched.length > 0) return matched;
	}

	// Country + postal code (no state on the rule)
	if (ctx.postalCode) {
		const matched = allRules.filter(
			(r) => !r.stateCode && r.postalCodePattern && matchPostalCode(ctx.postalCode!, r.postalCodePattern),
		);
		if (matched.length > 0) return matched;
	}

	// Country + state
	if (normalizedState) {
		const matched = allRules.filter((r) => stateMatches(r) && !r.postalCodePattern);
		if (matched.length > 0) return matched;
	}

	// Country only
	return allRules.filter((r) => !r.stateCode && !r.postalCodePattern);
}

/**
 * Match a postal code against a pattern.
 * Supports: exact match, wildcard (*), and ranges (12300-12399).
 */
export function matchPostalCode(code: string, pattern: string): boolean {
	const c = code.trim().toUpperCase();
	const p = pattern.trim().toUpperCase();

	if (c === p) return true;

	// Wildcard: "123*" matches "12345"
	if (p.endsWith("*")) {
		return c.startsWith(p.slice(0, -1));
	}

	// Range: "12300-12399" (numeric when both ends are numeric)
	if (p.includes("-")) {
		const [min, max] = p.split("-").map((s) => s.trim());
		if (/^\d+$/.test(min) && /^\d+$/.test(max) && /^\d+$/.test(c)) {
			const n = Number(c);
			return n >= Number(min) && n <= Number(max);
		}
		return c >= min && c <= max;
	}

	return false;
}
