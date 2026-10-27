/**
 * Core data model types for emCommerce.
 *
 * All monetary values are integers in the smallest currency unit (cents for USD/EUR).
 * Percentages are stored as basis points (10000 = 100%).
 * Dates are ISO 8601 strings. IDs are ULIDs.
 */

import type { StorageCollection } from "emdash";
import type {
	CouponType,
	EmailType,
	OrderStatus,
	PaymentStatus,
	ProductStatus,
	ProductType,
	ReductionType,
	ShippingMethodType,
} from "./constants.js";

export type {
	CouponType,
	EmailType,
	OrderStatus,
	PaymentStatus,
	ProductStatus,
	ProductType,
	ReductionType,
	ShippingMethodType,
} from "./constants.js";

/** Storage query `where` clause (emdash doesn't export this type directly). */
export type WhereClause = NonNullable<Parameters<StorageCollection["count"]>[0]>;

// ─── Products ───────────────────────────────────────────────────

export interface Product {
	name: string;
	slug: string;
	type: ProductType;
	status: ProductStatus;
	shortDescription: string;
	description: string;
	sku: string | null;
	/** Base price in smallest currency unit (cents) */
	price: number;
	/** Strikethrough / compare-at price */
	compareAtPrice: number | null;
	/** Cost price for margin calculation */
	costPrice: number | null;
	taxClassId: string;
	manageStock: boolean;
	stockQuantity: number;
	lowStockThreshold: number;
	backordersAllowed: boolean;
	/** Weight in grams */
	weight: number | null;
	dimensions: ProductDimensions | null;
	shippingClassId: string | null;
	/** Media library IDs */
	images: string[];
	categoryIds: string[];
	tagIds: string[];
	attributes: ProductAttribute[];
	/** Default variant to show (for variable products) */
	defaultVariantId: string | null;
	/** Child product IDs (for grouped products) */
	groupedProductIds: string[];
	/** Buy link (for external products) */
	externalUrl: string | null;
	externalButtonText: string | null;
	/** Downloadable files (for downloadable products) */
	downloadFiles: DownloadFile[] | null;
	/** Max downloads per purchase (0 = unlimited) */
	downloadLimit: number;
	/** Days until download link expires (0 = never) */
	downloadExpiry: number;
	featured: boolean;
	sortOrder: number;
	seoTitle: string | null;
	seoDescription: string | null;
	/** User-defined custom fields (applies to all products of this type) */
	customFields: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

export interface ProductDimensions {
	/** Length in cm */
	length: number;
	/** Width in cm */
	width: number;
	/** Height in cm */
	height: number;
}

export interface ProductAttribute {
	name: string;
	values: string[];
	/** Whether this attribute is used for variant generation */
	usedForVariants: boolean;
	visible: boolean;
}

export interface DownloadFile {
	name: string;
	/** Media library ID or external URL */
	url: string;
}

// ─── Variants ───────────────────────────────────────────────────

export interface Variant {
	productId: string;
	sku: string | null;
	/** Attribute name → value for this combination, e.g. { color: "Red", size: "L" } */
	attributes: Record<string, string>;
	/** null = inherit product base price */
	price: number | null;
	compareAtPrice: number | null;
	manageStock: boolean;
	stockQuantity: number;
	backordersAllowed: boolean;
	weight: number | null;
	imageId: string | null;
	enabled: boolean;
	sortOrder: number;
	createdAt: string;
	updatedAt: string;
}

// ─── Categories ─────────────────────────────────────────────────

export interface Category {
	name: string;
	slug: string;
	parentId: string | null;
	description: string;
	imageId: string | null;
	sortOrder: number;
	createdAt: string;
	updatedAt: string;
}

// ─── Tags ───────────────────────────────────────────────────────

export interface Tag {
	name: string;
	slug: string;
	createdAt: string;
}

// ─── Specific Prices (PrestaShop-style per-product rules) ───────

export interface SpecificPrice {
	/** null = applies to all products */
	productId: string | null;
	variantId: string | null;
	customerGroupId: string | null;
	customerId: string | null;
	countryCode: string | null;
	currencyCode: string | null;
	/** Minimum quantity to trigger this rule (default 1) */
	fromQuantity: number;
	reductionType: ReductionType;
	/** In cents (for amount) or basis points (for percentage) */
	reductionValue: number;
	reductionTaxIncluded: boolean;
	/** Fixed price override (null = apply reduction to base price) */
	price: number | null;
	startDate: string | null;
	endDate: string | null;
	/** 0 = highest priority (wins first), max 4 */
	priority: number;
	createdAt: string;
	updatedAt: string;
}

// ─── Catalog Price Rules (bulk rules with condition groups) ─────

export interface CatalogPriceRule {
	name: string;
	description: string;
	enabled: boolean;
	/** AND between groups — all groups must match */
	conditionGroups: ConditionGroup[];
	reductionType: ReductionType;
	/** In cents (for amount) or basis points (for percentage) */
	reductionValue: number;
	reductionTaxIncluded: boolean;
	startDate: string | null;
	endDate: string | null;
	/** 0 = highest priority */
	priority: number;
	createdAt: string;
	updatedAt: string;
}

/** A condition group: OR within — at least one condition must match */
export interface ConditionGroup {
	conditions: PriceCondition[];
}

export type PriceCondition =
	| { type: "category"; categoryIds: string[] }
	| { type: "tag"; tagIds: string[] }
	| { type: "attribute"; attributeName: string; values: string[] }
	| { type: "price_range"; min: number; max: number };

// ─── Carts ──────────────────────────────────────────────────────

export interface Cart {
	sessionId: string;
	userId: string | null;
	items: CartItem[];
	couponCodes: string[];
	shippingMethodId: string | null;
	shippingAddress: Address | null;
	billingAddress: Address | null;
	currencyCode: string;
	note: string | null;
	expiresAt: string;
	createdAt: string;
	updatedAt: string;
}

export interface CartItem {
	productId: string;
	variantId: string | null;
	quantity: number;
}

// ─── Orders ─────────────────────────────────────────────────────

export interface Order {
	orderNumber: string;
	status: OrderStatus;
	customerId: string | null;
	customerEmail: string;
	customerNote: string | null;
	billingAddress: Address;
	shippingAddress: Address | null;
	/** Snapshotted at order creation time — immutable to later product changes */
	items: OrderItem[];
	/** All amounts in smallest currency unit */
	subtotal: number;
	shippingTotal: number;
	shippingMethod: string;
	taxTotal: number;
	taxBreakdown: TaxLine[];
	discountTotal: number;
	discountBreakdown: DiscountLine[];
	total: number;
	currencyCode: string;
	paymentMethod: string;
	paymentIntentId: string | null;
	/** Provider capture/charge reference once paid (PayPal capture ID, Stripe charge ID) */
	paymentCaptureId?: string | null;
	paymentStatus: PaymentStatus;
	/** Cart the order was created from; deleted once payment succeeds */
	cartId?: string | null;
	/** Coupon codes applied (usage counts are incremented once payment succeeds) */
	couponCodes?: string[];
	/** Whether item prices included tax when the order was placed */
	taxInclusive?: boolean;
	/** Tax contained in shippingTotal */
	shippingTax?: number;
	/** Human-readable shipping method name, snapshotted at order time */
	shippingMethodName?: string | null;
	refunds: Refund[];
	adminNotes: AdminNote[];
	ipAddress: string | null;
	/** User-defined custom fields (applies to all orders) */
	customFields: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
}

export interface OrderItem {
	productId: string;
	variantId: string | null;
	/** Snapshotted product name at time of order */
	name: string;
	sku: string | null;
	quantity: number;
	/** Unit price after discounts (cents) */
	unitPrice: number;
	/** Original unit price before discounts */
	originalPrice: number;
	/** Line total = unitPrice × quantity */
	total: number;
	taxAmount: number;
	taxClassId: string;
	/** Snapshotted variant attributes */
	attributes: Record<string, string>;
}

export interface TaxLine {
	name: string;
	/** Rate in basis points */
	rate: number;
	amount: number;
}

export interface DiscountLine {
	source: "coupon" | "specific_price" | "catalog_rule";
	name: string;
	amount: number;
}

export interface Refund {
	id: string;
	amount: number;
	reason: string;
	refundId: string;
	createdAt: string;
}

export interface AdminNote {
	id: string;
	content: string;
	isSystem: boolean;
	createdAt: string;
}

// ─── Addresses ──────────────────────────────────────────────────

export interface Address {
	firstName: string;
	lastName: string;
	company: string | null;
	addressLine1: string;
	addressLine2: string | null;
	city: string;
	stateCode: string | null;
	postalCode: string;
	countryCode: string;
	phone: string | null;
}

// ─── Customers ──────────────────────────────────────────────────

export interface Customer {
	userId: string | null;
	email: string;
	firstName: string;
	lastName: string;
	phone: string | null;
	groupId: string | null;
	addresses: CustomerAddress[];
	defaultBillingAddressId: string | null;
	defaultShippingAddressId: string | null;
	totalOrders: number;
	totalSpent: number;
	note: string | null;
	/** User-defined custom fields (applies to all customers) */
	customFields: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

export interface CustomerAddress extends Address {
	id: string;
	label: string | null;
}

// ─── Customer Groups ────────────────────────────────────────────

export interface CustomerGroup {
	name: string;
	slug: string;
	description: string;
	isDefault: boolean;
	createdAt: string;
	updatedAt: string;
}

// ─── Shipping ───────────────────────────────────────────────────

export interface ShippingZone {
	name: string;
	regions: ShippingRegion[];
	methods: ShippingMethod[];
	sortOrder: number;
	createdAt: string;
	updatedAt: string;
}

export interface ShippingRegion {
	countryCode: string;
	stateCode: string | null;
}

export interface ShippingMethod {
	id: string;
	type: ShippingMethodType;
	name: string;
	enabled: boolean;
	/** Flat rate cost (cents) */
	cost: number | null;
	/** Free shipping minimum order amount (cents) */
	freeShippingMinimum: number | null;
	/** Weight-based rate tiers */
	weightRates: WeightRate[] | null;
	/** Price-based rate tiers */
	priceRates: PriceRate[] | null;
	sortOrder: number;
}

export interface WeightRate {
	/** Min weight in grams (inclusive) */
	minWeight: number;
	/** Max weight in grams (exclusive, null = unlimited) */
	maxWeight: number | null;
	cost: number;
}

export interface PriceRate {
	/** Min order subtotal in cents (inclusive) */
	minPrice: number;
	/** Max order subtotal in cents (exclusive, null = unlimited) */
	maxPrice: number | null;
	cost: number;
}

// ─── Tax ────────────────────────────────────────────────────────

export interface TaxClass {
	name: string;
	slug: string;
	description: string;
	isDefault: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface TaxRule {
	taxClassId: string;
	countryCode: string;
	stateCode: string | null;
	/** Wildcard or range, e.g. "12345" or "123*" or "12300-12399" */
	postalCodePattern: string | null;
	/** Rate in basis points (e.g. 2000 = 20%) */
	rate: number;
	name: string;
	/** Compound taxes are calculated on subtotal + prior non-compound taxes */
	compound: boolean;
	priority: number;
	createdAt: string;
}

// ─── Coupons ────────────────────────────────────────────────────

export interface Coupon {
	code: string;
	description: string;
	type: CouponType;
	/** In cents (for fixed) or basis points (for percentage) */
	value: number;
	/** Minimum order subtotal (cents) to apply */
	minimumAmount: number | null;
	/** Maximum discount amount (cents, null = unlimited) */
	maximumDiscount: number | null;
	/** Total usage limit (null = unlimited) */
	usageLimit: number | null;
	/** Per-customer usage limit (null = unlimited) */
	usageLimitPerCustomer: number | null;
	usageCount: number;
	/** Restrict to these product IDs (null = all) */
	productIds: string[] | null;
	/** Restrict to these category IDs (null = all) */
	categoryIds: string[] | null;
	/** Restrict to these customer group IDs (null = all) */
	customerGroupIds: string[] | null;
	/** Can combine with other coupons? */
	allowStacking: boolean;
	enabled: boolean;
	startDate: string | null;
	endDate: string | null;
	createdAt: string;
	updatedAt: string;
}

// ─── Currencies ─────────────────────────────────────────────────

export interface Currency {
	code: string;
	name: string;
	symbol: string;
	symbolPosition: "before" | "after";
	decimalPlaces: number;
	thousandsSeparator: string;
	decimalSeparator: string;
	/** Exchange rate relative to default currency (basis points: 10000 = 1:1) */
	exchangeRate: number;
	isDefault: boolean;
	enabled: boolean;
	updatedAt: string;
}

// ─── Email Settings ─────────────────────────────────────────────

export interface EmailSettings {
	type: EmailType;
	enabled: boolean;
	subject: string;
	body: string;
	updatedAt: string;
}

// ─── Custom Field Definitions ───────────────────────────────────

export type CustomFieldEntityType = "product" | "order" | "customer";

export interface CustomFieldDefinition {
	/** Which entity type this field applies to */
	entityType: CustomFieldEntityType;
	/** Machine-readable key (used in customFields record) */
	key: string;
	/** Human-readable label */
	label: string;
	/** Field type */
	fieldType: "text" | "number" | "boolean" | "select" | "date" | "url" | "email" | "textarea";
	/** For select fields: available options */
	options: string[] | null;
	/** Placeholder text */
	placeholder: string | null;
	/** Is this field required? */
	required: boolean;
	/** Default value */
	defaultValue: string | null;
	/** Sort order for display */
	sortOrder: number;
	createdAt: string;
	updatedAt: string;
}

// ─── Pricing Engine Types ───────────────────────────────────────

export interface PriceResolutionContext {
	productId: string;
	variantId: string | null;
	quantity: number;
	customerId: string | null;
	customerGroupId: string | null;
	countryCode: string | null;
	currencyCode: string;
	date: Date;
}

export interface ResolvedPrice {
	/** Final price per unit in cents */
	unitPrice: number;
	/** Original price before any discounts */
	originalPrice: number;
	/** Discount amount per unit */
	discountAmount: number;
	discountSource: "specific_price" | "catalog_rule" | null;
	ruleId: string | null;
	/** Available quantity price breaks for display */
	quantityBreaks: QuantityBreak[];
}

export interface QuantityBreak {
	fromQuantity: number;
	unitPrice: number;
	/** Savings per unit compared to base price */
	savings: number;
	/** Savings as basis points (e.g. 1500 = 15%) */
	savingsPercent: number;
}
