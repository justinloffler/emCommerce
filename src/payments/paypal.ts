/**
 * PayPal payment gateway implementation.
 *
 * Uses PayPal REST API v2 (Orders) via ctx.http.fetch().
 *
 * Flow: the server creates a PayPal order; the storefront renders PayPal
 * buttons for it; after the buyer approves, the server captures the order
 * (`finalizePayment`) and only then marks the emCommerce order as paid.
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
import { decimalStringToMinor, minorToDecimalString } from "./types.js";

class PayPalApiError extends Error {
	constructor(
		readonly status: number,
		readonly body: string,
	) {
		super(`PayPal error (${status}): ${body.slice(0, 300)}`);
		this.name = "PayPalApiError";
	}

	/** PayPal error "issue" codes, e.g. ORDER_ALREADY_CAPTURED */
	get issues(): string[] {
		try {
			const parsed = JSON.parse(this.body) as { details?: Array<{ issue?: string }> };
			return (parsed.details ?? []).map((d) => d.issue ?? "").filter(Boolean);
		} catch {
			return [];
		}
	}
}

interface PayPalCapture {
	id: string;
	status: string;
	amount?: { value: string; currency_code: string };
}

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
		// Default to sandbox until the merchant explicitly switches it off
		return sandbox === false ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
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

		if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${res.statusText}`);
		const data = (await res.json()) as { access_token: string };
		return data.access_token;
	}

	private async paypalRequest(
		path: string,
		method: string,
		body?: unknown,
		requestId?: string,
	): Promise<Record<string, unknown>> {
		const baseUrl = await this.getBaseUrl();
		const token = await this.getAccessToken();

		const headers: Record<string, string> = {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		};
		if (requestId) headers["PayPal-Request-Id"] = requestId;

		const res = await this.http.fetch(`${baseUrl}${path}`, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		});

		if (!res.ok) throw new PayPalApiError(res.status, await res.text());
		if (res.status === 204) return {};
		return (await res.json()) as Record<string, unknown>;
	}

	async createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntentResult> {
		const currency = params.currency.toUpperCase();
		const data = await this.paypalRequest(
			"/v2/checkout/orders",
			"POST",
			{
				intent: "CAPTURE",
				purchase_units: [
					{
						reference_id: params.orderId,
						custom_id: params.orderId,
						invoice_id: params.orderNumber,
						description: `Order ${params.orderNumber}`,
						amount: {
							currency_code: currency,
							value: minorToDecimalString(params.amount, currency),
						},
					},
				],
			},
			`emc-order-${params.orderId}`,
		);

		// The PayPal order ID is what the JS SDK buttons need
		return {
			intentId: data.id as string,
			clientSecret: data.id as string,
		};
	}

	async finalizePayment(intentId: string): Promise<PaymentVerification> {
		let order: Record<string, unknown>;
		try {
			order = await this.paypalRequest(
				`/v2/checkout/orders/${encodeURIComponent(intentId)}/capture`,
				"POST",
				undefined,
				`emc-capture-${intentId}`,
			);
		} catch (err) {
			if (err instanceof PayPalApiError && err.status === 422) {
				const issues = err.issues;
				if (issues.includes("ORDER_ALREADY_CAPTURED")) {
					order = await this.paypalRequest(`/v2/checkout/orders/${encodeURIComponent(intentId)}`, "GET");
				} else if (issues.includes("ORDER_NOT_APPROVED")) {
					return { status: "pending", amount: null, currency: null, captureId: null };
				} else {
					return {
						status: "failed",
						amount: null,
						currency: null,
						captureId: null,
						reason: issues[0] ?? "Payment could not be captured",
					};
				}
			} else {
				throw err;
			}
		}

		const capture = firstCapture(order);
		if (!capture) {
			return { status: "pending", amount: null, currency: null, captureId: null };
		}
		const currency = capture.amount?.currency_code ?? null;
		const amount = capture.amount && currency ? decimalStringToMinor(capture.amount.value, currency) : null;

		switch (capture.status) {
			case "COMPLETED":
				return { status: "succeeded", amount, currency, captureId: capture.id };
			case "PENDING":
				return { status: "pending", amount, currency, captureId: capture.id };
			default:
				return {
					status: "failed",
					amount,
					currency,
					captureId: capture.id,
					reason: `Capture ${capture.status.toLowerCase()}`,
				};
		}
	}

	async refundPayment(intentId: string, amount: number, currency: string): Promise<RefundResult> {
		const order = await this.paypalRequest(`/v2/checkout/orders/${encodeURIComponent(intentId)}`, "GET");
		const capture = firstCapture(order);
		if (!capture) throw new Error("No capture found for this PayPal order");

		const refundCurrency = capture.amount?.currency_code ?? currency.toUpperCase();
		const data = await this.paypalRequest(`/v2/payments/captures/${capture.id}/refund`, "POST", {
			amount: {
				value: minorToDecimalString(amount, refundCurrency),
				currency_code: refundCurrency,
			},
		});

		return { refundId: data.id as string };
	}

	async handleWebhook(input: WebhookInput): Promise<WebhookResult> {
		const webhookId = await this.kv.get<string>("settings:paypalWebhookId");
		if (!webhookId) return { type: "ignored", reason: "PayPal webhook ID not configured" };

		let event: { event_type: string; resource: Record<string, unknown> };
		try {
			event = JSON.parse(input.rawBody);
		} catch {
			return { type: "ignored", reason: "Malformed payload" };
		}

		const h = input.headers;
		const required = [
			"paypal-auth-algo",
			"paypal-cert-url",
			"paypal-transmission-id",
			"paypal-transmission-sig",
			"paypal-transmission-time",
		];
		if (required.some((name) => !h[name])) return { type: "invalid_signature" };

		const verification = await this.paypalRequest("/v1/notifications/verify-webhook-signature", "POST", {
			auth_algo: h["paypal-auth-algo"],
			cert_url: h["paypal-cert-url"],
			transmission_id: h["paypal-transmission-id"],
			transmission_sig: h["paypal-transmission-sig"],
			transmission_time: h["paypal-transmission-time"],
			webhook_id: webhookId,
			webhook_event: event,
		});
		if (verification.verification_status !== "SUCCESS") return { type: "invalid_signature" };

		const resource = event.resource ?? {};
		const related = (resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined)
			?.related_ids;
		const amountObj = resource.amount as { value: string; currency_code: string } | undefined;
		const amount = amountObj ? decimalStringToMinor(amountObj.value, amountObj.currency_code) : null;

		switch (event.event_type) {
			case "PAYMENT.CAPTURE.COMPLETED":
				if (!related?.order_id) return { type: "ignored", reason: "Capture has no related order" };
				return {
					type: "payment_succeeded",
					intentId: related.order_id,
					amount,
					currency: amountObj?.currency_code ?? null,
					captureId: (resource.id as string) ?? null,
				};
			case "PAYMENT.CAPTURE.DENIED":
			case "PAYMENT.CAPTURE.DECLINED":
				if (!related?.order_id) return { type: "ignored", reason: "Capture has no related order" };
				return { type: "payment_failed", intentId: related.order_id, reason: "Payment capture denied" };
			case "PAYMENT.CAPTURE.REFUNDED": {
				// Resource is the refund; its "up" link points at the capture
				const links = (resource.links as Array<{ rel: string; href: string }> | undefined) ?? [];
				const up = links.find((l) => l.rel === "up")?.href ?? "";
				const captureId = up.split("/captures/")[1]?.split(/[/?]/)[0] ?? null;
				return {
					type: "refund_succeeded",
					intentId: related?.order_id ?? null,
					captureId,
					refundId: resource.id as string,
					amount: amount ?? 0,
					cumulative: false,
				};
			}
			default:
				return { type: "ignored" };
		}
	}
}

function firstCapture(order: Record<string, unknown>): PayPalCapture | null {
	const units = order.purchase_units as Array<{ payments?: { captures?: PayPalCapture[] } }> | undefined;
	return units?.[0]?.payments?.captures?.[0] ?? null;
}
