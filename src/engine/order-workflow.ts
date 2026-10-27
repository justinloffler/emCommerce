/**
 * Order status state machine.
 *
 * Enforces valid transitions, records system notes, and triggers
 * side effects (stock adjustments, email notifications).
 */

import type { Order, AdminNote } from "../types.js";
import { ORDER_TRANSITIONS, type OrderStatus } from "../constants.js";
import { ulid } from "ulidx";

/** Error thrown when a status transition is not allowed. */
export class InvalidTransitionError extends Error {
	constructor(from: OrderStatus, to: OrderStatus) {
		super(`Cannot transition order from "${from}" to "${to}"`);
		this.name = "InvalidTransitionError";
	}
}

/**
 * Validate and apply a status transition to an order.
 * Returns the updated order fields (does NOT persist — caller is responsible).
 */
export function transitionOrder(
	order: Order,
	newStatus: OrderStatus,
	note?: string,
): Pick<Order, "status" | "adminNotes" | "updatedAt" | "completedAt"> {
	const allowed = ORDER_TRANSITIONS[order.status];
	if (!allowed.includes(newStatus)) {
		throw new InvalidTransitionError(order.status, newStatus);
	}

	const now = new Date().toISOString();
	const systemNote: AdminNote = {
		id: ulid(),
		content: note ?? `Status changed from ${order.status} to ${newStatus}`,
		isSystem: true,
		createdAt: now,
	};

	return {
		status: newStatus,
		adminNotes: [...order.adminNotes, systemNote],
		updatedAt: now,
		completedAt: newStatus === "completed" ? now : order.completedAt,
	};
}

/**
 * Determine what side effects a transition requires.
 */
export interface TransitionEffects {
	releaseStock: boolean;
	commitStock: boolean;
	sendEmail: OrderEmailType | null;
}

export type OrderEmailType =
	| "order_confirmation"
	| "shipping_notification"
	| "refund_confirmation";

export function getTransitionEffects(
	from: OrderStatus,
	to: OrderStatus,
): TransitionEffects {
	const effects: TransitionEffects = {
		releaseStock: false,
		commitStock: false,
		sendEmail: null,
	};

	if (to === "processing" && from === "pending_payment") {
		effects.commitStock = true;
		effects.sendEmail = "order_confirmation";
	}

	if (to === "shipped") {
		effects.sendEmail = "shipping_notification";
	}

	if (to === "cancelled") {
		effects.releaseStock = true;
	}

	if (to === "refunded") {
		effects.releaseStock = true;
		effects.sendEmail = "refund_confirmation";
	}

	return effects;
}

/**
 * Check if an order is in a terminal state (no further transitions possible).
 */
export function isTerminalStatus(status: OrderStatus): boolean {
	return ORDER_TRANSITIONS[status].length === 0;
}

/**
 * Get all valid next statuses for an order.
 */
export function getNextStatuses(status: OrderStatus): readonly OrderStatus[] {
	return ORDER_TRANSITIONS[status];
}
