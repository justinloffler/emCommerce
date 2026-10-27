/**
 * Order payment state changes shared by checkout confirmation and webhooks.
 *
 * Both paths can fire for the same payment (the browser confirms while the
 * provider's webhook arrives), so every transition here is idempotent and
 * uses compare-and-set: side effects (coupon usage, customer stats, cart
 * removal, confirmation email) run exactly once — for whichever caller wins.
 */

import type { PluginContext, StorageCollection } from "emdash";
import { ulid } from "ulidx";

import { releaseStock } from "../engine/inventory.js";
import { sendOrderEmail } from "../emails.js";
import type { Cart, Coupon, Customer, Order, Product, Variant } from "../types.js";

export interface PaymentEvidence {
	source: "confirm" | "webhook";
	amount: number | null;
	currency: string | null;
	captureId: string | null;
}

export type MarkPaidOutcome = "paid" | "already_paid" | "amount_mismatch" | "not_pending";

function ordersCol(ctx: PluginContext) {
	return ctx.storage.orders as StorageCollection<Order>;
}

function note(content: string, now: string) {
	return { id: ulid(), content, isSystem: true, createdAt: now };
}

/**
 * Mark an order as paid after the provider has confirmed the payment.
 */
export async function markOrderPaid(
	ctx: PluginContext,
	orderId: string,
	evidence: PaymentEvidence,
): Promise<{ outcome: MarkPaidOutcome; order: Order | null }> {
	const col = ordersCol(ctx);

	for (let attempt = 0; attempt < 3; attempt++) {
		const current = await col.getVersioned(orderId);
		if (!current) return { outcome: "not_pending", order: null };
		const order = current.value;

		if (order.paymentStatus === "captured" || order.status === "processing") {
			return { outcome: "already_paid", order };
		}
		if (order.status !== "pending_payment" && order.status !== "on_hold") {
			return { outcome: "not_pending", order };
		}

		const now = new Date().toISOString();
		const amountOk = evidence.amount === null || evidence.amount === order.total;
		const currencyOk =
			evidence.currency === null || evidence.currency.toUpperCase() === order.currencyCode.toUpperCase();

		let next: Order;
		if (!amountOk || !currencyOk) {
			if (order.status === "on_hold") return { outcome: "amount_mismatch", order };
			next = {
				...order,
				status: "on_hold",
				paymentCaptureId: evidence.captureId ?? order.paymentCaptureId ?? null,
				updatedAt: now,
				adminNotes: [
					...order.adminNotes,
					note(
						`Payment received (${evidence.source}) but it doesn't match the order: ` +
							`expected ${order.total} ${order.currencyCode}, ` +
							`got ${evidence.amount ?? "?"} ${evidence.currency ?? "?"}. Review before fulfilling.`,
						now,
					),
				],
			};
		} else {
			next = {
				...order,
				status: "processing",
				paymentStatus: "captured",
				paymentCaptureId: evidence.captureId ?? order.paymentCaptureId ?? null,
				updatedAt: now,
				adminNotes: [
					...order.adminNotes,
					note(`Payment confirmed via ${evidence.source}. Order is now processing.`, now),
				],
			};
		}

		const result = await col.compareAndSet(orderId, current.revision, next);
		if (!result.applied) continue; // someone else changed it; re-read

		if (next.status === "on_hold") {
			ctx.log.warn("Order payment amount mismatch", { orderId, orderNumber: order.orderNumber });
			return { outcome: "amount_mismatch", order: next };
		}

		await runPaidSideEffects(ctx, orderId, next);
		return { outcome: "paid", order: next };
	}

	// Persistent contention — report current state
	const latest = await col.get(orderId);
	return {
		outcome: latest?.paymentStatus === "captured" ? "already_paid" : "not_pending",
		order: latest,
	};
}

/**
 * Record a failed payment attempt. The order stays pending so the customer
 * can retry with another card; abandoned orders are cancelled by the
 * pending-order cleanup cron, which releases their stock.
 */
