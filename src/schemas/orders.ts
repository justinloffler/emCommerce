/**
 * Zod schemas for order management.
 */

import { z } from "astro/zod";

export const orderListSchema = z.object({
	status: z.enum(["pending_payment", "processing", "on_hold", "shipped", "completed", "cancelled", "refunded"]).optional(),
	customerId: z.string().optional(),
	customerEmail: z.string().email().optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const orderGetSchema = z.object({
	id: z.string().min(1),
});

export const orderUpdateStatusSchema = z.object({
	id: z.string().min(1),
	status: z.enum(["processing", "on_hold", "shipped", "completed", "cancelled", "refunded"]),
	note: z.string().max(500).optional(),
});

export const orderAddNoteSchema = z.object({
	id: z.string().min(1),
	content: z.string().min(1).max(1000),
});

export const orderRefundSchema = z.object({
	id: z.string().min(1),
	amount: z.number().int().min(1),
	reason: z.string().max(500).default(""),
});

export const orderPublicGetSchema = z.object({
	orderId: z.string().min(1),
});

export type OrderListInput = z.infer<typeof orderListSchema>;
export type OrderGetInput = z.infer<typeof orderGetSchema>;
export type OrderUpdateStatusInput = z.infer<typeof orderUpdateStatusSchema>;
export type OrderAddNoteInput = z.infer<typeof orderAddNoteSchema>;
export type OrderRefundInput = z.infer<typeof orderRefundSchema>;
export type OrderPublicGetInput = z.infer<typeof orderPublicGetSchema>;
