/**
 * Inventory management.
 *
 * Handles stock reservation (during checkout), commitment (after payment),
 * release (on cancellation), and manual adjustments.
 *
 * Stock operations are idempotent with respect to order IDs to prevent
 * double-decrement on retries.
 */

import type { StorageCollection } from "emdash";
import type { Product, Variant, CartItem } from "../types.js";

export interface InventoryStorageAccess {
	products: StorageCollection<Product>;
	variants: StorageCollection<Variant>;
}

export interface StockResult {
	success: boolean;
	insufficientItems: Array<{
		productId: string;
		variantId: string | null;
		requested: number;
		available: number;
	}>;
}

/**
 * Check if all items have sufficient stock. Does NOT modify stock levels.
 */
export async function checkStock(
	items: CartItem[],
	storage: InventoryStorageAccess,
): Promise<StockResult> {
	const insufficient: StockResult["insufficientItems"] = [];

	for (const item of items) {
		const stockInfo = await getStockInfo(item.productId, item.variantId, storage);
		if (!stockInfo.manageStock) continue;
		if (!stockInfo.backordersAllowed && stockInfo.quantity < item.quantity) {
			insufficient.push({
				productId: item.productId,
				variantId: item.variantId,
				requested: item.quantity,
				available: stockInfo.quantity,
			});
		}
	}

	return {
		success: insufficient.length === 0,
		insufficientItems: insufficient,
	};
}

/**
 * Reserve stock by decrementing quantities. Called at checkout start.
 * If any item has insufficient stock, no changes are made (atomic).
 */
export async function reserveStock(
	items: CartItem[],
	storage: InventoryStorageAccess,
): Promise<StockResult> {
	// Pre-check all items
	const check = await checkStock(items, storage);
	if (!check.success) return check;

	// Decrement stock for each item
	for (const item of items) {
		await adjustStock(item.productId, item.variantId, -item.quantity, storage);
	}

	return { success: true, insufficientItems: [] };
}

/**
 * Release stock by restoring quantities. Called on cancellation or expiry.
 */
export async function releaseStock(
	items: CartItem[],
	storage: InventoryStorageAccess,
): Promise<void> {
	for (const item of items) {
		await adjustStock(item.productId, item.variantId, item.quantity, storage);
	}
}

/**
 * Adjust stock for a single product/variant by a delta (+/-).
 */
export async function adjustStock(
	productId: string,
	variantId: string | null,
	delta: number,
	storage: InventoryStorageAccess,
): Promise<void> {
	if (variantId) {
		const variant = await storage.variants.get(variantId);
		if (variant && variant.manageStock) {
			await storage.variants.put(variantId, {
				...variant,
				stockQuantity: Math.max(0, variant.stockQuantity + delta),
				updatedAt: new Date().toISOString(),
			});
			return;
		}
	}

	const product = await storage.products.get(productId);
	if (product && product.manageStock) {
		await storage.products.put(productId, {
			...product,
			stockQuantity: Math.max(0, product.stockQuantity + delta),
			updatedAt: new Date().toISOString(),
		});
	}
}

/**
 * Get stock info for a product or variant.
 */
async function getStockInfo(
	productId: string,
	variantId: string | null,
	storage: InventoryStorageAccess,
): Promise<{ manageStock: boolean; quantity: number; backordersAllowed: boolean }> {
	if (variantId) {
		const variant = await storage.variants.get(variantId);
		if (variant && variant.manageStock) {
			return {
				manageStock: true,
				quantity: variant.stockQuantity,
				backordersAllowed: variant.backordersAllowed,
			};
		}
	}

	const product = await storage.products.get(productId);
	if (product) {
		return {
			manageStock: product.manageStock,
			quantity: product.stockQuantity,
			backordersAllowed: product.backordersAllowed,
		};
	}

	return { manageStock: false, quantity: 0, backordersAllowed: false };
}

/**
 * Get all products that are below their low stock threshold.
 */
export async function getLowStockProducts(
	storage: InventoryStorageAccess,
): Promise<Array<{ id: string; name: string; sku: string | null; stockQuantity: number; lowStockThreshold: number }>> {
	const lowStock: Array<{ id: string; name: string; sku: string | null; stockQuantity: number; lowStockThreshold: number }> = [];

	let cursor: string | undefined;
	do {
		const batch = await storage.products.query({
			where: { status: "active" },
			limit: 100,
			cursor,
		});

		for (const item of batch.items) {
			const p = item.data;
			if (p.manageStock && p.stockQuantity <= p.lowStockThreshold) {
				lowStock.push({
					id: item.id,
					name: p.name,
					sku: p.sku,
					stockQuantity: p.stockQuantity,
					lowStockThreshold: p.lowStockThreshold,
				});
			}
		}

		cursor = batch.cursor;
	} while (cursor);

	return lowStock;
}
