/**
 * Pricing Engine — the core differentiator of emCommerce.
 *
 * Resolves the final unit price for a product given full context:
 * customer, group, country, currency, quantity, and date.
 *
 * Resolution order:
 * 1. Specific prices (per-product rules) — sorted by priority ASC,
 *    ties broken by specificity score.
 * 2. Catalog price rules (bulk rules with condition groups).
 * 3. Base price from product/variant.
 *
 * All functions are pure — context in, price out.
 */

import type { StorageCollection } from "emdash";

import { BASIS_POINTS_100_PERCENT } from "../constants.js";
import type {
	CatalogPriceRule,
	ConditionGroup,
	PriceCondition,
	PriceResolutionContext,
	Product,
	QuantityBreak,
	ResolvedPrice,
	SpecificPrice,
	Variant,
} from "../types.js";
import { applyPercentageReduction, percentageOf } from "./currency.js";

// ─── Main Resolution ────────────────────────────────────────────

export interface PricingStorageAccess {
	products: StorageCollection<Product>;
	variants: StorageCollection<Variant>;
	specificPrices: StorageCollection<SpecificPrice>;
	catalogPriceRules: StorageCollection<CatalogPriceRule>;
}

/**
 * Resolve the final price for a product/variant in context.
 */
export async function resolvePrice(
	ctx: PriceResolutionContext,
	storage: PricingStorageAccess,
): Promise<ResolvedPrice> {
	// Get base price
	const basePrice = await getBasePrice(ctx.productId, ctx.variantId, storage);
	if (basePrice === null) {
		return {
			unitPrice: 0,
			originalPrice: 0,
			discountAmount: 0,
			discountSource: null,
			ruleId: null,
			quantityBreaks: [],
		};
	}

	// 1. Try specific prices
	const specificResult = await resolveSpecificPrice(ctx, basePrice, storage);
	if (specificResult) {
		const quantityBreaks = await getQuantityBreaks(ctx, basePrice, storage);
		return {
			...specificResult,
			quantityBreaks,
		};
	}

	// 2. Try catalog price rules
	const product = await storage.products.get(ctx.productId);
	if (product) {
		const catalogResult = await resolveCatalogPrice(ctx, basePrice, product, storage);
		if (catalogResult) {
			const quantityBreaks = await getQuantityBreaks(ctx, basePrice, storage);
			return {
				...catalogResult,
				quantityBreaks,
			};
		}
	}

	// 3. Base price
	const quantityBreaks = await getQuantityBreaks(ctx, basePrice, storage);
	return {
		unitPrice: basePrice,
		originalPrice: basePrice,
		discountAmount: 0,
		discountSource: null,
		ruleId: null,
		quantityBreaks,
	};
}

// ─── Base Price ─────────────────────────────────────────────────

async function getBasePrice(
	productId: string,
	variantId: string | null,
	storage: PricingStorageAccess,
): Promise<number | null> {
	if (variantId) {
		const variant = await storage.variants.get(variantId);
		if (variant && variant.price !== null) return variant.price;
	}
	const product = await storage.products.get(productId);
	return product?.price ?? null;
}

// ─── Specific Price Resolution ──────────────────────────────────

interface SpecificPriceCandidate {
	id: string;
	rule: SpecificPrice;
	specificity: number;
}

async function resolveSpecificPrice(
	ctx: PriceResolutionContext,
	basePrice: number,
	storage: PricingStorageAccess,
): Promise<Omit<ResolvedPrice, "quantityBreaks"> | null> {
	// Query specific prices for this product
	// Note: emdash storage doesn't support null equality queries,
	// so we query all rules and filter in-memory for global ones.
	let allRulesItems: Array<{ id: string; data: SpecificPrice }>;
	try {
		const productRules = await storage.specificPrices.query({
			where: { productId: ctx.productId },
			orderBy: { priority: "asc" },
			limit: 100,
		});
		// Also get rules without a product filter (global rules)
		// Since we can't query for null, get all and filter
		const allRules = await storage.specificPrices.query({
			orderBy: { priority: "asc" },
			limit: 100,
		});
		const globalRules = allRules.items.filter((i) => !i.data.productId);
		// Merge, dedup by id
		const seen = new Set<string>();
		allRulesItems = [];
		for (const item of [...productRules.items, ...globalRules]) {
			if (!seen.has(item.id)) { seen.add(item.id); allRulesItems.push(item); }
		}
	} catch {
		allRulesItems = [];
	}

	const now = ctx.date.toISOString();

	// Filter and score candidates
	const candidates: SpecificPriceCandidate[] = [];

	for (const item of allRulesItems) {
		const rule = item.data;

		if (!matchesSpecificPriceContext(rule, ctx, now)) continue;

		const specificity = computeSpecificity(rule);
		candidates.push({ id: item.id, rule, specificity });
	}

	if (candidates.length === 0) return null;

	// Sort: priority ASC, then specificity DESC (more specific wins)
	candidates.sort((a, b) => {
		if (a.rule.priority !== b.rule.priority) return a.rule.priority - b.rule.priority;
		return b.specificity - a.specificity;
	});

	const winner = candidates[0];
	return applySpecificPriceReduction(winner.id, winner.rule, basePrice);
}

function matchesSpecificPriceContext(
	rule: SpecificPrice,
	ctx: PriceResolutionContext,
	now: string,
): boolean {
	// Variant filter
	if (rule.variantId && rule.variantId !== ctx.variantId) return false;

	// Customer filter
	if (rule.customerId && rule.customerId !== ctx.customerId) return false;

	// Customer group filter
	if (rule.customerGroupId && rule.customerGroupId !== ctx.customerGroupId) return false;

	// Country filter
	if (rule.countryCode && rule.countryCode !== ctx.countryCode) return false;

	// Currency filter
	if (rule.currencyCode && rule.currencyCode !== ctx.currencyCode) return false;

	// Quantity threshold
	if (ctx.quantity < rule.fromQuantity) return false;

	// Date range
	if (rule.startDate && now < rule.startDate) return false;
	if (rule.endDate && now > rule.endDate) return false;

	return true;
}

