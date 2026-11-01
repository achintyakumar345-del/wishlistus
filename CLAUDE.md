# Project vision

- **What it is:** Wishlistus is a Shopify wishlist app I'm building to take from idea to a Shopify App Store listing, published under my own Partner account. Free at launch.
- **Differentiator:** merchants get full control over how the wishlist looks and behaves (toast messages, icon animations, colours, text, etc.) from a Settings page in the app admin, plus real tracking/analytics. No theme code editing needed.
- **Current architecture:**
  - Theme app extension `extensions/wishlist-button`: heart button block, wishlist page block, `assets/wishlist.js`, `assets/wishlist.css`.
  - App proxy `/apps/wishlist` → `app/routes/wishlist-proxy.jsx` stores each logged-in customer's list in the customer metafield `wishlistus.items` (JSON array of product handles).
  - Guests use `localStorage`, merged into their account list on login.
  - Admin dashboard at `app/routes/app.wishlists.jsx`.
- **Planned:**
  - Merchant settings saved to a shop metafield and read by the storefront.
  - Wishlist add/remove events stored in the app's own database (Prisma) for analytics at scale.
- **How to work with me:** I'm a PM learning to build, not a developer. Explain changes in plain language, make one feature at a time, and use Polaris web components and the Shopify docs MCP.

@AGENTS.md
