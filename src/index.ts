/**
 * emCommerce Plugin for EmDash CMS
 *
 * Full-featured ecommerce with WooCommerce ease-of-use
 * and PrestaShop-style advanced pricing.
 *
 * @example
 * ```typescript
 * // live.config.ts
 * import { emCommercePlugin } from "@emdash-cms/plugin-emcommerce";
 *
 * export default defineConfig({
 *   plugins: [emCommercePlugin()],
 * });
 * ```
 */

import type { PluginDescriptor, ResolvedPlugin } from "emdash";
import { definePlugin } from "emdash";
import { ulid } from "ulidx";

import { PLUGIN_ID, PLUGIN_VERSION, DEFAULT_TAX_CLASSES, COMMON_CURRENCIES } from "./constants.js";

// Phase 5: Checkout
import { checkoutCreateHandler, checkoutConfirmHandler } from "./handlers/checkout.js";
import { checkoutCreateSchema, checkoutConfirmSchema } from "./schemas/checkout.js";
import { stripeWebhookHandler, paypalWebhookHandler } from "./handlers/webhooks.js";

// Phase 6: Orders & Customers
import {
	orderListHandler, orderGetHandler, orderUpdateStatusHandler,
	orderAddNoteHandler, orderRefundHandler, orderPublicGetHandler,
} from "./handlers/orders.js";
import {
	orderListSchema, orderGetSchema, orderUpdateStatusSchema,
	orderAddNoteSchema, orderRefundSchema, orderPublicGetSchema,
} from "./schemas/orders.js";
import {
	customerListHandler, customerGetHandler, customerCreateHandler,
	customerUpdateHandler, customerDeleteHandler,
	customerGroupListHandler, customerGroupCreateHandler,
	customerGroupUpdateHandler, customerGroupDeleteHandler,
} from "./handlers/customers.js";
import {
	customerListSchema, customerGetSchema, customerCreateSchema,
	customerUpdateSchema, customerDeleteSchema,
	customerGroupListSchema, customerGroupCreateSchema,
	customerGroupUpdateSchema, customerGroupDeleteSchema,
} from "./schemas/customers.js";

// Phase 7: Coupons
import {
	couponListHandler, couponGetHandler, couponCreateHandler,
	couponUpdateHandler, couponDeleteHandler,
} from "./handlers/coupons.js";
import {
	couponListSchema, couponGetSchema, couponCreateSchema,
	couponUpdateSchema, couponDeleteSchema,
} from "./schemas/coupons.js";

// Phase 4: Tax & Shipping
import {
	taxClassListHandler, taxClassCreateHandler, taxClassUpdateHandler, taxClassDeleteHandler,
	taxRuleListHandler, taxRuleCreateHandler, taxRuleUpdateHandler, taxRuleDeleteHandler,
} from "./handlers/tax.js";
import {
	taxClassListSchema, taxClassCreateSchema, taxClassUpdateSchema, taxClassDeleteSchema,
	taxRuleListSchema, taxRuleCreateSchema, taxRuleUpdateSchema, taxRuleDeleteSchema,
} from "./schemas/tax.js";
import {
	shippingZoneListHandler, shippingZoneCreateHandler,
	shippingZoneUpdateHandler, shippingZoneDeleteHandler, shippingRatesHandler,
	paymentConfigHandler,
} from "./handlers/shipping.js";
import { initShippingProviders } from "./payments/shipping-registry.js";
import {
	shippingZoneListSchema, shippingZoneCreateSchema,
	shippingZoneUpdateSchema, shippingZoneDeleteSchema, shippingRatesSchema,
} from "./schemas/shipping.js";

// Phase 8: Settings & Dashboard
import { settingsGetHandler, settingsUpdateHandler, setupWizardHandler, emailSettingsListHandler, emailSettingUpdateHandler } from "./handlers/settings.js";
import { settingsUpdateSchema, setupWizardSchema, emailSettingSchema } from "./schemas/settings.js";
import { dashboardStatsHandler, recentOrdersHandler, lowStockHandler } from "./handlers/dashboard.js";
import { handleCartCleanup, handleExchangeRateSync, handleLowStockCheck } from "./handlers/cron.js";

// Custom Fields
import { customFieldListHandler, customFieldCreateHandler, customFieldUpdateHandler, customFieldDeleteHandler } from "./handlers/custom-fields.js";
import { customFieldListSchema, customFieldCreateSchema, customFieldUpdateSchema, customFieldDeleteSchema } from "./schemas/custom-fields.js";

