/**
 * Order management route handlers.
 */

import type { RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";
import type { WhereClause } from "../types.js";
import { ulid } from "ulidx";
import { requireHttp } from "./context.js";

import type {
	OrderListInput, OrderGetInput, OrderUpdateStatusInput,
	OrderAddNoteInput, OrderRefundInput, OrderPublicGetInput,
} from "../schemas/orders.js";
import type { Order, Product, Variant } from "../types.js";
import { transitionOrder, getTransitionEffects } from "../engine/order-workflow.js";
import { releaseStock } from "../engine/inventory.js";
import { initGateways, getGateway } from "../payments/gateway-registry.js";

function orders(ctx: RouteContext): StorageCollection<Order> {
	return ctx.storage.orders as StorageCollection<Order>;
}

export async function orderListHandler(ctx: RouteContext<OrderListInput>) {
	const input = ctx.input;
	const where: WhereClause = {};
	if (input.status) where.status = input.status;
	if (input.customerId) where.customerId = input.customerId;
	if (input.customerEmail) where.customerEmail = input.customerEmail;

	const result = await orders(ctx).query({
		where: Object.keys(where).length > 0 ? where : undefined,
		orderBy: { createdAt: "desc" },
		limit: input.limit,
		cursor: input.cursor,
	});

	return {
		items: result.items.map((i) => ({ id: i.id, ...i.data })),
		hasMore: result.hasMore,
		cursor: result.cursor,
	};
}

export async function orderGetHandler(ctx: RouteContext<OrderGetInput>) {
	const order = await orders(ctx).get(ctx.input.id);
	if (!order) throw PluginRouteError.notFound("Order not found");
	return { id: ctx.input.id, ...order };
}

export async function orderUpdateStatusHandler(ctx: RouteContext<OrderUpdateStatusInput>) {
	const input = ctx.input;
	const order = await orders(ctx).get(input.id);
	if (!order) throw PluginRouteError.notFound("Order not found");

	try {
		const updates = transitionOrder(order, input.status, input.note);
		const updated = { ...order, ...updates };

		// Handle side effects
		const effects = getTransitionEffects(order.status, input.status);

		if (effects.releaseStock) {
			await releaseStock(
				order.items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
				{
					products: ctx.storage.products as StorageCollection<Product>,
					variants: ctx.storage.variants as StorageCollection<Variant>,
				},
			);
		}

		if (effects.sendEmail) {
			const emailEnabled = await ctx.kv.get<boolean>(`email:${effects.sendEmail}:enabled`);
			if (emailEnabled && ctx.email) {
				await ctx.email.send({
					to: order.customerEmail,
					subject: getEmailSubject(effects.sendEmail, order.orderNumber),
					text: getEmailBody(effects.sendEmail, order.orderNumber),
				});
			}
		}

		await orders(ctx).put(input.id, updated);
		return { id: input.id, ...updated };
	} catch (e) {
		if (e instanceof Error && e.name === "InvalidTransitionError") {
			throw PluginRouteError.badRequest(e.message);
		}
		throw e;
	}
}

export async function orderAddNoteHandler(ctx: RouteContext<OrderAddNoteInput>) {
	const order = await orders(ctx).get(ctx.input.id);
	if (!order) throw PluginRouteError.notFound("Order not found");

	const now = new Date().toISOString();
	order.adminNotes.push({
		id: ulid(),
		content: ctx.input.content,
		isSystem: false,
		createdAt: now,
	});
	order.updatedAt = now;

	await orders(ctx).put(ctx.input.id, order);
	return { id: ctx.input.id, ...order };
}

export async function orderRefundHandler(ctx: RouteContext<OrderRefundInput>) {
	const input = ctx.input;
	const order = await orders(ctx).get(input.id);
	if (!order) throw PluginRouteError.notFound("Order not found");

	if (!order.paymentIntentId) throw PluginRouteError.badRequest("No payment to refund");

	const totalRefunded = order.refunds.reduce((s, r) => s + r.amount, 0);
	if (totalRefunded + input.amount > order.total) {
		throw PluginRouteError.badRequest("Refund amount exceeds order total");
	}

	// Process refund through payment gateway
	initGateways({ http: requireHttp(ctx), kv: ctx.kv });
	const gateway = getGateway(order.paymentMethod);
	if (!gateway) throw PluginRouteError.badRequest("Payment gateway not found");

	const refundResult = await gateway.refundPayment(order.paymentIntentId, input.amount);

	const now = new Date().toISOString();
	order.refunds.push({
		id: ulid(),
		amount: input.amount,
		reason: input.reason ?? "",
		refundId: refundResult.refundId,
		createdAt: now,
	});

	const newTotalRefunded = totalRefunded + input.amount;
	order.paymentStatus = newTotalRefunded >= order.total ? "refunded" : "partial_refund";
	if (order.paymentStatus === "refunded") {
		order.status = "refunded";
	}
	order.updatedAt = now;
	order.adminNotes.push({
		id: ulid(),
		content: `Refund of ${input.amount} issued. Reason: ${input.reason || "None given"}`,
		isSystem: true,
		createdAt: now,
	});

	await orders(ctx).put(input.id, order);
	return { id: input.id, ...order };
}

/**
 * Public storefront route: returns a safe (non-sensitive) order summary.
 * Used by the order confirmation page after checkout.
 */
export async function orderPublicGetHandler(ctx: RouteContext<OrderPublicGetInput>) {
	const order = await orders(ctx).get(ctx.input.orderId);
	if (!order) throw PluginRouteError.notFound("Order not found");

	// Return only fields safe for public display — no payment intent, no admin notes
	return {
		orderNumber: order.orderNumber,
		status: order.status,
		items: order.items.map((item) => ({
			productId: item.productId,
			name: item.name,
			sku: item.sku,
			quantity: item.quantity,
			unitPrice: item.unitPrice,
			totalPrice: item.total,
		})),
		subtotal: order.subtotal,
		shippingTotal: order.shippingTotal,
		taxTotal: order.taxTotal,
		discountTotal: order.discountTotal,
		total: order.total,
		currencyCode: order.currencyCode,
		shippingMethodName: order.shippingMethod,
		createdAt: order.createdAt,
	};
}

// ─── Email Helpers ──────────────────────────────────────────────

function getEmailSubject(type: string, orderNumber: string): string {
	switch (type) {
		case "order_confirmation": return `Order ${orderNumber} confirmed`;
		case "shipping_notification": return `Order ${orderNumber} has been shipped`;
		case "refund_confirmation": return `Refund for order ${orderNumber}`;
		default: return `Update for order ${orderNumber}`;
	}
}

function getEmailBody(type: string, orderNumber: string): string {
	switch (type) {
		case "order_confirmation":
			return `Thank you for your order! Your order ${orderNumber} has been confirmed and is being processed.`;
		case "shipping_notification":
			return `Great news! Your order ${orderNumber} has been shipped.`;
		case "refund_confirmation":
			return `A refund has been issued for your order ${orderNumber}. Please allow a few business days for the refund to appear.`;
		default:
			return `There has been an update to your order ${orderNumber}.`;
	}
}
