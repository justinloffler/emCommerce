import type { Cart, Coupon, Product, ShippingZone } from "../../src/types.js";
import type { createMockContext } from "./mock-context.js";

type Mock = ReturnType<typeof createMockContext>;

export const NOW = "2026-10-01T00:00:00.000Z";

export function product(overrides: Partial<Product> = {}): Product {
	return {
		name: "Coffee Mug",
		slug: "coffee-mug",
		type: "simple",
		status: "active",
		shortDescription: "A mug",
		description: "<p>A lovely mug</p>",
		sku: "MUG-1",
		price: 2200,
		compareAtPrice: null,
		costPrice: 700,
		taxClassId: "",
		manageStock: true,
		stockQuantity: 10,
		lowStockThreshold: 2,
		backordersAllowed: false,
		weight: 400,
		dimensions: null,
		shippingClassId: null,
		images: ["https://cdn.example.com/mug.jpg"],
		categoryIds: [],
		tagIds: [],
		attributes: [],
		defaultVariantId: null,
		groupedProductIds: [],
		externalUrl: null,
		externalButtonText: null,
		downloadFiles: [{ name: "secret.pdf", url: "https://files.example.com/secret.pdf" }],
		downloadLimit: 0,
		downloadExpiry: 0,
		featured: false,
		sortOrder: 0,
		seoTitle: null,
		seoDescription: null,
		customFields: { supplierCode: "INTERNAL-42" },
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	};
}

export function coupon(overrides: Partial<Coupon> = {}): Coupon {
	return {
		code: "SAVE10",
		description: "",
		type: "percentage",
		value: 1000,
		minimumAmount: null,
		maximumDiscount: null,
		usageLimit: null,
		usageLimitPerCustomer: null,
		usageCount: 0,
		productIds: null,
		categoryIds: null,
		customerGroupIds: null,
		allowStacking: false,
		enabled: true,
		startDate: null,
		endDate: null,
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	} as Coupon;
}

/**
 * A small Australian store: AUD, GST 10% on the default class, one shipping
 * zone for Australia (flat $10 + free shipping method unlocked by coupon).
 */
export async function seedStore(m: Mock, opts: { taxInclusive?: boolean; taxShipping?: boolean } = {}) {
	await m.kv.set("settings:defaultCurrency", "AUD");
	await m.kv.set("settings:taxInclusive", opts.taxInclusive ?? false);
	await m.kv.set("settings:taxShipping", opts.taxShipping ?? false);
	await m.kv.set("settings:stripeSecretKey", "sk_test_123");
	await m.kv.set("settings:stripePublishableKey", "pk_test_123");
	await m.kv.set("settings:stripeWebhookSecret", "whsec_test_secret");
	await m.kv.set("settings:storeName", "Halden");

	await m.storage["tax-classes"].put("std", {
		name: "Standard",
		slug: "standard",
		description: "",
		isDefault: true,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await m.storage["tax-rules"].put("gst", {
		taxClassId: "std",
		countryCode: "AU",
		stateCode: null,
		postalCodePattern: null,
		rate: 1000,
		name: "GST",
		compound: false,
		priority: 0,
		createdAt: NOW,
	});
	await m.storage["customer-groups"].put("grp-default", {
		name: "Default",
		slug: "default",
		description: "",
		isDefault: true,
		createdAt: NOW,
		updatedAt: NOW,
	});

	const zone: ShippingZone = {
		name: "Australia",
		regions: [{ countryCode: "AU", stateCode: null }],
		methods: [
			{
				id: "flat",
				type: "flat_rate",
				name: "Standard Post",
				enabled: true,
				cost: 1000,
				freeShippingMinimum: null,
				weightRates: null,
				priceRates: null,
				sortOrder: 0,
			},
			{
				id: "free",
				type: "free_shipping",
				name: "Free Shipping",
				enabled: true,
				cost: null,
				freeShippingMinimum: null,
				weightRates: null,
				priceRates: null,
				sortOrder: 1,
			},
		],
		sortOrder: 0,
		createdAt: NOW,
		updatedAt: NOW,
	} as ShippingZone;
	await m.storage["shipping-zones"].put("zone-au", zone);

	await m.storage.products.put("prod-mug", product());
}

export async function seedCart(m: Mock, id: string, sessionId: string, overrides: Partial<Cart> = {}) {
	const cart: Cart = {
		sessionId,
		userId: null,
		items: [{ productId: "prod-mug", variantId: null, quantity: 2 }],
		couponCodes: [],
		shippingMethodId: null,
		shippingAddress: null,
		billingAddress: null,
		currencyCode: "AUD",
		note: null,
		expiresAt: "2099-01-01T00:00:00.000Z",
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	};
	await m.storage.carts.put(id, cart);
	return cart;
}

export const billing = {
	firstName: "Justin",
	lastName: "Tester",
	company: null,
	addressLine1: "1 King William St",
	addressLine2: null,
	city: "Adelaide",
	stateCode: "SA",
	postalCode: "5000",
	countryCode: "AU",
	phone: null,
};
