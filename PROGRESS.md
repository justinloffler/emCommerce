# emCommerce — Implementation Progress

## Phase 1: Foundation ✅
- [x] Plugin skeleton (package.json, tsconfig)
- [x] TypeScript types and interfaces (types.ts) — 25+ interfaces
- [x] Constants (currency codes, status enums, defaults)
- [x] Storage collections with indexes (storage.ts) — 15 collections
- [x] Product Zod schemas (schemas/products.ts)
- [x] Pricing Zod schemas (schemas/pricing.ts)
- [x] Product route handlers (handlers/products.ts) — CRUD for products, variants, categories, tags
- [x] Pricing route handlers (handlers/pricing.ts) — specific prices + catalog rules
- [x] Pricing engine core (engine/pricing-engine.ts) — specific > catalog > base with priority+specificity
- [x] Currency utilities (engine/currency.ts) — BigInt math, formatting
- [x] Plugin entry point wired up (index.ts)

**Milestone: Products and pricing rules editable via admin API. Pricing engine resolves prices.**

## Phase 2: Pricing Engine Polish ✅
- [x] Pricing cache (engine/pricing-cache.ts) — L1 in-memory + L2 KV-backed with generation counter
- [x] Order workflow state machine (engine/order-workflow.ts) — valid transitions, side effects
- [x] Inventory management (engine/inventory.ts) — reserve, release, adjust, low stock detection

**Milestone: Full engine layer complete.**

## Phase 3: Cart & Storefront ✅
- [x] Cart Zod schemas (schemas/cart.ts)
- [x] Cart engine (engine/cart-engine.ts) — price resolution, coupon application
- [x] Cart route handlers (handlers/cart.ts) — get, add, update, remove, coupon, address, shipping method
- [x] Client-side cart (client/cart.ts) — localStorage session, reactive event system
- [x] Astro building blocks: PriceDisplay, ProductCard, ProductGrid, AddToCart, CartDrawer, VariantSelector, ImageGallery, QuantityDiscountTable
- [x] Astro full pages: ProductListPage, ProductDetailPage, CartPage
- [x] Cart routes wired into index.ts

**Milestone: Visitors can browse products, manage carts, see quantity discounts.**

## Phase 4: Tax & Shipping ✅
- [x] Tax engine (engine/tax-engine.ts) — country/state/postal matching, compound taxes
- [x] Shipping engine (engine/shipping-engine.ts) — zone matching, 4 method types
- [x] Tax schemas (schemas/tax.ts) — tax classes + tax rules
- [x] Shipping schemas (schemas/shipping.ts) — zones, methods, public rates
- [x] Tax route handlers (handlers/tax.ts)
- [x] Shipping route handlers (handlers/shipping.ts)

**Milestone: Accurate tax and shipping calculation.**

## Phase 5: Checkout & Payments ✅
- [x] Payment gateway interface (payments/types.ts)
- [x] Stripe gateway (payments/stripe.ts) — intent, capture, refund, webhook
- [x] PayPal gateway (payments/paypal.ts) — orders API v2, capture, refund, webhook
- [x] Gateway registry (payments/gateway-registry.ts)
- [x] Checkout Zod schemas (schemas/checkout.ts)
- [x] Checkout route handlers (handlers/checkout.ts) — create order + payment intent, confirm
- [x] Webhook handlers (handlers/webhooks.ts) — Stripe + PayPal event processing

**Milestone: End-to-end purchase flow with Stripe and PayPal.**

## Phase 6: Orders, Customers & Emails ✅
- [x] Order Zod schemas (schemas/orders.ts)
- [x] Order route handlers (handlers/orders.ts) — list, get, status transitions, notes, refunds
- [x] Customer Zod schemas (schemas/customers.ts) — customers + groups
- [x] Customer route handlers (handlers/customers.ts) — CRUD for customers + groups
- [x] Configurable email system — 6 email types, each toggleable on/off in KV

**Milestone: Complete order lifecycle with email notifications.**

## Phase 7: Coupons ✅
- [x] Coupon Zod schemas (schemas/coupons.ts)
- [x] Coupon route handlers (handlers/coupons.ts) — CRUD
- [x] Coupon integration in cart engine — percentage, fixed_cart, fixed_product, free_shipping, BOGO

**Milestone: Full discount system.**

## Phase 8: Setup Wizard & Dashboard ✅
- [x] Settings Zod schemas (schemas/settings.ts)
- [x] Settings route handlers (handlers/settings.ts) — get, update, setup wizard steps
- [x] Dashboard route handlers (handlers/dashboard.ts) — stats, recent orders, low stock
- [x] Cron handlers (handlers/cron.ts) — cart cleanup, exchange rate sync, low stock alerts

**Milestone: Complete admin backend.**

