/**
 * Tax class and tax rule CRUD route handlers.
 */

import type { RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";
import type { WhereClause } from "../types.js";
import { ulid } from "ulidx";

import type {
	TaxClassCreateInput, TaxClassUpdateInput, TaxClassDeleteInput, TaxClassListInput,
	TaxRuleCreateInput, TaxRuleUpdateInput, TaxRuleDeleteInput, TaxRuleListInput,
} from "../schemas/tax.js";
import type { TaxClass, TaxRule } from "../types.js";

function taxClasses(ctx: RouteContext): StorageCollection<TaxClass> {
	return ctx.storage["tax-classes"] as StorageCollection<TaxClass>;
}

function taxRules(ctx: RouteContext): StorageCollection<TaxRule> {
	return ctx.storage["tax-rules"] as StorageCollection<TaxRule>;
}

// ─── Tax Classes ────────────────────────────────────────────────

export async function taxClassListHandler(ctx: RouteContext<TaxClassListInput>) {
	const result = await taxClasses(ctx).query({
		orderBy: { isDefault: "desc" },
		limit: ctx.input.limit,
		cursor: ctx.input.cursor,
	});
	return { items: result.items.map((i) => ({ id: i.id, ...i.data })), hasMore: result.hasMore, cursor: result.cursor };
}

export async function taxClassCreateHandler(ctx: RouteContext<TaxClassCreateInput>) {
	const input = ctx.input;
	const existing = await taxClasses(ctx).query({ where: { slug: input.slug }, limit: 1 });
	if (existing.items.length > 0) throw PluginRouteError.conflict(`Tax class "${input.slug}" exists`);

	const now = new Date().toISOString();
	const id = ulid();
	const tc: TaxClass = {
		name: input.name, slug: input.slug, description: input.description ?? "",
		isDefault: input.isDefault ?? false, createdAt: now, updatedAt: now,
	};
	await taxClasses(ctx).put(id, tc);
	return { id, ...tc };
}

export async function taxClassUpdateHandler(ctx: RouteContext<TaxClassUpdateInput>) {
	const input = ctx.input;
	const existing = await taxClasses(ctx).get(input.id);
	if (!existing) throw PluginRouteError.notFound("Tax class not found");

	if (input.slug && input.slug !== existing.slug) {
		const check = await taxClasses(ctx).query({ where: { slug: input.slug }, limit: 1 });
		if (check.items.length > 0) throw PluginRouteError.conflict(`Tax class "${input.slug}" exists`);
	}

	const updated: TaxClass = {
		...existing,
		name: input.name ?? existing.name, slug: input.slug ?? existing.slug,
		description: input.description ?? existing.description,
		isDefault: input.isDefault ?? existing.isDefault,
		updatedAt: new Date().toISOString(),
	};
	await taxClasses(ctx).put(input.id, updated);
	return { id: input.id, ...updated };
}

export async function taxClassDeleteHandler(ctx: RouteContext<TaxClassDeleteInput>) {
	const existing = await taxClasses(ctx).get(ctx.input.id);
	if (!existing) throw PluginRouteError.notFound("Tax class not found");
	await taxClasses(ctx).delete(ctx.input.id);
	return { deleted: true };
}

// ─── Tax Rules ──────────────────────────────────────────────────

export async function taxRuleListHandler(ctx: RouteContext<TaxRuleListInput>) {
	const input = ctx.input;
	const where: WhereClause = {};
	if (input.taxClassId) where.taxClassId = input.taxClassId;
	if (input.countryCode) where.countryCode = input.countryCode;

	const result = await taxRules(ctx).query({
		where: Object.keys(where).length > 0 ? where : undefined,
		limit: input.limit,
		cursor: input.cursor,
	});
	return { items: result.items.map((i) => ({ id: i.id, ...i.data })), hasMore: result.hasMore, cursor: result.cursor };
}

export async function taxRuleCreateHandler(ctx: RouteContext<TaxRuleCreateInput>) {
	const input = ctx.input;
	const id = ulid();
	const rule: TaxRule = {
		taxClassId: input.taxClassId, countryCode: input.countryCode,
		stateCode: input.stateCode ?? null, postalCodePattern: input.postalCodePattern ?? null,
		rate: input.rate, name: input.name, compound: input.compound ?? false,
		priority: input.priority ?? 0, createdAt: new Date().toISOString(),
	};
	await taxRules(ctx).put(id, rule);
	return { id, ...rule };
}

export async function taxRuleUpdateHandler(ctx: RouteContext<TaxRuleUpdateInput>) {
	const input = ctx.input;
	const existing = await taxRules(ctx).get(input.id);
	if (!existing) throw PluginRouteError.notFound("Tax rule not found");

	const updated: TaxRule = {
		...existing,
		taxClassId: input.taxClassId ?? existing.taxClassId,
		countryCode: input.countryCode ?? existing.countryCode,
		stateCode: input.stateCode !== undefined ? input.stateCode : existing.stateCode,
		postalCodePattern: input.postalCodePattern !== undefined ? input.postalCodePattern : existing.postalCodePattern,
		rate: input.rate ?? existing.rate,
		name: input.name ?? existing.name,
		compound: input.compound ?? existing.compound,
		priority: input.priority ?? existing.priority,
	};
	await taxRules(ctx).put(input.id, updated);
	return { id: input.id, ...updated };
}

export async function taxRuleDeleteHandler(ctx: RouteContext<TaxRuleDeleteInput>) {
	const existing = await taxRules(ctx).get(ctx.input.id);
	if (!existing) throw PluginRouteError.notFound("Tax rule not found");
	await taxRules(ctx).delete(ctx.input.id);
	return { deleted: true };
}
