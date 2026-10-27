# emCommerce

> An AI wrote [emdash](https://github.com/emdash-cms/emdash). Then an AI wrote a plugin for it. You're looking at the result — two AIs doing their best, no human feelings were hurt in the making of this software.

**emCommerce** is a full-featured eCommerce plugin for [emdash CMS](https://github.com/emdash-cms/emdash). It brings advanced eCommerce capabilities — group pricing, catalog rules, quantity breaks, per-customer overrides, and a full checkout flow — to the emdash ecosystem, built on Astro 6+ and SQLite.

![Shop listing page](docs/screenshots/shop.png)

---

## Features

### Storefront
- **Product listing page** — grid layout, add-to-cart, price display, stock badge
- **Product detail page** — image gallery, quantity selector, in-stock indicator, SKU, description
- **Shopping cart** — server-side cart with quantity updates, line item delete, coupon code input, subtotal/total summary
- **Checkout** — 3-step flow (Contact → Shipping → Payment) with sticky order summary sidebar
- **Order confirmation** — post-purchase page with order number, item list, and totals

### Admin
- **Dashboard** — sales overview widget, recent orders, low stock alerts
- **Products** — full CRUD with type (simple/variable/virtual/downloadable/external), SKU, pricing, stock management, categories, tags, tax class, custom fields
- **Orders** — order list with status badges, status transitions, refund support, admin notes
- **Customers** — customer profiles with group assignment, custom fields, address book
- **Coupons** — percentage, fixed cart, fixed product, free shipping, and BOGO types; usage limits, date ranges, stacking rules
- **Pricing Rules**
  - *Specific Prices* — per-product/per-group/per-customer overrides with priority and specificity tiebreaker
  - *Catalog Rules* — category, tag, attribute, and price-range condition builder with AND/OR logic
  - *Customer Groups* — group management with default group auto-seeding
- **Shipping** — zone-based flat-rate methods; extensible `ShippingProvider` interface for live-rate carriers (ShipEngine built-in)
- **Tax** — tax classes, per-country/state rules, tax-inclusive pricing toggle
- **Settings** — tabbed: General (store info, custom field definitions), Payments (Stripe, PayPal, ShipEngine keys with masked display), API Keys (create/revoke with scoped permissions)

### Payments
- **Stripe** — Elements card UI, `confirmCardPayment` flow, webhook handler
- **PayPal** — JS SDK buttons, `createOrder`/`onApprove` flow
- Extensible `PaymentGateway` interface for additional providers

### Architecture
- All money stored as **integer cents** — no floats
- **Server-side cart** with session binding and expiry
- **Snapshot-on-order** — prices and product names copied at order time, immutable to catalog changes
- **KV for settings**, `StorageCollection` for entities — no raw SQL
- **Custom fields** on products, orders, and customers — definable in Settings
- **API keys** with SHA-256 hashing, scoped permissions, prefix display (`emck_...`)

---

## Installation

Requires **emdash 1.3+**, **Astro 6+** (tested on Astro 7) and **Node 22.12+**.

The package isn't published to npm yet, so install it straight from GitHub. It keeps the
`@emdash-cms/plugin-emcommerce` package name, so imports work as normal:

```bash
npm install github:justinloffler/emCommerce
```

```ts
// astro.config.mjs
import { emCommercePlugin } from "@emdash-cms/plugin-emcommerce";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [
        emCommercePlugin({ defaultCurrency: "AUD" }),
      ],
    }),
  ],
});
```

Plugin secret settings (Stripe/PayPal keys) need a valid `EMDASH_ENCRYPTION_KEY` in `.env`;
generate one with `npx emdash secrets generate`.

Add storefront pages to your Astro project. Server-side data comes from
`@emdash-cms/plugin-emcommerce/server` (see `createStorefront()`), and the bundled page components
live in `@emdash-cms/plugin-emcommerce/astro` (`ProductListPage`, `ProductDetailPage`, `CartPage`,
`CheckoutPage`, `OrderConfirmationPage`). Style them by setting the `--ec-color-*` CSS variables.

```
src/pages/shop/
  index.astro         ← product listing
  [slug].astro        ← product detail
  cart.astro          ← cart
  checkout.astro      ← checkout
  order-confirmation.astro
```

---

## TODO / Work in Progress

### Checkout & Payments
- [x] **Checkout flow** — quote → create order → Stripe Payment Element / PayPal Smart Buttons → server-side verification (`CheckoutPage`, `OrderConfirmationPage`)
- [x] Payments are verified with the provider server-side (the browser can't mark an order paid); webhooks require valid signatures (Stripe HMAC, PayPal verify API)
- [x] PayPal SDK loads with the store's real `client-id` and currency; orders are captured server-side
- [x] Guest checkout creates/links a customer record (by email, without granting that customer's group pricing)
- [x] Unpaid orders are resolved hourly: checked with the provider, then marked paid or cancelled with stock released
- [ ] **Not yet tested against live Stripe/PayPal sandboxes** — covered by unit tests with mocked provider APIs; needs a run with real test keys
- [ ] Customer accounts / authenticated checkout (group pricing for logged-in customers)
- [ ] Address validation
- [ ] Live carrier rates (ShipEngine) can be listed but not yet selected at checkout

### Emails
- [x] Order confirmation (on payment), shipping and refund emails are sent through emdash `ctx.email` when an email transport plugin is installed
- [ ] Abandoned cart and welcome emails not implemented
- [ ] Email templates are defined but not rendered/sent

### Tax
- [x] **Tax applied at checkout** — per-product tax classes, discounts allocated before tax, optional tax on shipping
- [x] Tax-inclusive pricing (e.g. GST) — tax is extracted, not added; summaries show "Includes $X GST"
- [ ] No VAT/GST number field

### Shipping
- [ ] **Live carrier rates (ShipEngine) not tested** — API key integration is built but unverified against real ShipEngine responses
- [ ] No tracking number field on orders
- [x] Shipping weight calculated from product/variant weights

### Pricing Engine
- [ ] Pricing cache invalidation on rule save is stubbed but not fully tested
- [ ] Quantity break display table on product page not implemented
- [ ] Multi-currency exchange rate sync cron exists but UI for managing rates is minimal

### Setup Wizard
- [ ] **Not implemented** — the 6-step onboarding wizard (store profile → product types → payments → shipping → tax → launch) is planned but not built; stores go straight to the admin

### Customers
- [ ] No customer account portal (order history, saved addresses)
- [ ] Customer registration/login on storefront not implemented
- [ ] Guest checkout does not create a customer record

### Orders
- [ ] No printable invoice/packing slip
- [ ] Bulk order status updates not implemented
- [ ] Order export (CSV) not implemented

### Products
- [ ] Variable products (variants) admin UI is incomplete
- [ ] Product image upload not connected to emdash media library
- [ ] Grouped and external product types not fully implemented

### General
- [x] Test suite (`npm test`) — tax, checkout totals, payment gateways, checkout/webhook flows, storefront visibility
- [ ] Pricing engine and cart engine unit tests
- [ ] No setup documentation beyond this README
- [ ] Storefront CSS is inline — no theme customization system

---

## Tech Stack

- [emdash CMS](https://github.com/emdash-cms/emdash) 1.3+ — Astro 6+/7, SQLite, plugin system
- [Stripe](https://stripe.com) — payment processing
- [PayPal JS SDK](https://developer.paypal.com/sdk/js/) — PayPal checkout
- [ShipEngine](https://www.shipengine.com) — live carrier rates (optional)
- [ulidx](https://github.com/perry-mitchell/ulidx) — sortable unique IDs
- [Zod](https://zod.dev) — schema validation

---

## Screenshots

### Shop
![Shop listing page](docs/screenshots/shop.png)

### Product Detail
![Product detail page](docs/screenshots/product.png)

### Cart
![Shopping cart](docs/screenshots/cart.png)

### Checkout
![Checkout — contact & shipping](docs/screenshots/checkout.png)

### Admin — Dashboard
![Admin dashboard](docs/screenshots/admin-dashboard.png)

### Admin — Products
![Admin products](docs/screenshots/admin-products.png)

### Admin — Orders
![Admin orders](docs/screenshots/admin-orders.png)

### Admin — Pricing Rules
![Admin pricing rules](docs/screenshots/admin-pricing.png)

---

*Built entirely by Claude. Maintained by whoever is brave enough.*
