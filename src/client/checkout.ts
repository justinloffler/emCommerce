/**
 * Client-side checkout helpers.
 *
 * Talks to the public storefront routes and loads the Stripe / PayPal browser
 * SDKs on demand. Payment success is always verified server-side by
 * `confirmOrder()` — the browser only reports that the customer finished.
 */

import { getSessionId } from "./cart.js";

const API_BASE = "/_emdash/api/plugins/emcommerce";

async function post<T>(route: string, body: Record<string, unknown>): Promise<T> {
	const res = await fetch(`${API_BASE}/${route}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
	if (!res.ok || !json || json.data === undefined) {
		throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
	}
	return json.data;
}

// ─── Types ──────────────────────────────────────────────────────

export interface StoreCurrency {
	code: string;
	symbol: string;
	symbolPosition: "before" | "after";
	decimalPlaces: number;
	thousandsSeparator: string;
	decimalSeparator: string;
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

export interface QuoteAddress {
	countryCode: string;
	stateCode?: string | null;
	postalCode?: string;
	city?: string;
}

export interface CheckoutQuote {
	items: Array<{
		productId: string;
		variantId: string | null;
		name: string;
		sku: string | null;
		quantity: number;
		unitPrice: number;
		originalPrice: number;
		lineTotal: number;
		attributes: Record<string, string>;
		taxAmount: number;
	}>;
	couponCodes: string[];
	discountBreakdown: Array<{ source: string; name: string; amount: number }>;
	shippingMethods: Array<{ id: string; name: string; cost: number }>;
	shippingMethodId: string | null;
	subtotal: number;
	discountTotal: number;
	shippingTotal: number;
	taxTotal: number;
	taxLines: Array<{ name: string; rate: number; amount: number }>;
	taxInclusive: boolean;
	total: number;
	currencyCode: string;
}

export interface CheckoutAddress {
	firstName: string;
	lastName: string;
	company?: string | null;
	addressLine1: string;
	addressLine2?: string | null;
	city: string;
	stateCode?: string | null;
	postalCode: string;
	countryCode: string;
	phone?: string | null;
}

export interface CreateOrderInput {
	email: string;
	billingAddress: CheckoutAddress;
	shippingAddress?: CheckoutAddress | null;
	shippingMethodId: string;
	paymentGateway: "stripe" | "paypal";
	customerNote?: string | null;
	expectedTotal?: number | null;
}

export interface CreatedOrder {
	orderId: string;
	orderNumber: string;
	total: number;
	currencyCode: string;
	paymentGateway: "stripe" | "paypal";
	/** Stripe client secret, or PayPal order ID */
	clientSecret: string;
}

export interface ConfirmResult {
	orderId: string;
	orderNumber: string;
	status: string;
	paymentStatus: string;
	paid: boolean;
	message?: string;
}

export interface PublicOrder {
	orderNumber: string;
	status: string;
	paymentStatus: string;
	paid: boolean;
	items: Array<{ name: string; sku: string | null; quantity: number; unitPrice: number; totalPrice: number; attributes?: Record<string, string> }>;
	subtotal: number;
	shippingTotal: number;
	taxTotal: number;
	taxLines: Array<{ name: string; rate: number; amount: number }>;
	taxInclusive: boolean;
	discountTotal: number;
	total: number;
	currencyCode: string;
	shippingMethodName: string | null;
	paymentMethod: string;
	createdAt: string;
}

// ─── API ────────────────────────────────────────────────────────

export function getStorefrontConfig(): Promise<StorefrontConfig> {
	return post("storefront/config", {});
}

export function getCheckoutQuote(address: QuoteAddress | null, shippingMethodId: string | null = null) {
	return post<CheckoutQuote>("storefront/checkout/quote", {
		sessionId: getSessionId(),
		address: address
			? {
					countryCode: address.countryCode,
					stateCode: address.stateCode || null,
					postalCode: address.postalCode ?? "",
					city: address.city ?? "",
				}
			: null,
		shippingMethodId,
	});
}

export function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
	return post("storefront/checkout/create", { sessionId: getSessionId(), ...input });
}

export function confirmOrder(orderId: string): Promise<ConfirmResult> {
	return post("storefront/checkout/confirm", { orderId });
}

export function getOrder(orderId: string): Promise<PublicOrder> {
	return post("storefront/order", { orderId });
}

// ─── Formatting ─────────────────────────────────────────────────

export function formatMoney(minor: number, currency: StoreCurrency): string {
	const negative = minor < 0;
	const abs = Math.abs(minor);
	const divisor = 10 ** currency.decimalPlaces;
	const whole = Math.floor(abs / divisor)
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousandsSeparator);
	const fraction =
		currency.decimalPlaces > 0
			? currency.decimalSeparator + String(abs % divisor).padStart(currency.decimalPlaces, "0")
			: "";
	const number = whole + fraction;
	const out = currency.symbolPosition === "after" ? `${number} ${currency.symbol}` : `${currency.symbol}${number}`;
	return negative ? `-${out}` : out;
}

export function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// ─── Payment SDK loaders ────────────────────────────────────────

const scriptCache = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
	if (!scriptCache.has(src)) {
		scriptCache.set(
			src,
			new Promise((resolve, reject) => {
				const el = document.createElement("script");
				el.src = src;
				el.async = true;
				el.onload = () => resolve();
				el.onerror = () => {
					scriptCache.delete(src);
					reject(new Error(`Failed to load ${src}`));
				};
				document.head.appendChild(el);
			}),
		);
	}
	return scriptCache.get(src)!;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Load Stripe.js and return a Stripe instance. */
export async function loadStripe(publishableKey: string): Promise<any> {
	await loadScript("https://js.stripe.com/v3/");
	const Stripe = (window as any).Stripe;
	if (!Stripe) throw new Error("Stripe.js failed to initialise");
	return Stripe(publishableKey);
}

/** Load the PayPal JS SDK for the store's client ID and currency. */
export async function loadPayPal(clientId: string, currency: string): Promise<any> {
	const params = new URLSearchParams({
		"client-id": clientId,
		currency: currency.toUpperCase(),
		intent: "capture",
		components: "buttons",
	});
	await loadScript(`https://www.paypal.com/sdk/js?${params.toString()}`);
	const paypal = (window as any).paypal;
	if (!paypal) throw new Error("PayPal SDK failed to initialise");
	return paypal;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
