/**
 * Public storefront route handlers.
 *
 * Everything here is internet-facing, so responses are built from an explicit
 * allow-list of fields: only active products are visible, and internal data
 * (cost price, download URLs, custom fields, stock counts) never leaves the
 * server.
 */

import type { PluginContext, RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";

import { COMMON_CURRENCIES } from "../constants.js";
import { resolvePrice } from "../engine/pricing-engine.js";
import type { StorefrontProductGetInput, StorefrontProductListInput } from "../schemas/storefront.js";
import type { Currency, Product, QuantityBreak, Variant } from "../types.js";
import { pricingStorage } from "./context.js";

// ─── Public shapes ──────────────────────────────────────────────

export interface PublicImage {
	url: string;
	alt: string;
}

export interface PublicProductSummary {
	id: string;
	name: string;
	slug: string;
	type: Product["type"];
	shortDescription: string;
	sku: string | null;
	/** Resolved unit price for a single unit (minor units) */
	price: number;
	/** Price before catalog/specific-price discounts, or compare-at price */
	originalPrice: number;
	images: PublicImage[];
	inStock: boolean;
	featured: boolean;
	categoryIds: string[];
	externalUrl: string | null;
	externalButtonText: string | null;
}

export interface PublicVariant {
	id: string;
	sku: string | null;
	attributes: Record<string, string>;
	price: number;
	originalPrice: number;
	inStock: boolean;
	image: PublicImage | null;
}

export interface PublicProductDetail extends PublicProductSummary {
	description: string;
	attributes: Array<{ name: string; values: string[] }>;
	variants: PublicVariant[];
	quantityBreaks: QuantityBreak[];
	seoTitle: string | null;
	seoDescription: string | null;
}

export interface StoreCurrency {
	code: string;
	symbol: string;
	symbolPosition: "before" | "after";
	decimalPlaces: number;
	thousandsSeparator: string;
	decimalSeparator: string;
}

// ─── Helpers ────────────────────────────────────────────────────

/** Product images are stored as URLs (or media IDs once media-library support lands). */
function toPublicImages(images: string[], alt: string): PublicImage[] {
	return images.filter(isUrlLike).map((url) => ({ url, alt }));
}

function isUrlLike(value: string): boolean {
	return /^(https?:)?\/\//i.test(value) || value.startsWith("/");
}

function productInStock(p: Pick<Product, "manageStock" | "stockQuantity" | "backordersAllowed">): boolean {
	return !p.manageStock || p.backordersAllowed || p.stockQuantity > 0;
}

async function priceFor(
	ctx: PluginContext,
	productId: string,
	variantId: string | null,
	currencyCode: string,
	compareAtPrice: number | null,
) {
	const resolved = await resolvePrice(
		{
			productId,
			variantId,
			quantity: 1,
			customerId: null,
			customerGroupId: null,
			countryCode: null,
			currencyCode,
			date: new Date(),
		},
		pricingStorage(ctx),
	);
	const originalPrice = Math.max(resolved.originalPrice, compareAtPrice ?? 0);
	return { price: resolved.unitPrice, originalPrice, quantityBreaks: resolved.quantityBreaks };
}

function summarize(id: string, p: Product, price: number, originalPrice: number): PublicProductSummary {
	return {
		id,
		name: p.name,
		slug: p.slug,
		type: p.type,
		shortDescription: p.shortDescription,
		sku: p.sku,
		price,
		originalPrice,
		images: toPublicImages(p.images, p.name),
		inStock: productInStock(p),
		featured: p.featured,
		categoryIds: p.categoryIds,
		externalUrl: p.type === "external" ? p.externalUrl : null,
		externalButtonText: p.type === "external" ? p.externalButtonText : null,
	};
}

export async function getStoreCurrency(ctx: PluginContext): Promise<StoreCurrency> {
	const code = ((await ctx.kv.get<string>("settings:defaultCurrency")) ?? "USD").toUpperCase();
	const stored = await (ctx.storage.currencies as StorageCollection<Currency>).query({
		where: { code },
		limit: 1,
	});
	const meta = stored.items[0]?.data ?? COMMON_CURRENCIES.find((c) => c.code === code);
	return {
		code,
		symbol: meta?.symbol ?? "$",
		symbolPosition: (meta?.symbolPosition as "before" | "after") ?? "before",
		decimalPlaces: meta?.decimalPlaces ?? 2,
		thousandsSeparator: meta?.thousandsSeparator ?? ",",
		decimalSeparator: meta?.decimalSeparator ?? ".",
	};
}

/** Load every active product (storefront catalogs are filtered/sorted in memory). */
async function loadActiveProducts(ctx: PluginContext): Promise<Array<{ id: string; data: Product }>> {
	const col = ctx.storage.products as StorageCollection<Product>;
	const out: Array<{ id: string; data: Product }> = [];
	let cursor: string | undefined;
	do {
		const page = await col.query({
			where: { status: "active" },
			orderBy: { createdAt: "desc" },
			limit: 100,
			cursor,
		});
		out.push(...page.items);
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor && out.length < 5000);
	return out;
}

// ─── Routes ─────────────────────────────────────────────────────

/** GET-style config the storefront needs to render prices and payment buttons. */
export async function storefrontConfigHandler(ctx: RouteContext) {
	const [storeName, taxInclusive, stripePk, paypalClientId, paypalSandbox, stripeSk, paypalSecret, storeCountry] =
		await Promise.all([
			ctx.kv.get<string>("settings:storeName"),
			ctx.kv.get<boolean>("settings:taxInclusive"),
			ctx.kv.get<string>("settings:stripePublishableKey"),
			ctx.kv.get<string>("settings:paypalClientId"),
			ctx.kv.get<boolean>("settings:paypalSandbox"),
			ctx.kv.get<string>("settings:stripeSecretKey"),
			ctx.kv.get<string>("settings:paypalClientSecret"),
			ctx.kv.get<string>("settings:storeCountry"),
		]);
	const currency = await getStoreCurrency(ctx);

	return {
		storeName: storeName ?? "",
		storeCountry: storeCountry || null,
		currency,
		taxInclusive: taxInclusive ?? false,
		payments: {
			stripe: {
				enabled: Boolean(stripePk && stripeSk),
				publishableKey: stripePk ?? null,
			},
			paypal: {
				enabled: Boolean(paypalClientId && paypalSecret),
				clientId: paypalClientId ?? null,
				sandbox: paypalSandbox !== false,
			},
		},
	};
}

export async function storefrontProductListHandler(ctx: RouteContext<StorefrontProductListInput>) {
	const input = ctx.input;
	const currency = await getStoreCurrency(ctx);

	let products = await loadActiveProducts(ctx);
	if (input.featured !== undefined) products = products.filter((p) => p.data.featured === input.featured);
	if (input.categoryId) products = products.filter((p) => p.data.categoryIds.includes(input.categoryId!));
	if (input.tagId) products = products.filter((p) => p.data.tagIds.includes(input.tagId!));
	if (input.search) {
		const term = input.search.toLowerCase();
		products = products.filter(
			(p) =>
				p.data.name.toLowerCase().includes(term) ||
				p.data.shortDescription.toLowerCase().includes(term) ||
				(p.data.sku?.toLowerCase().includes(term) ?? false),
		);
	}

	const dir = input.sortDir === "asc" ? 1 : -1;
	products.sort((a, b) => {
		switch (input.sortBy) {
			case "name":
				return a.data.name.localeCompare(b.data.name) * dir;
			case "price":
				return (a.data.price - b.data.price) * dir;
			case "sortOrder":
				return (a.data.sortOrder - b.data.sortOrder) * dir;
			default:
				return a.data.createdAt.localeCompare(b.data.createdAt) * dir;
		}
	});

	const offset = input.cursor ? Math.max(0, Number.parseInt(input.cursor, 10) || 0) : 0;
	const page = products.slice(offset, offset + input.limit);
	const items: PublicProductSummary[] = [];
	for (const { id, data } of page) {
		const { price, originalPrice } = await priceFor(ctx, id, null, currency.code, data.compareAtPrice);
		items.push(summarize(id, data, price, originalPrice));
	}

	const nextOffset = offset + page.length;
	return {
		items,
		total: products.length,
		hasMore: nextOffset < products.length,
		cursor: nextOffset < products.length ? String(nextOffset) : undefined,
		currency,
	};
}

export async function storefrontProductGetHandler(ctx: RouteContext<StorefrontProductGetInput>) {
	const col = ctx.storage.products as StorageCollection<Product>;
	let found: { id: string; data: Product } | null = null;

	if (ctx.input.id) {
		const data = await col.get(ctx.input.id);
		if (data) found = { id: ctx.input.id, data };
	} else if (ctx.input.slug) {
		const hit = await col.query({ where: { slug: ctx.input.slug }, limit: 1 });
		found = hit.items[0] ?? null;
	}
	// Drafts and archived products are indistinguishable from missing ones
	if (!found || found.data.status !== "active") throw PluginRouteError.notFound("Product not found");

	const { id, data: p } = found;
	const currency = await getStoreCurrency(ctx);
	const base = await priceFor(ctx, id, null, currency.code, p.compareAtPrice);

	const variantCol = ctx.storage.variants as StorageCollection<Variant>;
	const variantRows = await variantCol.query({ where: { productId: id }, limit: 100 });
	const variants: PublicVariant[] = [];
	for (const row of variantRows.items.filter((v) => v.data.enabled).sort((a, b) => a.data.sortOrder - b.data.sortOrder)) {
		const v = row.data;
		const vp = await priceFor(ctx, id, row.id, currency.code, v.compareAtPrice ?? p.compareAtPrice);
		variants.push({
			id: row.id,
			sku: v.sku,
			attributes: v.attributes,
			price: vp.price,
			originalPrice: vp.originalPrice,
			inStock: v.manageStock ? v.backordersAllowed || v.stockQuantity > 0 : productInStock(p),
			image: v.imageId && isUrlLike(v.imageId) ? { url: v.imageId, alt: p.name } : null,
		});
	}

	const detail: PublicProductDetail = {
		...summarize(id, p, base.price, base.originalPrice),
		inStock: variants.length > 0 ? variants.some((v) => v.inStock) : productInStock(p),
		description: p.description,
		attributes: p.attributes.filter((a) => a.visible || a.usedForVariants).map((a) => ({ name: a.name, values: a.values })),
		variants,
		quantityBreaks: base.quantityBreaks,
		seoTitle: p.seoTitle,
		seoDescription: p.seoDescription,
	};
	return { product: detail, currency };
}
