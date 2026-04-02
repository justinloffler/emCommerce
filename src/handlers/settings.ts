/**
 * Settings and setup wizard route handlers.
 */

import type { RouteContext } from "emdash";
import type { SetupWizardInput, SettingsUpdateInput, EmailSettingInput } from "../schemas/settings.js";
import { COUNTRY_CURRENCY_MAP } from "../constants.js";

export async function settingsGetHandler(ctx: RouteContext) {
	const [
		setupComplete, storeName, storeCountry, storeAddress, defaultCurrency, taxInclusive, enabledProductTypes,
		stripePublishableKey, stripeSecretKey, stripeWebhookSecret,
		paypalClientId, paypalClientSecret, paypalSandbox, shipEngineApiKey,
	] = await Promise.all([
		ctx.kv.get<boolean>("state:setupComplete"),
		ctx.kv.get<string>("settings:storeName"),
		ctx.kv.get<string>("settings:storeCountry"),
		ctx.kv.get<string>("settings:storeAddress"),
		ctx.kv.get<string>("settings:defaultCurrency"),
		ctx.kv.get<boolean>("settings:taxInclusive"),
		ctx.kv.get<string[]>("settings:enabledProductTypes"),
		ctx.kv.get<string>("settings:stripePublishableKey"),
		ctx.kv.get<string>("settings:stripeSecretKey"),
		ctx.kv.get<string>("settings:stripeWebhookSecret"),
		ctx.kv.get<string>("settings:paypalClientId"),
		ctx.kv.get<string>("settings:paypalClientSecret"),
		ctx.kv.get<boolean>("settings:paypalSandbox"),
		ctx.kv.get<string>("settings:shipEngineApiKey"),
	]);

	// Mask secret values — return only whether they're set, not the actual value
	function mask(val: string | null | undefined): string {
		if (!val) return "";
		return "••••••••" + val.slice(-4);
	}

	return {
		setupComplete: setupComplete ?? false,
		storeName: storeName ?? "",
		storeCountry: storeCountry ?? "",
		storeAddress: storeAddress ?? "",
		defaultCurrency: defaultCurrency ?? "USD",
		taxInclusive: taxInclusive ?? false,
		enabledProductTypes: enabledProductTypes ?? ["simple"],
		stripePublishableKey: stripePublishableKey ?? "",
		stripeSecretKey: mask(stripeSecretKey),
		stripeWebhookSecret: mask(stripeWebhookSecret),
		paypalClientId: paypalClientId ?? "",
		paypalClientSecret: mask(paypalClientSecret),
		paypalSandbox: paypalSandbox ?? true,
		shipEngineApiKey: mask(shipEngineApiKey),
	};
}

export async function settingsUpdateHandler(ctx: RouteContext<SettingsUpdateInput>) {
	const input = ctx.input;

	if (input.storeName !== undefined) await ctx.kv.set("settings:storeName", input.storeName);
	if (input.storeCountry !== undefined) await ctx.kv.set("settings:storeCountry", input.storeCountry);
	if (input.storeAddress !== undefined) await ctx.kv.set("settings:storeAddress", input.storeAddress);
	if (input.defaultCurrency !== undefined) await ctx.kv.set("settings:defaultCurrency", input.defaultCurrency);
	if (input.taxInclusive !== undefined) await ctx.kv.set("settings:taxInclusive", input.taxInclusive);
	if (input.enabledProductTypes !== undefined) await ctx.kv.set("settings:enabledProductTypes", input.enabledProductTypes);

	// Payment keys — only save if non-empty and not the masked placeholder
	const isMasked = (v?: string) => !v || v.startsWith("••••");
	if (input.stripePublishableKey !== undefined && !isMasked(input.stripePublishableKey))
		await ctx.kv.set("settings:stripePublishableKey", input.stripePublishableKey);
	if (input.stripeSecretKey !== undefined && !isMasked(input.stripeSecretKey))
		await ctx.kv.set("settings:stripeSecretKey", input.stripeSecretKey);
	if (input.stripeWebhookSecret !== undefined && !isMasked(input.stripeWebhookSecret))
		await ctx.kv.set("settings:stripeWebhookSecret", input.stripeWebhookSecret);
	if (input.paypalClientId !== undefined && !isMasked(input.paypalClientId))
		await ctx.kv.set("settings:paypalClientId", input.paypalClientId);
	if (input.paypalClientSecret !== undefined && !isMasked(input.paypalClientSecret))
		await ctx.kv.set("settings:paypalClientSecret", input.paypalClientSecret);
	if (input.paypalSandbox !== undefined) await ctx.kv.set("settings:paypalSandbox", input.paypalSandbox);
	if (input.shipEngineApiKey !== undefined && !isMasked(input.shipEngineApiKey))
		await ctx.kv.set("settings:shipEngineApiKey", input.shipEngineApiKey);

	return settingsGetHandler(ctx);
}

