/**
 * Zod schemas for the external REST-style API.
 *
 * Modeled after WooCommerce REST API v3 conventions:
 * - Pagination: page, per_page
 * - Filtering: status, search, after, before
 * - Response: { data, meta: { total, pages, page } }
 */

import { z } from "astro/zod";

// ─── Shared pagination / filter ─────────────────────────────────

const paginationSchema = z.object({
	page: z.number().int().min(1).default(1),
	per_page: z.number().int().min(1).max(100).default(10),
});

// ─── Products ───────────────────────────────────────────────────

export const apiProductListSchema = paginationSchema.extend({
	status: z.enum(["draft", "active", "archived"]).optional(),
	type: z.enum(["simple", "variable", "grouped", "virtual", "downloadable", "external"]).optional(),
	search: z.string().optional(),
	featured: z.boolean().optional(),
	category: z.string().optional(),
	tag: z.string().optional(),
	sku: z.string().optional(),
	after: z.string().datetime().optional(),
	before: z.string().datetime().optional(),
	orderby: z.enum(["date", "name", "price"]).default("date"),
	order: z.enum(["asc", "desc"]).default("desc"),
});

export const apiProductGetSchema = z.object({ id: z.string().min(1) });

export const apiProductCreateSchema = z.object({
	name: z.string().min(1).max(200),
	slug: z.string().max(100).optional(),
	type: z.enum(["simple", "variable", "grouped", "virtual", "downloadable", "external"]).default("simple"),
	status: z.enum(["draft", "active", "archived"]).default("active"),
	description: z.string().default(""),
	short_description: z.string().default(""),
	sku: z.string().nullable().optional(),
	/** Price as decimal string, e.g. "19.99" */
	price: z.string().regex(/^\d+(\.\d{1,2})?$/),
	regular_price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
	sale_price: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
	manage_stock: z.boolean().default(false),
	stock_quantity: z.number().int().nullable().optional(),
	low_stock_threshold: z.number().int().optional(),
	backorders_allowed: z.boolean().default(false),
	weight: z.string().nullable().optional(),
	featured: z.boolean().default(false),
	categories: z.array(z.object({ id: z.string() })).optional(),
	tags: z.array(z.object({ id: z.string() })).optional(),
	custom_fields: z.record(z.string(), z.unknown()).optional(),
});

export const apiProductUpdateSchema = z.object({
	id: z.string().min(1),
}).merge(apiProductCreateSchema.partial());

export const apiProductDeleteSchema = z.object({
	id: z.string().min(1),
	force: z.boolean().default(false),
});

// ─── Orders ─────────────────────────────────────────────────────

export const apiOrderListSchema = paginationSchema.extend({
	status: z.enum(["pending_payment", "processing", "on_hold", "shipped", "completed", "cancelled", "refunded"]).optional(),
	customer: z.string().optional(),
	after: z.string().datetime().optional(),
	before: z.string().datetime().optional(),
	orderby: z.enum(["date", "total"]).default("date"),
	order: z.enum(["asc", "desc"]).default("desc"),
});

export const apiOrderGetSchema = z.object({ id: z.string().min(1) });

export const apiOrderUpdateSchema = z.object({
	id: z.string().min(1),
	status: z.enum(["pending_payment", "processing", "on_hold", "shipped", "completed", "cancelled", "refunded"]).optional(),
	customer_note: z.string().optional(),
	custom_fields: z.record(z.string(), z.unknown()).optional(),
});

export const apiOrderCreateSchema = z.object({
	customer_email: z.string().email(),
	customer_id: z.string().nullable().default(null),
	status: z.enum(["pending_payment", "processing"]).default("pending_payment"),
	line_items: z.array(z.object({
		product_id: z.string().min(1),
		variant_id: z.string().nullable().default(null),
		quantity: z.number().int().min(1),
		/** Override unit price in dollars, e.g. "19.99". If omitted, resolved from product. */
		price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
	})).min(1),
	billing: z.object({
		first_name: z.string(), last_name: z.string(),
		address_1: z.string(), address_2: z.string().default(""),
		city: z.string(), state: z.string().default(""),
		postcode: z.string(), country: z.string().length(2),
		email: z.string().email().optional(), phone: z.string().default(""),
	}),
	shipping: z.object({
		first_name: z.string(), last_name: z.string(),
		address_1: z.string(), address_2: z.string().default(""),
		city: z.string(), state: z.string().default(""),
		postcode: z.string(), country: z.string().length(2),
	}).optional(),
	customer_note: z.string().default(""),
	custom_fields: z.record(z.string(), z.unknown()).optional(),
});

// ─── Customers ──────────────────────────────────────────────────

export const apiCustomerListSchema = paginationSchema.extend({
	search: z.string().optional(),
	email: z.string().email().optional(),
	orderby: z.enum(["date", "name"]).default("date"),
	order: z.enum(["asc", "desc"]).default("desc"),
});

export const apiCustomerGetSchema = z.object({ id: z.string().min(1) });

// ─── Inventory ──────────────────────────────────────────────────

export const apiInventoryUpdateSchema = z.object({
	id: z.string().min(1),
	stock_quantity: z.number().int().optional(),
	manage_stock: z.boolean().optional(),
	backorders_allowed: z.boolean().optional(),
});

export const apiInventoryBatchSchema = z.object({
	updates: z.array(z.object({
		id: z.string().min(1),
		stock_quantity: z.number().int(),
	})),
});

// ─── Coupons ────────────────────────────────────────────────────

export const apiCouponListSchema = paginationSchema.extend({
	search: z.string().optional(),
});

// ─── Webhooks ───────────────────────────────────────────────────

export const apiWebhookCreateSchema = z.object({
	topic: z.enum(["order.created", "order.updated", "order.deleted", "product.created", "product.updated", "product.deleted", "customer.created", "customer.updated"]),
	delivery_url: z.string().url(),
	secret: z.string().min(1).max(200).optional(),
	status: z.enum(["active", "paused"]).default("active"),
});

export const apiWebhookDeleteSchema = z.object({ id: z.string().min(1) });

export type ApiProductListInput = z.infer<typeof apiProductListSchema>;
export type ApiProductGetInput = z.infer<typeof apiProductGetSchema>;
export type ApiProductCreateInput = z.infer<typeof apiProductCreateSchema>;
export type ApiProductUpdateInput = z.infer<typeof apiProductUpdateSchema>;
export type ApiProductDeleteInput = z.infer<typeof apiProductDeleteSchema>;
export type ApiOrderListInput = z.infer<typeof apiOrderListSchema>;
export type ApiOrderGetInput = z.infer<typeof apiOrderGetSchema>;
export type ApiOrderCreateInput = z.infer<typeof apiOrderCreateSchema>;
export type ApiOrderUpdateInput = z.infer<typeof apiOrderUpdateSchema>;
export type ApiCustomerListInput = z.infer<typeof apiCustomerListSchema>;
export type ApiCustomerGetInput = z.infer<typeof apiCustomerGetSchema>;
export type ApiInventoryUpdateInput = z.infer<typeof apiInventoryUpdateSchema>;
export type ApiInventoryBatchInput = z.infer<typeof apiInventoryBatchSchema>;
export type ApiCouponListInput = z.infer<typeof apiCouponListSchema>;
export type ApiWebhookCreateInput = z.infer<typeof apiWebhookCreateSchema>;
export type ApiWebhookDeleteInput = z.infer<typeof apiWebhookDeleteSchema>;
