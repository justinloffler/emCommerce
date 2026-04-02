/**
 * PayPal payment gateway implementation.
 *
 * Uses PayPal REST API v2 via ctx.http.fetch().
 */

import type {
	PaymentGateway,
	CreatePaymentParams,
	PaymentIntentResult,
	RefundResult,
	WebhookResult,
	GatewayConfig,
} from "./types.js";

export class PayPalGateway implements PaymentGateway {
	readonly id = "paypal";
	readonly name = "PayPal";

	private http: GatewayConfig["http"];
	private kv: GatewayConfig["kv"];

	constructor(config: GatewayConfig) {
		this.http = config.http;
		this.kv = config.kv;
	}

	private async getBaseUrl(): Promise<string> {
		const sandbox = await this.kv.get<boolean>("settings:paypalSandbox");
		return sandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
	}

	private async getAccessToken(): Promise<string> {
		const clientId = await this.kv.get<string>("settings:paypalClientId");
		const clientSecret = await this.kv.get<string>("settings:paypalClientSecret");
		if (!clientId || !clientSecret) throw new Error("PayPal credentials not configured");

		const baseUrl = await this.getBaseUrl();
		const credentials = btoa(`${clientId}:${clientSecret}`);

		const res = await this.http.fetch(`${baseUrl}/v1/oauth2/token`, {
			method: "POST",
			headers: {
				Authorization: `Basic ${credentials}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "grant_type=client_credentials",
		});

		if (!res.ok) throw new Error(`PayPal auth failed: ${res.statusText}`);
		const data = (await res.json()) as { access_token: string };
		return data.access_token;
	}

	private async paypalRequest(
		path: string,
		method: string,
		body?: unknown,
	): Promise<Record<string, unknown>> {
		const baseUrl = await this.getBaseUrl();
		const token = await this.getAccessToken();

		const res = await this.http.fetch(`${baseUrl}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: body ? JSON.stringify(body) : undefined,
		});

		if (!res.ok) {
			const err = await res.text();
			throw new Error(`PayPal error: ${err}`);
		}

		// Some PayPal endpoints return 204
		if (res.status === 204) return {};
		return (await res.json()) as Record<string, unknown>;
	}

	async createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntentResult> {
		// Convert cents to decimal string
		const amount = (params.amount / 100).toFixed(2);

		const data = await this.paypalRequest("/v2/checkout/orders", "POST", {
			intent: "CAPTURE",
			purchase_units: [
				{
					reference_id: params.orderId,
					amount: {
						currency_code: params.currency.toUpperCase(),
						value: amount,
					},
					description: `Order ${params.orderId}`,
				},
			],
			payment_source: {
				paypal: {
					experience_context: {
						return_url: params.metadata.returnUrl ?? "",
						cancel_url: params.metadata.cancelUrl ?? "",
					},
				},
			},
		});

		// PayPal returns an order ID; client uses it to render PayPal buttons
		return {
			intentId: data.id as string,
			clientSecret: data.id as string, // PayPal uses order ID as client token
		};
	}

	async capturePayment(intentId: string): Promise<void> {
		await this.paypalRequest(`/v2/checkout/orders/${intentId}/capture`, "POST");
	}

	async refundPayment(intentId: string, amount: number): Promise<RefundResult> {
		// First get the capture ID from the order
		const order = await this.paypalRequest(`/v2/checkout/orders/${intentId}`, "GET");
		const units = order.purchase_units as Array<{
			payments: { captures: Array<{ id: string }> };
		}>;
		const captureId = units?.[0]?.payments?.captures?.[0]?.id;
		if (!captureId) throw new Error("No capture found for this order");

		const refundAmount = (amount / 100).toFixed(2);
		const data = await this.paypalRequest(`/v2/payments/captures/${captureId}/refund`, "POST", {
			amount: {
				value: refundAmount,
				currency_code: "USD", // Will be overridden by the capture's currency
			},
		});

		return { refundId: data.id as string };
	}

	async handleWebhook(request: Request): Promise<WebhookResult> {
		const body = await request.text();
		const event = JSON.parse(body) as {
			event_type: string;
			resource: Record<string, unknown>;
		};

		switch (event.event_type) {
			case "CHECKOUT.ORDER.APPROVED":
				return {
					type: "payment_succeeded",
					intentId: event.resource.id as string,
				};
			case "PAYMENT.CAPTURE.DENIED":
				return {
					type: "payment_failed",
					intentId: event.resource.id as string,
					reason: "Payment capture denied",
				};
			case "PAYMENT.CAPTURE.REFUNDED":
				return {
					type: "refund_succeeded",
					intentId: "",
					refundId: event.resource.id as string,
					amount: 0,
				};
			default:
				return { type: "ignored" };
		}
	}
}
