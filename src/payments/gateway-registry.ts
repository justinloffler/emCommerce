/**
 * Payment gateway registry.
 *
 * Manages available gateways and provides lookup by ID.
 */

import type { PaymentGateway, GatewayConfig } from "./types.js";
import { StripeGateway } from "./stripe.js";
import { PayPalGateway } from "./paypal.js";

const gateways = new Map<string, PaymentGateway>();

/**
 * Initialize built-in gateways with the plugin context.
 */
export function initGateways(config: GatewayConfig): void {
	gateways.set("stripe", new StripeGateway(config));
	gateways.set("paypal", new PayPalGateway(config));
}

/**
 * Register a custom gateway (for extensibility).
 */
export function registerGateway(gateway: PaymentGateway): void {
	gateways.set(gateway.id, gateway);
}

/**
 * Get a gateway by ID.
 */
export function getGateway(id: string): PaymentGateway | undefined {
	return gateways.get(id);
}

/**
 * List all registered gateways.
 */
export function listGateways(): PaymentGateway[] {
	return Array.from(gateways.values());
}
