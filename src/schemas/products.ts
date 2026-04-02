/**
 * Zod schemas for product and variant route validation.
 */

import { z } from "astro/zod";

// ─── Shared Sub-schemas ─────────────────────────────────────────

const slugRegex = /^[a-z][a-z0-9-]*$/;

const productDimensionsSchema = z
	.object({
		length: z.number().min(0),
		width: z.number().min(0),
		height: z.number().min(0),
	})
	.nullable()
	.default(null);

const productAttributeSchema = z.object({
	name: z.string().min(1).max(100),
	values: z.array(z.string().min(1)).min(1),
	usedForVariants: z.boolean().default(false),
	visible: z.boolean().default(true),
});

const downloadFileSchema = z.object({
	name: z.string().min(1),
	url: z.string().min(1),
});

// ─── Product CRUD ───────────────────────────────────────────────

export const productCreateSchema = z.object({
	name: z.string().min(1).max(200),
	slug: z.string().min(1).max(100).regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens"),
	type: z.enum(["simple", "variable", "grouped", "virtual", "downloadable", "external"]),
	status: z.enum(["draft", "active", "archived"]).default("draft"),
	shortDescription: z.string().max(500).default(""),
	description: z.string().default(""),
	sku: z.string().max(100).nullable().default(null),
	price: z.number().int().min(0),
	compareAtPrice: z.number().int().min(0).nullable().default(null),
	costPrice: z.number().int().min(0).nullable().default(null),
	taxClassId: z.string().min(1),
	manageStock: z.boolean().default(false),
	stockQuantity: z.number().int().min(0).default(0),
	lowStockThreshold: z.number().int().min(0).default(5),
	backordersAllowed: z.boolean().default(false),
	weight: z.number().min(0).nullable().default(null),
	dimensions: productDimensionsSchema,
	shippingClassId: z.string().nullable().default(null),
	images: z.array(z.string()).default([]),
	categoryIds: z.array(z.string()).default([]),
	tagIds: z.array(z.string()).default([]),
	attributes: z.array(productAttributeSchema).default([]),
	defaultVariantId: z.string().nullable().default(null),
	groupedProductIds: z.array(z.string()).default([]),
	externalUrl: z.string().url().nullable().default(null),
	externalButtonText: z.string().max(100).nullable().default(null),
	downloadFiles: z.array(downloadFileSchema).nullable().default(null),
	downloadLimit: z.number().int().min(0).default(0),
	downloadExpiry: z.number().int().min(0).default(0),
	featured: z.boolean().default(false),
	sortOrder: z.number().int().default(0),
	seoTitle: z.string().max(200).nullable().default(null),
	seoDescription: z.string().max(500).nullable().default(null),
});

export const productUpdateSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(200).optional(),
	slug: z.string().min(1).max(100).regex(slugRegex).optional(),
	type: z.enum(["simple", "variable", "grouped", "virtual", "downloadable", "external"]).optional(),
	status: z.enum(["draft", "active", "archived"]).optional(),
	shortDescription: z.string().max(500).optional(),
	description: z.string().optional(),
	sku: z.string().max(100).nullable().optional(),
	price: z.number().int().min(0).optional(),
	compareAtPrice: z.number().int().min(0).nullable().optional(),
	costPrice: z.number().int().min(0).nullable().optional(),
	taxClassId: z.string().min(1).optional(),
	manageStock: z.boolean().optional(),
	stockQuantity: z.number().int().min(0).optional(),
	lowStockThreshold: z.number().int().min(0).optional(),
	backordersAllowed: z.boolean().optional(),
	weight: z.number().min(0).nullable().optional(),
	dimensions: productDimensionsSchema.optional(),
	shippingClassId: z.string().nullable().optional(),
	images: z.array(z.string()).optional(),
	categoryIds: z.array(z.string()).optional(),
	tagIds: z.array(z.string()).optional(),
	attributes: z.array(productAttributeSchema).optional(),
	defaultVariantId: z.string().nullable().optional(),
	groupedProductIds: z.array(z.string()).optional(),
	externalUrl: z.string().url().nullable().optional(),
	externalButtonText: z.string().max(100).nullable().optional(),
	downloadFiles: z.array(downloadFileSchema).nullable().optional(),
	downloadLimit: z.number().int().min(0).optional(),
	downloadExpiry: z.number().int().min(0).optional(),
	featured: z.boolean().optional(),
	sortOrder: z.number().int().optional(),
	seoTitle: z.string().max(200).nullable().optional(),
	seoDescription: z.string().max(500).nullable().optional(),
});

