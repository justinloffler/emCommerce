/**
 * Zod schemas for shipping zone/method management.
 */

import { z } from "astro/zod";

const shippingRegionSchema = z.object({
	countryCode: z.string().length(2),
	stateCode: z.string().nullable().default(null),
});

const weightRateSchema = z.object({
	minWeight: z.number().int().min(0),
	maxWeight: z.number().int().min(0).nullable().default(null),
	cost: z.number().int().min(0),
});

const priceRateSchema = z.object({
	minPrice: z.number().int().min(0),
	maxPrice: z.number().int().min(0).nullable().default(null),
	cost: z.number().int().min(0),
});

const shippingMethodSchema = z.object({
	id: z.string().min(1),
	type: z.enum(["flat_rate", "free_shipping", "weight_based", "price_based"]),
	name: z.string().min(1).max(100),
	enabled: z.boolean().default(true),
	cost: z.number().int().min(0).nullable().default(null),
	freeShippingMinimum: z.number().int().min(0).nullable().default(null),
	weightRates: z.array(weightRateSchema).nullable().default(null),
	priceRates: z.array(priceRateSchema).nullable().default(null),
	sortOrder: z.number().int().default(0),
});

export const shippingZoneCreateSchema = z.object({
	name: z.string().min(1).max(200),
	regions: z.array(shippingRegionSchema).default([]),
	methods: z.array(shippingMethodSchema).default([]),
	sortOrder: z.number().int().default(0),
});

export const shippingZoneUpdateSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(200).optional(),
	regions: z.array(shippingRegionSchema).optional(),
	methods: z.array(shippingMethodSchema).optional(),
	sortOrder: z.number().int().optional(),
});

export const shippingZoneDeleteSchema = z.object({
	id: z.string().min(1),
});

export const shippingZoneListSchema = z.object({
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const shippingRatesSchema = z.object({
	countryCode: z.string().length(2),
	stateCode: z.string().nullable().default(null),
	postalCode: z.string().default(""),
	city: z.string().default(""),
	weight: z.number().int().min(0).default(0),
	subtotal: z.number().int().min(0).default(0),
});

export type ShippingZoneCreateInput = z.infer<typeof shippingZoneCreateSchema>;
export type ShippingZoneUpdateInput = z.infer<typeof shippingZoneUpdateSchema>;
export type ShippingZoneDeleteInput = z.infer<typeof shippingZoneDeleteSchema>;
export type ShippingZoneListInput = z.infer<typeof shippingZoneListSchema>;
export type ShippingRatesInput = z.infer<typeof shippingRatesSchema>;