export async function setupWizardHandler(ctx: RouteContext<SetupWizardInput>) {
	const { step, data } = ctx.input;

	switch (step) {
		case "store_profile": {
			const name = data.storeName as string;
			const country = data.storeCountry as string;
			const address = data.storeAddress as string;
			if (name) await ctx.kv.set("settings:storeName", name);
			if (country) {
				await ctx.kv.set("settings:storeCountry", country);
				// Auto-suggest currency from country
				const suggested = COUNTRY_CURRENCY_MAP[country];
				if (suggested) await ctx.kv.set("settings:defaultCurrency", suggested);
			}
			if (address) await ctx.kv.set("settings:storeAddress", address);
			break;
		}
		case "product_types": {
			const types = data.enabledProductTypes as string[];
			if (types) await ctx.kv.set("settings:enabledProductTypes", types);
			break;
		}
		case "payments": {
			if (data.stripePublishableKey) await ctx.kv.set("settings:stripePublishableKey", data.stripePublishableKey);
			if (data.stripeSecretKey) await ctx.kv.set("settings:stripeSecretKey", data.stripeSecretKey);
			if (data.paypalClientId) await ctx.kv.set("settings:paypalClientId", data.paypalClientId);
			if (data.paypalClientSecret) await ctx.kv.set("settings:paypalClientSecret", data.paypalClientSecret);
			if (data.paypalSandbox !== undefined) await ctx.kv.set("settings:paypalSandbox", data.paypalSandbox);
			break;
		}
		case "shipping": {
			// Shipping zone setup handled by dedicated shipping routes
			break;
		}
		case "tax": {
			if (data.taxInclusive !== undefined) await ctx.kv.set("settings:taxInclusive", data.taxInclusive);
			break;
		}
		case "complete": {
			await ctx.kv.set("state:setupComplete", true);
			break;
		}
	}

	return { step, success: true };
}

export async function emailSettingsListHandler(ctx: RouteContext) {
	const types = [
		"order_confirmation", "shipping_notification", "refund_confirmation",
		"low_stock_alert", "abandoned_cart", "new_account_welcome",
	];

	const settings = await Promise.all(
		types.map(async (type) => ({
			type,
			enabled: (await ctx.kv.get<boolean>(`email:${type}:enabled`)) ?? true,
			subject: (await ctx.kv.get<string>(`email:${type}:subject`)) ?? "",
			body: (await ctx.kv.get<string>(`email:${type}:body`)) ?? "",
		})),
	);

	return { items: settings };
}

export async function emailSettingUpdateHandler(ctx: RouteContext<EmailSettingInput>) {
	const { type, enabled, subject, body } = ctx.input;
	await ctx.kv.set(`email:${type}:enabled`, enabled);
	if (subject !== undefined) await ctx.kv.set(`email:${type}:subject`, subject);
	if (body !== undefined) await ctx.kv.set(`email:${type}:body`, body);
	return { type, enabled, subject, body };
}
