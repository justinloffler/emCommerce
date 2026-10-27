/**
 * Currency utilities.
 *
 * All monetary math uses integers (cents) to avoid floating-point errors.
 * Exchange rates are stored as basis points (10000 = 1:1).
 */

import type { Currency } from "../types.js";
import { BASIS_POINTS_100_PERCENT } from "../constants.js";

/**
 * Convert an amount from one currency to another using exchange rates.
 * Both rates are relative to the default currency (basis points: 10000 = 1:1).
 *
 * Uses cross-multiplication to avoid intermediate floating point:
 *   result = amount * toRate / fromRate
 */
export function convertCurrency(
	amount: number,
	fromRate: number,
	toRate: number,
): number {
	if (fromRate === toRate) return amount;
	// Use BigInt for precision in multiplication before division
	return Number((BigInt(amount) * BigInt(toRate)) / BigInt(fromRate));
}

/**
 * Apply a percentage reduction (in basis points) to an amount.
 * 10000 basis points = 100%.
 */
export function applyPercentageReduction(
	amount: number,
	basisPoints: number,
): number {
	return Number(
		(BigInt(amount) * BigInt(basisPoints)) / BigInt(BASIS_POINTS_100_PERCENT),
	);
}

/**
 * Apply a basis-point rate with half-up rounding (used for tax, where
 * flooring would systematically under-collect).
 */
export function applyRateRounded(amount: number, basisPoints: number): number {
	const scaled = BigInt(amount) * BigInt(basisPoints);
	const half = BigInt(BASIS_POINTS_100_PERCENT / 2);
	return Number((scaled + half) / BigInt(BASIS_POINTS_100_PERCENT));
}

/**
 * Split an integer `total` across `weights` proportionally, using the
 * largest-remainder method so the parts always sum exactly to `total`.
 * Weights must be non-negative; if they're all zero the total goes to index 0.
 */
export function allocateProportionally(total: number, weights: number[]): number[] {
	const parts = weights.map(() => 0);
	if (weights.length === 0 || total === 0) return parts;
	const sum = weights.reduce((a, b) => a + b, 0);
	if (sum <= 0) {
		parts[0] = total;
		return parts;
	}
	const remainders: Array<{ index: number; rem: number }> = [];
	let allocated = 0;
	weights.forEach((w, index) => {
		const exact = (total * w) / sum;
		const floor = Math.floor(exact);
		parts[index] = floor;
		allocated += floor;
		remainders.push({ index, rem: exact - floor });
	});
	remainders.sort((a, b) => b.rem - a.rem || a.index - b.index);
	for (let i = 0; allocated < total; i++, allocated++) {
		parts[remainders[i % remainders.length].index] += 1;
	}
	return parts;
}

/**
 * Calculate the percentage (in basis points) that `part` is of `whole`.
 */
export function percentageOf(part: number, whole: number): number {
	if (whole === 0) return 0;
	return Number(
		(BigInt(part) * BigInt(BASIS_POINTS_100_PERCENT)) / BigInt(whole),
	);
}

/**
 * Format a monetary amount for display.
 */
export function formatMoney(amount: number, currency: Currency): string {
	const { symbol, symbolPosition, decimalPlaces, thousandsSeparator, decimalSeparator } = currency;

	const isNegative = amount < 0;
	const abs = Math.abs(amount);

	let formatted: string;
	if (decimalPlaces === 0) {
		formatted = formatWithSeparator(abs, thousandsSeparator);
	} else {
		const divisor = Math.pow(10, decimalPlaces);
		const whole = Math.floor(abs / divisor);
		const fraction = abs % divisor;
		const fractionStr = String(fraction).padStart(decimalPlaces, "0");
		formatted = `${formatWithSeparator(whole, thousandsSeparator)}${decimalSeparator}${fractionStr}`;
	}

	const sign = isNegative ? "-" : "";
	return symbolPosition === "before"
		? `${sign}${symbol}${formatted}`
		: `${sign}${formatted} ${symbol}`;
}

function formatWithSeparator(value: number, separator: string): string {
	const str = String(value);
	if (str.length <= 3) return str;

	const parts: string[] = [];
	for (let i = str.length; i > 0; i -= 3) {
		parts.unshift(str.slice(Math.max(0, i - 3), i));
	}
	return parts.join(separator);
}