export async function recordPaymentFailure(ctx: PluginContext, orderId: string, reason: string): Promise<void> {
	const col = ordersCol(ctx);
	const current = await col.getVersioned(orderId);
	if (!current) return;
	const order = current.value;
	if (order.status !== "pending_payment") return;

	const now = new Date().toISOString();
	await col.compareAndSet(orderId, current.revision, {
		...order,
		paymentStatus: "failed",
		updatedAt: now,
		adminNotes: [...order.adminNotes, note(`Payment attempt failed: ${reason}`, now)],
	});
}

/**
 * Cancel an unpaid order and release its reserved stock (idempotent).
 */
export async function cancelUnpaidOrder(ctx: PluginContext, orderId: string, reason: string): Promise<boolean> {
	const col = ordersCol(ctx);
	const current = await col.getVersioned(orderId);
	if (!current) return false;
	const order = current.value;
	if (order.status !== "pending_payment") return false;

	const now = new Date().toISOString();
	const result = await col.compareAndSet(orderId, current.revision, {
		...order,
		status: "cancelled",
		paymentStatus: order.paymentStatus === "pending" ? "failed" : order.paymentStatus,
		updatedAt: now,
		adminNotes: [...order.adminNotes, note(`Order cancelled: ${reason}`, now)],
	});
	if (!result.applied) return false;

	await releaseStock(
		order.items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
		{
			products: ctx.storage.products as StorageCollection<Product>,
			variants: ctx.storage.variants as StorageCollection<Variant>,
		},
	);
	return true;
}

/**
 * Find an order by its provider payment reference.
 */
export async function findOrderByPaymentRef(
	ctx: PluginContext,
	ref: { intentId?: string | null; captureId?: string | null },
): Promise<{ id: string; data: Order } | null> {
	const col = ordersCol(ctx);
	if (ref.intentId) {
		const hit = await col.query({ where: { paymentIntentId: ref.intentId }, limit: 1 });
		if (hit.items[0]) return hit.items[0];
	}
	if (ref.captureId) {
		const hit = await col.query({ where: { paymentCaptureId: ref.captureId }, limit: 1 });
		if (hit.items[0]) return hit.items[0];
	}
	return null;
}

// ─── Side effects ───────────────────────────────────────────────

async function runPaidSideEffects(ctx: PluginContext, orderId: string, order: Order): Promise<void> {
	const tasks: Array<[string, () => Promise<unknown>]> = [
		["coupon usage", () => incrementCouponUsage(ctx, order.couponCodes ?? [])],
		["customer stats", () => updateCustomerStats(ctx, order)],
		["cart removal", () => removeCart(ctx, order.cartId ?? null)],
		["confirmation email", () => sendOrderEmail(ctx, "order_confirmation", order)],
	];
	for (const [label, task] of tasks) {
		try {
			await task();
		} catch (err) {
			ctx.log.error(`Post-payment step failed: ${label}`, { orderId, error: String(err) });
		}
	}
}

async function incrementCouponUsage(ctx: PluginContext, codes: string[]): Promise<void> {
	const coupons = ctx.storage.coupons as StorageCollection<Coupon>;
	for (const code of codes) {
		const hit = await coupons.query({ where: { code }, limit: 1 });
		const item = hit.items[0];
		if (!item) continue;
		await coupons.updateIf(item.id, { where: {}, delta: { usageCount: { inc: 1 } } });
	}
}

async function updateCustomerStats(ctx: PluginContext, order: Order): Promise<void> {
	if (!order.customerId) return;
	const customers = ctx.storage.customers as StorageCollection<Customer>;
	await customers.updateIf(order.customerId, {
		where: {},
		set: { updatedAt: new Date().toISOString() },
		delta: { totalOrders: { inc: 1 }, totalSpent: { inc: order.total } },
	});
}

async function removeCart(ctx: PluginContext, cartId: string | null): Promise<void> {
	if (!cartId) return;
	await (ctx.storage.carts as StorageCollection<Cart>).delete(cartId);
}
