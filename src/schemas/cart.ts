/**
 * Zod schemas for cart operations.
 */

import { z } from "astro/zod";

export const cartGetSchema = z.object({
	sessionId: z.string().min(1),
});

export const cartAddSchema = z.object({
	sessionId: z.string().min(1),
	productId: z.string().min(1),
	variantId: z.string().nullable().default(null),
	quantity: z.number().int().min(1).default(1),
});

export const cartUpdateSchema = z.object({
	sessionId: z.string().min(1),
	productId: z.string().min(1),
	variantId: z.string().nullable().default(null),
	quantity: z.number().int().min(0),
});

export const cartRemoveSchema = z.object({
	sessionId: z.string().min(1),
	productId: z.string().min(1),
	variantId: z.string().nullable().default(null),
});

export const cartCouponSchema = z.object({
	sessionId: z.string().min(1),
	code: z.string().min(1),
});

export const cartSetAddressSchema = z.object({
	sessionId: z.string().min(1),
	type: z.enum(["billing", "shipping"]),
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

export const cartSetShippingMethodSchema = z.object({
	sessionId: z.string().min(1),
	shippingMethodId: z.string().min(1),
});

export type CartGetInput = z.infer<typeof cartGetSchema>;
export type CartAddInput = z.infer<typeof cartAddSchema>;
export type CartUpdateInput = z.infer<typeof cartUpdateSchema>;
export type CartRemoveInput = z.infer<typeof cartRemoveSchema>;
export type CartCouponInput = z.infer<typeof cartCouponSchema>;
export type CartSetAddressInput = z.infer<typeof cartSetAddressSchema>;
export type CartSetShippingMethodInput = z.infer<typeof cartSetShippingMethodSchema>;
