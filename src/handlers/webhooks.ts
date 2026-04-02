/**
 * Payment webhook handlers.
 *
 * Receives events from Stripe and PayPal to update order status.
 */

import type { RouteContext, StorageCollection } from "emdash";
import { ulid } from "ulidx";

import type { Order } from "../types.js";
import { initGateways, getGateway } from "../payments/gateway-registry.js";
import { releaseStock } from "../engine/inventory.js";
import type { Product, Variant } from "../types.js";

/**
 * Handle Stripe webhook events.
 */
export async function stripeWebhookHandler(ctx: RouteContext) {
	initGateways({ http: ctx.http, kv: ctx.kv });
	const gateway = getGateway("stripe");
	if (!gateway) return { received: false };

	const result = await gateway.handleWebhook(ctx.request as Request);
	return handleWebhookResult(result, ctx);
}

/**
 * Handle PayPal webhook events.
 */
export async function paypalWebhookHandler(ctx: RouteContext) {
	initGateways({ http: ctx.http, kv: ctx.kv });
	const gateway = getGateway("paypal");
	if (!gateway) return { received: false };

	const result = await gateway.handleWebhook(ctx.request as Request);
	return handleWebhookResult(result, ctx);
}

async function handleWebhookResult(
	result: Awaited<ReturnType<typeof getGateway extends (...args: unknown[]) => infer R ? R : never>>,
	ctx: RouteContext,
) {
	if (!result || result.type === "ignored") {
		return { received: true };
	}

	const ordersCol = ctx.storage.orders as StorageCollection<Order>;

	switch (result.type) {
		case "payment_succeeded": {
			// Find order by payment intent ID
			const order = await findOrderByIntentId(result.intentId, ordersCol);
			if (order) {
				const now = new Date().toISOString();
				order.data.status = "processing";
				order.data.paymentStatus = "captured";
				order.data.updatedAt = now;
				order.data.adminNotes.push({
					id: ulid(),
					content: "Payment succeeded via webhook",
					isSystem: true,
					createdAt: now,
				});
				await ordersCol.put(order.id, order.data);
			}
			break;
		}

		case "payment_failed": {
			const order = await findOrderByIntentId(result.intentId, ordersCol);
			if (order) {
				const now = new Date().toISOString();
				order.data.status = "cancelled";
				order.data.paymentStatus = "failed";
				order.data.updatedAt = now;
				order.data.adminNotes.push({
					id: ulid(),
					content: `Payment failed: ${result.reason}`,
					isSystem: true,
					createdAt: now,
				});
				await ordersCol.put(order.id, order.data);

				// Release reserved stock
				await releaseStock(
					order.data.items.map((i) => ({
						productId: i.productId,
						variantId: i.variantId,
						quantity: i.quantity,
					})),
					{
						products: ctx.storage.products as StorageCollection<Product>,
						variants: ctx.storage.variants as StorageCollection<Variant>,
					},
				);
			}
			break;
		}

		case "refund_succeeded": {
			const order = await findOrderByIntentId(result.intentId, ordersCol);
			if (order) {
				const now = new Date().toISOString();
				order.data.refunds.push({
					id: ulid(),
					amount: result.amount,
					reason: "Refund processed via webhook",
					refundId: result.refundId,
					createdAt: now,
				});
				const totalRefunded = order.data.refunds.reduce((s, r) => s + r.amount, 0);
				order.data.paymentStatus = totalRefunded >= order.data.total ? "refunded" : "partial_refund";
				if (order.data.paymentStatus === "refunded") {
					order.data.status = "refunded";
				}
				order.data.updatedAt = now;
				await ordersCol.put(order.id, order.data);
			}
			break;
		}
	}

	return { received: true };
}

async function findOrderByIntentId(
	intentId: string,
	ordersCol: StorageCollection<Order>,
): Promise<{ id: string; data: Order } | null> {
	// Query by payment intent — since it's not indexed, we do a scan
	// In production, you'd want to index paymentIntentId
	let cursor: string | undefined;
	do {
		const batch = await ordersCol.query({ limit: 100, cursor });
		for (const item of batch.items) {
			if (item.data.paymentIntentId === intentId) {
				return { id: item.id, data: item.data };
			}
		}
		cursor = batch.cursor;
	} while (cursor);
	return null;
}