// API Keys
import { apiKeyListHandler, apiKeyCreateHandler, apiKeyRevokeHandler } from "./handlers/api-keys.js";
import { apiKeyCreateSchema, apiKeyRevokeSchema } from "./schemas/api-keys.js";

// External REST API
import {
	apiProductList, apiProductGet, apiProductCreate, apiProductUpdate, apiProductDelete,
	apiOrderList, apiOrderGet, apiOrderCreate, apiOrderUpdate,
	apiCustomerList, apiCustomerGet,
	apiInventoryUpdate, apiInventoryBatch,
	apiCouponList,
	apiWebhookCreate, apiWebhookList, apiWebhookDelete,
} from "./handlers/api.js";
import {
	apiProductListSchema, apiProductGetSchema, apiProductCreateSchema, apiProductUpdateSchema, apiProductDeleteSchema,
	apiOrderListSchema, apiOrderGetSchema, apiOrderCreateSchema, apiOrderUpdateSchema,
	apiCustomerListSchema, apiCustomerGetSchema,
	apiInventoryUpdateSchema, apiInventoryBatchSchema,
	apiCouponListSchema,
	apiWebhookCreateSchema, apiWebhookDeleteSchema,
} from "./schemas/api.js";

import {
	cartGetHandler,
	cartAddHandler,
	cartUpdateHandler,
	cartRemoveHandler,
	cartApplyCouponHandler,
	cartRemoveCouponHandler,
	cartSetAddressHandler,
	cartSetShippingMethodHandler,
} from "./handlers/cart.js";
import {
	cartGetSchema,
	cartAddSchema,
	cartUpdateSchema,
	cartRemoveSchema,
	cartCouponSchema,
	cartSetAddressSchema,
	cartSetShippingMethodSchema,
} from "./schemas/cart.js";
import {
	productListHandler,
	productGetHandler,
	productCreateHandler,
	productUpdateHandler,
	productDeleteHandler,
	variantListHandler,
	variantCreateHandler,
	variantUpdateHandler,
	variantDeleteHandler,
	categoryListHandler,
	categoryCreateHandler,
	categoryUpdateHandler,
	categoryDeleteHandler,
	tagListHandler,
	tagCreateHandler,
	tagDeleteHandler,
} from "./handlers/products.js";
import {
	specificPriceListHandler,
	specificPriceCreateHandler,
	specificPriceUpdateHandler,
	specificPriceDeleteHandler,
	catalogPriceRuleListHandler,
	catalogPriceRuleCreateHandler,
	catalogPriceRuleUpdateHandler,
	catalogPriceRuleDeleteHandler,
} from "./handlers/pricing.js";
import {
	productListSchema,
	productGetSchema,
	productCreateSchema,
	productUpdateSchema,
	productDeleteSchema,
	variantListSchema,
	variantCreateSchema,
	variantUpdateSchema,
	variantDeleteSchema,
	categoryListSchema,
	categoryCreateSchema,
	categoryUpdateSchema,
	categoryDeleteSchema,
	tagListSchema,
	tagCreateSchema,
	tagDeleteSchema,
} from "./schemas/products.js";
import {
	specificPriceListSchema,
	specificPriceCreateSchema,
	specificPriceUpdateSchema,
	specificPriceDeleteSchema,
	catalogPriceRuleListSchema,
	catalogPriceRuleCreateSchema,
	catalogPriceRuleUpdateSchema,
	catalogPriceRuleDeleteSchema,
} from "./schemas/pricing.js";
import { EMCOMMERCE_STORAGE_CONFIG } from "./storage.js";

// ─── Plugin Options ─────────────────────────────────────────────

export interface EmCommercePluginOptions {
	/** Default currency code (default: USD) */
	defaultCurrency?: string;
}

// ─── Plugin Descriptor (for live.config.ts) ─────────────────────

