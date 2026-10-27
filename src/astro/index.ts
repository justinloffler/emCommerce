/**
 * Astro component exports for emCommerce.
 *
 * Building blocks and full pages for storefront rendering.
 */

// Building blocks
export { default as ProductCard } from "./ProductCard.astro";
export { default as ProductGrid } from "./ProductGrid.astro";
export { default as PriceDisplay } from "./PriceDisplay.astro";
export { default as QuantityDiscountTable } from "./QuantityDiscountTable.astro";
export { default as AddToCart } from "./AddToCart.astro";
export { default as CartDrawer } from "./CartDrawer.astro";
export { default as VariantSelector } from "./VariantSelector.astro";
export { default as ImageGallery } from "./ImageGallery.astro";

// Full pages
export { default as ProductListPage } from "./pages/ProductListPage.astro";
export { default as ProductDetailPage } from "./pages/ProductDetailPage.astro";
export { default as CartPage } from "./pages/CartPage.astro";
export { default as CheckoutPage } from "./pages/CheckoutPage.astro";
export { default as OrderConfirmationPage } from "./pages/OrderConfirmationPage.astro";
