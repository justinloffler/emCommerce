/**
 * Zod schemas for checkout operations.
 */

import { z } from "astro/zod";

const addressSchema = z.object({
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

export const checkoutCreateSchema = z.object({
	sessionId: z.string().min(1),
	email: z.string().email(),
	billingAddress: addressSchema,
	shippingAddress: addressSchema.nullable().default(null),
	shippingMethodId: z.string().min(1),
	paymentGateway: z.enum(["stripe", "paypal"]).default("stripe"),
	customerNote: z.string().max(1000).nullable().default(null),
});

export const checkoutConfirmSchema = z.object({
	orderId: z.string().min(1),
	paymentIntentId: z.string().min(1),
});

export type CheckoutCreateInput = z.infer<typeof checkoutCreateSchema>;
export type CheckoutConfirmInput = z.infer<typeof checkoutConfirmSchema>;
