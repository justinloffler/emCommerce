import { describe, expect, it } from "vitest";

import { PayPalGateway } from "../../src/payments/paypal.js";
import { StripeGateway, hmacSha256Hex, verifyStripeSignature } from "../../src/payments/stripe.js";
import { currencyDecimals, decimalStringToMinor, minorToDecimalString } from "../../src/payments/types.js";
import { MemoryKV, MockHttp, jsonResponse } from "../helpers/mock-context.js";

const SECRET = "whsec_test_secret";

async function signedHeader(payload: string, timestamp: number, secret = SECRET) {
	return `t=${timestamp},v1=${await hmacSha256Hex(secret, `${timestamp}.${payload}`)}`;
}

describe("currency helpers", () => {
	it("knows zero-decimal currencies", () => {
		expect(currencyDecimals("AUD")).toBe(2);
		expect(currencyDecimals("JPY")).toBe(0);
		expect(minorToDecimalString(1999, "AUD")).toBe("19.99");
		expect(minorToDecimalString(500, "JPY")).toBe("500");
		expect(decimalStringToMinor("19.99", "AUD")).toBe(1999);
		expect(decimalStringToMinor("0.29", "USD")).toBe(29);
	});
});

describe("verifyStripeSignature", () => {
	const payload = JSON.stringify({ type: "payment_intent.succeeded" });
	const now = 1_790_000_000;

	it("accepts a valid signature", async () => {
		expect(await verifyStripeSignature(payload, await signedHeader(payload, now), SECRET, now)).toBe(true);
	});

	it("rejects a tampered payload", async () => {
		const header = await signedHeader(payload, now);
		expect(await verifyStripeSignature(payload.replace("succeeded", "failed"), header, SECRET, now)).toBe(false);
	});

	it("rejects the wrong secret", async () => {
		const header = await signedHeader(payload, now, "whsec_other");
		expect(await verifyStripeSignature(payload, header, SECRET, now)).toBe(false);
	});

	it("rejects stale timestamps (replay protection)", async () => {
		const header = await signedHeader(payload, now - 301);
		expect(await verifyStripeSignature(payload, header, SECRET, now)).toBe(false);
	});

	it("accepts any matching v1 signature (secret rotation)", async () => {
		const good = await signedHeader(payload, now);
		const header = `t=${now},v1=deadbeef,${good.split(",")[1]}`;
		expect(await verifyStripeSignature(payload, header, SECRET, now)).toBe(true);
	});

	it("rejects malformed headers", async () => {
		expect(await verifyStripeSignature(payload, "garbage", SECRET, now)).toBe(false);
	});
});

