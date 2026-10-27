/**
 * Cron job handlers for scheduled tasks.
 *
 * - cart-cleanup: Remove expired carts
 * - exchange-rate-sync: Fetch exchange rates from API
 * - low-stock-check: Send alerts for low stock products
 */

import type { StorageCollection } from "emdash";
import type { PluginContext } from "emdash";
import type { Cart, Currency, Product, Variant } from "../types.js";
import { getLowStockProducts } from "../engine/inventory.js";

/**
 * Remove carts that have passed their expiration date.
 */
export async function handleCartCleanup(ctx: PluginContext): Promise<void> {
	const carts = ctx.storage.carts as StorageCollection<Cart>;
	const now = new Date().toISOString();

	let cursor: string | undefined;
	let deleted = 0;
	do {
		const batch = await carts.query({
			where: { expiresAt: { lt: now } },
			limit: 100,
			cursor,
		});
		const ids = batch.items.map((item) => item.id);
		if (ids.length > 0) {
			await carts.deleteMany(ids);
			deleted += ids.length;
		}
		cursor = batch.cursor;
	} while (cursor);

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
