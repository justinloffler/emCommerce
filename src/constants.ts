/**
 * Constants for emCommerce plugin.
 *
 * Currency codes, status enums, and default values.
 */

// ─── Product Types ──────────────────────────────────────────────

export const PRODUCT_TYPES = [
	"simple",
	"variable",
	"grouped",
	"virtual",
	"downloadable",
	"external",
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

// ─── Product Status ─────────────────────────────────────────────

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

// ─── Order Status ───────────────────────────────────────────────

export const ORDER_STATUSES = [
	"pending_payment",
	"processing",
	"on_hold",
	"shipped",
	"completed",
	"cancelled",
	"refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Valid order status transitions: from → allowed destinations */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
	pending_payment: ["processing", "cancelled"],
	processing: ["on_hold", "shipped", "completed", "cancelled"],
	on_hold: ["processing", "cancelled"],
	shipped: ["completed"],
	completed: ["refunded"],
	cancelled: [],
	refunded: [],
} as const;

// ─── Payment Status ─────────────────────────────────────────────

export const PAYMENT_STATUSES = [
	"pending",
	"authorized",
	"captured",
	"refunded",
	"partial_refund",
	"failed",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// ─── Submission / Cart ──────────────────────────────────────────

export const CART_EXPIRY_DAYS = 30;

// ─── Pricing ────────────────────────────────────────────────────

export const REDUCTION_TYPES = ["amount", "percentage"] as const;
export type ReductionType = (typeof REDUCTION_TYPES)[number];

/** Basis points: 10000 = 100% */
export const BASIS_POINTS_100_PERCENT = 10000;

/** Price priority levels (0 = highest priority, wins first) */
export const PRICE_PRIORITY_MIN = 0;
export const PRICE_PRIORITY_MAX = 4;

// ─── Coupon Types ───────────────────────────────────────────────

export const COUPON_TYPES = [
	"percentage",
	"fixed_cart",
	"fixed_product",
	"free_shipping",
	"bogo",
] as const;

export type CouponType = (typeof COUPON_TYPES)[number];

// ─── Shipping Method Types ──────────────────────────────────────

export const SHIPPING_METHOD_TYPES = [
	"flat_rate",
	"free_shipping",
	"weight_based",
	"price_based",
] as const;

export type ShippingMethodType = (typeof SHIPPING_METHOD_TYPES)[number];

// ─── Tax ────────────────────────────────────────────────────────

export const DEFAULT_TAX_CLASSES = [
	{ name: "Standard Rate", slug: "standard", isDefault: true },
	{ name: "Reduced Rate", slug: "reduced", isDefault: false },
	{ name: "Zero Rate", slug: "zero", isDefault: false },
] as const;

// ─── Currencies ─────────────────────────────────────────────────

export interface CurrencyMeta {
	code: string;
	name: string;
	symbol: string;
	symbolPosition: "before" | "after";
	decimalPlaces: number;
	thousandsSeparator: string;
	decimalSeparator: string;
}

export const COMMON_CURRENCIES: CurrencyMeta[] = [
	{ code: "USD", name: "US Dollar", symbol: "$", symbolPosition: "before", decimalPlaces: 2, thousandsSeparator: ",", decimalSeparator: "." },
	{ code: "EUR", name: "Euro", symbol: "€", symbolPosition: "after", decimalPlaces: 2, thousandsSeparator: ".", decimalSeparator: "," },
	{ code: "GBP", name: "British Pound", symbol: "£", symbolPosition: "before", decimalPlaces: 2, thousandsSeparator: ",", decimalSeparator: "." },
	{ code: "CAD", name: "Canadian Dollar", symbol: "CA$", symbolPosition: "before", decimalPlaces: 2, thousandsSeparator: ",", decimalSeparator: "." },
	{ code: "AUD", name: "Australian Dollar", symbol: "A$", symbolPosition: "before", decimalPlaces: 2, thousandsSeparator: ",", decimalSeparator: "." },
	{ code: "JPY", name: "Japanese Yen", symbol: "¥", symbolPosition: "before", decimalPlaces: 0, thousandsSeparator: ",", decimalSeparator: "." },
	{ code: "CHF", name: "Swiss Franc", symbol: "CHF", symbolPosition: "after", decimalPlaces: 2, thousandsSeparator: "'", decimalSeparator: "." },
	{ code: "CNY", name: "Chinese Yuan", symbol: "¥", symbolPosition: "before", decimalPlaces: 2, thousandsSeparator: ",", decimalSeparator: "." },
	{ code: "SEK", name: "Swedish Krona", symbol: "kr", symbolPosition: "after", decimalPlaces: 2, thousandsSeparator: " ", decimalSeparator: "," },
	{ code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", symbolPosition: "before", decimalPlaces: 2, thousandsSeparator: ",", decimalSeparator: "." },
	{ code: "MXN", name: "Mexican Peso", symbol: "$", symbolPosition: "before", decimalPlaces: 2, thousandsSeparator: ",", decimalSeparator: "." },
	{ code: "BRL", name: "Brazilian Real", symbol: "R$", symbolPosition: "before", decimalPlaces: 2, thousandsSeparator: ".", decimalSeparator: "," },
	{ code: "INR", name: "Indian Rupee", symbol: "₹", symbolPosition: "before", decimalPlaces: 2, thousandsSeparator: ",", decimalSeparator: "." },
	{ code: "KRW", name: "South Korean Won", symbol: "₩", symbolPosition: "before", decimalPlaces: 0, thousandsSeparator: ",", decimalSeparator: "." },
];

// ─── Country Auto-Suggestions ───────────────────────────────────

export const COUNTRY_CURRENCY_MAP: Record<string, string> = {
	US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", JP: "JPY",
	CH: "CHF", CN: "CNY", SE: "SEK", NZ: "NZD", MX: "MXN",
	BR: "BRL", IN: "INR", KR: "KRW",
	// EU countries
	DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR",
	BE: "EUR", AT: "EUR", PT: "EUR", IE: "EUR", FI: "EUR",
	GR: "EUR", LU: "EUR", SK: "EUR", SI: "EUR", LT: "EUR",
	LV: "EUR", EE: "EUR", MT: "EUR", CY: "EUR", HR: "EUR",
};

// ─── Email Types ────────────────────────────────────────────────

export const EMAIL_TYPES = [
	"order_confirmation",
	"shipping_notification",
	"refund_confirmation",
	"low_stock_alert",
	"abandoned_cart",
	"new_account_welcome",
] as const;

export type EmailType = (typeof EMAIL_TYPES)[number];

// ─── Plugin ID ──────────────────────────────────────────────────

export const PLUGIN_ID = "emcommerce";
export const PLUGIN_VERSION = "0.1.0";
