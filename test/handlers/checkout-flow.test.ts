import { beforeEach, describe, expect, it } from "vitest";

import { checkoutConfirmHandler, checkoutCreateHandler, checkoutQuoteHandler } from "../../src/handlers/checkout.js";
import { handlePendingOrderCleanup } from "../../src/handlers/cron.js";
import { stripeWebhookHandler } from "../../src/handlers/webhooks.js";
import { hmacSha256Hex } from "../../src/payments/stripe.js";
import type { Order, Product } from "../../src/types.js";
import { billing, coupon, seedCart, seedStore } from "../helpers/fixtures.js";
import { createMockContext, jsonResponse } from "../helpers/mock-context.js";

type Mock = ReturnType<typeof createMockContext>;

function createInput(overrides: Record<string, unknown> = {}) {
	return {
		sessionId: "sess-1",
		email: "Shopper@Example.com",
		billingAddress: billing,
		shippingAddress: null,
		shippingMethodId: "flat",
		paymentGateway: "stripe",
		customerNote: null,
		expectedTotal: null,
		...overrides,
	};
}

/** Stripe API double: PaymentIntent create + retrieve with a controllable status */
function mockStripe(m: Mock, state: { status: string; amount?: number; currency?: string }) {
	m.http.on("POST", "/v1/payment_intents", () => ({ id: "pi_1", client_secret: "pi_1_secret_x" }));
	m.http.on("GET", "/v1/payment_intents/pi_1", () => ({
		id: "pi_1",
		status: state.status,
		amount_received: state.amount ?? 0,
		currency: state.currency ?? "aud",
		latest_charge: "ch_1",
		last_payment_error: state.status === "requires_payment_method" ? { message: "Card declined" } : null,
	}));
}

async function stripeEvent(m: Mock, event: unknown, secret = "whsec_test_secret") {
	const raw = JSON.stringify(event);
	const ts = Math.floor(Date.now() / 1000);
	const sig = `t=${ts},v1=${await hmacSha256Hex(secret, `${ts}.${raw}`)}`;
	const request = new Request("http://localhost/webhook/stripe", {
		method: "POST",
		headers: { "stripe-signature": sig },
	});
	return stripeWebhookHandler(m.withInput(raw, request));
}

async function getOrder(m: Mock, id: string) {
	return (await m.storage.orders.get(id)) as Order;
}

async function stock(m: Mock) {
	return ((await m.storage.products.get("prod-mug")) as Product).stockQuantity;
}

describe("checkout quote", () => {
	let m: Mock;
	beforeEach(async () => {
		m = createMockContext();
		await seedStore(m);
		await seedCart(m, "cart-1", "sess-1");
	});

	it("prices the cart with shipping options and GST for the address", async () => {
		const quote = await checkoutQuoteHandler(
			m.withInput({
				sessionId: "sess-1",
				address: { countryCode: "AU", stateCode: "SA", postalCode: "5000", city: "Adelaide" },
				shippingMethodId: null,
			}),
		);
		// Free shipping method isn't offered without a free-shipping coupon
		expect(quote.shippingMethods).toEqual([{ id: "flat", name: "Standard Post", cost: 1000 }]);
		expect(quote.shippingMethodId).toBe("flat");
		expect(quote.subtotal).toBe(4400);
		expect(quote.taxTotal).toBe(440);
		expect(quote.total).toBe(4400 + 1000 + 440);
	});

	it("unlocks the free shipping method only with a free-shipping coupon", async () => {
		await m.storage.coupons.put("c-pct", coupon({ code: "SAVE10" }));
		await m.storage.coupons.put("c-ship", coupon({ code: "FREESHIP", type: "free_shipping", value: 0 }));
		const address = { countryCode: "AU", stateCode: "SA", postalCode: "5000", city: "Adelaide" };

		await seedCart(m, "cart-1", "sess-1", { couponCodes: ["SAVE10"] });
		const withPercent = await checkoutQuoteHandler(m.withInput({ sessionId: "sess-1", address, shippingMethodId: null }));
		expect(withPercent.shippingMethods.map((s) => s.id)).toEqual(["flat"]);

		await seedCart(m, "cart-1", "sess-1", { couponCodes: ["FREESHIP"] });
		const withFreeShip = await checkoutQuoteHandler(
			m.withInput({ sessionId: "sess-1", address, shippingMethodId: "free" }),
		);
		expect(withFreeShip.shippingMethods.map((s) => s.id)).toEqual(["flat", "free"]);
		expect(withFreeShip.shippingTotal).toBe(0);
	});
});

