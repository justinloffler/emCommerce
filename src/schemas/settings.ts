/**
 * Zod schemas for store settings and setup wizard.
 */

import { z } from "astro/zod";

export const setupWizardSchema = z.object({
	step: z.enum(["store_profile", "product_types", "payments", "shipping", "tax", "complete"]),
	data: z.record(z.string(), z.unknown()),
});

export const settingsUpdateSchema = z.object({
	storeName: z.string().min(1).max(200).optional(),
	storeCountry: z.string().length(2).optional(),
	storeAddress: z.string().max(500).optional(),
	defaultCurrency: z.string().length(3).optional(),
	taxInclusive: z.boolean().optional(),
	enabledProductTypes: z.array(z.enum(["simple", "variable", "grouped", "virtual", "downloadable", "external"])).optional(),
	// Payment gateway keys
	stripePublishableKey: z.string().optional(),
	stripeSecretKey: z.string().optional(),
	stripeWebhookSecret: z.string().optional(),
	paypalClientId: z.string().optional(),
	paypalClientSecret: z.string().optional(),
	paypalSandbox: z.boolean().optional(),
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
