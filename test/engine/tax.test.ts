import { describe, expect, it } from "vitest";

import { allocateProportionally, applyRateRounded } from "../../src/engine/currency.js";
import {
	computeTax,
	extractInclusiveTax,
	matchPostalCode,
	selectMostSpecificRules,
} from "../../src/engine/tax-engine.js";
import type { TaxRule } from "../../src/types.js";

function rule(partial: Partial<TaxRule>): TaxRule {
	return {
		taxClassId: "std",
		countryCode: "AU",
		stateCode: null,
		postalCodePattern: null,
		rate: 1000,
		name: "GST",
		compound: false,
		priority: 0,
		createdAt: "2026-01-01T00:00:00.000Z",
		...partial,
	};
}

describe("allocateProportionally", () => {
	it("always sums exactly to the total", () => {
		const parts = allocateProportionally(100, [1, 1, 1]);
		expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
		expect(parts).toEqual([34, 33, 33]);
	});

	it("is proportional to weights", () => {
		expect(allocateProportionally(1000, [3000, 1000])).toEqual([750, 250]);
	});

	it("puts everything on the first slot when all weights are zero", () => {
		expect(allocateProportionally(5, [0, 0])).toEqual([5, 0]);
	});
});

describe("applyRateRounded", () => {
	it("rounds half up instead of flooring", () => {
		// 10% of 1995 = 199.5 → 200 (flooring would give 199)
		expect(applyRateRounded(1995, 1000)).toBe(200);
		expect(applyRateRounded(1994, 1000)).toBe(199);
	});
});

describe("computeTax", () => {
	it("applies non-compound rates to the base amount", () => {
		const result = computeTax(10000, [rule({ rate: 1000 })]);
		expect(result).toEqual({ total: 1000, lines: [{ name: "GST", rate: 1000, amount: 1000 }] });
	});

	it("applies compound rates on top of earlier taxes", () => {
		// Quebec-style: GST 5%, QST 9.975% compound for illustration
		const result = computeTax(10000, [
			rule({ name: "GST", rate: 500 }),
			rule({ name: "QST", rate: 998, compound: true, priority: 1 }),
		]);
		expect(result.lines).toEqual([
			{ name: "GST", rate: 500, amount: 500 },
			{ name: "QST", rate: 998, amount: 1048 }, // 9.98% of 10500
		]);
		expect(result.total).toBe(1548);
	});

	it("returns nothing when there are no rules", () => {
		expect(computeTax(5000, [])).toEqual({ total: 0, lines: [] });
	});
});

describe("extractInclusiveTax", () => {
	it("extracts 10% GST from a GST-inclusive price", () => {
		const result = extractInclusiveTax(11000, [rule({ rate: 1000 })]);
		expect(result.net).toBe(10000);
		expect(result.total).toBe(1000);
	});

	it("net + tax always equals the gross amount", () => {
		for (const gross of [1, 99, 1999, 4567, 12345, 99999]) {
			const result = extractInclusiveTax(gross, [
				rule({ name: "A", rate: 700 }),
				rule({ name: "B", rate: 300, compound: true, priority: 1 }),
			]);
			expect(result.net + result.total).toBe(gross);
			expect(result.lines.reduce((s, l) => s + l.amount, 0)).toBe(result.total);
		}
	});
});

describe("selectMostSpecificRules", () => {
	const rules = [
		rule({ name: "Country", rate: 500 }),
		rule({ name: "State", stateCode: "NSW", rate: 600 }),
		rule({ name: "Postcode", stateCode: "NSW", postalCodePattern: "2000-2099", rate: 700 }),
	];

	it("prefers state + postcode, then state, then country", () => {
		const ctx = { taxClassId: "std", countryCode: "AU" };
		expect(selectMostSpecificRules(rules, { ...ctx, stateCode: "NSW", postalCode: "2010" })[0].name).toBe("Postcode");
		expect(selectMostSpecificRules(rules, { ...ctx, stateCode: "nsw", postalCode: "2500" })[0].name).toBe("State");
		expect(selectMostSpecificRules(rules, { ...ctx, stateCode: "VIC", postalCode: "3000" })[0].name).toBe("Country");
	});
});

describe("matchPostalCode", () => {
	it("supports exact, wildcard and numeric ranges", () => {
		expect(matchPostalCode("5081", "5081")).toBe(true);
		expect(matchPostalCode("5081", "50*")).toBe(true);
		expect(matchPostalCode("5081", "5000-5199")).toBe(true);
		expect(matchPostalCode("999", "1000-1999")).toBe(false); // numeric, not lexical
		expect(matchPostalCode("sw1a 1aa", "SW1A*")).toBe(true);
	});
});
