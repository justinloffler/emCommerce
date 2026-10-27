import { describe, expect, it } from "vitest";

import type { CartSummary } from "../../src/engine/cart-engine.js";
import { calculateCheckoutTotals, type TotalsOptions } from "../../src/engine/checkout-totals.js";
import type { TaxRule } from "../../src/types.js";

function item(lineTotal: number, taxClassId = "", quantity = 1) {
	return {
		productId: `p-${lineTotal}`,
		variantId: null,
		name: "Item",
		sku: null,
		quantity,
		unitPrice: lineTotal / quantity,
		originalPrice: lineTotal / quantity,
		lineTotal,
		attributes: {},
		imageId: null,
		taxClassId,
		weight: 0,
	};
}

function summary(items: ReturnType<typeof item>[], discountTotal = 0): CartSummary {
	const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
	return {
		items,
		subtotal,
		discountTotal,
		discountBreakdown: [],
		shippingTotal: 0,
		taxTotal: 0,
		total: subtotal - discountTotal,
		itemCount: items.length,
		currencyCode: "AUD",
		freeShipping: false,
		totalWeight: 0,
	};
}

const rules: Record<string, TaxRule[]> = {
	std: [
		{
			taxClassId: "std",
			countryCode: "AU",
			stateCode: null,
			postalCodePattern: null,
			rate: 1000,
			name: "GST",
			compound: false,
			priority: 0,
			createdAt: "",
		},
	],
	zero: [],
	reduced: [
		{
			taxClassId: "reduced",
			countryCode: "AU",
			stateCode: null,
			postalCodePattern: null,
			rate: 500,
			name: "Reduced",
			compound: false,
			priority: 0,
			createdAt: "",
		},
	],
};

function opts(overrides: Partial<TotalsOptions> = {}): TotalsOptions {
	return {
		taxAddress: { countryCode: "AU", stateCode: "SA", postalCode: "5081" },
		shippingCost: 0,
		taxInclusive: false,
		taxShipping: false,
		defaultTaxClassId: "std",
		taxClassIds: new Set(["std", "zero", "reduced"]),
		loadRules: async (classId) => rules[classId] ?? [],
		...overrides,
	};
}

describe("calculateCheckoutTotals", () => {
	it("adds tax on top with exclusive pricing", async () => {
		const t = await calculateCheckoutTotals(summary([item(10000)]), opts({ shippingCost: 1000 }));
		expect(t.taxTotal).toBe(1000);
		expect(t.total).toBe(10000 + 1000 + 1000);
	});

	it("extracts tax and keeps the total with inclusive (GST) pricing", async () => {
		const t = await calculateCheckoutTotals(
			summary([item(11000)]),
			opts({ taxInclusive: true, taxShipping: true, shippingCost: 1100 }),
		);
		expect(t.taxTotal).toBe(1000 + 100);
		expect(t.shippingTax).toBe(100);
		expect(t.total).toBe(12100);
		expect(t.taxLines).toEqual([{ name: "GST", rate: 1000, amount: 1100 }]);
	});

	it("taxes each line with its own tax class", async () => {
		const t = await calculateCheckoutTotals(
			summary([item(10000, "std"), item(10000, "zero"), item(10000, "reduced")]),
			opts(),
		);
		expect(t.itemTax).toEqual([1000, 0, 500]);
		expect(t.taxTotal).toBe(1500);
		expect(t.taxLines.map((l) => l.name).sort()).toEqual(["GST", "Reduced"]);
	});

	it("falls back to the default class for unknown or empty classes", async () => {
		const t = await calculateCheckoutTotals(summary([item(10000, "deleted-class"), item(5000, "")]), opts());
		expect(t.itemTaxClassIds).toEqual(["std", "std"]);
		expect(t.taxTotal).toBe(1500);
	});

	it("taxes the discounted amount, spreading cart discounts across lines", async () => {
		const t = await calculateCheckoutTotals(summary([item(15000, "std"), item(5000, "zero")], 4000), opts());
		// 4000 discount split 3000 / 1000 → taxable std base = 12000
		expect(t.itemTax).toEqual([1200, 0]);
		expect(t.total).toBe(20000 - 4000 + 1200);
	});

	it("doesn't tax shipping unless enabled", async () => {
		const t = await calculateCheckoutTotals(summary([item(10000)]), opts({ shippingCost: 1000 }));
		expect(t.shippingTax).toBe(0);
	});

	it("charges no tax without an address", async () => {
		const t = await calculateCheckoutTotals(summary([item(10000)]), opts({ taxAddress: null }));
		expect(t.taxTotal).toBe(0);
		expect(t.total).toBe(10000);
	});
});
