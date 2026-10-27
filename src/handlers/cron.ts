/**
 * Cron job handlers for scheduled tasks.
 *
 * - cart-cleanup: Remove expired carts
 * - exchange-rate-sync: Fetch exchange rates from API
 * - low-stock-check: Send alerts for low stock products
 * - pending-order-cleanup: Resolve orders left awaiting payment
 */

import type { StorageCollection } from "emdash";
import type { PluginContext } from "emdash";
import type { Cart, Currency, Order, Product, Variant } from "../types.js";
import { getLowStockProducts } from "../engine/inventory.js";
import { getGateway, initGateways } from "../payments/gateway-registry.js";
import { cancelUnpaidOrder, markOrderPaid } from "./order-payment.js";

/** Orders still awaiting payment after this many hours are resolved by cron. */
export const DEFAULT_PENDING_ORDER_TIMEOUT_HOURS = 24;

/**
 * Resolve orders stuck in pending_payment (abandoned checkouts, or payments
 * whose confirmation was missed). Each one is checked with its payment
 * provider first: paid orders are marked paid, everything else is cancelled
 * and its reserved stock released.
 */
export async function handlePendingOrderCleanup(ctx: PluginContext): Promise<{ paid: number; cancelled: number }> {
	const orders = ctx.storage.orders as StorageCollection<Order>;
	const hours = (await ctx.kv.get<number>("settings:pendingOrderTimeoutHours")) ?? DEFAULT_PENDING_ORDER_TIMEOUT_HOURS;
	const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();
	if (ctx.http) initGateways({ http: ctx.http, kv: ctx.kv });

	let paid = 0;
	let cancelled = 0;
	let cursor: string | undefined;
	const stale: Array<{ id: string; data: Order }> = [];
	do {
		const batch = await orders.query({
			where: { status: "pending_payment", createdAt: { lt: cutoff } },
			orderBy: { createdAt: "asc" },
			limit: 100,
			cursor,
		});
		stale.push(...batch.items);
		cursor = batch.hasMore ? batch.cursor : undefined;
	} while (cursor && stale.length < 1000);

	for (const { id, data } of stale) {
		try {
			const gateway = ctx.http && data.paymentIntentId ? getGateway(data.paymentMethod) : undefined;
			if (gateway && data.paymentIntentId) {
				const verification = await gateway.finalizePayment(data.paymentIntentId);
				if (verification.status === "succeeded") {
					const res = await markOrderPaid(ctx, id, {
						source: "webhook",
						amount: verification.amount,
						currency: verification.currency,
						captureId: verification.captureId,
					});
					if (res.outcome === "paid") paid++;
					continue;
				}
				if (verification.status === "pending" && verification.amount !== null) {
					// Payment is genuinely in flight (e.g. bank transfer) — leave it
					continue;
				}
			}
			if (await cancelUnpaidOrder(ctx, id, `No payment received within ${hours} hours`)) cancelled++;
		} catch (err) {
			ctx.log.error("Pending order cleanup failed for order", { orderId: id, error: String(err) });
		}
	}

	if (paid || cancelled) ctx.log.info(`Pending order cleanup: ${paid} paid, ${cancelled} cancelled`);
	return { paid, cancelled };
}

/**
 * Remove carts that have passed their expiration date.
 */
export async function handleCartCleanup(ctx: PluginContext): Promise<void> {
	const carts = ctx.storage.carts as StorageCollection<Cart>;
	const now = new Date().toISOString();

	let deleted = 0;
	// Deleting while paging would skip rows, so re-read the first page each time
	for (let round = 0; round < 1000; round++) {
		const batch = await carts.query({
			where: { expiresAt: { lt: now } },
			limit: 100,
		});
		const ids = batch.items.map((item) => item.id);
		if (ids.length === 0) break;
		deleted += await carts.deleteMany(ids);
		if (!batch.hasMore) break;
	}

	ctx.log.info(`Cart cleanup: removed ${deleted} expired carts`);
}

/**
 * Sync exchange rates from an external API.
 */
export async function handleExchangeRateSync(ctx: PluginContext): Promise<void> {
	const currencies = ctx.storage.currencies as StorageCollection<Currency>;
	const defaultCurrency = (await ctx.kv.get<string>("settings:defaultCurrency")) ?? "USD";

	// Get all enabled non-default currencies
	// SQLite can't bind booleans — query all, filter in-memory
	const result = await currencies.query({ limit: 100 });
	const toUpdate = result.items.filter((i) => i.data.enabled && !i.data.isDefault);
	if (toUpdate.length === 0) return;

	const codes = toUpdate.map((i) => i.data.code).join(",");

	try {
		if (!ctx.http) {
			ctx.log.warn("Exchange rate sync skipped: outbound HTTP unavailable");
			return;
		}
		const res = await ctx.http.fetch(
			`https://api.exchangerate.host/latest?base=${defaultCurrency}&symbols=${codes}`,
		);
		if (!res.ok) {
			ctx.log.error(`Exchange rate API error: ${res.status}`);
			return;
		}

		const data = (await res.json()) as { rates?: Record<string, number> };
		if (!data.rates) return;

		const now = new Date().toISOString();
		for (const item of toUpdate) {
			const rate = data.rates[item.data.code];
			if (rate !== undefined) {
				// Convert decimal rate to basis points (e.g. 0.85 EUR/USD = 8500)
				const basisPoints = Math.round(rate * 10000);
				item.data.exchangeRate = basisPoints;
				item.data.updatedAt = now;
				await currencies.put(item.id, item.data);
			}
		}

		ctx.log.info(`Exchange rates updated for ${toUpdate.length} currencies`);
	} catch (e) {
		ctx.log.error(`Exchange rate sync failed: ${e}`);
	}
}

/**
 * Check for low stock products and send alert emails.
 */
export async function handleLowStockCheck(ctx: PluginContext): Promise<void> {
	const emailEnabled = await ctx.kv.get<boolean>("email:low_stock_alert:enabled");
	if (!emailEnabled) return;

	const lowStock = await getLowStockProducts({
		products: ctx.storage.products as StorageCollection<Product>,
		variants: ctx.storage.variants as StorageCollection<Variant>,
	});

	if (lowStock.length === 0) return;

	// Build alert summary
	const lines = lowStock.map(
		(p) => `- ${p.name} (SKU: ${p.sku ?? "N/A"}): ${p.stockQuantity} remaining (threshold: ${p.lowStockThreshold})`,
	);

	const alertsEnabled = (await ctx.kv.get<boolean>("email:low_stock_alert:enabled")) ?? true;
	const storeEmail = await ctx.kv.get<string>("settings:storeEmail");
	if (ctx.email && alertsEnabled && storeEmail) {
		const storeName = (await ctx.kv.get<string>("settings:storeName")) ?? "Your Store";
		await ctx.email.send({
			to: storeEmail,
			subject: `[${storeName}] Low stock alert: ${lowStock.length} products`,
			text: `The following products are at or below their low stock threshold:\n\n${lines.join("\n")}`,
		});
	}

	ctx.log.info(`Low stock alert: ${lowStock.length} products below threshold`);
}
