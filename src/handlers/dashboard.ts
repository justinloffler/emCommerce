/**
 * Dashboard stats and widget data handlers.
 */

import type { RouteContext, StorageCollection } from "emdash";
import type { Order, Product, Variant } from "../types.js";
import { getLowStockProducts } from "../engine/inventory.js";

export async function dashboardStatsHandler(ctx: RouteContext) {
	const ordersCol = ctx.storage.orders as StorageCollection<Order>;

	// Get recent orders for stats
	const recentOrders = await ordersCol.query({
		orderBy: { createdAt: "desc" },
		limit: 100,
	});

	const allOrders = recentOrders.items.map((i) => i.data);
	const completedOrders = allOrders.filter((o) => o.status === "completed" || o.status === "processing");

	const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);
	const totalOrders = completedOrders.length;
	const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

	// Pending orders count
	const pendingOrders = allOrders.filter((o) => o.status === "pending_payment" || o.status === "processing");

	return {
		totalRevenue,
		totalOrders,
		averageOrderValue,
		pendingOrderCount: pendingOrders.length,
	};
}

export async function recentOrdersHandler(ctx: RouteContext) {
	const ordersCol = ctx.storage.orders as StorageCollection<Order>;
	const result = await ordersCol.query({
		orderBy: { createdAt: "desc" },
		limit: 10,
	});

	return {
		items: result.items.map((i) => ({
			id: i.id,
			orderNumber: i.data.orderNumber,
			status: i.data.status,
			customerEmail: i.data.customerEmail,
			total: i.data.total,
			currencyCode: i.data.currencyCode,
			createdAt: i.data.createdAt,
		})),
	};
}

export async function lowStockHandler(ctx: RouteContext) {
	const items = await getLowStockProducts({
		products: ctx.storage.products as StorageCollection<Product>,
		variants: ctx.storage.variants as StorageCollection<Variant>,
	});
	return { items };
}
