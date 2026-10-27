/**
 * Zod schemas for checkout operations.
 */

import { z } from "astro/zod";

export const addressSchema = z.object({
	firstName: z.string().trim().min(1).max(100),
	lastName: z.string().trim().min(1).max(100),
	company: z.string().max(200).nullable().default(null),
	addressLine1: z.string().trim().min(1).max(200),
	addressLine2: z.string().max(200).nullable().default(null),
	city: z.string().trim().min(1).max(100),
	stateCode: z.string().max(10).nullable().default(null),
	postalCode: z.string().trim().min(1).max(20),
	countryCode: z.string().length(2),
	phone: z.string().max(40).nullable().default(null),
});

export const checkoutCreateSchema = z.object({
	sessionId: z.string().min(1).max(100),
	email: z.string().trim().email().max(254),
	billingAddress: addressSchema,
	/** null = ship to the billing address */
	shippingAddress: addressSchema.nullable().default(null),
	shippingMethodId: z.string().min(1),
	paymentGateway: z.enum(["stripe", "paypal"]).default("stripe"),
	customerNote: z.string().max(1000).nullable().default(null),
	/** Total the customer was shown (minor units); creation fails if prices changed */
	expectedTotal: z.number().int().nullable().default(null),
});

export const checkoutConfirmSchema = z.object({
	orderId: z.string().min(1).max(100),
	/** Optional: if supplied it must match the order's payment reference */
	paymentIntentId: z.string().min(1).max(200).optional(),
});

export type CheckoutCreateInput = z.infer<typeof checkoutCreateSchema>;
export type CheckoutConfirmInput = z.infer<typeof checkoutConfirmSchema>;
