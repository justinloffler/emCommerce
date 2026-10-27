/**
 * Pricing rule CRUD route handlers.
 *
 * Manages specific prices and catalog price rules.
 */

import type { RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";
import type { WhereClause } from "../types.js";
import { ulid } from "ulidx";

import type {
	CatalogPriceRuleCreateInput,
	CatalogPriceRuleDeleteInput,
	CatalogPriceRuleListInput,
	CatalogPriceRuleUpdateInput,
	SpecificPriceCreateInput,
	SpecificPriceDeleteInput,
	SpecificPriceListInput,
	SpecificPriceUpdateInput,
} from "../schemas/pricing.js";
import type { CatalogPriceRule, SpecificPrice } from "../types.js";

// ─── Typed Storage Accessors ────────────────────────────────────

function specificPrices(ctx: RouteContext): StorageCollection<SpecificPrice> {
	return ctx.storage["specific-prices"] as StorageCollection<SpecificPrice>;
}

function catalogPriceRules(ctx: RouteContext): StorageCollection<CatalogPriceRule> {
	return ctx.storage["catalog-price-rules"] as StorageCollection<CatalogPriceRule>;
}

/** Increment the price generation counter to invalidate cache */
async function bumpPriceGeneration(ctx: RouteContext) {
	const current = (await ctx.kv.get<number>("state:priceGeneration")) ?? 0;
	await ctx.kv.set("state:priceGeneration", current + 1);
}

// ═══════════════════════════════════════════════════════════════
// SPECIFIC PRICES
// ═══════════════════════════════════════════════════════════════

export async function specificPriceListHandler(ctx: RouteContext<SpecificPriceListInput>) {
	const input = ctx.input;
	const where: WhereClause = {};
	if (input.productId) where.productId = input.productId;

	const result = await specificPrices(ctx).query({
		where: Object.keys(where).length > 0 ? where : undefined,
		orderBy: { priority: "asc" },
		limit: input.limit,
		cursor: input.cursor,
	});

	return {
		items: result.items.map((item) => ({ id: item.id, ...item.data })),
		hasMore: result.hasMore,
		cursor: result.cursor,
	};
}

export async function specificPriceCreateHandler(ctx: RouteContext<SpecificPriceCreateInput>) {
	const input = ctx.input;
	const now = new Date().toISOString();
	const id = ulid();

	const rule: SpecificPrice = {
		productId: input.productId ?? null,
		variantId: input.variantId ?? null,
		customerGroupId: input.customerGroupId ?? null,
		customerId: input.customerId ?? null,
		countryCode: input.countryCode ?? null,
		currencyCode: input.currencyCode ?? null,
		fromQuantity: input.fromQuantity ?? 1,
		reductionType: input.reductionType,
		reductionValue: input.reductionValue,
		reductionTaxIncluded: input.reductionTaxIncluded ?? false,
		price: input.price ?? null,
		startDate: input.startDate ?? null,
		endDate: input.endDate ?? null,
		priority: input.priority ?? 0,
		createdAt: now,
		updatedAt: now,
	};

	await specificPrices(ctx).put(id, rule);
	await bumpPriceGeneration(ctx);

	return { id, ...rule };
}

export async function specificPriceUpdateHandler(ctx: RouteContext<SpecificPriceUpdateInput>) {
	const input = ctx.input;

	const existing = await specificPrices(ctx).get(input.id);
	if (!existing) throw PluginRouteError.notFound("Specific price not found");

	const updated: SpecificPrice = {
		...existing,
		productId: input.productId !== undefined ? input.productId : existing.productId,
		variantId: input.variantId !== undefined ? input.variantId : existing.variantId,
		customerGroupId: input.customerGroupId !== undefined ? input.customerGroupId : existing.customerGroupId,
		customerId: input.customerId !== undefined ? input.customerId : existing.customerId,
		countryCode: input.countryCode !== undefined ? input.countryCode : existing.countryCode,
		currencyCode: input.currencyCode !== undefined ? input.currencyCode : existing.currencyCode,
		fromQuantity: input.fromQuantity ?? existing.fromQuantity,
		reductionType: input.reductionType ?? existing.reductionType,
		reductionValue: input.reductionValue ?? existing.reductionValue,
		reductionTaxIncluded: input.reductionTaxIncluded ?? existing.reductionTaxIncluded,
		price: input.price !== undefined ? input.price : existing.price,
		startDate: input.startDate !== undefined ? input.startDate : existing.startDate,
		endDate: input.endDate !== undefined ? input.endDate : existing.endDate,
		priority: input.priority ?? existing.priority,
		updatedAt: new Date().toISOString(),
	};

	await specificPrices(ctx).put(input.id, updated);
	await bumpPriceGeneration(ctx);

	return { id: input.id, ...updated };
}

export async function specificPriceDeleteHandler(ctx: RouteContext<SpecificPriceDeleteInput>) {
	const existing = await specificPrices(ctx).get(ctx.input.id);
	if (!existing) throw PluginRouteError.notFound("Specific price not found");

	await specificPrices(ctx).delete(ctx.input.id);
	await bumpPriceGeneration(ctx);

	return { deleted: true };
}

// ═══════════════════════════════════════════════════════════════
// CATALOG PRICE RULES
// ═══════════════════════════════════════════════════════════════

export async function catalogPriceRuleListHandler(ctx: RouteContext<CatalogPriceRuleListInput>) {
	const input = ctx.input;
	const where: WhereClause = {};
	if (input.enabled !== undefined) where.enabled = input.enabled;

	const result = await catalogPriceRules(ctx).query({
		where: Object.keys(where).length > 0 ? where : undefined,
		orderBy: { priority: "asc" },
		limit: input.limit,
		cursor: input.cursor,
	});

	return {
		items: result.items.map((item) => ({ id: item.id, ...item.data })),
		hasMore: result.hasMore,
		cursor: result.cursor,
	};
}

export async function catalogPriceRuleCreateHandler(ctx: RouteContext<CatalogPriceRuleCreateInput>) {
	const input = ctx.input;
	const now = new Date().toISOString();
	const id = ulid();

	const rule: CatalogPriceRule = {
		name: input.name,
		description: input.description ?? "",
		enabled: input.enabled ?? true,
		conditionGroups: input.conditionGroups,
		reductionType: input.reductionType,
		reductionValue: input.reductionValue,
		reductionTaxIncluded: input.reductionTaxIncluded ?? false,
		startDate: input.startDate ?? null,
		endDate: input.endDate ?? null,
		priority: input.priority ?? 0,
		createdAt: now,
		updatedAt: now,
	};

	await catalogPriceRules(ctx).put(id, rule);
	await bumpPriceGeneration(ctx);

	return { id, ...rule };
}

export async function catalogPriceRuleUpdateHandler(ctx: RouteContext<CatalogPriceRuleUpdateInput>) {
	const input = ctx.input;

	const existing = await catalogPriceRules(ctx).get(input.id);
	if (!existing) throw PluginRouteError.notFound("Catalog price rule not found");

	const updated: CatalogPriceRule = {
		...existing,
		name: input.name ?? existing.name,
		description: input.description ?? existing.description,
		enabled: input.enabled ?? existing.enabled,
		conditionGroups: input.conditionGroups ?? existing.conditionGroups,
		reductionType: input.reductionType ?? existing.reductionType,
		reductionValue: input.reductionValue ?? existing.reductionValue,
		reductionTaxIncluded: input.reductionTaxIncluded ?? existing.reductionTaxIncluded,
		startDate: input.startDate !== undefined ? input.startDate : existing.startDate,
		endDate: input.endDate !== undefined ? input.endDate : existing.endDate,
		priority: input.priority ?? existing.priority,
		updatedAt: new Date().toISOString(),
	};

	await catalogPriceRules(ctx).put(input.id, updated);
	await bumpPriceGeneration(ctx);

	return { id: input.id, ...updated };
}

export async function catalogPriceRuleDeleteHandler(ctx: RouteContext<CatalogPriceRuleDeleteInput>) {
	const existing = await catalogPriceRules(ctx).get(ctx.input.id);
	if (!existing) throw PluginRouteError.notFound("Catalog price rule not found");

	await catalogPriceRules(ctx).delete(ctx.input.id);
	await bumpPriceGeneration(ctx);

	return { deleted: true };
}
