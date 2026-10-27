/**
 * Transactional order emails.
 *
 * Sent through emdash's `ctx.email` (requires the `email:send` capability and
 * an email transport plugin). Each type can be toggled in Settings → Emails
 * and given a custom subject/body. Bodies support {orderNumber}, {storeName}
 * and {total} placeholders.
 */

import type { PluginContext } from "emdash";

import type { Order } from "./types.js";
import { minorToDecimalString } from "./payments/types.js";

export type OrderEmailType = "order_confirmation" | "shipping_notification" | "refund_confirmation";

const DEFAULT_SUBJECTS: Record<OrderEmailType, string> = {
	order_confirmation: "Order {orderNumber} confirmed",
	shipping_notification: "Order {orderNumber} has been shipped",
	refund_confirmation: "Refund for order {orderNumber}",
};

const DEFAULT_BODIES: Record<OrderEmailType, string> = {
	order_confirmation:
		"Thank you for your order! Your order {orderNumber} ({total}) has been confirmed and is being processed.",
	shipping_notification: "Great news! Your order {orderNumber} has been shipped.",
	refund_confirmation:
		"A refund has been issued for your order {orderNumber}. Please allow a few business days for it to appear.",
};

function fill(template: string, vars: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);
}

/**
 * Send an order email if that email type is enabled and a transport exists.
 * Never throws — email failures are logged so they can't break checkout.
 */
export async function sendOrderEmail(ctx: PluginContext, type: OrderEmailType, order: Order): Promise<boolean> {
	try {
		const enabled = (await ctx.kv.get<boolean>(`email:${type}:enabled`)) ?? true;
		if (!enabled || !ctx.email) return false;

		const [storeName, subjectTpl, bodyTpl] = await Promise.all([
			ctx.kv.get<string>("settings:storeName"),
			ctx.kv.get<string>(`email:${type}:subject`),
			ctx.kv.get<string>(`email:${type}:body`),
		]);
		const vars = {
			orderNumber: order.orderNumber,
			storeName: storeName || "our store",
			total: `${order.currencyCode} ${minorToDecimalString(order.total, order.currencyCode)}`,
		};
		await ctx.email.send({
			to: order.customerEmail,
			subject: fill(subjectTpl || DEFAULT_SUBJECTS[type], vars),
			text: fill(bodyTpl || DEFAULT_BODIES[type], vars),
		});
		return true;
	} catch (err) {
		ctx.log.error("Failed to send order email", { type, orderNumber: order.orderNumber, error: String(err) });
		return false;
	}
}
