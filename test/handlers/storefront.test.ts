import { beforeEach, describe, expect, it } from "vitest";

import {
	storefrontConfigHandler,
	storefrontProductGetHandler,
	storefrontProductListHandler,
} from "../../src/handlers/storefront.js";
import { product, seedStore } from "../helpers/fixtures.js";
import { createMockContext } from "../helpers/mock-context.js";

type Mock = ReturnType<typeof createMockContext>;

const listInput = { sortBy: "createdAt", sortDir: "desc", limit: 24 };

describe("storefront products", () => {
	let m: Mock;
	beforeEach(async () => {
		m = createMockContext();
		await seedStore(m);
		await m.storage.products.put("prod-draft", product({ name: "Draft", slug: "draft", status: "draft" }));
		await m.storage.products.put("prod-archived", product({ name: "Old", slug: "old", status: "archived" }));
	});

	it("lists only active products", async () => {
		const res = await storefrontProductListHandler(m.withInput(listInput));
		expect(res.items.map((p) => p.slug)).toEqual(["coffee-mug"]);
		expect(res.currency.code).toBe("AUD");
	});

	it("never exposes internal product fields", async () => {
		const res = await storefrontProductListHandler(m.withInput(listInput));
		const detail = await storefrontProductGetHandler(m.withInput({ slug: "coffee-mug" }));
		for (const obj of [res.items[0], detail.product]) {
			const json = JSON.stringify(obj);
			expect(json).not.toContain("costPrice");
			expect(json).not.toContain("secret.pdf");
			expect(json).not.toContain("INTERNAL-42");
			expect(json).not.toContain("stockQuantity");
		}
		expect(detail.product.price).toBe(2200);
		expect(detail.product.images).toEqual([{ url: "https://cdn.example.com/mug.jpg", alt: "Coffee Mug" }]);
	});

	it("hides draft and archived products from direct lookups", async () => {
		await expect(storefrontProductGetHandler(m.withInput({ slug: "draft" }))).rejects.toThrow(/not found/i);
		await expect(storefrontProductGetHandler(m.withInput({ id: "prod-archived" }))).rejects.toThrow(/not found/i);
	});

	it("shows the compare-at price as the original price", async () => {
		await m.storage.products.put("prod-mug", product({ compareAtPrice: 3000 }));
		const res = await storefrontProductListHandler(m.withInput(listInput));
		expect(res.items[0]).toMatchObject({ price: 2200, originalPrice: 3000 });
	});

	it("paginates with a cursor", async () => {
		for (let i = 0; i < 5; i++) {
			await m.storage.products.put(`p${i}`, product({ name: `P${i}`, slug: `p-${i}`, sku: `SKU-${i}` }));
		}
		const first = await storefrontProductListHandler(m.withInput({ ...listInput, limit: 4, sortBy: "name", sortDir: "asc" }));
		expect(first.items).toHaveLength(4);
		expect(first.hasMore).toBe(true);
		const second = await storefrontProductListHandler(
			m.withInput({ ...listInput, limit: 4, sortBy: "name", sortDir: "asc", cursor: first.cursor }),
		);
		expect(second.items).toHaveLength(2);
		expect(second.hasMore).toBe(false);
	});
});

describe("storefront config", () => {
	it("exposes publishable keys only, and only enables gateways that are fully configured", async () => {
		const m = createMockContext();
		await seedStore(m);
		await m.kv.set("settings:paypalClientId", "pp-client");
		const config = await storefrontConfigHandler(m.withInput({}));
		expect(config.payments.stripe).toEqual({ enabled: true, publishableKey: "pk_test_123" });
		expect(config.payments.paypal.enabled).toBe(false); // no client secret yet
		expect(JSON.stringify(config)).not.toContain("sk_test");
		expect(JSON.stringify(config)).not.toContain("whsec");
	});
});
