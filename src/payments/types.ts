/**
 * Payment gateway interface.
 *
 * All gateways implement this interface for a uniform checkout experience.
 */

import type { HttpAccess, KVAccess } from "emdash";

export interface PaymentGateway {
	id: string;
	name: string;

	/** Create a payment intent / order on the provider side. */
	createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntentResult>;

	/** Capture a previously authorized payment. */
	capturePayment(intentId: string): Promise<void>;

	/** Issue a full or partial refund. */
	refundPayment(intentId: string, amount: number): Promise<RefundResult>;

	/** Verify and parse an incoming webhook event. */
	handleWebhook(request: Request): Promise<WebhookResult>;
}

export interface CreatePaymentParams {
	amount: number;
	currency: string;
	orderId: string;
	customerEmail: string;
	metadata: Record<string, string>;
}

export interface PaymentIntentResult {
	intentId: string;
	clientSecret: string;
}

export interface RefundResult {
	refundId: string;
}

export type WebhookResult =
	| { type: "payment_succeeded"; intentId: string }
	| { type: "payment_failed"; intentId: string; reason: string }
	| { type: "refund_succeeded"; intentId: string; refundId: string; amount: number }
	| { type: "ignored" };

export interface GatewayConfig {
	http: HttpAccess;
	kv: KVAccess;
}
