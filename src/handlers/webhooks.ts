/**
 * Payment webhook handlers.
 *
 * Receive events from Stripe and PayPal. Events are only acted on after the
 * gateway has verified the signature (Stripe: HMAC with the endpoint secret;
 * PayPal: the verify-webhook-signature API with the configured webhook ID).
 *
 * Routes are declared with `request: { body: "text" }`, so `ctx.input` is the
 * raw, unparsed body — required for signature verification.
 */

import type { RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";
import { ulid } from "ulidx";

import { sendOrderEmail } from "../emails.js";
import { getGateway, initGateways } from "../payments/gateway-registry.js";
import type { WebhookResult } from "../payments/types.js";
import type { Order } from "../types.js";
import { requireHttp } from "./context.js";
import { findOrderByPaymentRef, markOrderPaid, recordPaymentFailure } from "./order-payment.js";

export const STRIPE_WEBHOOK_HEADERS = ["stripe-signature"];
export const PAYPAL_WEBHOOK_HEADERS = [
	"paypal-auth-algo",
	"paypal-cert-url",
	"paypal-transmission-id",
	"paypal-transmission-sig",
	"paypal-transmission-time",
];

export async function stripeWebhookHandler(ctx: RouteContext<string>) {
	return handleWebhook(ctx, "stripe", STRIPE_WEBHOOK_HEADERS);
}

export async function paypalWebhookHandler(ctx: RouteContext<string>) {
	return handleWebhook(ctx, "paypal", PAYPAL_WEBHOOK_HEADERS);
}

async function handleWebhook(ctx: RouteContext<string>, gatewayId: string, headerNames: string[]) {
	initGateways({ http: requireHttp(ctx), kv: ctx.kv });
	const gateway = getGateway(gatewayId);
	if (!gateway) return { received: false };

	const headers: Record<string, string> = {};
	for (const name of headerNames) {
		const value = ctx.request.headers.get(name);
		if (value) headers[name] = value;
	}
	const rawBody = typeof ctx.input === "string" ? ctx.input : "";

	const result = await gateway.handleWebhook({ rawBody, headers });
	if (result.type === "invalid_signature") {
		ctx.log.warn(`Rejected ${gatewayId} webhook with an invalid signature`);
		throw PluginRouteError.badRequest("Invalid webhook signature");
	}
	await applyWebhookResult(ctx, gatewayId, result);
	return { received: true };
}

export async function applyWebhookResult(ctx: RouteContext<unknown>, gatewayId: string, result: WebhookResult) {
	switch (result.type) {
		case "payment_succeeded": {
			const found = await findOrderByPaymentRef(ctx, { intentId: result.intentId });
			if (!found || found.data.paymentMethod !== gatewayId) return;
			await markOrderPaid(ctx, found.id, {
				source: "webhook",
				amount: result.amount,
				currency: result.currency,
				captureId: result.captureId,
			});
			return;
		}

		case "payment_failed": {
			const found = await findOrderByPaymentRef(ctx, { intentId: result.intentId });
			if (!found || found.data.paymentMethod !== gatewayId) return;
			await recordPaymentFailure(ctx, found.id, result.reason);
			return;
		}

		case "refund_succeeded": {
			const found = await findOrderByPaymentRef(ctx, {
				intentId: result.intentId,
				captureId: result.captureId,
			});
			if (!found || found.data.paymentMethod !== gatewayId) return;
			await recordProviderRefund(ctx, found.id, result);
			return;
		}

		default:
			return;
	}
}

/**
 * Record a refund reported by the provider, skipping ones we already know
 * about (e.g. refunds issued from the emCommerce admin).
 */
async function recordProviderRefund(
	ctx: RouteContext<unknown>,
	orderId: string,
	result: Extract<WebhookResult, { type: "refund_succeeded" }>,
) {
	const col = ctx.storage.orders as StorageCollection<Order>;
	for (let attempt = 0; attempt < 3; attempt++) {
		const current = await col.getVersioned(orderId);
		if (!current) return;
		const order = current.value;

		if (order.refunds.some((r) => r.refundId === result.refundId)) return;
		const alreadyRefunded = order.refunds.reduce((s, r) => s + r.amount, 0);
		const amount = result.cumulative ? result.amount - alreadyRefunded : result.amount;
		if (amount <= 0) return;

		const now = new Date().toISOString();
		const totalRefunded = alreadyRefunded + amount;
		const fullyRefunded = totalRefunded >= order.total;
		const next: Order = {
			...order,
			refunds: [
				...order.refunds,
				{ id: ulid(), amount, reason: "Refund issued at payment provider", refundId: result.refundId, createdAt: now },
			],
			paymentStatus: fullyRefunded ? "refunded" : "partial_refund",
			status: fullyRefunded ? "refunded" : order.status,
			updatedAt: now,
			adminNotes: [
				...order.adminNotes,
				{ id: ulid(), content: `Refund of ${amount} recorded from provider webhook`, isSystem: true, createdAt: now },
			],
		};
		const res = await col.compareAndSet(orderId, current.revision, next);
		if (res.applied) {
			if (fullyRefunded) await sendOrderEmail(ctx, "refund_confirmation", next);
			return;
		}
	}
}