describe("checkout create", () => {
	let m: Mock;
	beforeEach(async () => {
		m = createMockContext();
		await seedStore(m);
		await seedCart(m, "cart-1", "sess-1");
		mockStripe(m, { status: "requires_payment_method" });
	});

	it("creates a pending order, guest customer and Stripe PaymentIntent", async () => {
		const res = await checkoutCreateHandler(m.withInput(createInput()));
		expect(res.clientSecret).toBe("pi_1_secret_x");
		expect(res.total).toBe(5840);

		const order = await getOrder(m, res.orderId);
		expect(order.status).toBe("pending_payment");
		expect(order.paymentStatus).toBe("pending");
		expect(order.paymentIntentId).toBe("pi_1");
		expect(order.customerEmail).toBe("shopper@example.com");
		expect(order.taxTotal).toBe(440);
		expect(order.items[0].taxAmount).toBe(440);
		expect(order.items[0].taxClassId).toBe("std");
		expect(order.shippingMethodName).toBe("Standard Post");
		expect(order.cartId).toBe("cart-1");

		// Stripe was asked for exactly the order total in the cart's currency
		const body = new URLSearchParams(m.http.calls[0].init.body as string);
		expect(body.get("amount")).toBe("5840");
		expect(body.get("currency")).toBe("aud");

		// Guest customer created and linked, without spending stats yet
		const customers = await m.storage.customers.query();
		expect(customers.items).toHaveLength(1);
		expect(order.customerId).toBe(customers.items[0].id);
		expect(customers.items[0].data).toMatchObject({ email: "shopper@example.com", totalOrders: 0, groupId: "grp-default" });

		// Stock reserved
		expect(await stock(m)).toBe(8);
	});

	it("reuses the existing customer for a returning email", async () => {
		await checkoutCreateHandler(m.withInput(createInput()));
		await seedCart(m, "cart-2", "sess-2");
		await checkoutCreateHandler(m.withInput(createInput({ sessionId: "sess-2", email: "shopper@example.com" })));
		expect(await m.storage.customers.count()).toBe(1);
	});

	it("rejects a shipping method that isn't available instead of shipping for free", async () => {
		await expect(
			checkoutCreateHandler(m.withInput(createInput({ shippingMethodId: "free" }))),
		).rejects.toThrow(/shipping method/i);
		await expect(
			checkoutCreateHandler(m.withInput(createInput({ shippingMethodId: "does-not-exist" }))),
		).rejects.toThrow(/shipping method/i);
		expect(await stock(m)).toBe(10);
	});

	it("refuses to charge a different total than the customer reviewed", async () => {
		await expect(checkoutCreateHandler(m.withInput(createInput({ expectedTotal: 1 })))).rejects.toThrow(
			/prices have changed/i,
		);
		expect(await m.storage.orders.count()).toBe(0);
	});

	it("cancels the order and releases stock if the payment provider fails", async () => {
		m.http.on("POST", "/v1/payment_intents", () => jsonResponse({ error: { message: "Invalid API key" } }, 401));
		await expect(checkoutCreateHandler(m.withInput(createInput()))).rejects.toThrow(/couldn't start the payment/i);

		const orders = await m.storage.orders.query();
		expect(orders.items[0].data).toMatchObject({ status: "cancelled" });
		expect(await stock(m)).toBe(10);
	});

	it("refuses when stock is insufficient", async () => {
		await m.storage.products.put("prod-mug", { ...(await m.storage.products.get("prod-mug")) as Product, stockQuantity: 1 });
		await expect(checkoutCreateHandler(m.withInput(createInput()))).rejects.toThrow(/out of stock/i);
	});
});

describe("checkout confirm", () => {
	let m: Mock;
	let stripe: { status: string; amount?: number; currency?: string };
	let orderId: string;

	beforeEach(async () => {
		m = createMockContext();
		await seedStore(m);
		await m.storage.coupons.put("c-pct", coupon({ code: "SAVE10" }));
		await seedCart(m, "cart-1", "sess-1", { couponCodes: ["SAVE10"] });
		await seedCart(m, "cart-other", "sess-other"); // another shopper's cart
		stripe = { status: "requires_payment_method" };
		mockStripe(m, stripe);
		orderId = (await checkoutCreateHandler(m.withInput(createInput()))).orderId;
	});

	it("does not mark an order paid just because the browser says so", async () => {
		const res = await checkoutConfirmHandler(m.withInput({ orderId, paymentIntentId: "pi_1" }));
		expect(res.paid).toBe(false);
		expect((await getOrder(m, orderId)).status).toBe("pending_payment");
	});

	it("rejects a payment reference that belongs to another order", async () => {
		await expect(checkoutConfirmHandler(m.withInput({ orderId, paymentIntentId: "pi_attacker" }))).rejects.toThrow(
			/does not belong/i,
		);
	});

	it("marks the order paid once Stripe confirms, with side effects exactly once", async () => {
		const order = await getOrder(m, orderId);
		stripe.status = "succeeded";
		stripe.amount = order.total;

		const res = await checkoutConfirmHandler(m.withInput({ orderId }));
		expect(res).toMatchObject({ paid: true, status: "processing", paymentStatus: "captured" });

		// Only the shopper's own cart is removed
		expect(await m.storage.carts.exists("cart-1")).toBe(false);
		expect(await m.storage.carts.exists("cart-other")).toBe(true);

		// Coupon usage, customer stats, confirmation email
		expect(((await m.storage.coupons.get("c-pct")) as { usageCount: number }).usageCount).toBe(1);
		const customer = (await m.storage.customers.get(order.customerId!)) as { totalOrders: number; totalSpent: number };
		expect(customer).toMatchObject({ totalOrders: 1, totalSpent: order.total });
		expect(m.emails).toHaveLength(1);
		expect(m.emails[0]).toMatchObject({ to: "shopper@example.com", subject: `Order ${order.orderNumber} confirmed` });

		// Confirming again (or the webhook arriving later) changes nothing
		await checkoutConfirmHandler(m.withInput({ orderId }));
		await stripeEvent(m, {
			type: "payment_intent.succeeded",
			data: { object: { id: "pi_1", amount_received: order.total, currency: "aud", latest_charge: "ch_1" } },
		});
		expect(((await m.storage.coupons.get("c-pct")) as { usageCount: number }).usageCount).toBe(1);
		expect(m.emails).toHaveLength(1);
	});

	it("puts the order on hold when the amount paid doesn't match", async () => {
		stripe.status = "succeeded";
		stripe.amount = 100;
		const res = await checkoutConfirmHandler(m.withInput({ orderId }));
		expect(res.paid).toBe(false);
		const order = await getOrder(m, orderId);
		expect(order.status).toBe("on_hold");
		expect(order.adminNotes.at(-1)!.content).toMatch(/doesn't match/);
	});
});

describe("stripe webhook", () => {
	let m: Mock;
	let orderId: string;
	let total: number;

	beforeEach(async () => {
		m = createMockContext();
		await seedStore(m);
		await seedCart(m, "cart-1", "sess-1");
		mockStripe(m, { status: "requires_payment_method" });
		const res = await checkoutCreateHandler(m.withInput(createInput()));
		orderId = res.orderId;
		total = res.total;
	});

	it("marks the order paid from a correctly signed event", async () => {
		await stripeEvent(m, {
			type: "payment_intent.succeeded",
			data: { object: { id: "pi_1", amount_received: total, currency: "aud", latest_charge: "ch_1" } },
		});
		const order = await getOrder(m, orderId);
		expect(order).toMatchObject({ status: "processing", paymentStatus: "captured", paymentCaptureId: "ch_1" });
	});

	it("rejects forged events and leaves the order unpaid", async () => {
		await expect(
			stripeEvent(
				m,
				{ type: "payment_intent.succeeded", data: { object: { id: "pi_1", amount_received: total, currency: "aud" } } },
				"whsec_attacker",
			),
		).rejects.toThrow(/invalid webhook signature/i);
		expect((await getOrder(m, orderId)).status).toBe("pending_payment");
	});

	it("records provider refunds once, even if the event is redelivered", async () => {
		await stripeEvent(m, {
			type: "payment_intent.succeeded",
			data: { object: { id: "pi_1", amount_received: total, currency: "aud", latest_charge: "ch_1" } },
		});
		const refund = { type: "charge.refunded", data: { object: { id: "ch_1", payment_intent: "pi_1", amount_refunded: 1000 } } };
		await stripeEvent(m, refund);
		await stripeEvent(m, refund);
		const order = await getOrder(m, orderId);
		expect(order.refunds).toHaveLength(1);
		expect(order.refunds[0].amount).toBe(1000);
		expect(order.paymentStatus).toBe("partial_refund");
	});
});

describe("pending order cleanup", () => {
	it("cancels abandoned orders (releasing stock) but rescues ones that were actually paid", async () => {
		const m = createMockContext();
		await seedStore(m);
		const state = { status: "requires_payment_method", amount: 0 };
		mockStripe(m, state);

		await seedCart(m, "cart-1", "sess-1");
		const abandoned = await checkoutCreateHandler(m.withInput(createInput()));
		expect(await stock(m)).toBe(8);

		// Age the order past the timeout
		const old = await getOrder(m, abandoned.orderId);
		await m.storage.orders.put(abandoned.orderId, { ...old, createdAt: "2020-01-01T00:00:00.000Z" });

		const result = await handlePendingOrderCleanup(m.ctx);
		expect(result).toEqual({ paid: 0, cancelled: 1 });
		expect((await getOrder(m, abandoned.orderId)).status).toBe("cancelled");
		expect(await stock(m)).toBe(10);

		// A paid order whose confirmation was missed gets marked paid instead
		await seedCart(m, "cart-2", "sess-2");
		const paidLate = await checkoutCreateHandler(m.withInput(createInput({ sessionId: "sess-2" })));
		const o2 = await getOrder(m, paidLate.orderId);
		await m.storage.orders.put(paidLate.orderId, { ...o2, createdAt: "2020-01-01T00:00:00.000Z" });
		state.status = "succeeded";
		state.amount = o2.total;

		expect(await handlePendingOrderCleanup(m.ctx)).toEqual({ paid: 1, cancelled: 0 });
		expect((await getOrder(m, paidLate.orderId)).status).toBe("processing");
	});
});
