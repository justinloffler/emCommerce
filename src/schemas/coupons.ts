/**
 * Zod schemas for coupon management.
 */

import { z } from "astro/zod";

export const couponCreateSchema = z.object({
	code: z.string().min(1).max(50).regex(/^[A-Z0-9_-]+$/i, "Code must be alphanumeric with hyphens/underscores"),
	description: z.string().max(500).default(""),
	type: z.enum(["percentage", "fixed_cart", "fixed_product", "free_shipping", "bogo"]),
	/** Cents for fixed, basis points for percentage */
	value: z.number().int().min(0),
	minimumAmount: z.number().int().min(0).nullable().default(null),
	maximumDiscount: z.number().int().min(0).nullable().default(null),
	usageLimit: z.number().int().min(0).nullable().default(null),
	usageLimitPerCustomer: z.number().int().min(0).nullable().default(null),
	productIds: z.array(z.string()).nullable().default(null),
	categoryIds: z.array(z.string()).nullable().default(null),
	customerGroupIds: z.array(z.string()).nullable().default(null),
	allowStacking: z.boolean().default(true),
	enabled: z.boolean().default(true),
	startDate: z.string().datetime().nullable().default(null),
	endDate: z.string().datetime().nullable().default(null),
});

export const couponUpdateSchema = z.object({
	id: z.string().min(1),
	code: z.string().min(1).max(50).regex(/^[A-Z0-9_-]+$/i).optional(),
	description: z.string().max(500).optional(),
	type: z.enum(["percentage", "fixed_cart", "fixed_product", "free_shipping", "bogo"]).optional(),
	value: z.number().int().min(0).optional(),
	minimumAmount: z.number().int().min(0).nullable().optional(),
	maximumDiscount: z.number().int().min(0).nullable().optional(),
	usageLimit: z.number().int().min(0).nullable().optional(),
	usageLimitPerCustomer: z.number().int().min(0).nullable().optional(),
	productIds: z.array(z.string()).nullable().optional(),
	categoryIds: z.array(z.string()).nullable().optional(),
	customerGroupIds: z.array(z.string()).nullable().optional(),
	allowStacking: z.boolean().optional(),
	enabled: z.boolean().optional(),
	startDate: z.string().datetime().nullable().optional(),
	endDate: z.string().datetime().nullable().optional(),
});

export const couponDeleteSchema = z.object({ id: z.string().min(1) });

export const couponListSchema = z.object({
	enabled: z.boolean().optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const couponGetSchema = z.object({ id: z.string().min(1) });

export type CouponCreateInput = z.infer<typeof couponCreateSchema>;
export type CouponUpdateInput = z.infer<typeof couponUpdateSchema>;
export type CouponDeleteInput = z.infer<typeof couponDeleteSchema>;
export type CouponListInput = z.infer<typeof couponListSchema>;
export type CouponGetInput = z.infer<typeof couponGetSchema>;
