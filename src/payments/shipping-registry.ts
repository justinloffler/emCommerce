/**
 * Shipping provider registry.
 *
 * Mirrors gateway-registry.ts — register providers once at plugin
 * activation, then query them during rate calculation.
 */

import type { ShippingProvider, ShippingProviderConfig } from "./shipping-provider.js";
import { ShipEngineProvider } from "./shipping-provider.js";

const providers = new Map<string, ShippingProvider>();

/**
 * Initialize built-in providers. Call once when the plugin activates.
 * ShipEngine is registered unconditionally; it no-ops if the API key
 * is absent, so it's always safe to include.
 */
export function initShippingProviders(config: ShippingProviderConfig): void {
	providers.set("shipengine", new ShipEngineProvider(config));
}

/**
 * Register a custom shipping provider (third-party extension point).
 */
export function registerShippingProvider(provider: ShippingProvider): void {
	providers.set(provider.id, provider);
}

/**
 * Get a provider by ID.
 */
export function getShippingProvider(id: string): ShippingProvider | undefined {
	return providers.get(id);
}

/**
 * List all registered shipping providers.
 */
export function listShippingProviders(): ShippingProvider[] {
	return Array.from(providers.values());
}
