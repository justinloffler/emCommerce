/**
 * Product, variant, category, and tag CRUD route handlers.
 */

import type { RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";
import type { WhereClause } from "../types.js";
import { ulid } from "ulidx";

import type {
	CategoryCreateInput,
	CategoryDeleteInput,
	CategoryListInput,
	CategoryUpdateInput,
	ProductCreateInput,
	ProductDeleteInput,
	ProductGetInput,
	ProductListInput,
	ProductUpdateInput,
	TagCreateInput,
	TagDeleteInput,
	TagListInput,
	VariantCreateInput,
	VariantDeleteInput,
	VariantListInput,
	VariantUpdateInput,
} from "../schemas/products.js";
import type { Category, Product, Tag, Variant } from "../types.js";

// ─── Typed Storage Accessors ────────────────────────────────────

function products(ctx: RouteContext): StorageCollection<Product> {
	return ctx.storage.products as StorageCollection<Product>;
}

function variants(ctx: RouteContext): StorageCollection<Variant> {
	return ctx.storage.variants as StorageCollection<Variant>;
}

function categories(ctx: RouteContext): StorageCollection<Category> {
	return ctx.storage.categories as StorageCollection<Category>;
}

function tags(ctx: RouteContext): StorageCollection<Tag> {
	return ctx.storage.tags as StorageCollection<Tag>;
}

// ═══════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════

export async function productListHandler(ctx: RouteContext<ProductListInput>) {
	const input = ctx.input;
	const where: WhereClause = {};

	if (input.status) where.status = input.status;
	if (input.type) where.type = input.type;
	// Note: boolean fields can't be used in SQLite where clauses — filter in post

	const result = await products(ctx).query({
		where: Object.keys(where).length > 0 ? where : undefined,
		orderBy: { [input.sortBy]: input.sortDir },
		limit: input.limit,
		cursor: input.cursor,
	});

	let items = result.items.map((item) => ({ id: item.id, ...item.data }));

	// Post-query filtering (arrays and booleans can't be indexed in SQLite)
	if (input.featured !== undefined) {
		items = items.filter((p) => p.featured === input.featured);
	}
	if (input.categoryId) {
		items = items.filter((p) => p.categoryIds.includes(input.categoryId!));
	}
	if (input.tagId) {
		items = items.filter((p) => p.tagIds.includes(input.tagId!));
	}
	if (input.search) {
		const term = input.search.toLowerCase();
		items = items.filter(
			(p) =>
				p.name.toLowerCase().includes(term) ||
				(p.sku && p.sku.toLowerCase().includes(term)),
		);
	}

	return {
		items,
		hasMore: result.hasMore,
		cursor: result.cursor,
	};
}

export async function productGetHandler(ctx: RouteContext<ProductGetInput>) {
	const input = ctx.input;

	if (input.id) {
		const product = await products(ctx).get(input.id);
		if (!product) throw PluginRouteError.notFound("Product not found");
		return { id: input.id, ...product };
	}

	if (input.slug) {
		const result = await products(ctx).query({
			where: { slug: input.slug },
			limit: 1,
		});
		if (result.items.length === 0) throw PluginRouteError.notFound("Product not found");
		return { id: result.items[0].id, ...result.items[0].data };
	}

	throw PluginRouteError.badRequest("Either id or slug must be provided");
}

export async function productCreateHandler(ctx: RouteContext<ProductCreateInput>) {
	const input = ctx.input;

	// Check slug uniqueness
	const existing = await products(ctx).query({
		where: { slug: input.slug },
		limit: 1,
	});
	if (existing.items.length > 0) {
		throw PluginRouteError.conflict(`A product with slug "${input.slug}" already exists`);
	}

	const now = new Date().toISOString();
	const id = ulid();
	const product: Product = {
		name: input.name,
		slug: input.slug,
		type: input.type,
		status: input.status ?? "draft",
		shortDescription: input.shortDescription ?? "",
		description: input.description ?? "",
		sku: input.sku ?? null,
		price: input.price,
		compareAtPrice: input.compareAtPrice ?? null,
		costPrice: input.costPrice ?? null,
		taxClassId: input.taxClassId,
		manageStock: input.manageStock ?? false,
		stockQuantity: input.stockQuantity ?? 0,
		lowStockThreshold: input.lowStockThreshold ?? 5,
		backordersAllowed: input.backordersAllowed ?? false,
		weight: input.weight ?? null,
		dimensions: input.dimensions ?? null,
		shippingClassId: input.shippingClassId ?? null,
		images: input.images ?? [],
		categoryIds: input.categoryIds ?? [],
		tagIds: input.tagIds ?? [],
		attributes: input.attributes ?? [],
		defaultVariantId: input.defaultVariantId ?? null,
		groupedProductIds: input.groupedProductIds ?? [],
		externalUrl: input.externalUrl ?? null,
		externalButtonText: input.externalButtonText ?? null,
		downloadFiles: input.downloadFiles ?? null,
		downloadLimit: input.downloadLimit ?? 0,
		downloadExpiry: input.downloadExpiry ?? 0,
		featured: input.featured ?? false,
		sortOrder: input.sortOrder ?? 0,
		seoTitle: input.seoTitle ?? null,
		seoDescription: input.seoDescription ?? null,
		customFields: (input as any).customFields ?? {},
		createdAt: now,
		updatedAt: now,
	};

	await products(ctx).put(id, product);
	return { id, ...product };
}

export async function productUpdateHandler(ctx: RouteContext<ProductUpdateInput>) {
	const input = ctx.input;

	const existing = await products(ctx).get(input.id);
	if (!existing) throw PluginRouteError.notFound("Product not found");

	// Check slug uniqueness if changing
	if (input.slug && input.slug !== existing.slug) {
		const slugCheck = await products(ctx).query({
			where: { slug: input.slug },
			limit: 1,
		});
		if (slugCheck.items.length > 0) {
			throw PluginRouteError.conflict(`A product with slug "${input.slug}" already exists`);
		}
	}

	const updated: Product = {
		...existing,
		name: input.name ?? existing.name,
		slug: input.slug ?? existing.slug,
		type: input.type ?? existing.type,
		status: input.status ?? existing.status,
		shortDescription: input.shortDescription ?? existing.shortDescription,
		description: input.description ?? existing.description,
		sku: input.sku !== undefined ? input.sku : existing.sku,
		price: input.price ?? existing.price,
		compareAtPrice: input.compareAtPrice !== undefined ? input.compareAtPrice : existing.compareAtPrice,
		costPrice: input.costPrice !== undefined ? input.costPrice : existing.costPrice,
		taxClassId: input.taxClassId ?? existing.taxClassId,
		manageStock: input.manageStock ?? existing.manageStock,
		stockQuantity: input.stockQuantity ?? existing.stockQuantity,
		lowStockThreshold: input.lowStockThreshold ?? existing.lowStockThreshold,
		backordersAllowed: input.backordersAllowed ?? existing.backordersAllowed,
		weight: input.weight !== undefined ? input.weight : existing.weight,
		dimensions: input.dimensions !== undefined ? input.dimensions : existing.dimensions,
		shippingClassId: input.shippingClassId !== undefined ? input.shippingClassId : existing.shippingClassId,
		images: input.images ?? existing.images,
		categoryIds: input.categoryIds ?? existing.categoryIds,
		tagIds: input.tagIds ?? existing.tagIds,
		attributes: input.attributes ?? existing.attributes,
		defaultVariantId: input.defaultVariantId !== undefined ? input.defaultVariantId : existing.defaultVariantId,
		groupedProductIds: input.groupedProductIds ?? existing.groupedProductIds,
		externalUrl: input.externalUrl !== undefined ? input.externalUrl : existing.externalUrl,
		externalButtonText: input.externalButtonText !== undefined ? input.externalButtonText : existing.externalButtonText,
		downloadFiles: input.downloadFiles !== undefined ? input.downloadFiles : existing.downloadFiles,
		downloadLimit: input.downloadLimit ?? existing.downloadLimit,
		downloadExpiry: input.downloadExpiry ?? existing.downloadExpiry,
		featured: input.featured ?? existing.featured,
		sortOrder: input.sortOrder ?? existing.sortOrder,
		seoTitle: input.seoTitle !== undefined ? input.seoTitle : existing.seoTitle,
		seoDescription: input.seoDescription !== undefined ? input.seoDescription : existing.seoDescription,
		customFields: (input as any).customFields !== undefined ? (input as any).customFields : existing.customFields,
		updatedAt: new Date().toISOString(),
	};

	await products(ctx).put(input.id, updated);
	return { id: input.id, ...updated };
}

export async function productDeleteHandler(ctx: RouteContext<ProductDeleteInput>) {
	const input = ctx.input;

	const existing = await products(ctx).get(input.id);
	if (!existing) throw PluginRouteError.notFound("Product not found");

	// Delete associated variants if requested
	if (input.deleteVariants) {
		await deleteProductVariants(input.id, ctx);
	}

	// Delete associated specific prices
	await deleteProductSpecificPrices(input.id, ctx);

	await products(ctx).delete(input.id);
	return { deleted: true };
}

// ═══════════════════════════════════════════════════════════════
// VARIANTS
// ═══════════════════════════════════════════════════════════════

export async function variantListHandler(ctx: RouteContext<VariantListInput>) {
	const input = ctx.input;
	const where: WhereClause = { productId: input.productId };
	if (input.enabled !== undefined) where.enabled = input.enabled;

	const result = await variants(ctx).query({
		where,
		orderBy: { sortOrder: "asc" },
		limit: input.limit,
		cursor: input.cursor,
	});

	return {
		items: result.items.map((item) => ({ id: item.id, ...item.data })),
		hasMore: result.hasMore,
		cursor: result.cursor,
	};
}

export async function variantCreateHandler(ctx: RouteContext<VariantCreateInput>) {
	const input = ctx.input;

	// Verify product exists
	const product = await products(ctx).get(input.productId);
	if (!product) throw PluginRouteError.notFound("Product not found");

	// Check SKU uniqueness
	if (input.sku) {
		const skuCheck = await variants(ctx).query({
			where: { sku: input.sku },
			limit: 1,
		});
		if (skuCheck.items.length > 0) {
			throw PluginRouteError.conflict(`A variant with SKU "${input.sku}" already exists`);
		}
	}

	const now = new Date().toISOString();
	const id = ulid();
	const variant: Variant = {
		productId: input.productId,
		sku: input.sku ?? null,
		attributes: input.attributes,
		price: input.price ?? null,
		compareAtPrice: input.compareAtPrice ?? null,
		manageStock: input.manageStock ?? false,
		stockQuantity: input.stockQuantity ?? 0,
		backordersAllowed: input.backordersAllowed ?? false,
		weight: input.weight ?? null,
		imageId: input.imageId ?? null,
		enabled: input.enabled ?? true,
		sortOrder: input.sortOrder ?? 0,
		createdAt: now,
		updatedAt: now,
	};

	await variants(ctx).put(id, variant);
	return { id, ...variant };
}

export async function variantUpdateHandler(ctx: RouteContext<VariantUpdateInput>) {
	const input = ctx.input;

	const existing = await variants(ctx).get(input.id);
	if (!existing) throw PluginRouteError.notFound("Variant not found");

	// Check SKU uniqueness if changing
	if (input.sku && input.sku !== existing.sku) {
		const skuCheck = await variants(ctx).query({
			where: { sku: input.sku },
			limit: 1,
		});
		if (skuCheck.items.length > 0) {
			throw PluginRouteError.conflict(`A variant with SKU "${input.sku}" already exists`);
		}
	}

	const updated: Variant = {
		...existing,
		sku: input.sku !== undefined ? input.sku : existing.sku,
		attributes: input.attributes ?? existing.attributes,
		price: input.price !== undefined ? input.price : existing.price,
		compareAtPrice: input.compareAtPrice !== undefined ? input.compareAtPrice : existing.compareAtPrice,
		manageStock: input.manageStock ?? existing.manageStock,
		stockQuantity: input.stockQuantity ?? existing.stockQuantity,
		backordersAllowed: input.backordersAllowed ?? existing.backordersAllowed,
		weight: input.weight !== undefined ? input.weight : existing.weight,
		imageId: input.imageId !== undefined ? input.imageId : existing.imageId,
		enabled: input.enabled ?? existing.enabled,
		sortOrder: input.sortOrder ?? existing.sortOrder,
		updatedAt: new Date().toISOString(),
	};

	await variants(ctx).put(input.id, updated);
	return { id: input.id, ...updated };
}

export async function variantDeleteHandler(ctx: RouteContext<VariantDeleteInput>) {
	const existing = await variants(ctx).get(ctx.input.id);
	if (!existing) throw PluginRouteError.notFound("Variant not found");

	await variants(ctx).delete(ctx.input.id);
	return { deleted: true };
}

// ═══════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════

export async function categoryListHandler(ctx: RouteContext<CategoryListInput>) {
	const input = ctx.input;
	const where: WhereClause = {};
	if (input.parentId !== undefined) where.parentId = input.parentId;

	const result = await categories(ctx).query({
		where: Object.keys(where).length > 0 ? where : undefined,
		orderBy: { sortOrder: "asc" },
		limit: input.limit,
		cursor: input.cursor,
	});

	return {
		items: result.items.map((item) => ({ id: item.id, ...item.data })),
		hasMore: result.hasMore,
		cursor: result.cursor,
	};
}

export async function categoryCreateHandler(ctx: RouteContext<CategoryCreateInput>) {
	const input = ctx.input;

	const existing = await categories(ctx).query({
		where: { slug: input.slug },
		limit: 1,
	});
	if (existing.items.length > 0) {
		throw PluginRouteError.conflict(`A category with slug "${input.slug}" already exists`);
	}

	const now = new Date().toISOString();
	const id = ulid();
	const category: Category = {
		name: input.name,
		slug: input.slug,
		parentId: input.parentId ?? null,
		description: input.description ?? "",
		imageId: input.imageId ?? null,
		sortOrder: input.sortOrder ?? 0,
		createdAt: now,
		updatedAt: now,
	};

	await categories(ctx).put(id, category);
	return { id, ...category };
}

export async function categoryUpdateHandler(ctx: RouteContext<CategoryUpdateInput>) {
	const input = ctx.input;

	const existing = await categories(ctx).get(input.id);
	if (!existing) throw PluginRouteError.notFound("Category not found");

	if (input.slug && input.slug !== existing.slug) {
		const slugCheck = await categories(ctx).query({
			where: { slug: input.slug },
			limit: 1,
		});
		if (slugCheck.items.length > 0) {
			throw PluginRouteError.conflict(`A category with slug "${input.slug}" already exists`);
		}
	}

	const updated: Category = {
		...existing,
		name: input.name ?? existing.name,
		slug: input.slug ?? existing.slug,
		parentId: input.parentId !== undefined ? input.parentId : existing.parentId,
		description: input.description ?? existing.description,
		imageId: input.imageId !== undefined ? input.imageId : existing.imageId,
		sortOrder: input.sortOrder ?? existing.sortOrder,
		updatedAt: new Date().toISOString(),
	};

	await categories(ctx).put(input.id, updated);
	return { id: input.id, ...updated };
}

export async function categoryDeleteHandler(ctx: RouteContext<CategoryDeleteInput>) {
	const existing = await categories(ctx).get(ctx.input.id);
	if (!existing) throw PluginRouteError.notFound("Category not found");

	await categories(ctx).delete(ctx.input.id);
	return { deleted: true };
}

// ═══════════════════════════════════════════════════════════════
// TAGS
// ═══════════════════════════════════════════════════════════════

export async function tagListHandler(ctx: RouteContext<TagListInput>) {
	const input = ctx.input;

	const result = await tags(ctx).query({
		orderBy: { createdAt: "desc" },
		limit: input.limit,
		cursor: input.cursor,
	});

	let items = result.items.map((item) => ({ id: item.id, ...item.data }));

	if (input.search) {
		const term = input.search.toLowerCase();
		items = items.filter((t) => t.name.toLowerCase().includes(term));
	}

	return {
		items,
		hasMore: result.hasMore,
		cursor: result.cursor,
	};
}

export async function tagCreateHandler(ctx: RouteContext<TagCreateInput>) {
	const input = ctx.input;

	const existing = await tags(ctx).query({
		where: { slug: input.slug },
		limit: 1,
	});
	if (existing.items.length > 0) {
		throw PluginRouteError.conflict(`A tag with slug "${input.slug}" already exists`);
	}

	const id = ulid();
	const tag: Tag = {
		name: input.name,
		slug: input.slug,
		createdAt: new Date().toISOString(),
	};

	await tags(ctx).put(id, tag);
	return { id, ...tag };
}

export async function tagDeleteHandler(ctx: RouteContext<TagDeleteInput>) {
	const existing = await tags(ctx).get(ctx.input.id);
	if (!existing) throw PluginRouteError.notFound("Tag not found");

	await tags(ctx).delete(ctx.input.id);
	return { deleted: true };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

async function deleteProductVariants(productId: string, ctx: RouteContext) {
	let cursor: string | undefined;
	do {
		const batch = await variants(ctx).query({
			where: { productId },
			limit: 100,
			cursor,
		});
		const ids = batch.items.map((item) => item.id);
		if (ids.length > 0) {
			await variants(ctx).deleteMany(ids);
		}
		cursor = batch.cursor;
	} while (cursor);
}

async function deleteProductSpecificPrices(productId: string, ctx: RouteContext) {
	const specificPrices = ctx.storage["specific-prices"] as StorageCollection;
	let cursor: string | undefined;
	do {
		const batch = await specificPrices.query({
			where: { productId },
			limit: 100,
			cursor,
		});
		const ids = batch.items.map((item) => item.id);
		if (ids.length > 0) {
			await specificPrices.deleteMany(ids);
		}
		cursor = batch.cursor;
	} while (cursor);
}