## Test Site Setup ✅
- [x] Standalone test site at `E:/emdash/test-store/` (not in monorepo)
- [x] Plugin linked via `file:../emCommerce` in package.json
- [x] Node 22.15.0 (required by Astro 6 / emdash)
- [x] Database initialized (31 migrations), seeded
- [x] Dev server running on `http://localhost:4321/`
- [x] Admin panel at `/_emdash/admin` (302 → auth, correct)
- [x] Public storefront API verified: `POST /storefront/products` → `{"data":{"items":[],"hasMore":false}}`
- [x] Admin API auth-gated: `POST /settings/get` → `UNAUTHORIZED`

**To start the test site:**
```bash
cd E:/emdash/test-store
nvm use 22.15.0
npx astro dev
```

**To test:**
1. Open `http://localhost:4321/_emdash/admin` — create account via passkey/magic link
2. Navigate to emCommerce plugin pages in admin sidebar
3. `http://localhost:4321/shop` — storefront page (calls product API)

## Post-Phase Improvements ✅
- [x] Currency: admin UI uses dollar format ($19.99), converts to/from cents internally
- [x] Custom fields: user-defined fields for Products, Orders, Customers (Settings > Custom Fields)
  - Define fields with key, label, type (text/number/boolean/select/date/url/email/textarea)
  - Fields auto-render in entity create/edit forms
  - Stored in `customFields` record on each entity
  - Separate `custom-field-definitions` storage collection for schema
- [x] emdash API documented: plugin has access to content, media, users, http, email, kv, cron, log via PluginContext
- [x] External REST API (WooCommerce-style) — 17 endpoints at `api/v1/*`
- [x] Webhook system — register delivery URLs per topic, HMAC-SHA256 signatures

## emdash 1.3 / Astro 7 + Checkout ✅
- [x] Compatible with emdash 1.3.x / Astro 7 (capability names, types, KV without TTL)
- [x] Public storefront API returns allow-listed product views (active only, no cost/download data)
- [x] `storefront/config`, `storefront/checkout/quote` routes; `/server` helper for Astro pages
- [x] Checkout totals engine (per-class tax, inclusive tax extraction, discount allocation, shipping tax)
- [x] Payments verified server-side; signed webhooks; idempotent mark-paid with compare-and-set
- [x] Guest customers, coupon usage counts, customer stats, correct cart removal
- [x] Pending-order cleanup cron; stock released on failure/cancellation
- [x] CheckoutPage + OrderConfirmationPage components
- [x] Vitest suite (59 tests)

## Phase 9: Polish & Testing
- [x] Admin UI (admin.tsx) — full CRUD for all entities, internal nav, custom fields
- [ ] Unit tests for pricing engine
- [ ] Unit tests for cart engine
- [x] Unit tests for tax engine and checkout totals
- [ ] Unit tests for shipping engine
- [ ] Integration tests
- [ ] CSS styles file (styles/emcommerce.css)

---

## File Inventory (43 files)

### Core
- `package.json`, `tsconfig.json`
- `src/index.ts` — plugin descriptor + createPlugin
- `src/types.ts` — 25+ data model interfaces
- `src/constants.ts` — enums, currency meta, country mapping
- `src/storage.ts` — 15 storage collections

### Schemas (8 files)
- `src/schemas/products.ts`, `pricing.ts`, `cart.ts`, `checkout.ts`
- `src/schemas/orders.ts`, `customers.ts`, `coupons.ts`
- `src/schemas/shipping.ts`, `tax.ts`, `settings.ts`

### Handlers (10 files)
- `src/handlers/products.ts`, `pricing.ts`, `cart.ts`, `checkout.ts`
- `src/handlers/orders.ts`, `customers.ts`, `coupons.ts`
- `src/handlers/shipping.ts`, `tax.ts`, `settings.ts`
- `src/handlers/dashboard.ts`, `webhooks.ts`, `cron.ts`

### Engine (7 files)
- `src/engine/pricing-engine.ts`, `pricing-cache.ts`, `currency.ts`
- `src/engine/cart-engine.ts`, `tax-engine.ts`, `shipping-engine.ts`
- `src/engine/order-workflow.ts`, `inventory.ts`

### Payments (4 files)
- `src/payments/types.ts`, `stripe.ts`, `paypal.ts`, `gateway-registry.ts`

### Storefront (11 files)
- `src/astro/index.ts`
- `src/astro/PriceDisplay.astro`, `ProductCard.astro`, `ProductGrid.astro`
- `src/astro/AddToCart.astro`, `CartDrawer.astro`, `VariantSelector.astro`
- `src/astro/ImageGallery.astro`, `QuantityDiscountTable.astro`
- `src/astro/pages/ProductListPage.astro`, `ProductDetailPage.astro`, `CartPage.astro`

### Client (2 files)
- `src/client/cart.ts`, `index.ts`
