/**
 * Stripe payment gateway implementation.
 *
 * Uses ctx.http.fetch() to call Stripe's API directly (no SDK dependency).
 * PaymentIntents use automatic payment methods, so the storefront can render
 * the Stripe Payment Element (cards, wallets, BNPL where enabled).
 */

import type {
	PaymentGateway,
	CreatePaymentParams,
	PaymentIntentResult,
	PaymentVerification,
	RefundResult,
	WebhookInput,
	WebhookResult,
	GatewayConfig,
} from "./types.js";

const STRIPE_API = "https://api.stripe.com/v1";

/** Maximum age of a webhook signature timestamp, in seconds (Stripe's default). */
export const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

export class StripeGateway implements PaymentGateway {
	readonly id = "stripe";
	readonly name = "Stripe";

	private http: GatewayConfig["http"];
	private kv: GatewayConfig["kv"];

	constructor(config: GatewayConfig) {
		this.http = config.http;
		this.kv = config.kv;
	}

	private async getSecretKey(): Promise<string> {
		const key = await this.kv.get<string>("settings:stripeSecretKey");
		if (!key) throw new Error("Stripe secret key not configured");
		return key;
	}

	private async stripeRequest(
		method: "GET" | "POST",
		path: string,
		body?: Record<string, string>,
		idempotencyKey?: string,
	): Promise<Record<string, unknown>> {
		const secretKey = await this.getSecretKey();
		const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}` };
		if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
		if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

		const res = await this.http.fetch(`${STRIPE_API}${path}`, {
			method,
			headers,
			body: body ? new URLSearchParams(body).toString() : undefined,
		});

		const data = (await res.json()) as Record<string, unknown>;
		if (!res.ok) {
			const error = data.error as Record<string, string> | undefined;
			throw new Error(`Stripe error: ${error?.message ?? res.statusText}`);
		}
		return data;
	}

	async createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntentResult> {
		const body: Record<string, string> = {
			amount: String(params.amount),
			currency: params.currency.toLowerCase(),
			"automatic_payment_methods[enabled]": "true",
			description: `Order ${params.orderNumber}`,
			"metadata[orderId]": params.orderId,
			"metadata[orderNumber]": params.orderNumber,
			receipt_email: params.customerEmail,
		};
		for (const [k, v] of Object.entries(params.metadata)) {
			body[`metadata[${k}]`] = v;
		}

		const data = await this.stripeRequest("POST", "/payment_intents", body, `emc-order-${params.orderId}`);
		return {
			intentId: data.id as string,
			clientSecret: data.client_secret as string,
		};
	}

	async finalizePayment(intentId: string): Promise<PaymentVerification> {
		const data = await this.stripeRequest("GET", `/payment_intents/${encodeURIComponent(intentId)}`);
		const status = data.status as string;
		const amount = typeof data.amount_received === "number" ? data.amount_received : null;
		const currency = typeof data.currency === "string" ? data.currency.toUpperCase() : null;
		const captureId = typeof data.latest_charge === "string" ? data.latest_charge : null;

		switch (status) {
			case "succeeded":
				return { status: "succeeded", amount, currency, captureId };
			case "processing":
			case "requires_action":
			case "requires_confirmation":
			case "requires_capture":
				return { status: "pending", amount, currency, captureId };
			case "canceled":
				return { status: "failed", amount, currency, captureId, reason: "Payment was cancelled" };
			default: {
				const err = data.last_payment_error as Record<string, string> | null | undefined;
				return err
					? { status: "failed", amount, currency, captureId, reason: err.message ?? "Payment failed" }
					: { status: "pending", amount, currency, captureId };
			}
		}
	}

	async refundPayment(intentId: string, amount: number, _currency: string): Promise<RefundResult> {
		const data = await this.stripeRequest("POST", "/refunds", {
			payment_intent: intentId,
			amount: String(amount),
		});
		return { refundId: data.id as string };
	}

	async handleWebhook(input: WebhookInput): Promise<WebhookResult> {
		const webhookSecret = await this.kv.get<string>("settings:stripeWebhookSecret");
		if (!webhookSecret) return { type: "ignored", reason: "Stripe webhook secret not configured" };

		const signature = input.headers["stripe-signature"];
		if (!signature) return { type: "invalid_signature" };

		const valid = await verifyStripeSignature(input.rawBody, signature, webhookSecret);
		if (!valid) return { type: "invalid_signature" };

		let event: { type: string; data: { object: Record<string, unknown> } };
		try {
			event = JSON.parse(input.rawBody);
		} catch {
			return { type: "ignored", reason: "Malformed payload" };
		}
		const obj = event.data?.object ?? {};

		switch (event.type) {
			case "payment_intent.succeeded":
				return {
					type: "payment_succeeded",
					intentId: obj.id as string,
					amount: typeof obj.amount_received === "number" ? obj.amount_received : null,
					currency: typeof obj.currency === "string" ? obj.currency.toUpperCase() : null,
					captureId: typeof obj.latest_charge === "string" ? obj.latest_charge : null,
				};
			case "payment_intent.payment_failed":
				return {
					type: "payment_failed",
					intentId: obj.id as string,
					reason: (obj.last_payment_error as Record<string, string> | null)?.message ?? "Payment failed",
				};
			case "charge.refunded":
				return {
					type: "refund_succeeded",
					intentId: (obj.payment_intent as string) ?? null,
					captureId: (obj.id as string) ?? null,
					refundId: `${obj.id as string}:${obj.amount_refunded as number}`,
					amount: obj.amount_refunded as number,
					cumulative: true,
				};
			default:
				return { type: "ignored" };
		}
	}
}

// ─── Signature verification ─────────────────────────────────────

/**
 * Verify a `Stripe-Signature` header (scheme v1: HMAC-SHA256 of "t.payload").
 * https://docs.stripe.com/webhooks#verify-manually
 */
export async function verifyStripeSignature(
	payload: string,
	header: string,
	secret: string,
	nowSeconds: number = Math.floor(Date.now() / 1000),
	toleranceSeconds: number = STRIPE_WEBHOOK_TOLERANCE_SECONDS,
): Promise<boolean> {
	let timestamp: number | null = null;
	const signatures: string[] = [];
	for (const part of header.split(",")) {
		const [key, value] = part.split("=", 2).map((s) => s?.trim());
		if (key === "t" && value) timestamp = Number.parseInt(value, 10);
		else if (key === "v1" && value) signatures.push(value);
	}
	if (timestamp === null || Number.isNaN(timestamp) || signatures.length === 0) return false;
	if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

	const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
	return signatures.some((sig) => timingSafeEqual(sig, expected));
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const mac = await crypto.subtle.sign("HMAC", key, enc.encode(message));
	return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
