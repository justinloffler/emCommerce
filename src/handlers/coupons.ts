/**
 * Coupon CRUD route handlers.
 */

import type { RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";
import { ulid } from "ulidx";

import type {
	CouponCreateInput, CouponUpdateInput, CouponDeleteInput,
	CouponListInput, CouponGetInput,
} from "../schemas/coupons.js";
import type { Coupon } from "../types.js";

function coupons(ctx: RouteContext): StorageCollection<Coupon> {
	return ctx.storage.coupons as StorageCollection<Coupon>;
}

export async function couponListHandler(ctx: RouteContext<CouponListInput>) {
	const input = ctx.input;
	const where: Record<string, unknown> = {};
	if (input.enabled !== undefined) where.enabled = input.enabled;

	const result = await coupons(ctx).query({
		where: Object.keys(where).length > 0 ? where : undefined,
		orderBy: { createdAt: "desc" },
		limit: input.limit, cursor: input.cursor,
	});
	return { items: result.items.map((i) => ({ id: i.id, ...i.data })), hasMore: result.hasMore, cursor: result.cursor };
}

export async function couponGetHandler(ctx: RouteContext<CouponGetInput>) {
	const coupon = await coupons(ctx).get(ctx.input.id);
	if (!coupon) throw PluginRouteError.notFound("Coupon not found");
	return { id: ctx.input.id, ...coupon };
}

export async function couponCreateHandler(ctx: RouteContext<CouponCreateInput>) {
	const input = ctx.input;
	const code = input.code.toUpperCase();

	const existing = await coupons(ctx).query({ where: { code }, limit: 1 });
	if (existing.items.length > 0) throw PluginRouteError.conflict(`Coupon "${code}" already exists`);

	const now = new Date().toISOString();
	const id = ulid();
	const coupon: Coupon = {
		code, description: input.description ?? "", type: input.type, value: input.value,
		minimumAmount: input.minimumAmount ?? null, maximumDiscount: input.maximumDiscount ?? null,
		usageLimit: input.usageLimit ?? null, usageLimitPerCustomer: input.usageLimitPerCustomer ?? null,
		usageCount: 0,
		productIds: input.productIds ?? null, categoryIds: input.categoryIds ?? null,
		customerGroupIds: input.customerGroupIds ?? null,
		allowStacking: input.allowStacking ?? true,
		enabled: input.enabled ?? true,
		startDate: input.startDate ?? null, endDate: input.endDate ?? null,
		createdAt: now, updatedAt: now,
	};
	await coupons(ctx).put(id, coupon);
	return { id, ...coupon };
}

export async function couponUpdateHandler(ctx: RouteContext<CouponUpdateInput>) {
	const input = ctx.input;
	const existing = await coupons(ctx).get(input.id);
	if (!existing) throw PluginRouteError.notFound("Coupon not found");

	if (input.code) {
		const code = input.code.toUpperCase();
		if (code !== existing.code) {
			const check = await coupons(ctx).query({ where: { code }, limit: 1 });
			if (check.items.length > 0) throw PluginRouteError.conflict(`Coupon "${code}" already exists`);
		}
	}

	const updated: Coupon = {
		...existing,
		code: input.code ? input.code.toUpperCase() : existing.code,
		description: input.description ?? existing.description,
		type: input.type ?? existing.type,
		value: input.value ?? existing.value,
		minimumAmount: input.minimumAmount !== undefined ? input.minimumAmount : existing.minimumAmount,
		maximumDiscount: input.maximumDiscount !== undefined ? input.maximumDiscount : existing.maximumDiscount,
		usageLimit: input.usageLimit !== undefined ? input.usageLimit : existing.usageLimit,
		usageLimitPerCustomer: input.usageLimitPerCustomer !== undefined ? input.usageLimitPerCustomer : existing.usageLimitPerCustomer,
		productIds: input.productIds !== undefined ? input.productIds : existing.productIds,
		categoryIds: input.categoryIds !== undefined ? input.categoryIds : existing.categoryIds,
		customerGroupIds: input.customerGroupIds !== undefined ? input.customerGroupIds : existing.customerGroupIds,
		allowStacking: input.allowStacking ?? existing.allowStacking,
		enabled: input.enabled ?? existing.enabled,
		startDate: input.startDate !== undefined ? input.startDate : existing.startDate,
		endDate: input.endDate !== undefined ? input.endDate : existing.endDate,
		updatedAt: new Date().toISOString(),
	};
	await coupons(ctx).put(input.id, updated);
	return { id: input.id, ...updated };
}

export async function couponDeleteHandler(ctx: RouteContext<CouponDeleteInput>) {
	const existing = await coupons(ctx).get(ctx.input.id);
	if (!existing) throw PluginRouteError.notFound("Coupon not found");
	await coupons(ctx).delete(ctx.input.id);
	return { deleted: true };
}