describe("StripeGateway", () => {
	async function setup() {
		const kv = new MemoryKV();
		await kv.set("settings:stripeSecretKey", "sk_test_123");
		await kv.set("settings:stripeWebhookSecret", SECRET);
		const http = new MockHttp();
		return { kv, http, gateway: new StripeGateway({ kv, http: { fetch: http.fetch } as never }) };
	}

	it("creates a PaymentIntent with automatic payment methods and an idempotency key", async () => {
		const { http, gateway } = await setup();
		http.on("POST", "/v1/payment_intents", () => ({ id: "pi_1", client_secret: "pi_1_secret" }));
		const result = await gateway.createPaymentIntent({
			amount: 4400,
			currency: "AUD",
			orderId: "ord1",
			orderNumber: "EM-1",
			customerEmail: "a@b.co",
			metadata: {},
		});
		expect(result).toEqual({ intentId: "pi_1", clientSecret: "pi_1_secret" });
		const call = http.calls[0];
		const body = new URLSearchParams(call.init.body as string);
		expect(body.get("amount")).toBe("4400");
		expect(body.get("currency")).toBe("aud");
		expect(body.get("automatic_payment_methods[enabled]")).toBe("true");
		expect((call.init.headers as Record<string, string>)["Idempotency-Key"]).toBe("emc-order-ord1");
	});

	it("maps PaymentIntent status when finalizing", async () => {
		const { http, gateway } = await setup();
		http.on("GET", "/payment_intents/pi_ok", () => ({
			status: "succeeded",
			amount_received: 4400,
			currency: "aud",
			latest_charge: "ch_1",
		}));
		http.on("GET", "/payment_intents/pi_wait", () => ({ status: "requires_payment_method", last_payment_error: null }));
		http.on("GET", "/payment_intents/pi_bad", () => ({
			status: "requires_payment_method",
			last_payment_error: { message: "Card declined" },
		}));

		expect(await gateway.finalizePayment("pi_ok")).toEqual({
			status: "succeeded",
			amount: 4400,
			currency: "AUD",
			captureId: "ch_1",
		});
		expect((await gateway.finalizePayment("pi_wait")).status).toBe("pending");
		expect(await gateway.finalizePayment("pi_bad")).toMatchObject({ status: "failed", reason: "Card declined" });
	});

	it("only trusts webhooks with a valid signature", async () => {
		const { gateway } = await setup();
		const payload = JSON.stringify({
			type: "payment_intent.succeeded",
			data: { object: { id: "pi_1", amount_received: 4400, currency: "aud", latest_charge: "ch_1" } },
		});
		const ts = Math.floor(Date.now() / 1000);

		const ok = await gateway.handleWebhook({
			rawBody: payload,
			headers: { "stripe-signature": await signedHeader(payload, ts) },
		});
		expect(ok).toEqual({ type: "payment_succeeded", intentId: "pi_1", amount: 4400, currency: "AUD", captureId: "ch_1" });

		const forged = await gateway.handleWebhook({
			rawBody: payload,
			headers: { "stripe-signature": await signedHeader(payload, ts, "whsec_attacker") },
		});
		expect(forged).toEqual({ type: "invalid_signature" });

		const unsigned = await gateway.handleWebhook({ rawBody: payload, headers: {} });
		expect(unsigned).toEqual({ type: "invalid_signature" });
	});

	it("ignores webhooks when no signing secret is configured", async () => {
		const { kv, gateway } = await setup();
		await kv.delete("settings:stripeWebhookSecret");
		const result = await gateway.handleWebhook({ rawBody: "{}", headers: { "stripe-signature": "t=1,v1=x" } });
		expect(result.type).toBe("ignored");
	});

	it("reports cumulative refunds from charge.refunded", async () => {
		const { gateway } = await setup();
		const payload = JSON.stringify({
			type: "charge.refunded",
			data: { object: { id: "ch_1", payment_intent: "pi_1", amount_refunded: 1500 } },
		});
		const ts = Math.floor(Date.now() / 1000);
		const result = await gateway.handleWebhook({
			rawBody: payload,
			headers: { "stripe-signature": await signedHeader(payload, ts) },
		});
		expect(result).toMatchObject({ type: "refund_succeeded", intentId: "pi_1", amount: 1500, cumulative: true });
	});
});

