/**
 * Zod schemas for store settings and setup wizard.
 */

import { z } from "astro/zod";

export const setupWizardSchema = z.object({
	step: z.enum(["store_profile", "product_types", "payments", "shipping", "tax", "complete"]),
	data: z.record(z.string(), z.unknown()),
});

export const settingsUpdateSchema = z.object({
	storeName: z.string().max(200).optional(),
	storeCountry: z.union([z.string().length(2), z.literal("")]).optional(),
	storeAddress: z.string().max(500).optional(),
	/** Where store notifications (e.g. low stock alerts) are sent */
	storeEmail: z.union([z.string().email().max(254), z.literal("")]).optional(),
	defaultCurrency: z.string().length(3).optional(),
	taxInclusive: z.boolean().optional(),
	/** Charge tax on shipping (using the default tax class) */
	taxShipping: z.boolean().optional(),
	/** Hours before an unpaid order is cancelled and its stock released */
	pendingOrderTimeoutHours: z.number().int().min(1).max(720).optional(),
	enabledProductTypes: z.array(z.enum(["simple", "variable", "grouped", "virtual", "downloadable", "external"])).optional(),
	// Payment gateway keys
	stripePublishableKey: z.string().optional(),
	stripeSecretKey: z.string().optional(),
	stripeWebhookSecret: z.string().optional(),
	paypalClientId: z.string().optional(),
	paypalClientSecret: z.string().optional(),
	paypalSandbox: z.boolean().optional(),
	paypalWebhookId: z.string().max(100).optional(),
	// ShipEngine
	shipEngineApiKey: z.string().optional(),
});

export const emailSettingSchema = z.object({
	type: z.enum(["order_confirmation", "shipping_notification", "refund_confirmation", "low_stock_alert", "abandoned_cart", "new_account_welcome"]),
	enabled: z.boolean(),
	subject: z.string().max(200).optional(),
	body: z.string().max(5000).optional(),
});

export type SetupWizardInput = z.infer<typeof setupWizardSchema>;
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
export type EmailSettingInput = z.infer<typeof emailSettingSchema>;