export function emCommercePlugin(
	options: EmCommercePluginOptions = {},
): PluginDescriptor<EmCommercePluginOptions> {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		entrypoint: "@emdash-cms/plugin-emcommerce",
		adminEntry: "@emdash-cms/plugin-emcommerce/admin",
		componentsEntry: "@emdash-cms/plugin-emcommerce/astro",
		options,
		capabilities: ["email:send", "network:fetch", "page:inject", "read:users", "write:media"],
		allowedHosts: ["api.stripe.com", "*.stripe.com", "api.paypal.com", "*.paypal.com", "api.exchangerate.host", "api.shipengine.com"],
		adminPages: [
			{ path: "/", label: "emCommerce", icon: "storefront" },
		],
		adminWidgets: [
			{ id: "sales-overview", title: "Sales Overview", size: "half" },
			{ id: "recent-orders", title: "Recent Orders", size: "half" },
			{ id: "low-stock", title: "Low Stock", size: "third" },
		],
		storage: {
			// Descriptor uses flat indexes only; composite indexes are in definePlugin
			products: { indexes: ["status", "type", "featured", "createdAt"], uniqueIndexes: ["slug"] },
			variants: { indexes: ["productId"], uniqueIndexes: ["sku"] },
			categories: { indexes: ["parentId", "sortOrder"], uniqueIndexes: ["slug"] },
			tags: { indexes: ["createdAt"], uniqueIndexes: ["slug"] },
			"specific-prices": { indexes: ["productId", "variantId", "customerGroupId", "priority"] },
			"catalog-price-rules": { indexes: ["enabled", "priority"] },
			carts: { indexes: ["sessionId", "userId", "expiresAt"] },
			orders: { indexes: ["status", "customerId", "customerEmail", "paymentStatus", "createdAt"], uniqueIndexes: ["orderNumber"] },
			customers: { indexes: ["userId", "groupId", "createdAt"], uniqueIndexes: ["email"] },
			"customer-groups": { indexes: ["isDefault", "createdAt"], uniqueIndexes: ["slug"] },
			"shipping-zones": { indexes: ["sortOrder"] },
			"tax-classes": { indexes: ["isDefault"], uniqueIndexes: ["slug"] },
			"tax-rules": { indexes: ["taxClassId", "countryCode"] },
			coupons: { indexes: ["enabled", "startDate", "endDate"], uniqueIndexes: ["code"] },
			currencies: { indexes: ["isDefault", "enabled"], uniqueIndexes: ["code"] },
		},
	};
}

// ─── Plugin Implementation ──────────────────────────────────────

