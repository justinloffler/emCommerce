/**
 * Checkout totals.
 *
 * Layers shipping and tax on top of a priced cart summary. Used both for the
 * storefront "quote" (shown before payment) and for order creation, so the
 * customer always pays exactly what they were shown.
 *
 * Tax rules:
 * - Each line is taxed using its product's tax class, falling back to the
 *   store's default class when the product has none (or an unknown one).
 * - Cart-level discounts are allocated across lines in proportion to their
 *   value before tax is calculated.
 * - With tax-inclusive pricing, tax is extracted from line totals and the
 *   order total is not increased.
 * - Shipping is taxed with the default class when `taxShipping` is enabled.
 */

import type { Address, TaxLine, TaxRule } from "../types.js";
import type { CartSummary } from "./cart-engine.js";
import { allocateProportionally } from "./currency.js";
import { computeTax, extractInclusiveTax, selectMostSpecificRules } from "./tax-engine.js";

export interface TotalsOptions {
	/** Address used to determine tax jurisdiction (shipping, falling back to billing) */
	taxAddress: Pick<Address, "countryCode" | "stateCode" | "postalCode"> | null;
	shippingCost: number;
	taxInclusive: boolean;
	taxShipping: boolean;
	defaultTaxClassId: string | null;
	/** Known tax class IDs; unknown product classes fall back to the default */
	taxClassIds: ReadonlySet<string>;
	/** Loads all tax rules for a class + country (results are cached per call) */
	loadRules: (taxClassId: string, countryCode: string) => Promise<TaxRule[]>;
}

export interface CheckoutTotals {
	subtotal: number;
	discountTotal: number;
	shippingTotal: number;
	taxTotal: number;
	/** Tax contained in the shipping charge */
	shippingTax: number;
	taxLines: TaxLine[];
	/** Tax per cart line, same order as `summary.items` */
	itemTax: number[];
	/** Effective tax class per cart line ("" when untaxed) */
	itemTaxClassIds: string[];
	taxInclusive: boolean;
	total: number;
}

export async function calculateCheckoutTotals(
	summary: CartSummary,
	opts: TotalsOptions,
): Promise<CheckoutTotals> {
	const { items } = summary;
	const discountTotal = Math.min(summary.discountTotal, summary.subtotal);
	const discountAlloc = allocateProportionally(
		discountTotal,
		items.map((i) => i.lineTotal),
	);
	const bases = items.map((item, idx) => Math.max(0, item.lineTotal - discountAlloc[idx]));

	const itemTaxClassIds = items.map((item) =>
		item.taxClassId && opts.taxClassIds.has(item.taxClassId)
			? item.taxClassId
			: (opts.defaultTaxClassId ?? ""),
	);

	const itemTax = items.map(() => 0);
	const lineMap = new Map<string, TaxLine>();
	let taxTotal = 0;
	let shippingTax = 0;

	const address = opts.taxAddress;
	if (address) {
		const country = address.countryCode.toUpperCase();
		const taxCtxBase = {
			countryCode: country,
			stateCode: address.stateCode ?? null,
			postalCode: address.postalCode ?? null,
		};
		const ruleCache = new Map<string, TaxRule[]>();
		const rulesFor = async (classId: string) => {
			if (!ruleCache.has(classId)) {
				const all = await opts.loadRules(classId, country);
				ruleCache.set(classId, selectMostSpecificRules(all, { ...taxCtxBase, taxClassId: classId }));
			}
			return ruleCache.get(classId)!;
		};

		const addLines = (lines: TaxLine[]) => {
			for (const line of lines) {
				const key = `${line.name}|${line.rate}`;
				const existing = lineMap.get(key);
				if (existing) existing.amount += line.amount;
				else lineMap.set(key, { ...line });
			}
		};

		// Group line bases by tax class
		const classes = new Map<string, number[]>();
		itemTaxClassIds.forEach((classId, idx) => {
			if (!classId) return;
			if (!classes.has(classId)) classes.set(classId, []);
			classes.get(classId)!.push(idx);
		});

		for (const [classId, indexes] of classes) {
			const rules = await rulesFor(classId);
			if (rules.length === 0) continue;
			const classBase = indexes.reduce((s, i) => s + bases[i], 0);
			const result = opts.taxInclusive
				? extractInclusiveTax(classBase, rules)
				: computeTax(classBase, rules);
			taxTotal += result.total;
			addLines(result.lines);
			const perItem = allocateProportionally(
				result.total,
				indexes.map((i) => bases[i]),
			);
			indexes.forEach((itemIdx, k) => {
				itemTax[itemIdx] = perItem[k];
			});
		}

		if (opts.taxShipping && opts.defaultTaxClassId && opts.shippingCost > 0) {
			const rules = await rulesFor(opts.defaultTaxClassId);
			const result = opts.taxInclusive
				? extractInclusiveTax(opts.shippingCost, rules)
				: computeTax(opts.shippingCost, rules);
			shippingTax = result.total;
			taxTotal += result.total;
			addLines(result.lines);
		}
	}

	const net = summary.subtotal - discountTotal + opts.shippingCost;
	return {
		subtotal: summary.subtotal,
		discountTotal,
		shippingTotal: opts.shippingCost,
		taxTotal,
		shippingTax,
		taxLines: [...lineMap.values()],
		itemTax,
		itemTaxClassIds,
		taxInclusive: opts.taxInclusive,
		total: opts.taxInclusive ? net : net + taxTotal,
	};
}
