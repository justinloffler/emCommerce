/**
 * Zod schemas for tax class and tax rule management.
 */

import { z } from "astro/zod";

// ─── Tax Classes ────────────────────────────────────────────────

export const taxClassCreateSchema = z.object({
	name: z.string().min(1).max(100),
	slug: z.string().min(1).max(50).regex(/^[a-z][a-z0-9-]*$/),
	description: z.string().max(500).default(""),
	isDefault: z.boolean().default(false),
});

export const taxClassUpdateSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(100).optional(),
	slug: z.string().min(1).max(50).regex(/^[a-z][a-z0-9-]*$/).optional(),
	description: z.string().max(500).optional(),
	isDefault: z.boolean().optional(),
});

export const taxClassDeleteSchema = z.object({
	id: z.string().min(1),
});

export const taxClassListSchema = z.object({
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

// ─── Tax Rules ──────────────────────────────────────────────────

export const taxRuleCreateSchema = z.object({
	taxClassId: z.string().min(1),
	countryCode: z.string().length(2),
	stateCode: z.string().nullable().default(null),
	postalCodePattern: z.string().nullable().default(null),
	/** Rate in basis points (e.g. 2000 = 20%) */
	rate: z.number().int().min(0).max(100_00),
	name: z.string().min(1).max(100),
	compound: z.boolean().default(false),
	priority: z.number().int().min(0).default(0),
});

export const taxRuleUpdateSchema = z.object({
	id: z.string().min(1),
	taxClassId: z.string().min(1).optional(),
	countryCode: z.string().length(2).optional(),
	stateCode: z.string().nullable().optional(),
	postalCodePattern: z.string().nullable().optional(),
	rate: z.number().int().min(0).max(100_00).optional(),
	name: z.string().min(1).max(100).optional(),
	compound: z.boolean().optional(),
	priority: z.number().int().min(0).optional(),
});

export const taxRuleDeleteSchema = z.object({
	id: z.string().min(1),
});

export const taxRuleListSchema = z.object({
	taxClassId: z.string().optional(),
	countryCode: z.string().length(2).optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export type TaxClassCreateInput = z.infer<typeof taxClassCreateSchema>;
export type TaxClassUpdateInput = z.infer<typeof taxClassUpdateSchema>;
export type TaxClassDeleteInput = z.infer<typeof taxClassDeleteSchema>;
export type TaxClassListInput = z.infer<typeof taxClassListSchema>;
export type TaxRuleCreateInput = z.infer<typeof taxRuleCreateSchema>;
export type TaxRuleUpdateInput = z.infer<typeof taxRuleUpdateSchema>;
export type TaxRuleDeleteInput = z.infer<typeof taxRuleDeleteSchema>;
export type TaxRuleListInput = z.infer<typeof taxRuleListSchema>;
