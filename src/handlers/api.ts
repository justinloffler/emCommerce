/**
 * External REST-style API handlers.
 *
 * WooCommerce-compatible response format:
 *   List:   { data: [...], meta: { total, pages, page, per_page } }
 *   Single: { data: { ... } }
 *   Delete: { data: { id, deleted: true } }
 *
 * Prices in responses are decimal strings ("19.99") like WooCommerce.
 * Prices in requests accept decimal strings too.
 * Internally everything is stored as integer cents.
 */

import type { RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";
import { ulid } from "ulidx";

import type {
	ApiProductListInput, ApiProductGetInput, ApiProductCreateInput,
	ApiProductUpdateInput, ApiProductDeleteInput,
	ApiOrderListInput, ApiOrderGetInput, ApiOrderCreateInput, ApiOrderUpdateInput,
	ApiCustomerListInput, ApiCustomerGetInput,
	ApiInventoryUpdateInput, ApiInventoryBatchInput,
	ApiCouponListInput,
	ApiWebhookCreateInput, ApiWebhookDeleteInput,
} from "../schemas/api.js";
import type { Product, Variant, Order, Customer, Coupon } from "../types.js";
import { resolvePrice } from "../engine/pricing-engine.js";
import type { SpecificPrice, CatalogPriceRule } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────

const toDollars = (cents: number): string => (cents / 100).toFixed(2);
const toCents = (dollars: string): number => Math.round(Number(dollars) * 100);

function products(ctx: RouteContext): StorageCollection<Product> { return ctx.storage.products as StorageCollection<Product>; }
function variants(ctx: RouteContext): StorageCollection<Variant> { return ctx.storage.variants as StorageCollection<Variant>; }
function orders(ctx: RouteContext): StorageCollection<Order> { return ctx.storage.orders as StorageCollection<Order>; }
function customers(ctx: RouteContext): StorageCollection<Customer> { return ctx.storage.customers as StorageCollection<Customer>; }
function coupons(ctx: RouteContext): StorageCollection<Coupon> { return ctx.storage.coupons as StorageCollection<Coupon>; }

/** Transform a product for API response (cents → dollar strings) */
function formatProduct(id: string, p: Product) {
	return {
		id,
		name: p.name,
		slug: p.slug,
		type: p.type,
		status: p.status,
		description: p.description,
		short_description: p.shortDescription,
		sku: p.sku,
		price: toDollars(p.price),
		regular_price: toDollars(p.price),
		sale_price: p.compareAtPrice ? toDollars(p.compareAtPrice) : null,
		cost_price: p.costPrice ? toDollars(p.costPrice) : null,
		manage_stock: p.manageStock,
		stock_quantity: p.stockQuantity,
		low_stock_threshold: p.lowStockThreshold,
		backorders_allowed: p.backordersAllowed,
		weight: p.weight ? String(p.weight) : null,
		featured: p.featured,
		categories: p.categoryIds.map((id) => ({ id })),
		tags: p.tagIds.map((id) => ({ id })),
		images: p.images,
		custom_fields: p.customFields ?? {},
		created_at: p.createdAt,
		updated_at: p.updatedAt,
	};
}

/** Transform an order for API response */
function formatOrder(id: string, o: Order) {
	return {
		id,
		order_number: o.orderNumber,
		status: o.status,
		currency: o.currencyCode,
		total: toDollars(o.total),
		subtotal: toDollars(o.subtotal),
		shipping_total: toDollars(o.shippingTotal),
		tax_total: toDollars(o.taxTotal),
		discount_total: toDollars(o.discountTotal),
		payment_method: o.paymentMethod,
		payment_status: o.paymentStatus,
		customer_id: o.customerId,
		customer_email: o.customerEmail,
		customer_note: o.customerNote,
		billing: o.billingAddress ? {
			first_name: o.billingAddress.firstName, last_name: o.billingAddress.lastName,
			address_1: o.billingAddress.addressLine1, address_2: o.billingAddress.addressLine2,
			city: o.billingAddress.city, state: o.billingAddress.stateCode, postcode: o.billingAddress.postalCode, country: o.billingAddress.countryCode,
		} : null,
		shipping: o.shippingAddress ? {
			first_name: o.shippingAddress.firstName, last_name: o.shippingAddress.lastName,
			address_1: o.shippingAddress.addressLine1, address_2: o.shippingAddress.addressLine2,
			city: o.shippingAddress.city, state: o.shippingAddress.stateCode, postcode: o.shippingAddress.postalCode, country: o.shippingAddress.countryCode,
		} : null,
		line_items: o.items.map((i) => ({
			product_id: i.productId,
			variant_id: i.variantId,
			name: i.name,
			sku: i.sku,
			quantity: i.quantity,
			price: toDollars(i.unitPrice),
			total: toDollars(i.total),
			attributes: i.attributes,
		})),
		refunds: o.refunds.map((r) => ({ id: r.id, amount: toDollars(r.amount), reason: r.reason, created_at: r.createdAt })),
		custom_fields: o.customFields ?? {},
		created_at: o.createdAt,
		updated_at: o.updatedAt,
		completed_at: o.completedAt,
	};
}

function formatCustomer(id: string, c: Customer) {
	return {
		id,
		email: c.email,
		first_name: c.firstName,
		last_name: c.lastName,
		phone: c.phone,
		group_id: c.groupId,
		total_orders: c.totalOrders,
		total_spent: toDollars(c.totalSpent),
		custom_fields: c.customFields ?? {},
		created_at: c.createdAt,
		updated_at: c.updatedAt,
	};
}

function paginatedResponse(items: any[], total: number, page: number, perPage: number) {
	return {
		data: items,
		meta: { total, pages: Math.ceil(total / perPage), page, per_page: perPage },
	};
}

// ═══════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════

export async function apiProductList(ctx: RouteContext<ApiProductListInput>) {
	const { page, per_page, status, type, search, featured } = ctx.input;
	const where: Record<string, unknown> = {};
	if (status) where.status = status;
	if (type) where.type = type;
	// Note: boolean fields filtered in-memory (SQLite can't bind booleans)

	const total = await products(ctx).count(Object.keys(where).length ? where : undefined);
	const result = await products(ctx).query({
		where: Object.keys(where).length ? where : undefined,
		orderBy: { createdAt: ctx.input.order },
		limit: per_page,
		// cursor-based pagination: skip (page-1)*per_page items
	});

	let items = result.items.map((i) => formatProduct(i.id, i.data));
	if (featured !== undefined) items = items.filter((p) => p.featured === featured);
	if (search) {
		const term = search.toLowerCase();
		items = items.filter((p) => p.name.toLowerCase().includes(term) || (p.sku && p.sku.toLowerCase().includes(term)));
	}

	return paginatedResponse(items, total, page, per_page);
}

export async function apiProductGet(ctx: RouteContext<ApiProductGetInput>) {
	const p = await products(ctx).get(ctx.input.id);
	if (!p) throw PluginRouteError.notFound("Product not found");

	// Also fetch variants
	const varResult = await variants(ctx).query({ where: { productId: ctx.input.id }, limit: 100 });
	const formatted = formatProduct(ctx.input.id, p);
	return {
		data: {
			...formatted,
			variants: varResult.items.map((v) => ({
				id: v.id,
				sku: v.data.sku,
				price: v.data.price !== null ? toDollars(v.data.price) : null,
				attributes: v.data.attributes,
				stock_quantity: v.data.stockQuantity,
				enabled: v.data.enabled,
			})),
		},
	};
}

export async function apiProductCreate(ctx: RouteContext<ApiProductCreateInput>) {
	const input = ctx.input;
	const slug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

	// Check slug uniqueness
	const existing = await products(ctx).query({ where: { slug }, limit: 1 });
	if (existing.items.length > 0) throw PluginRouteError.conflict(`Slug "${slug}" already exists`);

	const now = new Date().toISOString();
	const id = ulid();
	const product: Product = {
		name: input.name, slug, type: input.type ?? "simple", status: input.status ?? "active",
		shortDescription: input.short_description ?? "", description: input.description ?? "",
		sku: input.sku ?? null,
		price: toCents(input.price),
		compareAtPrice: input.sale_price ? toCents(input.sale_price) : null,
		costPrice: null, taxClassId: "standard",
		manageStock: input.manage_stock ?? false,
		stockQuantity: input.stock_quantity ?? 0,
		lowStockThreshold: input.low_stock_threshold ?? 5,
		backordersAllowed: input.backorders_allowed ?? false,
		weight: input.weight ? Number(input.weight) : null,
		dimensions: null, shippingClassId: null,
		images: [], categoryIds: (input.categories || []).map((c) => c.id),
		tagIds: (input.tags || []).map((t) => t.id),
		attributes: [], defaultVariantId: null, groupedProductIds: [],
		externalUrl: null, externalButtonText: null,
		downloadFiles: null, downloadLimit: 0, downloadExpiry: 0,
		featured: input.featured ?? false, sortOrder: 0,
		seoTitle: null, seoDescription: null,
		customFields: input.custom_fields ?? {},
		createdAt: now, updatedAt: now,
	};
	await products(ctx).put(id, product);
	await fireWebhooks(ctx, "product.created", { id, ...formatProduct(id, product) });
	return { data: formatProduct(id, product) };
}

export async function apiProductUpdate(ctx: RouteContext<ApiProductUpdateInput>) {
	const { id, ...updates } = ctx.input;
	const existing = await products(ctx).get(id);
	if (!existing) throw PluginRouteError.notFound("Product not found");

	const updated: Product = {
		...existing,
		name: updates.name ?? existing.name,
		slug: updates.slug ?? existing.slug,
		type: updates.type ?? existing.type,
		status: updates.status ?? existing.status,
		shortDescription: updates.short_description ?? existing.shortDescription,
		description: updates.description ?? existing.description,
		sku: updates.sku !== undefined ? (updates.sku ?? null) : existing.sku,
		price: updates.price ? toCents(updates.price) : existing.price,
		compareAtPrice: updates.sale_price !== undefined ? (updates.sale_price ? toCents(updates.sale_price) : null) : existing.compareAtPrice,
		manageStock: updates.manage_stock ?? existing.manageStock,
		stockQuantity: updates.stock_quantity ?? existing.stockQuantity,
		lowStockThreshold: updates.low_stock_threshold ?? existing.lowStockThreshold,
		backordersAllowed: updates.backorders_allowed ?? existing.backordersAllowed,
		weight: updates.weight !== undefined ? (updates.weight ? Number(updates.weight) : null) : existing.weight,
		featured: updates.featured ?? existing.featured,
		categoryIds: updates.categories ? updates.categories.map((c) => c.id) : existing.categoryIds,
		tagIds: updates.tags ? updates.tags.map((t) => t.id) : existing.tagIds,
		customFields: updates.custom_fields ?? existing.customFields,
		updatedAt: new Date().toISOString(),
	};
	await products(ctx).put(id, updated);
	await fireWebhooks(ctx, "product.updated", { id, ...formatProduct(id, updated) });
	return { data: formatProduct(id, updated) };
}

export async function apiProductDelete(ctx: RouteContext<ApiProductDeleteInput>) {
	const existing = await products(ctx).get(ctx.input.id);
	if (!existing) throw PluginRouteError.notFound("Product not found");
	await products(ctx).delete(ctx.input.id);
	await fireWebhooks(ctx, "product.deleted", { id: ctx.input.id });
	return { data: { id: ctx.input.id, deleted: true } };
}

// ═══════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════

export async function apiOrderList(ctx: RouteContext<ApiOrderListInput>) {
	const { page, per_page, status, customer } = ctx.input;
	const where: Record<string, unknown> = {};
	if (status) where.status = status;
	if (customer) where.customerEmail = customer;

	const total = await orders(ctx).count(Object.keys(where).length ? where : undefined);
	const result = await orders(ctx).query({
		where: Object.keys(where).length ? where : undefined,
		orderBy: { createdAt: ctx.input.order },
		limit: per_page,
	});
	return paginatedResponse(result.items.map((i) => formatOrder(i.id, i.data)), total, page, per_page);
}

export async function apiOrderGet(ctx: RouteContext<ApiOrderGetInput>) {
	const o = await orders(ctx).get(ctx.input.id);
	if (!o) throw PluginRouteError.notFound("Order not found");
	return { data: formatOrder(ctx.input.id, o) };
}

export async function apiOrderCreate(ctx: RouteContext<ApiOrderCreateInput>) {
	const input = ctx.input;
	const now = new Date().toISOString();
	const id = ulid();
	const orderNumber = `EM-${new Date().getFullYear().toString().slice(-2)}${String(new Date().getMonth() + 1).padStart(2, "0")}-${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`;

	// Resolve line items
	const items: Order["items"] = [];
	let subtotal = 0;
	for (const li of input.line_items) {
		const product = await products(ctx).get(li.product_id);
		if (!product) throw PluginRouteError.notFound(`Product ${li.product_id} not found`);

		const unitPrice = li.price ? toCents(li.price) : product.price;
		const lineTotal = unitPrice * li.quantity;
		subtotal += lineTotal;

		items.push({
			productId: li.product_id, variantId: li.variant_id, name: product.name,
			sku: product.sku, quantity: li.quantity, unitPrice, originalPrice: product.price,
			total: lineTotal, taxAmount: 0, taxClassId: product.taxClassId,
			attributes: {},
		});
	}

	const order: Order = {
		orderNumber, status: input.status ?? "pending_payment",
		customerId: input.customer_id, customerEmail: input.customer_email,
		customerNote: input.customer_note || null,
		billingAddress: {
			firstName: input.billing.first_name, lastName: input.billing.last_name,
			company: null, addressLine1: input.billing.address_1, addressLine2: input.billing.address_2 || null,
			city: input.billing.city, stateCode: input.billing.state || null,
			postalCode: input.billing.postcode, countryCode: input.billing.country,
			phone: input.billing.phone || null,
		},
		shippingAddress: input.shipping ? {
			firstName: input.shipping.first_name, lastName: input.shipping.last_name,
			company: null, addressLine1: input.shipping.address_1, addressLine2: input.shipping.address_2 || null,
			city: input.shipping.city, stateCode: input.shipping.state || null,
			postalCode: input.shipping.postcode, countryCode: input.shipping.country,
			phone: null,
		} : null,
		items, subtotal, shippingTotal: 0, shippingMethod: "",
		taxTotal: 0, taxBreakdown: [], discountTotal: 0, discountBreakdown: [],
		total: subtotal, currencyCode: "USD",
		paymentMethod: "", paymentIntentId: null, paymentStatus: "pending",
		refunds: [], adminNotes: [{ id: ulid(), content: "Order created via API", isSystem: true, createdAt: now }],
		ipAddress: null, customFields: input.custom_fields ?? {},
		createdAt: now, updatedAt: now, completedAt: null,
	};
	await orders(ctx).put(id, order);
	await fireWebhooks(ctx, "order.created", formatOrder(id, order));
	return { data: formatOrder(id, order) };
}

export async function apiOrderUpdate(ctx: RouteContext<ApiOrderUpdateInput>) {
	const { id, ...updates } = ctx.input;
	const existing = await orders(ctx).get(id);
	if (!existing) throw PluginRouteError.notFound("Order not found");

	const now = new Date().toISOString();
	if (updates.status && updates.status !== existing.status) {
		existing.adminNotes.push({ id: ulid(), content: `Status changed: ${existing.status} → ${updates.status} (via API)`, isSystem: true, createdAt: now });
	}
	const updated: Order = {
		...existing,
		status: updates.status ?? existing.status,
		customerNote: updates.customer_note ?? existing.customerNote,
		customFields: updates.custom_fields ?? existing.customFields,
		completedAt: updates.status === "completed" ? now : existing.completedAt,
		updatedAt: now,
	};
	await orders(ctx).put(id, updated);
	await fireWebhooks(ctx, "order.updated", formatOrder(id, updated));
	return { data: formatOrder(id, updated) };
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════

export async function apiCustomerList(ctx: RouteContext<ApiCustomerListInput>) {
	const { page, per_page, search, email } = ctx.input;
	const where: Record<string, unknown> = {};
	if (email) where.email = email;

	const total = await customers(ctx).count(Object.keys(where).length ? where : undefined);
	const result = await customers(ctx).query({
		where: Object.keys(where).length ? where : undefined,
		orderBy: { createdAt: ctx.input.order },
		limit: per_page,
	});
	let items = result.items.map((i) => formatCustomer(i.id, i.data));
	if (search) {
		const term = search.toLowerCase();
		items = items.filter((c) => c.email.includes(term) || c.first_name.toLowerCase().includes(term) || c.last_name.toLowerCase().includes(term));
	}
	return paginatedResponse(items, total, page, per_page);
}

export async function apiCustomerGet(ctx: RouteContext<ApiCustomerGetInput>) {
	const c = await customers(ctx).get(ctx.input.id);
	if (!c) throw PluginRouteError.notFound("Customer not found");
	return { data: formatCustomer(ctx.input.id, c) };
}

// ═══════════════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════════════

export async function apiInventoryUpdate(ctx: RouteContext<ApiInventoryUpdateInput>) {
	const { id, ...updates } = ctx.input;
	const p = await products(ctx).get(id);
	if (!p) throw PluginRouteError.notFound("Product not found");

	const updated: Product = {
		...p,
		manageStock: updates.manage_stock ?? p.manageStock,
		stockQuantity: updates.stock_quantity ?? p.stockQuantity,
		backordersAllowed: updates.backorders_allowed ?? p.backordersAllowed,
		updatedAt: new Date().toISOString(),
	};
	await products(ctx).put(id, updated);
	return { data: { id, stock_quantity: updated.stockQuantity, manage_stock: updated.manageStock, backorders_allowed: updated.backordersAllowed } };
}

export async function apiInventoryBatch(ctx: RouteContext<ApiInventoryBatchInput>) {
	const results: any[] = [];
	for (const upd of ctx.input.updates) {
		const p = await products(ctx).get(upd.id);
		if (!p) { results.push({ id: upd.id, error: "not found" }); continue; }
		p.stockQuantity = upd.stock_quantity;
		p.updatedAt = new Date().toISOString();
		await products(ctx).put(upd.id, p);
		results.push({ id: upd.id, stock_quantity: upd.stock_quantity });
	}
	return { data: results };
}

// ═══════════════════════════════════════════════════════════════
// COUPONS
// ═══════════════════════════════════════════════════════════════

export async function apiCouponList(ctx: RouteContext<ApiCouponListInput>) {
	const { page, per_page, search } = ctx.input;
	const total = await coupons(ctx).count();
	const result = await coupons(ctx).query({ orderBy: { createdAt: "desc" }, limit: per_page });
	let items = result.items.map((i) => ({
		id: i.id, code: i.data.code, type: i.data.type,
		amount: i.data.type === "percentage" ? String(i.data.value / 100) : toDollars(i.data.value),
		usage_count: i.data.usageCount, usage_limit: i.data.usageLimit,
		enabled: i.data.enabled,
		minimum_amount: i.data.minimumAmount ? toDollars(i.data.minimumAmount) : null,
		created_at: i.data.createdAt,
	}));
	if (search) { const t = search.toLowerCase(); items = items.filter((c) => c.code.toLowerCase().includes(t)); }
	return paginatedResponse(items, total, page, per_page);
}

// ═══════════════════════════════════════════════════════════════
// WEBHOOKS
// ═══════════════════════════════════════════════════════════════

export async function apiWebhookCreate(ctx: RouteContext<ApiWebhookCreateInput>) {
	const input = ctx.input;
	const id = ulid();
	await ctx.kv.set(`webhook:${id}`, { topic: input.topic, delivery_url: input.delivery_url, secret: input.secret ?? null, status: input.status ?? "active", created_at: new Date().toISOString() });

	// Add to webhook index
	const index = (await ctx.kv.get<string[]>("webhooks:index")) ?? [];
	index.push(id);
	await ctx.kv.set("webhooks:index", index);

	return { data: { id, ...input } };
}

export async function apiWebhookList(ctx: RouteContext) {
	const index = (await ctx.kv.get<string[]>("webhooks:index")) ?? [];
	const items: any[] = [];
	for (const id of index) {
		const wh = await ctx.kv.get<any>(`webhook:${id}`);
		if (wh) items.push({ id, ...wh });
	}
	return { data: items };
}

export async function apiWebhookDelete(ctx: RouteContext<ApiWebhookDeleteInput>) {
	await ctx.kv.delete(`webhook:${ctx.input.id}`);
	const index = (await ctx.kv.get<string[]>("webhooks:index")) ?? [];
	await ctx.kv.set("webhooks:index", index.filter((i) => i !== ctx.input.id));
	return { data: { id: ctx.input.id, deleted: true } };
}

// ─── Webhook Dispatch ───────────────────────────────────────────

async function fireWebhooks(ctx: RouteContext, topic: string, payload: unknown) {
	const index = (await ctx.kv.get<string[]>("webhooks:index")) ?? [];
	for (const id of index) {
		const wh = await ctx.kv.get<any>(`webhook:${id}`);
		if (!wh || wh.status !== "active" || wh.topic !== topic) continue;
		try {
			const body = JSON.stringify(payload);
			const headers: Record<string, string> = { "Content-Type": "application/json", "X-EC-Webhook-Topic": topic };
			if (wh.secret) {
				// HMAC-SHA256 signature
				const encoder = new TextEncoder();
				const key = await crypto.subtle.importKey("raw", encoder.encode(wh.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
				const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
				headers["X-EC-Webhook-Signature"] = btoa(String.fromCharCode(...new Uint8Array(sig)));
			}
			if (ctx.http) {
				await ctx.http.fetch(wh.delivery_url, { method: "POST", headers, body });
			}
		} catch { /* best effort */ }
	}
}
