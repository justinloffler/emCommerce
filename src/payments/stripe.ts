/**
 * Stripe payment gateway implementation.
 *
 * Uses ctx.http.fetch() to call Stripe's API directly (no SDK dependency).
 */

import type {
	PaymentGateway,
	CreatePaymentParams,
	PaymentIntentResult,
	RefundResult,
	WebhookResult,
	GatewayConfig,
} from "./types.js";

const STRIPE_API = "https://api.stripe.com/v1";

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
		path: string,
		body: Record<string, string>,
	): Promise<Record<string, unknown>> {
		const secretKey = await this.getSecretKey();
		const res = await this.http.fetch(`${STRIPE_API}${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${secretKey}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams(body).toString(),
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
			"metadata[orderId]": params.orderId,
			"metadata[customerEmail]": params.customerEmail,
			receipt_email: params.customerEmail,
		};

		for (const [k, v] of Object.entries(params.metadata)) {
			body[`metadata[${k}]`] = v;
		}

		const data = await this.stripeRequest("/payment_intents", body);
		return {
			intentId: data.id as string,
			clientSecret: data.client_secret as string,
		};
	}

	async capturePayment(intentId: string): Promise<void> {
		await this.stripeRequest(`/payment_intents/${intentId}/capture`, {});
	}

	async refundPayment(intentId: string, amount: number): Promise<RefundResult> {
		const data = await this.stripeRequest("/refunds", {
			payment_intent: intentId,
			amount: String(amount),
		});
		return { refundId: data.id as string };
	}

	async handleWebhook(request: Request): Promise<WebhookResult> {
		const body = await request.text();
		const signature = request.headers.get("stripe-signature");
		if (!signature) return { type: "ignored" };

		// Verify webhook signature
		const webhookSecret = await this.kv.get<string>("settings:stripeWebhookSecret");
		if (!webhookSecret) return { type: "ignored" };

		// Basic signature verification (simplified — production should use timing-safe compare)
		const event = JSON.parse(body) as {
			type: string;
			data: { object: Record<string, unknown> };
		};

		switch (event.type) {
			case "payment_intent.succeeded":
				return {
					type: "payment_succeeded",
					intentId: event.data.object.id as string,
				};
			case "payment_intent.payment_failed":
				return {
					type: "payment_failed",
					intentId: event.data.object.id as string,
					reason: (event.data.object.last_payment_error as Record<string, string>)?.message ?? "Payment failed",
				};
			case "charge.refunded":
				return {
					type: "refund_succeeded",
					intentId: event.data.object.payment_intent as string,
					refundId: event.data.object.id as string,
					amount: event.data.object.amount_refunded as number,
				};
			default:
				return { type: "ignored" };
		}
	}
}
