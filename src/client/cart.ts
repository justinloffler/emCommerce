/**
 * Client-side cart manager.
 *
 * Manages a sessionId in localStorage and syncs with the server-side cart.
 * Works for both authenticated and guest users.
 */

const STORAGE_KEY = "emcommerce_session";
const API_BASE = "/_emdash/api/plugins/emcommerce";

// ─── Session ────────────────────────────────────────────────────

function getSessionId(): string {
	let id = localStorage.getItem(STORAGE_KEY);
	if (!id) {
		id = crypto.randomUUID();
		localStorage.setItem(STORAGE_KEY, id);
	}
	return id;
}

// ─── API Helpers ────────────────────────────────────────────────

async function apiCall<T>(route: string, body: Record<string, unknown>): Promise<T> {
	const res = await fetch(`${API_BASE}/${route}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
		throw new Error(err.error?.message ?? `Cart API error: ${res.status}`);
	}
	const json = await res.json();
	return json.data as T;
}

// ─── Cart Type (client-side mirror) ─────────────────────────────

export interface ClientCartSummary {
	cartId: string;
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
		imageId: string | null;
	}>;
	subtotal: number;
	discountTotal: number;
	shippingTotal: number;
	taxTotal: number;
	total: number;
	itemCount: number;
	currencyCode: string;
	couponCodes: string[];
}

// ─── Event System ───────────────────────────────────────────────

type CartListener = (cart: ClientCartSummary) => void;
const listeners: CartListener[] = [];
let currentCart: ClientCartSummary | null = null;

function notify(cart: ClientCartSummary) {
	currentCart = cart;
	for (const fn of listeners) fn(cart);
}

/** Subscribe to cart changes. Returns an unsubscribe function. */
export function onCartChange(fn: CartListener): () => void {
	listeners.push(fn);
	if (currentCart) fn(currentCart);
	return () => {
		const idx = listeners.indexOf(fn);
		if (idx >= 0) listeners.splice(idx, 1);
	};
}

/** Get current cart state without fetching. */
export function getCartState(): ClientCartSummary | null {
	return currentCart;
}

// ─── Cart Operations ────────────────────────────────────────────

export async function getCart(): Promise<ClientCartSummary> {
	const cart = await apiCall<ClientCartSummary>("storefront/cart/get", {
		sessionId: getSessionId(),
	});
	notify(cart);
	return cart;
}

export async function addToCart(
	productId: string,
	variantId?: string | null,
	quantity = 1,
): Promise<ClientCartSummary> {
	const cart = await apiCall<ClientCartSummary>("storefront/cart/add", {
		sessionId: getSessionId(),
		productId,
		variantId: variantId ?? null,
		quantity,
	});
	notify(cart);
	return cart;
}

export async function updateCartItem(
	productId: string,
	variantId: string | null,
	quantity: number,
): Promise<ClientCartSummary> {
	const cart = await apiCall<ClientCartSummary>("storefront/cart/update", {
		sessionId: getSessionId(),
		productId,
		variantId,
		quantity,
	});
	notify(cart);
	return cart;
}

export async function removeFromCart(
	productId: string,
	variantId?: string | null,
): Promise<ClientCartSummary> {
	const cart = await apiCall<ClientCartSummary>("storefront/cart/remove", {
		sessionId: getSessionId(),
		productId,
		variantId: variantId ?? null,
	});
	notify(cart);
	return cart;
}

export async function applyCoupon(code: string): Promise<ClientCartSummary> {
	const cart = await apiCall<ClientCartSummary>("storefront/cart/coupon", {
		sessionId: getSessionId(),
		code,
	});
	notify(cart);
	return cart;
}

export async function removeCoupon(code: string): Promise<ClientCartSummary> {
	const cart = await apiCall<ClientCartSummary>("storefront/cart/remove-coupon", {
		sessionId: getSessionId(),
		code,
	});
	notify(cart);
	return cart;
}

export async function setAddress(
	type: "billing" | "shipping",
	address: {
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
	},
): Promise<ClientCartSummary> {
	const cart = await apiCall<ClientCartSummary>("storefront/cart/address", {
		sessionId: getSessionId(),
		type,
		...address,
	});
	notify(cart);
	return cart;
}

export async function setShippingMethod(
	shippingMethodId: string,
): Promise<ClientCartSummary> {
	const cart = await apiCall<ClientCartSummary>("storefront/cart/shipping-method", {
		sessionId: getSessionId(),
		shippingMethodId,
	});
	notify(cart);
	return cart;
}
