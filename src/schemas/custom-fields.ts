/**
 * Zod schemas for custom field definitions.
 */

import { z } from "astro/zod";

export const customFieldCreateSchema = z.object({
	entityType: z.enum(["product", "order", "customer"]),
	key: z.string().min(1).max(50).regex(/^[a-z][a-z0-9_]*$/, "Key must be lowercase alphanumeric with underscores"),
	label: z.string().min(1).max(100),
	fieldType: z.enum(["text", "number", "boolean", "select", "date", "url", "email", "textarea"]),
	options: z.array(z.string()).nullable().default(null),
	placeholder: z.string().max(200).nullable().default(null),
	required: z.boolean().default(false),
	defaultValue: z.string().nullable().default(null),
	sortOrder: z.number().int().default(0),
});

export const customFieldUpdateSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1).max(100).optional(),
	fieldType: z.enum(["text", "number", "boolean", "select", "date", "url", "email", "textarea"]).optional(),
	options: z.array(z.string()).nullable().optional(),
	placeholder: z.string().max(200).nullable().optional(),
	required: z.boolean().optional(),
	defaultValue: z.string().nullable().optional(),
	sortOrder: z.number().int().optional(),
});

export const customFieldDeleteSchema = z.object({ id: z.string().min(1) });

export const customFieldListSchema = z.object({
	entityType: z.enum(["product", "order", "customer"]),
});

export type CustomFieldCreateInput = z.infer<typeof customFieldCreateSchema>;
export type CustomFieldUpdateInput = z.infer<typeof customFieldUpdateSchema>;
export type CustomFieldDeleteInput = z.infer<typeof customFieldDeleteSchema>;
export type CustomFieldListInput = z.infer<typeof customFieldListSchema>;