export function createPlugin(options: EmCommercePluginOptions = {}): ResolvedPlugin {
	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		capabilities: ["email:send", "network:fetch", "page:inject", "read:users", "write:media"],
		allowedHosts: ["api.stripe.com", "*.stripe.com", "api.paypal.com", "*.paypal.com", "api.exchangerate.host", "api.shipengine.com"],

		storage: EMCOMMERCE_STORAGE_CONFIG,

		hooks: {
			"plugin:install": {
				handler: async (_event, ctx) => {
					const now = new Date().toISOString();

					// Seed default tax classes
					for (const tc of DEFAULT_TAX_CLASSES) {
						await ctx.storage["tax-classes"].put(ulid(), {
							name: tc.name,
							slug: tc.slug,
							description: "",
							isDefault: tc.isDefault,
							createdAt: now,
							updatedAt: now,
						});
					}

					// Seed default customer group (isDefault: true is the fallback for new customers)
					await ctx.storage["customer-groups"].put(ulid(), {
						name: "Default",
						slug: "default",
						description: "Default customer group",
						isDefault: true,
						createdAt: now,
						updatedAt: now,
					});

					// Seed default shipping zone ("Rest of World")
					await ctx.storage["shipping-zones"].put(ulid(), {
						name: "Rest of World",
						regions: [],
						methods: [
							{
								id: ulid(),
								type: "flat_rate",
								name: "Flat Rate",
								enabled: true,
								cost: 500, // $5.00
								freeShippingMinimum: null,
								weightRates: null,
								priceRates: null,
								sortOrder: 0,
							},
						],
						sortOrder: 99,
						createdAt: now,
						updatedAt: now,
					});

					// Seed default currency
					const defaultCode = options.defaultCurrency ?? "USD";
					const meta = COMMON_CURRENCIES.find((c) => c.code === defaultCode) ?? COMMON_CURRENCIES[0];
					await ctx.storage.currencies.put(ulid(), {
						code: meta.code,
						name: meta.name,
						symbol: meta.symbol,
						symbolPosition: meta.symbolPosition,
						decimalPlaces: meta.decimalPlaces,
						thousandsSeparator: meta.thousandsSeparator,
						decimalSeparator: meta.decimalSeparator,
						exchangeRate: 10000, // 1:1 (it's the default)
						isDefault: true,
						enabled: true,
						updatedAt: now,
					});

					// Initialize settings
					await ctx.kv.set("settings:defaultCurrency", meta.code);
					await ctx.kv.set("settings:taxInclusive", false);
					await ctx.kv.set("state:setupComplete", false);
					await ctx.kv.set("state:priceGeneration", 0);

					// Initialize email settings (all enabled by default)
					const emailTypes = [
						"order_confirmation",
						"shipping_notification",
						"refund_confirmation",
						"low_stock_alert",
						"abandoned_cart",
						"new_account_welcome",
					];
					for (const type of emailTypes) {
						await ctx.kv.set(`email:${type}:enabled`, true);
					}
				},
			},

			"plugin:activate": {
				handler: async (_event, ctx) => {
					// Ensure the Default customer group exists (idempotent — safe to run every activation)
					const allGroups = await ctx.storage["customer-groups"].query({ limit: 100 });
					const hasDefault = allGroups.items.some((i) => i.data.isDefault);
					if (!hasDefault) {
						const now = new Date().toISOString();
						await ctx.storage["customer-groups"].put(ulid(), {
							name: "Default",
							slug: "default",
							description: "Default customer group",
							isDefault: true,
							createdAt: now,
							updatedAt: now,
						});
					}

					// Initialize extensible shipping providers (ShipEngine no-ops if no API key)
					initShippingProviders({ http: ctx.http, kv: ctx.kv });

					if (ctx.cron) {
						// Daily cart cleanup (remove expired carts)
						await ctx.cron.schedule("cart-cleanup", { schedule: "@daily" });
						// Daily exchange rate sync
						await ctx.cron.schedule("exchange-rate-sync", { schedule: "@daily" });
						// Daily low stock check
						await ctx.cron.schedule("low-stock-check", { schedule: "@daily" });
					}
				},
			},

			"plugin:deactivate": {
				handler: async (_event, ctx) => {
					if (ctx.cron) {
						await ctx.cron.cancel("cart-cleanup").catch(() => {});
						await ctx.cron.cancel("exchange-rate-sync").catch(() => {});
						await ctx.cron.cancel("low-stock-check").catch(() => {});
					}
				},
			},

			cron: {
				handler: async (event, ctx) => {
					switch (event.name) {
						case "cart-cleanup":
							await handleCartCleanup(ctx);
							break;
						case "exchange-rate-sync":
							await handleExchangeRateSync(ctx);
							break;
						case "low-stock-check":
							await handleLowStockCheck(ctx);
							break;
					}
				},
			},
		},

		routes: {
			// ═══════════════════════════════════════════════════════
			// PUBLIC STOREFRONT ROUTES
			// ═══════════════════════════════════════════════════════

			"storefront/products": {
				public: true,
				input: productListSchema,
				handler: async (ctx) => {
					// Override: only show active products on storefront
					ctx.input.status = "active";
					return productListHandler(ctx);
				},
			} as never,

			"storefront/product": {
				public: true,
				input: productGetSchema,
				handler: productGetHandler as never,
			},

			// ═══════════════════════════════════════════════════════
			// PUBLIC: CART
			// ═══════════════════════════════════════════════════════

			"storefront/cart/get": {
				public: true,
				input: cartGetSchema,
				handler: cartGetHandler as never,
			},
			"storefront/cart/add": {
				public: true,
				input: cartAddSchema,
				handler: cartAddHandler as never,
			},
			"storefront/cart/update": {
				public: true,
				input: cartUpdateSchema,
				handler: cartUpdateHandler as never,
			},
			"storefront/cart/remove": {
				public: true,
				input: cartRemoveSchema,
				handler: cartRemoveHandler as never,
			},
			"storefront/cart/coupon": {
				public: true,
				input: cartCouponSchema,
				handler: cartApplyCouponHandler as never,
			},
			"storefront/cart/remove-coupon": {
				public: true,
				input: cartCouponSchema,
				handler: cartRemoveCouponHandler as never,
			},
			"storefront/cart/address": {
				public: true,
				input: cartSetAddressSchema,
				handler: cartSetAddressHandler as never,
			},
			"storefront/cart/shipping-method": {
				public: true,
				input: cartSetShippingMethodSchema,
				handler: cartSetShippingMethodHandler as never,
			},

			// ═══════════════════════════════════════════════════════
			// ADMIN: PRODUCTS
			// ═══════════════════════════════════════════════════════

			"products/list": {
				input: productListSchema,
				handler: productListHandler as never,
			},
			"products/get": {
				input: productGetSchema,
				handler: productGetHandler as never,
			},
			"products/create": {
				input: productCreateSchema,
				handler: productCreateHandler as never,
			},
			"products/update": {
				input: productUpdateSchema,
				handler: productUpdateHandler as never,
			},
			"products/delete": {
				input: productDeleteSchema,
				handler: productDeleteHandler as never,
			},

			// ═══════════════════════════════════════════════════════
			// ADMIN: VARIANTS
			// ═══════════════════════════════════════════════════════

			"variants/list": {
				input: variantListSchema,
				handler: variantListHandler as never,
			},
			"variants/create": {
				input: variantCreateSchema,
				handler: variantCreateHandler as never,
			},
			"variants/update": {
				input: variantUpdateSchema,
				handler: variantUpdateHandler as never,
			},
			"variants/delete": {
				input: variantDeleteSchema,
				handler: variantDeleteHandler as never,
			},

			// ═══════════════════════════════════════════════════════
			// ADMIN: CATEGORIES
			// ═══════════════════════════════════════════════════════

			"categories/list": {
				input: categoryListSchema,
				handler: categoryListHandler as never,
			},
			"categories/create": {
				input: categoryCreateSchema,
				handler: categoryCreateHandler as never,
			},
			"categories/update": {
				input: categoryUpdateSchema,
				handler: categoryUpdateHandler as never,
			},
			"categories/delete": {
				input: categoryDeleteSchema,
				handler: categoryDeleteHandler as never,
			},

			// ═══════════════════════════════════════════════════════
			// ADMIN: TAGS
			// ═══════════════════════════════════════════════════════

			"tags/list": {
				input: tagListSchema,
				handler: tagListHandler as never,
			},
			"tags/create": {
				input: tagCreateSchema,
				handler: tagCreateHandler as never,
			},
			"tags/delete": {
				input: tagDeleteSchema,
				handler: tagDeleteHandler as never,
			},

			// ═══════════════════════════════════════════════════════
			// ADMIN: SPECIFIC PRICES
			// ═══════════════════════════════════════════════════════

			"pricing/specific/list": {
				input: specificPriceListSchema,
				handler: specificPriceListHandler as never,
			},
			"pricing/specific/create": {
				input: specificPriceCreateSchema,
				handler: specificPriceCreateHandler as never,
			},
			"pricing/specific/update": {
				input: specificPriceUpdateSchema,
				handler: specificPriceUpdateHandler as never,
			},
			"pricing/specific/delete": {
				input: specificPriceDeleteSchema,
				handler: specificPriceDeleteHandler as never,
			},

			// ═══════════════════════════════════════════════════════
			// ADMIN: CATALOG PRICE RULES
			// ═══════════════════════════════════════════════════════

			"pricing/catalog/list": {
				input: catalogPriceRuleListSchema,
				handler: catalogPriceRuleListHandler as never,
			},
			"pricing/catalog/create": {
				input: catalogPriceRuleCreateSchema,
				handler: catalogPriceRuleCreateHandler as never,
			},
			"pricing/catalog/update": {
				input: catalogPriceRuleUpdateSchema,
				handler: catalogPriceRuleUpdateHandler as never,
			},
			"pricing/catalog/delete": {
				input: catalogPriceRuleDeleteSchema,
				handler: catalogPriceRuleDeleteHandler as never,
			},

			// ═══════════════════════════════════════════════════════
			// PUBLIC: CHECKOUT & WEBHOOKS
			// ═══════════════════════════════════════════════════════

			"storefront/checkout/create": {
				public: true,
				input: checkoutCreateSchema,
				handler: checkoutCreateHandler as never,
			},
			"storefront/checkout/confirm": {
				public: true,
				input: checkoutConfirmSchema,
				handler: checkoutConfirmHandler as never,
			},
			"storefront/shipping-methods": {
				public: true,
				input: shippingRatesSchema,
				handler: shippingRatesHandler as never,
			},
			"storefront/order": {
				public: true,
				input: orderPublicGetSchema,
				handler: orderPublicGetHandler as never,
			},
			"storefront/payment-config": {
				public: true,
				handler: paymentConfigHandler,
			},
			"webhook/stripe": {
				public: true,
				handler: stripeWebhookHandler,
			},
			"webhook/paypal": {
				public: true,
				handler: paypalWebhookHandler,
			},

			// ═══════════════════════════════════════════════════════
			// ADMIN: ORDERS
			// ═══════════════════════════════════════════════════════

			"orders/list": { input: orderListSchema, handler: orderListHandler as never },
			"orders/get": { input: orderGetSchema, handler: orderGetHandler as never },
			"orders/update-status": { input: orderUpdateStatusSchema, handler: orderUpdateStatusHandler as never },
			"orders/add-note": { input: orderAddNoteSchema, handler: orderAddNoteHandler as never },
			"orders/refund": { input: orderRefundSchema, handler: orderRefundHandler as never },

			// ═══════════════════════════════════════════════════════
			// ADMIN: CUSTOMERS
			// ═══════════════════════════════════════════════════════

			"customers/list": { input: customerListSchema, handler: customerListHandler as never },
			"customers/get": { input: customerGetSchema, handler: customerGetHandler as never },
			"customers/create": { input: customerCreateSchema, handler: customerCreateHandler as never },
			"customers/update": { input: customerUpdateSchema, handler: customerUpdateHandler as never },
			"customers/delete": { input: customerDeleteSchema, handler: customerDeleteHandler as never },

			"customer-groups/list": { input: customerGroupListSchema, handler: customerGroupListHandler as never },
			"customer-groups/create": { input: customerGroupCreateSchema, handler: customerGroupCreateHandler as never },
			"customer-groups/update": { input: customerGroupUpdateSchema, handler: customerGroupUpdateHandler as never },
			"customer-groups/delete": { input: customerGroupDeleteSchema, handler: customerGroupDeleteHandler as never },

			// ═══════════════════════════════════════════════════════
			// ADMIN: COUPONS
			// ═══════════════════════════════════════════════════════

			"coupons/list": { input: couponListSchema, handler: couponListHandler as never },
			"coupons/get": { input: couponGetSchema, handler: couponGetHandler as never },
			"coupons/create": { input: couponCreateSchema, handler: couponCreateHandler as never },
			"coupons/update": { input: couponUpdateSchema, handler: couponUpdateHandler as never },
			"coupons/delete": { input: couponDeleteSchema, handler: couponDeleteHandler as never },

			// ═══════════════════════════════════════════════════════
			// ADMIN: TAX
			// ═══════════════════════════════════════════════════════

			"tax-classes/list": { input: taxClassListSchema, handler: taxClassListHandler as never },
			"tax-classes/create": { input: taxClassCreateSchema, handler: taxClassCreateHandler as never },
			"tax-classes/update": { input: taxClassUpdateSchema, handler: taxClassUpdateHandler as never },
			"tax-classes/delete": { input: taxClassDeleteSchema, handler: taxClassDeleteHandler as never },

			"tax-rules/list": { input: taxRuleListSchema, handler: taxRuleListHandler as never },
			"tax-rules/create": { input: taxRuleCreateSchema, handler: taxRuleCreateHandler as never },
			"tax-rules/update": { input: taxRuleUpdateSchema, handler: taxRuleUpdateHandler as never },
			"tax-rules/delete": { input: taxRuleDeleteSchema, handler: taxRuleDeleteHandler as never },

			// ═══════════════════════════════════════════════════════
			// ADMIN: SHIPPING
			// ═══════════════════════════════════════════════════════

			"shipping-zones/list": { input: shippingZoneListSchema, handler: shippingZoneListHandler as never },
			"shipping-zones/create": { input: shippingZoneCreateSchema, handler: shippingZoneCreateHandler as never },
			"shipping-zones/update": { input: shippingZoneUpdateSchema, handler: shippingZoneUpdateHandler as never },
			"shipping-zones/delete": { input: shippingZoneDeleteSchema, handler: shippingZoneDeleteHandler as never },

			// ═══════════════════════════════════════════════════════
			// ADMIN: SETTINGS & DASHBOARD
			// ═══════════════════════════════════════════════════════

			"settings/get": { handler: settingsGetHandler },
			"settings/update": { input: settingsUpdateSchema, handler: settingsUpdateHandler as never },
			"settings/setup-wizard": { input: setupWizardSchema, handler: setupWizardHandler as never },
			"settings/emails": { handler: emailSettingsListHandler },
			"settings/emails/update": { input: emailSettingSchema, handler: emailSettingUpdateHandler as never },

			// ═══════════════════════════════════════════════════════
			// ADMIN: CUSTOM FIELDS
			// ═══════════════════════════════════════════════════════

			"custom-fields/list": { input: customFieldListSchema, handler: customFieldListHandler as never },
			"custom-fields/create": { input: customFieldCreateSchema, handler: customFieldCreateHandler as never },
			"custom-fields/update": { input: customFieldUpdateSchema, handler: customFieldUpdateHandler as never },
			"custom-fields/delete": { input: customFieldDeleteSchema, handler: customFieldDeleteHandler as never },

			"dashboard/stats": { handler: dashboardStatsHandler },
			"dashboard/recent-orders": { handler: recentOrdersHandler },
			"dashboard/low-stock": { handler: lowStockHandler },

			// ═══════════════════════════════════════════════════════
			// ADMIN: API KEYS
			// ═══════════════════════════════════════════════════════

			"api-keys/list": { handler: apiKeyListHandler },
			"api-keys/create": { input: apiKeyCreateSchema, handler: apiKeyCreateHandler as never },
			"api-keys/revoke": { input: apiKeyRevokeSchema, handler: apiKeyRevokeHandler as never },

			// ═══════════════════════════════════════════════════════
			// EXTERNAL REST API (WooCommerce-style)
			// Authenticated via emdash API tokens.
			// Prices as dollar strings ("19.99"), pagination via page/per_page.
			// ═══════════════════════════════════════════════════════

			// Products
			"api/v1/products": { input: apiProductListSchema, handler: apiProductList as never },
			"api/v1/products/get": { input: apiProductGetSchema, handler: apiProductGet as never },
			"api/v1/products/create": { input: apiProductCreateSchema, handler: apiProductCreate as never },
			"api/v1/products/update": { input: apiProductUpdateSchema, handler: apiProductUpdate as never },
			"api/v1/products/delete": { input: apiProductDeleteSchema, handler: apiProductDelete as never },

			// Orders
			"api/v1/orders": { input: apiOrderListSchema, handler: apiOrderList as never },
			"api/v1/orders/get": { input: apiOrderGetSchema, handler: apiOrderGet as never },
			"api/v1/orders/create": { input: apiOrderCreateSchema, handler: apiOrderCreate as never },
			"api/v1/orders/update": { input: apiOrderUpdateSchema, handler: apiOrderUpdate as never },

			// Customers
			"api/v1/customers": { input: apiCustomerListSchema, handler: apiCustomerList as never },
			"api/v1/customers/get": { input: apiCustomerGetSchema, handler: apiCustomerGet as never },

			// Inventory
			"api/v1/inventory/update": { input: apiInventoryUpdateSchema, handler: apiInventoryUpdate as never },
			"api/v1/inventory/batch": { input: apiInventoryBatchSchema, handler: apiInventoryBatch as never },

			// Coupons
			"api/v1/coupons": { input: apiCouponListSchema, handler: apiCouponList as never },

			// Webhooks
			"api/v1/webhooks": { handler: apiWebhookList },
			"api/v1/webhooks/create": { input: apiWebhookCreateSchema, handler: apiWebhookCreate as never },
			"api/v1/webhooks/delete": { input: apiWebhookDeleteSchema, handler: apiWebhookDelete as never },
		},

		admin: {
			settingsSchema: {
				stripePublishableKey: { type: "string", label: "Stripe Publishable Key" },
				stripeSecretKey: { type: "secret", label: "Stripe Secret Key" },
				stripeWebhookSecret: { type: "secret", label: "Stripe Webhook Secret" },
				paypalClientId: { type: "string", label: "PayPal Client ID" },
				paypalClientSecret: { type: "secret", label: "PayPal Client Secret" },
				paypalSandbox: { type: "boolean", label: "PayPal Sandbox Mode" },
			},
			pages: [
				{ path: "/", label: "emCommerce", icon: "storefront" },
			],
			widgets: [
				{ id: "sales-overview", title: "Sales Overview", size: "half" },
				{ id: "recent-orders", title: "Recent Orders", size: "half" },
				{ id: "low-stock", title: "Low Stock", size: "third" },
			],
		},
	});
}

export default createPlugin;

// Re-export types for consumers
export type * from "./types.js";
export type { EmCommerceStorage } from "./storage.js";