describe("PayPalGateway", () => {
	async function setup() {
		const kv = new MemoryKV();
		await kv.set("settings:paypalClientId", "client");
		await kv.set("settings:paypalClientSecret", "secret");
		await kv.set("settings:paypalWebhookId", "WH-1");
		const http = new MockHttp();
		http.on("POST", "/v1/oauth2/token", () => ({ access_token: "tok" }));
		return { kv, http, gateway: new PayPalGateway({ kv, http: { fetch: http.fetch } as never }) };
	}

	const capturedOrder = (status = "COMPLETED") => ({
		id: "PP-ORDER",
		status: "COMPLETED",
		purchase_units: [
			{ payments: { captures: [{ id: "CAP-1", status, amount: { value: "44.00", currency_code: "AUD" } }] } },
		],
	});

	it("defaults to the sandbox API until sandbox mode is switched off", async () => {
		const { http, gateway, kv } = await setup();
		http.on("POST", "/v2/checkout/orders", () => ({ id: "PP-ORDER" }));
		await gateway.createPaymentIntent({
			amount: 4400,
			currency: "AUD",
			orderId: "o1",
			orderNumber: "EM-1",
			customerEmail: "a@b.co",
			metadata: {},
		});
		expect(http.calls[0].url).toContain("api-m.sandbox.paypal.com");

		await kv.set("settings:paypalSandbox", false);
		await gateway.createPaymentIntent({
			amount: 4400,
			currency: "AUD",
			orderId: "o2",
			orderNumber: "EM-2",
			customerEmail: "a@b.co",
			metadata: {},
		});
		expect(http.calls.at(-1)!.url).toContain("api-m.paypal.com");
	});

	it("sends amounts as decimal strings in the order's currency", async () => {
		const { http, gateway } = await setup();
		http.on("POST", "/v2/checkout/orders", () => ({ id: "PP-ORDER" }));
		await gateway.createPaymentIntent({
			amount: 4400,
			currency: "aud",
			orderId: "o1",
			orderNumber: "EM-1",
			customerEmail: "a@b.co",
			metadata: {},
		});
		const body = JSON.parse(http.calls.at(-1)!.init.body as string);
		expect(body.purchase_units[0].amount).toEqual({ currency_code: "AUD", value: "44.00" });
		expect(body.purchase_units[0].custom_id).toBe("o1");
	});

	it("captures on finalize and reports the captured amount", async () => {
		const { http, gateway } = await setup();
		http.on("POST", "/PP-ORDER/capture", () => capturedOrder());
		expect(await gateway.finalizePayment("PP-ORDER")).toEqual({
			status: "succeeded",
			amount: 4400,
			currency: "AUD",
			captureId: "CAP-1",
		});
	});

	it("handles an order that was already captured", async () => {
		const { http, gateway } = await setup();
		http.on("POST", "/PP-ORDER/capture", () =>
			jsonResponse({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_ALREADY_CAPTURED" }] }, 422),
		);
		http.on("GET", "/v2/checkout/orders/PP-ORDER", () => capturedOrder());
		expect((await gateway.finalizePayment("PP-ORDER")).status).toBe("succeeded");
	});

	it("treats an unapproved order as pending and a declined one as failed", async () => {
		const { http, gateway } = await setup();
		http.on("POST", "/NOT-APPROVED/capture", () =>
			jsonResponse({ details: [{ issue: "ORDER_NOT_APPROVED" }] }, 422),
		);
		http.on("POST", "/DECLINED/capture", () => jsonResponse({ details: [{ issue: "INSTRUMENT_DECLINED" }] }, 422));
		expect((await gateway.finalizePayment("NOT-APPROVED")).status).toBe("pending");
		expect(await gateway.finalizePayment("DECLINED")).toMatchObject({ status: "failed", reason: "INSTRUMENT_DECLINED" });
	});

	it("verifies webhooks with PayPal before trusting them", async () => {
		const { http, gateway } = await setup();
		let verdict = "SUCCESS";
		http.on("POST", "/v1/notifications/verify-webhook-signature", (call) => {
			const body = JSON.parse(call.init.body as string);
			expect(body.webhook_id).toBe("WH-1");
			return { verification_status: verdict };
		});
		const event = {
			event_type: "PAYMENT.CAPTURE.COMPLETED",
			resource: {
				id: "CAP-1",
				amount: { value: "44.00", currency_code: "AUD" },
				supplementary_data: { related_ids: { order_id: "PP-ORDER" } },
			},
		};
		const headers = {
			"paypal-auth-algo": "SHA256withRSA",
			"paypal-cert-url": "https://api.paypal.com/cert.pem",
			"paypal-transmission-id": "tx",
			"paypal-transmission-sig": "sig",
			"paypal-transmission-time": "2026-10-27T00:00:00Z",
		};

		expect(await gateway.handleWebhook({ rawBody: JSON.stringify(event), headers })).toEqual({
			type: "payment_succeeded",
			intentId: "PP-ORDER",
			amount: 4400,
			currency: "AUD",
			captureId: "CAP-1",
		});

		verdict = "FAILURE";
		expect(await gateway.handleWebhook({ rawBody: JSON.stringify(event), headers })).toEqual({
			type: "invalid_signature",
		});

		expect(await gateway.handleWebhook({ rawBody: JSON.stringify(event), headers: {} })).toEqual({
			type: "invalid_signature",
		});
	});

	it("does not treat an approved-but-uncaptured order as paid", async () => {
		const { http, gateway } = await setup();
		http.on("POST", "/v1/notifications/verify-webhook-signature", () => ({ verification_status: "SUCCESS" }));
		const result = await gateway.handleWebhook({
			rawBody: JSON.stringify({ event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "PP-ORDER" } }),
			headers: {
				"paypal-auth-algo": "a",
				"paypal-cert-url": "b",
				"paypal-transmission-id": "c",
				"paypal-transmission-sig": "d",
				"paypal-transmission-time": "e",
			},
		});
		expect(result.type).toBe("ignored");
	});
});
