/**
 * Zod schemas for public storefront routes.
 */

import { z } from "astro/zod";

export const storefrontProductListSchema = z.object({
	categoryId: z.string().optional(),
	tagId: z.string().optional(),
	featured: z.boolean().optional(),
	search: z.string().max(200).optional(),
	sortBy: z.enum(["createdAt", "name", "price", "sortOrder"]).default("createdAt"),
	sortDir: z.enum(["asc", "desc"]).default("desc"),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(24),
});

export const storefrontProductGetSchema = z
	.object({
		id: z.string().min(1).optional(),
		slug: z.string().min(1).max(200).optional(),
	})
	.refine((v) => v.id || v.slug, { message: "Either id or slug is required" });

/** Partial address used to quote tax and shipping before the customer has typed everything. */
export const quoteAddressSchema = z.object({
	countryCode: z.string().length(2),
	stateCode: z.string().max(10).nullable().default(null),
	postalCode: z.string().max(20).default(""),
	city: z.string().max(100).default(""),
});

export const checkoutQuoteSchema = z.object({
	sessionId: z.string().min(1).max(100),
	address: quoteAddressSchema.nullable().default(null),
	shippingMethodId: z.string().min(1).nullable().default(null),
});

export type StorefrontProductListInput = z.infer<typeof storefrontProductListSchema>;
export type StorefrontProductGetInput = z.infer<typeof storefrontProductGetSchema>;
export type QuoteAddress = z.infer<typeof quoteAddressSchema>;
export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;
