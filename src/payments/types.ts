/**
 * Payment gateway interface.
 *
 * All gateways implement this interface for a uniform checkout experience.
 *
 * Security model: the browser never tells the server that a payment
 * succeeded. After the customer completes payment client-side, the server
 * asks the provider directly (`finalizePayment`), and webhooks are only
 * trusted after their signature has been verified.
 */

import type { HttpAccess, KVAccess } from "emdash";

export interface PaymentGateway {
	id: string;
	name: string;

	/** Create a payment intent / order on the provider side. */
	createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntentResult>;

	/**
	 * Ask the provider for the authoritative state of a payment, capturing it
	 * first if the provider requires an explicit capture (PayPal).
	 */
	finalizePayment(intentId: string): Promise<PaymentVerification>;

	/** Issue a full or partial refund (amount in minor units). */
	refundPayment(intentId: string, amount: number, currency: string): Promise<RefundResult>;

	/** Verify and parse an incoming webhook event. */
	handleWebhook(input: WebhookInput): Promise<WebhookResult>;
}

export interface CreatePaymentParams {
	/** Amount in minor units (cents) */
	amount: number;
	currency: string;
	orderId: string;
	orderNumber: string;
	customerEmail: string;
	metadata: Record<string, string>;
}

export interface PaymentIntentResult {
	intentId: string;
	/** Stripe: PaymentIntent client secret. PayPal: the PayPal order ID. */
	clientSecret: string;
}

export interface PaymentVerification {
	status: "succeeded" | "pending" | "failed";
	/** Amount actually received, in minor units (null if unknown) */
	amount: number | null;
	currency: string | null;
	/** Provider capture/charge reference, when available */
	captureId: string | null;
	reason?: string;
}

export interface RefundResult {
	refundId: string;
}

export interface WebhookInput {
	rawBody: string;
	/** Lower-cased header names */
	headers: Record<string, string>;
}

export type WebhookResult =
	| {
			type: "payment_succeeded";
			intentId: string;
			amount: number | null;
			currency: string | null;
			captureId: string | null;
	  }
	| { type: "payment_failed"; intentId: string; reason: string }
	| {
			type: "refund_succeeded";
			/** Provider payment reference stored on the order (may be null for PayPal) */
			intentId: string | null;
			captureId: string | null;
			refundId: string;
			amount: number;
			/** True when `amount` is the cumulative refunded total (Stripe charge.refunded) */
			cumulative: boolean;
	  }
	| { type: "ignored"; reason?: string }
	| { type: "invalid_signature" };

export interface GatewayConfig {
	http: HttpAccess;
	kv: KVAccess;
}

/** Number of decimal places a currency uses for its minor unit (e.g. USD 2, JPY 0). */
export function currencyDecimals(currency: string): number {
	try {
		return (
			new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).resolvedOptions()
				.maximumFractionDigits ?? 2
		);
	} catch {
		return 2;
	}
}

/** Convert minor units to a decimal string, e.g. (1999, "AUD") → "19.99". */
export function minorToDecimalString(amount: number, currency: string): string {
	const decimals = currencyDecimals(currency);
	return (amount / 10 ** decimals).toFixed(decimals);
}

/** Convert a decimal string to minor units, e.g. ("19.99", "AUD") → 1999. */
export function decimalStringToMinor(value: string, currency: string): number {
	const decimals = currencyDecimals(currency);
	return Math.round(Number.parseFloat(value) * 10 ** decimals);
}