/**
 * Compute specificity score for tiebreaking within same priority.
 * More specific rules (targeting a customer vs. targeting everyone) score higher.
 */
function computeSpecificity(rule: SpecificPrice): number {
	let score = 0;
	if (rule.customerId) score += 8;
	if (rule.customerGroupId) score += 4;
	if (rule.countryCode) score += 2;
	if (rule.currencyCode) score += 1;
	return score;
}

function applySpecificPriceReduction(
	ruleId: string,
	rule: SpecificPrice,
	basePrice: number,
): Omit<ResolvedPrice, "quantityBreaks"> {
	// Fixed price override
	if (rule.price !== null) {
		const unitPrice = rule.price;
		return {
			unitPrice,
			originalPrice: basePrice,
			discountAmount: Math.max(0, basePrice - unitPrice),
			discountSource: "specific_price",
			ruleId,
		};
	}

	// Reduction from base
	let discountAmount: number;
	if (rule.reductionType === "percentage") {
		discountAmount = applyPercentageReduction(basePrice, rule.reductionValue);
	} else {
		discountAmount = rule.reductionValue;
	}

	const unitPrice = Math.max(0, basePrice - discountAmount);
	return {
		unitPrice,
		originalPrice: basePrice,
		discountAmount: basePrice - unitPrice,
		discountSource: "specific_price",
		ruleId,
	};
}

// ─── Catalog Price Rule Resolution ──────────────────────────────

async function resolveCatalogPrice(
	ctx: PriceResolutionContext,
	basePrice: number,
	product: Product,
	storage: PricingStorageAccess,
): Promise<Omit<ResolvedPrice, "quantityBreaks"> | null> {
	// Note: SQLite can't bind booleans — query all and filter in-memory
	const result = await storage.catalogPriceRules.query({
		orderBy: { priority: "asc" },
		limit: 100,
	});

	const now = ctx.date.toISOString();

	for (const item of result.items) {
		const rule = item.data;

		// Filter enabled rules in-memory (SQLite can't bind booleans)
		if (!rule.enabled) continue;

		// Date range check
		if (rule.startDate && now < rule.startDate) continue;
		if (rule.endDate && now > rule.endDate) continue;

		// All condition groups must match (AND between groups)
		if (!matchesCatalogRule(rule, product)) continue;

		// First matching rule wins (sorted by priority)
		let discountAmount: number;
		if (rule.reductionType === "percentage") {
			discountAmount = applyPercentageReduction(basePrice, rule.reductionValue);
		} else {
			discountAmount = rule.reductionValue;
		}

		const unitPrice = Math.max(0, basePrice - discountAmount);
		return {
			unitPrice,
			originalPrice: basePrice,
			discountAmount: basePrice - unitPrice,
			discountSource: "catalog_rule",
			ruleId: item.id,
		};
	}

	return null;
}

/**
 * Check if a product matches a catalog price rule.
 * ALL condition groups must match (AND logic).
 * Within each group, at least ONE condition must match (OR logic).
 */
function matchesCatalogRule(rule: CatalogPriceRule, product: Product): boolean {
	return rule.conditionGroups.every((group) => matchesConditionGroup(group, product));
}

function matchesConditionGroup(group: ConditionGroup, product: Product): boolean {
	return group.conditions.some((condition) => matchesCondition(condition, product));
}

function matchesCondition(condition: PriceCondition, product: Product): boolean {
	switch (condition.type) {
		case "category":
			return condition.categoryIds.some((id) => product.categoryIds.includes(id));

		case "tag":
			return condition.tagIds.some((id) => product.tagIds.includes(id));

		case "attribute":
			return product.attributes.some(
				(attr) =>
					attr.name === condition.attributeName &&
					condition.values.some((v) => attr.values.includes(v)),
			);

		case "price_range":
			return product.price >= condition.min && product.price <= condition.max;

		default:
			return false;
	}
}

// ─── Quantity Breaks ────────────────────────────────────────────

/**
 * Get all quantity price breaks for a product (for display in the storefront).
 * Returns breaks sorted by fromQuantity ASC.
 */
async function getQuantityBreaks(
	ctx: PriceResolutionContext,
	basePrice: number,
	storage: PricingStorageAccess,
): Promise<QuantityBreak[]> {
	const result = await storage.specificPrices.query({
		where: { productId: ctx.productId },
		orderBy: { priority: "asc" },
		limit: 100,
	});

	const now = ctx.date.toISOString();
	const breaks: QuantityBreak[] = [];
	const seenQuantities = new Set<number>();

	for (const item of result.items) {
		const rule = item.data;

		// Only include quantity-based rules (fromQuantity > 1)
		if (rule.fromQuantity <= 1) continue;
		if (seenQuantities.has(rule.fromQuantity)) continue;

		// Must match the current context (ignoring quantity)
		const qtyCtx = { ...ctx, quantity: rule.fromQuantity };
		if (!matchesSpecificPriceContext(rule, qtyCtx, now)) continue;

		const resolved = applySpecificPriceReduction(item.id, rule, basePrice);
		seenQuantities.add(rule.fromQuantity);

		breaks.push({
			fromQuantity: rule.fromQuantity,
			unitPrice: resolved.unitPrice,
			savings: basePrice - resolved.unitPrice,
			savingsPercent: percentageOf(basePrice - resolved.unitPrice, basePrice),
		});
	}

	return breaks.sort((a, b) => a.fromQuantity - b.fromQuantity);
}
