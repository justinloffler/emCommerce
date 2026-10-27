/**
 * Server-side storefront helpers for Astro pages.
 *
 * Calls the plugin's public storefront routes in-process through emdash's
 * route dispatcher (no HTTP round-trip), so pages get exactly the same
 * public, allow-listed data the browser would.
 *
 * @example
 * ```astro
 * ---
 * import { createStorefront } from "@emdash-cms/plugin-emcommerce/server";
 * const shop = createStorefront(Astro);
 * const { items, currency } = await shop.listProducts({ limit: 24 });
 * ---
 * ```
 */

import type { PublicProductDetail, PublicProductSummary, StoreCurrency } from "./handlers/storefront.js";

export type { PublicProductDetail, PublicProductSummary, PublicVariant, StoreCurrency } from "./handlers/storefront.js";

const PLUGIN_ID = "emcommerce";

interface HandlerResponse<T> {
	success: boolean;
	data?: T;
	error?: { code: string; message: string };
	status?: number;
}

interface AstroLike {
	url: URL;
	locals: {
		emdash?: {
			handlePublicPluginApiRoute?: (
				pluginId: string,
				method: string,
				path: string,
				request: Request,
			) => Promise<HandlerResponse<unknown>>;
		};
	};
}

export class StorefrontError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly status: number,
	) {
		super(message);
		this.name = "StorefrontError";
	}
}

export interface StorefrontConfig {
	storeName: string;
	storeCountry: string | null;
	currency: StoreCurrency;
	taxInclusive: boolean;
	payments: {
		stripe: { enabled: boolean; publishableKey: string | null };
		paypal: { enabled: boolean; clientId: string | null; sandbox: boolean };
	};
}

export interface ProductListOptions {
	categoryId?: string;
	tagId?: string;
	featured?: boolean;
	search?: string;
	sortBy?: "createdAt" | "name" | "price" | "sortOrder";
	sortDir?: "asc" | "desc";
	cursor?: string;
	limit?: number;
}

export interface ProductListResult {
	items: PublicProductSummary[];
	total: number;
	hasMore: boolean;
	cursor?: string;
	currency: StoreCurrency;
}

export function createStorefront(astro: AstroLike) {
	async function call<T>(route: string, body: Record<string, unknown>): Promise<T> {
		const dispatch = astro.locals.emdash?.handlePublicPluginApiRoute;
		if (!dispatch) {
			throw new StorefrontError("emdash runtime is not available on this request", "NO_RUNTIME", 500);
		}
		const url = new URL(`/_emdash/api/plugins/${PLUGIN_ID}/${route}`, astro.url);
		const request = new Request(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		const res = await dispatch(PLUGIN_ID, "POST", route, request);
		if (!res.success) {
			throw new StorefrontError(res.error?.message ?? "Storefront request failed", res.error?.code ?? "ERROR", res.status ?? 500);
		}
		return res.data as T;
	}

	return {
		config: () => call<StorefrontConfig>("storefront/config", {}),

		listProducts: (options: ProductListOptions = {}) =>
			call<ProductListResult>("storefront/products", options as Record<string, unknown>),

		/** Returns null when the product doesn't exist or isn't published. */
		async getProduct(ref: { slug: string } | { id: string }) {
			try {
				return await call<{ product: PublicProductDetail; currency: StoreCurrency }>("storefront/product", ref);
			} catch (err) {
				if (err instanceof StorefrontError && err.status === 404) return null;
				throw err;
			}
		},
	};
}

// ─── Prop mappers for the bundled Astro components ──────────────

/** Props for <ProductCard> / items of <ProductListPage products={...}> */
export function toProductCardProps(p: PublicProductSummary) {
	return {
		id: p.id,
		name: p.name,
		slug: p.slug,
		imageUrl: p.images[0]?.url,
		unitPrice: p.price,
		originalPrice: p.originalPrice > p.price ? p.originalPrice : undefined,
	};
}

/** Props for <ProductDetailPage {...}> */
export function toProductDetailProps(p: PublicProductDetail, currency: StoreCurrency) {
	return {
		id: p.id,
		name: p.name,
		description: p.description,
		shortDescription: p.shortDescription,
		images: p.images,
		unitPrice: p.price,
		originalPrice: p.originalPrice > p.price ? p.originalPrice : undefined,
		currencySymbol: currency.symbol,
		attributes: p.attributes,
		variants: p.variants.map((v) => ({
			id: v.id,
			attributes: v.attributes,
			price: v.price,
			enabled: v.inStock,
			imageId: v.image?.url ?? null,
		})),
		quantityBreaks: p.quantityBreaks,
		sku: p.sku,
		inStock: p.inStock,
	};
}