export const productDeleteSchema = z.object({
	id: z.string().min(1),
	deleteVariants: z.boolean().default(true),
});

export const productListSchema = z.object({
	status: z.enum(["draft", "active", "archived"]).optional(),
	type: z.enum(["simple", "variable", "grouped", "virtual", "downloadable", "external"]).optional(),
	featured: z.boolean().optional(),
	categoryId: z.string().optional(),
	tagId: z.string().optional(),
	search: z.string().optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(50),
	sortBy: z.enum(["createdAt", "name", "price", "sortOrder"]).default("createdAt"),
	sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const productGetSchema = z.object({
	id: z.string().min(1).optional(),
	slug: z.string().min(1).optional(),
}).refine((data) => data.id || data.slug, "Either id or slug must be provided");

// ─── Variant CRUD ───────────────────────────────────────────────

export const variantCreateSchema = z.object({
	productId: z.string().min(1),
	sku: z.string().max(100).nullable().default(null),
	attributes: z.record(z.string(), z.string()),
	price: z.number().int().min(0).nullable().default(null),
	compareAtPrice: z.number().int().min(0).nullable().default(null),
	manageStock: z.boolean().default(false),
	stockQuantity: z.number().int().min(0).default(0),
	backordersAllowed: z.boolean().default(false),
	weight: z.number().min(0).nullable().default(null),
	imageId: z.string().nullable().default(null),
	enabled: z.boolean().default(true),
	sortOrder: z.number().int().default(0),
});

export const variantUpdateSchema = z.object({
	id: z.string().min(1),
	sku: z.string().max(100).nullable().optional(),
	attributes: z.record(z.string(), z.string()).optional(),
	price: z.number().int().min(0).nullable().optional(),
	compareAtPrice: z.number().int().min(0).nullable().optional(),
	manageStock: z.boolean().optional(),
	stockQuantity: z.number().int().min(0).optional(),
	backordersAllowed: z.boolean().optional(),
	weight: z.number().min(0).nullable().optional(),
	imageId: z.string().nullable().optional(),
	enabled: z.boolean().optional(),
	sortOrder: z.number().int().optional(),
});

export const variantDeleteSchema = z.object({
	id: z.string().min(1),
});

export const variantListSchema = z.object({
	productId: z.string().min(1),
	enabled: z.boolean().optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

// ─── Category CRUD ──────────────────────────────────────────────

export const categoryCreateSchema = z.object({
	name: z.string().min(1).max(200),
	slug: z.string().min(1).max(100).regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens"),
	parentId: z.string().nullable().default(null),
	description: z.string().max(1000).default(""),
	imageId: z.string().nullable().default(null),
	sortOrder: z.number().int().default(0),
});

export const categoryUpdateSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(200).optional(),
	slug: z.string().min(1).max(100).regex(slugRegex).optional(),
	parentId: z.string().nullable().optional(),
	description: z.string().max(1000).optional(),
	imageId: z.string().nullable().optional(),
	sortOrder: z.number().int().optional(),
});

export const categoryDeleteSchema = z.object({
	id: z.string().min(1),
});

export const categoryListSchema = z.object({
	parentId: z.string().nullable().optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(100),
});

// ─── Tag CRUD ───────────────────────────────────────────────────

export const tagCreateSchema = z.object({
	name: z.string().min(1).max(100),
	slug: z.string().min(1).max(100).regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens"),
});

export const tagDeleteSchema = z.object({
	id: z.string().min(1),
});

export const tagListSchema = z.object({
	search: z.string().optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(100),
});

// ─── Type Exports ───────────────────────────────────────────────

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductDeleteInput = z.infer<typeof productDeleteSchema>;
export type ProductListInput = z.infer<typeof productListSchema>;
export type ProductGetInput = z.infer<typeof productGetSchema>;
export type VariantCreateInput = z.infer<typeof variantCreateSchema>;
export type VariantUpdateInput = z.infer<typeof variantUpdateSchema>;
export type VariantDeleteInput = z.infer<typeof variantDeleteSchema>;
export type VariantListInput = z.infer<typeof variantListSchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
export type CategoryDeleteInput = z.infer<typeof categoryDeleteSchema>;
export type CategoryListInput = z.infer<typeof categoryListSchema>;
export type TagCreateInput = z.infer<typeof tagCreateSchema>;
export type TagDeleteInput = z.infer<typeof tagDeleteSchema>;
export type TagListInput = z.infer<typeof tagListSchema>;
