/**
 * Shipping provider interface.
 *
 * All external rate providers implement this interface, mirroring
 * the PaymentGateway pattern for consistent extensibility.
 */

import type { HttpAccess, KVAccess } from "emdash";

export interface ShippingProvider {
	id: string;
	name: string;

	/** Fetch live carrier rates for the given shipment. */
	getRates(params: ShippingRateParams): Promise<ExternalShippingRate[]>;
}

export interface ShippingRateParams {
	toAddress: {
		countryCode: string;
		stateCode?: string | null;
		postalCode: string;
		city: string;
	};
	/** Total weight of the order in grams. */
	weight: number;
	/** Order subtotal in cents (used for declared value / insurance). */
	subtotal: number;
}

export interface ExternalShippingRate {
	/** Globally unique rate ID, e.g. "shipengine_usps_priority". */
	id: string;
	carrier: string;
	service: string;
	estimatedDays?: number;
	/** Cost in cents. */
	amount: number;
}

export interface ShippingProviderConfig {
	http: HttpAccess;
	kv: KVAccess;
}

// ─── ShipEngine Provider ────────────────────────────────────────

/**
 * ShipEngine live-rate provider.
 *
 * Requires `settings:shipEngineApiKey` in KV.
 * From origin address stored in `settings:storeAddress` KV namespace.
 * Only returns rates when the API key is configured — no-ops otherwise.
 */
export class ShipEngineProvider implements ShippingProvider {
	readonly id = "shipengine";
	readonly name = "ShipEngine";

	constructor(private config: ShippingProviderConfig) {}

	async getRates(params: ShippingRateParams): Promise<ExternalShippingRate[]> {
		const apiKey = await this.config.kv.get<string>("settings:shipEngineApiKey");
		if (!apiKey) return [];

		// Build from-address from store settings (fall back to placeholder)
		const fromCountry = (await this.config.kv.get("settings:storeCountry")) ?? "US";
		const fromPostal = (await this.config.kv.get("settings:storePostalCode")) ?? "00000";
		const fromCity = (await this.config.kv.get("settings:storeCity")) ?? "Unknown";
		const fromState = (await this.config.kv.get("settings:storeState")) ?? undefined;

		const weightOz = Math.max(1, Math.round(params.weight / 28.35)); // grams → oz

		const body = {
			rate_options: { carrier_ids: [] }, // empty = all connected carriers
			shipment: {
				validate_address: "no_validation",
				ship_from: {
					country_code: fromCountry,
					postal_code: fromPostal,
					city_locality: fromCity,
					...(fromState ? { state_province: fromState } : {}),
				},
				ship_to: {
					country_code: params.toAddress.countryCode,
					postal_code: params.toAddress.postalCode,
					city_locality: params.toAddress.city,
					...(params.toAddress.stateCode ? { state_province: params.toAddress.stateCode } : {}),
				},
				packages: [
					{
						weight: { value: weightOz, unit: "ounce" },
					},
				],
			},
		};

		try {
			const res = await this.config.http.fetch("https://api.shipengine.com/v1/rates", {
				method: "POST",
				headers: {
					"API-Key": apiKey,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			});

			if (!res.ok) return [];

			const json = (await res.json()) as any;
			const rates: ExternalShippingRate[] = [];

			for (const rate of json.rate_response?.rates ?? []) {
				if (rate.validation_status === "invalid") continue;
				rates.push({
					id: `shipengine_${rate.rate_id}`,
					carrier: rate.carrier_friendly_name ?? rate.carrier_code,
					service: rate.service_type,
					estimatedDays: rate.delivery_days ?? undefined,
					amount: Math.round((rate.shipping_amount?.amount ?? 0) * 100), // dollars → cents
				});
			}

			return rates;
		} catch {
			return [];
		}
	}
}
