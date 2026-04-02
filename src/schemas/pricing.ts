/**
 * Zod schemas for pricing rule validation.
 */

import { z } from "astro/zod";

// ─── Specific Price ─────────────────────────────────────────────

export const specificPriceCreateSchema = z.object({
	productId: z.string().nullable().default(null),
	variantId: z.string().nullable().default(null),
	customerGroupId: z.string().nullable().default(null),
	customerId: z.string().nullable().default(null),
	countryCode: z.string().length(2).nullable().default(null),
	currencyCode: z.string().length(3).nullable().default(null),
	fromQuantity: z.number().int().min(1).default(1),
	reductionType: z.enum(["amount", "percentage"]),
	/** Cents for amount, basis points for percentage */
	reductionValue: z.number().int().min(0),
	reductionTaxIncluded: z.boolean().default(false),
	/** Fixed price override (cents). Null = apply reduction to base */
	price: z.number().int().min(0).nullable().default(null),
	startDate: z.string().datetime().nullable().default(null),
	endDate: z.string().datetime().nullable().default(null),
	priority: z.number().int().min(0).max(4).default(0),
});

export const specificPriceUpdateSchema = z.object({
	id: z.string().min(1),
	productId: z.string().nullable().optional(),
	variantId: z.string().nullable().optional(),
	customerGroupId: z.string().nullable().optional(),
	customerId: z.string().nullable().optional(),
	countryCode: z.string().length(2).nullable().optional(),
	currencyCode: z.string().length(3).nullable().optional(),
	fromQuantity: z.number().int().min(1).optional(),
	reductionType: z.enum(["amount", "percentage"]).optional(),
	reductionValue: z.number().int().min(0).optional(),
	reductionTaxIncluded: z.boolean().optional(),
	price: z.number().int().min(0).nullable().optional(),
	startDate: z.string().datetime().nullable().optional(),
	endDate: z.string().datetime().nullable().optional(),
	priority: z.number().int().min(0).max(4).optional(),
});

export const specificPriceDeleteSchema = z.object({
	id: z.string().min(1),
});

export const specificPriceListSchema = z.object({
	productId: z.string().optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

// ─── Catalog Price Rule ─────────────────────────────────────────

const priceConditionSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("category"), categoryIds: z.array(z.string().min(1)).min(1) }),
	z.object({ type: z.literal("tag"), tagIds: z.array(z.string().min(1)).min(1) }),
	z.object({
		type: z.literal("attribute"),
		attributeName: z.string().min(1),
		values: z.array(z.string().min(1)).min(1),
	}),
	z.object({
		type: z.literal("price_range"),
		min: z.number().int().min(0),
		max: z.number().int().min(0),
	}),
]);

const conditionGroupSchema = z.object({
	conditions: z.array(priceConditionSchema).min(1),
});

export const catalogPriceRuleCreateSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().max(1000).default(""),
	enabled: z.boolean().default(true),
	conditionGroups: z.array(conditionGroupSchema).min(1),
	reductionType: z.enum(["amount", "percentage"]),
	reductionValue: z.number().int().min(0),
	reductionTaxIncluded: z.boolean().default(false),
	startDate: z.string().datetime().nullable().default(null),
	endDate: z.string().datetime().nullable().default(null),
	priority: z.number().int().min(0).max(4).default(0),
});

export const catalogPriceRuleUpdateSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(200).optional(),
	description: z.string().max(1000).optional(),
	enabled: z.boolean().optional(),
	conditionGroups: z.array(conditionGroupSchema).min(1).optional(),
	reductionType: z.enum(["amount", "percentage"]).optional(),
	reductionValue: z.number().int().min(0).optional(),
	reductionTaxIncluded: z.boolean().optional(),
	startDate: z.string().datetime().nullable().optional(),
	endDate: z.string().datetime().nullable().optional(),
	priority: z.number().int().min(0).max(4).optional(),
});

export const catalogPriceRuleDeleteSchema = z.object({
	id: z.string().min(1),
});

export const catalogPriceRuleListSchema = z.object({
	enabled: z.boolean().optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

// ─── Type Exports ───────────────────────────────────────────────

export type SpecificPriceCreateInput = z.infer<typeof specificPriceCreateSchema>;
export type SpecificPriceUpdateInput = z.infer<typeof specificPriceUpdateSchema>;
export type SpecificPriceDeleteInput = z.infer<typeof specificPriceDeleteSchema>;
export type SpecificPriceListInput = z.infer<typeof specificPriceListSchema>;
export type CatalogPriceRuleCreateInput = z.infer<typeof catalogPriceRuleCreateSchema>;
export type CatalogPriceRuleUpdateInput = z.infer<typeof catalogPriceRuleUpdateSchema>;
export type CatalogPriceRuleDeleteInput = z.infer<typeof catalogPriceRuleDeleteSchema>;
export type CatalogPriceRuleListInput = z.infer<typeof catalogPriceRuleListSchema>;
