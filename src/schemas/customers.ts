/**
 * Zod schemas for customer and customer group management.
 */

import { z } from "astro/zod";

// ─── Customers ──────────────────────────────────────────────────

const addressSchema = z.object({
	id: z.string().min(1),
	label: z.string().nullable().default(null),
	firstName: z.string().min(1),
	lastName: z.string().min(1),
	company: z.string().nullable().default(null),
	addressLine1: z.string().min(1),
	addressLine2: z.string().nullable().default(null),
	city: z.string().min(1),
	stateCode: z.string().nullable().default(null),
	postalCode: z.string().min(1),
	countryCode: z.string().length(2),
	phone: z.string().nullable().default(null),
});

export const customerCreateSchema = z.object({
	email: z.string().email(),
	firstName: z.string().min(1).max(100),
	lastName: z.string().min(1).max(100),
	phone: z.string().nullable().default(null),
	groupId: z.string().optional(),
	addresses: z.array(addressSchema).default([]),
	note: z.string().max(1000).nullable().default(null),
	customFields: z.record(z.string(), z.unknown()).default({}),
});

export const customerUpdateSchema = z.object({
	id: z.string().min(1),
	email: z.string().email().optional(),
	firstName: z.string().min(1).max(100).optional(),
	lastName: z.string().min(1).max(100).optional(),
	phone: z.string().nullable().optional(),
	groupId: z.string().min(1).optional(),
	addresses: z.array(addressSchema).optional(),
	defaultBillingAddressId: z.string().nullable().optional(),
	defaultShippingAddressId: z.string().nullable().optional(),
	note: z.string().max(1000).nullable().optional(),
	customFields: z.record(z.string(), z.unknown()).optional(),
});

export const customerDeleteSchema = z.object({ id: z.string().min(1) });

export const customerListSchema = z.object({
	groupId: z.string().optional(),
	search: z.string().optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const customerGetSchema = z.object({ id: z.string().min(1) });

// ─── Customer Groups ────────────────────────────────────────────

export const customerGroupCreateSchema = z.object({
	name: z.string().min(1).max(100),
	slug: z.string().min(1).max(50).regex(/^[a-z][a-z0-9-]*$/),
	description: z.string().max(500).default(""),
	isDefault: z.boolean().default(false),
});

export const customerGroupUpdateSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(100).optional(),
	slug: z.string().min(1).max(50).regex(/^[a-z][a-z0-9-]*$/).optional(),
	description: z.string().max(500).optional(),
	isDefault: z.boolean().optional(),
});

export const customerGroupDeleteSchema = z.object({ id: z.string().min(1) });
export const customerGroupListSchema = z.object({
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type CustomerDeleteInput = z.infer<typeof customerDeleteSchema>;
export type CustomerListInput = z.infer<typeof customerListSchema>;
export type CustomerGetInput = z.infer<typeof customerGetSchema>;
export type CustomerGroupCreateInput = z.infer<typeof customerGroupCreateSchema>;
export type CustomerGroupUpdateInput = z.infer<typeof customerGroupUpdateSchema>;
export type CustomerGroupDeleteInput = z.infer<typeof customerGroupDeleteSchema>;
export type CustomerGroupListInput = z.infer<typeof customerGroupListSchema>;
