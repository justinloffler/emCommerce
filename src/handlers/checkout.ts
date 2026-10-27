/**
 * Checkout route handlers.
 *
 * quote   → price the cart for an address/shipping method (no side effects)
 * create  → create the order + guest customer, reserve stock, open a payment
 * confirm → ask the payment provider whether the payment succeeded
 *
 * The browser is never trusted to say "this order is paid": `confirm` checks
 * with Stripe/PayPal server-side, and signed webhooks do the same.
 */

import type { PluginContext, RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";
import { ulid } from "ulidx";

import { calculateCart, type CartSummary } from "../engine/cart-engine.js";
import { calculateCheckoutTotals, type CheckoutTotals } from "../engine/checkout-totals.js";
import { reserveStock } from "../engine/inventory.js";
import { getShippingCost, getShippingRates } from "../engine/shipping-engine.js";
import { getGateway, initGateways } from "../payments/gateway-registry.js";
import type { CheckoutConfirmInput, CheckoutCreateInput } from "../schemas/checkout.js";
import type { CheckoutQuoteInput, QuoteAddress } from "../schemas/storefront.js";
import type {
	Address,
	Cart,
	Customer,
	CustomerGroup,
	Order,
	Product,
	ShippingZone,
	TaxClass,
	TaxRule,
	Variant,
} from "../types.js";
import { cartCalculationContext, requireHttp } from "./context.js";
import { cancelUnpaidOrder, markOrderPaid, recordPaymentFailure } from "./order-payment.js";

function carts(ctx: PluginContext): StorageCollection<Cart> {
	return ctx.storage.carts as StorageCollection<Cart>;
}
function orders(ctx: PluginContext): StorageCollection<Order> {
	return ctx.storage.orders as StorageCollection<Order>;
}

// ─── Shared pricing ─────────────────────────────────────────────

type TaxAddress = Pick<Address, "countryCode" | "stateCode" | "postalCode" | "city">;

export interface PricedCheckout {
	summary: CartSummary;
	totals: CheckoutTotals;
	shippingMethodName: string | null;
}

/**
 * Price a cart for checkout. Throws if a shipping method is given that isn't
 * available for the address (never silently ships for free).
 */
export async function priceCheckout(
	ctx: PluginContext,
	cart: Cart,
	address: TaxAddress | null,
	shippingMethodId: string | null,
): Promise<PricedCheckout> {
	const countryCode = address?.countryCode.toUpperCase() ?? null;
	const summary = await calculateCart(cart, cartCalculationContext(ctx, { countryCode }));

	let shippingCost = 0;
	let shippingMethodName: string | null = null;
	if (shippingMethodId) {
		if (!address) throw PluginRouteError.badRequest("An address is required to choose shipping");
		const shipping = await getShippingCost(
			shippingMethodId,
			toFullAddress(address),
			summary.totalWeight,
			summary.subtotal - summary.discountTotal,
			summary.freeShipping,
			{ shippingZones: ctx.storage["shipping-zones"] as StorageCollection<ShippingZone> },
		);
		if (!shipping) {
			throw PluginRouteError.badRequest("The selected shipping method isn't available for this address");
		}
		shippingCost = shipping.cost;
		shippingMethodName = shipping.name;
	}

	const [taxInclusive, taxShipping, taxClasses] = await Promise.all([
		ctx.kv.get<boolean>("settings:taxInclusive"),
		ctx.kv.get<boolean>("settings:taxShipping"),
		(ctx.storage["tax-classes"] as StorageCollection<TaxClass>).query({ limit: 100 }),
	]);
	const defaultTaxClass = taxClasses.items.find((c) => c.data.isDefault) ?? taxClasses.items[0];

	const taxRules = ctx.storage["tax-rules"] as StorageCollection<TaxRule>;
	const totals = await calculateCheckoutTotals(summary, {
		taxAddress: address,
		shippingCost,
		taxInclusive: taxInclusive ?? false,
		taxShipping: taxShipping ?? false,
		defaultTaxClassId: defaultTaxClass?.id ?? null,
		taxClassIds: new Set(taxClasses.items.map((c) => c.id)),
		loadRules: async (taxClassId, country) => {
			const res = await taxRules.query({ where: { taxClassId, countryCode: country }, limit: 100 });
			return res.items.map((i) => i.data);
		},
	});

	return { summary, totals, shippingMethodName };
}

function toFullAddress(a: TaxAddress): Address {
	return {
		firstName: "",
		lastName: "",
		company: null,
		addressLine1: "",
		addressLine2: null,
		city: a.city ?? "",
		stateCode: a.stateCode ?? null,
		postalCode: a.postalCode ?? "",
		countryCode: a.countryCode.toUpperCase(),
		phone: null,
	};
}

async function findCartBySession(ctx: PluginContext, sessionId: string) {
	const res = await carts(ctx).query({ where: { sessionId }, limit: 1 });
	return res.items[0] ?? null;
}

// ─── Quote ──────────────────────────────────────────────────────

/**
 * Public: show the customer what they'll pay — items, discounts, available
 * shipping methods for the address, tax and total.
 */
export async function checkoutQuoteHandler(ctx: RouteContext<CheckoutQuoteInput>) {
	const input = ctx.input;
	const found = await findCartBySession(ctx, input.sessionId);
	if (!found || found.data.items.length === 0) throw PluginRouteError.badRequest("Cart is empty");

	const address: QuoteAddress | null = input.address;

	// Available shipping methods for this address
	let shippingMethods: Array<{ id: string; name: string; cost: number }> = [];
	let preliminary: CartSummary | null = null;
	if (address) {
		preliminary = await calculateCart(found.data, cartCalculationContext(ctx, { countryCode: address.countryCode }));
		const rates = await getShippingRates(
			toFullAddress(address),
			preliminary.totalWeight,
			preliminary.subtotal - preliminary.discountTotal,
			preliminary.freeShipping,
			{ shippingZones: ctx.storage["shipping-zones"] as StorageCollection<ShippingZone> },
		);
		shippingMethods = (rates?.methods ?? []).map((m) => ({ id: m.id, name: m.name, cost: m.cost }));
	}

	const selected =
		input.shippingMethodId && shippingMethods.some((m) => m.id === input.shippingMethodId)
			? input.shippingMethodId
			: (shippingMethods[0]?.id ?? null);

	const priced = await priceCheckout(ctx, found.data, address, selected);
	return {
		items: priced.summary.items.map((item, idx) => ({
			productId: item.productId,
			variantId: item.variantId,
			name: item.name,
			sku: item.sku,
			quantity: item.quantity,
			unitPrice: item.unitPrice,
			originalPrice: item.originalPrice,
			lineTotal: item.lineTotal,
			attributes: item.attributes,
			taxAmount: priced.totals.itemTax[idx],
		})),
		couponCodes: found.data.couponCodes,
		discountBreakdown: priced.summary.discountBreakdown,
		shippingMethods,
		shippingMethodId: selected,
		subtotal: priced.totals.subtotal,
		discountTotal: priced.totals.discountTotal,
		shippingTotal: priced.totals.shippingTotal,
		taxTotal: priced.totals.taxTotal,
		taxLines: priced.totals.taxLines,
		taxInclusive: priced.totals.taxInclusive,
		total: priced.totals.total,
		currencyCode: found.data.currencyCode,
		requiresShipping: address !== null,
	};
}

// ─── Create ─────────────────────────────────────────────────────

/**
 * Public: create an order from a cart and open a payment with the provider.
 * Returns what the browser needs to complete payment (Stripe client secret
 * or PayPal order ID).
 */
export async function checkoutCreateHandler(ctx: RouteContext<CheckoutCreateInput>) {
	const input = ctx.input;

	const found = await findCartBySession(ctx, input.sessionId);
	if (!found) throw PluginRouteError.notFound("Cart not found");
	const { id: cartId, data: cart } = found;
	if (cart.items.length === 0) throw PluginRouteError.badRequest("Cart is empty");

	// Gateway must exist and be configured before we touch stock
	const gatewayId = input.paymentGateway;
	initGateways({ http: requireHttp(ctx), kv: ctx.kv });
	const gateway = getGateway(gatewayId);
	if (!gateway) throw PluginRouteError.badRequest(`Unknown payment gateway: ${gatewayId}`);

	const billing = normalizeAddress(input.billingAddress);
	const shipping = input.shippingAddress ? normalizeAddress(input.shippingAddress) : null;
	const taxAddress = shipping ?? billing;
	const email = input.email.trim().toLowerCase();

	const priced = await priceCheckout(ctx, cart, taxAddress, input.shippingMethodId);
	const { summary, totals } = priced;
	if (summary.items.length === 0) throw PluginRouteError.badRequest("None of the items in the cart are available");
	if (totals.total <= 0) throw PluginRouteError.badRequest("Order total must be greater than zero");

	// Customer did their sums in the browser: refuse if the price moved since the quote
	if (input.expectedTotal !== null && input.expectedTotal !== totals.total) {
		throw PluginRouteError.conflict("Prices have changed since you reviewed your order. Please check the new total.", {
			total: totals.total,
		});
	}

	const customerId = await findOrCreateGuestCustomer(ctx, email, billing);

	// Reserve stock (released if anything below fails, or by the cleanup cron)
	const stockResult = await reserveStock(cart.items, {
		products: ctx.storage.products as StorageCollection<Product>,
		variants: ctx.storage.variants as StorageCollection<Variant>,
	});
	if (!stockResult.success) {
		throw PluginRouteError.conflict("Some items are out of stock", { items: stockResult.insufficientItems });
	}

	const now = new Date().toISOString();
	const orderId = ulid();
	const orderNumber = await generateUniqueOrderNumber(ctx);
	const appliedCoupons = summary.discountBreakdown.filter((d) => d.source === "coupon").map((d) => d.name);

	const order: Order = {
		orderNumber,
		status: "pending_payment",
		customerId,
		customerEmail: email,
		customerNote: input.customerNote ?? null,
		billingAddress: billing,
		shippingAddress: shipping,
		items: summary.items.map((item, idx) => ({
			productId: item.productId,
			variantId: item.variantId,
			name: item.name,
			sku: item.sku,
			quantity: item.quantity,
			unitPrice: item.unitPrice,
			originalPrice: item.originalPrice,
			total: item.lineTotal,
			taxAmount: totals.itemTax[idx],
			taxClassId: totals.itemTaxClassIds[idx],
			attributes: item.attributes,
		})),
		subtotal: totals.subtotal,
		shippingTotal: totals.shippingTotal,
		shippingMethod: input.shippingMethodId,
		shippingMethodName: priced.shippingMethodName,
		shippingTax: totals.shippingTax,
		taxTotal: totals.taxTotal,
		taxBreakdown: totals.taxLines,
		taxInclusive: totals.taxInclusive,
		discountTotal: totals.discountTotal,
		discountBreakdown: summary.discountBreakdown,
		couponCodes: appliedCoupons,
		total: totals.total,
		currencyCode: cart.currencyCode,
		paymentMethod: gatewayId,
		paymentIntentId: null,
		paymentCaptureId: null,
		paymentStatus: "pending",
		cartId,
		refunds: [],
		adminNotes: [],
		ipAddress: ctx.requestMeta?.ip ?? null,
		customFields: {},
		createdAt: now,
		updatedAt: now,
		completedAt: null,
	};
	await orders(ctx).put(orderId, order);

	let payment;
	try {
		payment = await gateway.createPaymentIntent({
			amount: totals.total,
			currency: cart.currencyCode,
			orderId,
			orderNumber,
			customerEmail: email,
			metadata: {},
		});
	} catch (err) {
		ctx.log.error("Payment provider rejected payment creation", { orderId, gateway: gatewayId, error: String(err) });
		await cancelUnpaidOrder(ctx, orderId, `Payment could not be started (${gatewayId})`);
		throw PluginRouteError.badRequest("We couldn't start the payment. Please try again or use another payment method.");
	}

	await orders(ctx).put(orderId, { ...order, paymentIntentId: payment.intentId, updatedAt: new Date().toISOString() });

	return {
		orderId,
		orderNumber,
		total: totals.total,
		currencyCode: cart.currencyCode,
		paymentGateway: gatewayId,
		clientSecret: payment.clientSecret,
	};
}

// ─── Confirm ────────────────────────────────────────────────────

/**
 * Public: called by the browser after the customer completes payment (and by
 * the order confirmation page). Verifies the payment with the provider; the
 * request body is only used to identify the order.
 */
export async function checkoutConfirmHandler(ctx: RouteContext<CheckoutConfirmInput>) {
	const { orderId, paymentIntentId } = ctx.input;

	const order = await orders(ctx).get(orderId);
	if (!order) throw PluginRouteError.notFound("Order not found");
	if (!order.paymentIntentId || (paymentIntentId && paymentIntentId !== order.paymentIntentId)) {
		throw PluginRouteError.badRequest("Payment does not belong to this order");
	}

	if (order.status !== "pending_payment") {
		return confirmResponse(orderId, order);
	}

	initGateways({ http: requireHttp(ctx), kv: ctx.kv });
	const gateway = getGateway(order.paymentMethod);
	if (!gateway) throw PluginRouteError.internal("Payment gateway unavailable");

	let verification;
	try {
		verification = await gateway.finalizePayment(order.paymentIntentId);
	} catch (err) {
		ctx.log.error("Payment verification failed", { orderId, error: String(err) });
		throw PluginRouteError.internal("We couldn't verify your payment yet. Please refresh in a moment.");
	}

	if (verification.status === "succeeded") {
		const { order: updated } = await markOrderPaid(ctx, orderId, {
			source: "confirm",
			amount: verification.amount,
			currency: verification.currency,
			captureId: verification.captureId,
		});
		return confirmResponse(orderId, updated ?? order);
	}

	if (verification.status === "failed") {
		await recordPaymentFailure(ctx, orderId, verification.reason ?? "Payment failed");
		const latest = (await orders(ctx).get(orderId)) ?? order;
		return { ...confirmResponse(orderId, latest), message: verification.reason ?? "Payment failed" };
	}

	return confirmResponse(orderId, order);
}

function confirmResponse(orderId: string, order: Order) {
	return {
		orderId,
		orderNumber: order.orderNumber,
		status: order.status,
		paymentStatus: order.paymentStatus,
		paid: order.paymentStatus === "captured",
	};
}

// ─── Helpers ────────────────────────────────────────────────────

function normalizeAddress<T extends Address>(a: T): Address {
	const clean = (v: string | null | undefined) => {
		const t = v?.trim();
		return t ? t : null;
	};
	return {
		firstName: a.firstName.trim(),
		lastName: a.lastName.trim(),
		company: clean(a.company),
		addressLine1: a.addressLine1.trim(),
		addressLine2: clean(a.addressLine2),
		city: a.city.trim(),
		stateCode: clean(a.stateCode)?.toUpperCase() ?? null,
		postalCode: a.postalCode.trim().toUpperCase(),
		countryCode: a.countryCode.trim().toUpperCase(),
		phone: clean(a.phone),
	};
}

function generateOrderNumber(): string {
	const now = new Date();
	const year = now.getFullYear().toString().slice(-2);
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const random = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
	return `EM-${year}${month}-${String(random).padStart(6, "0")}`;
}

async function generateUniqueOrderNumber(ctx: PluginContext): Promise<string> {
	for (let i = 0; i < 5; i++) {
		const candidate = generateOrderNumber();
		const clash = await orders(ctx).count({ orderNumber: candidate });
		if (clash === 0) return candidate;
	}
	return `EM-${ulid()}`;
}

/**
 * Link the order to a customer record, creating one for first-time guests.
 *
 * Guests are identified only by the email they typed, so we never apply an
 * existing customer's group pricing here — that would let anyone who knows a
 * wholesale customer's email get their prices.
 */
async function findOrCreateGuestCustomer(ctx: PluginContext, email: string, billing: Address): Promise<string> {
	const customers = ctx.storage.customers as StorageCollection<Customer>;
	const existing = await customers.query({ where: { email }, limit: 1 });
	if (existing.items[0]) return existing.items[0].id;

	const groups = await (ctx.storage["customer-groups"] as StorageCollection<CustomerGroup>).query({ limit: 100 });
	const defaultGroup = groups.items.find((g) => g.data.isDefault);
	const now = new Date().toISOString();
	const id = ulid();
	const addressId = ulid();
	const customer: Customer = {
		userId: null,
		email,
		firstName: billing.firstName,
		lastName: billing.lastName,
		phone: billing.phone,
		groupId: defaultGroup?.id ?? null,
		addresses: [{ ...billing, id: addressId, label: "Billing" }],
		defaultBillingAddressId: addressId,
		defaultShippingAddressId: null,
		totalOrders: 0,
		totalSpent: 0,
		note: null,
		customFields: {},
		createdAt: now,
		updatedAt: now,
	};
	try {
		await customers.put(id, customer);
		return id;
	} catch (err) {
		// Unique email violation from a concurrent checkout — use the winner
		const retry = await customers.query({ where: { email }, limit: 1 });
		if (retry.items[0]) return retry.items[0].id;
		throw err;
	}
}
