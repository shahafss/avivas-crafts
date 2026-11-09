# Contract: Page Routes (URLs)

> **Living document.** Moved from `specs/001-online-crafts-shop/` on 2026-11-09. Every feature that
> changes this contract updates this file in its own branch. Unqualified references to `spec.md`,
> `plan.md`, `research.md` (R-numbers), `quickstart.md`, FR-/SC- numbers and task IDs mean the
> ones in [`specs/001-online-crafts-shop/`](../../specs/001-online-crafts-shop/) unless a later
> spec is named.

Every public page exists under both `/he/...` (default, RTL) and `/en/...` (LTR) (FR-041,
FR-043). Each page emits `<link rel="alternate" hreflang>` for the other language and a
canonical URL. The language switch links to the same path in the other locale (FR-042).

## Public storefront (`src/app/[locale]/(shop)/`)

| Path | Page | Data shown | Notes |
|---|---|---|---|
| `/` | redirect | — | 307 to `/{NEXT_LOCALE cookie or he}` |
| `/{locale}` | Home / catalog | published products (main photo 800w, name, price in ₪, "not available to order" label), category links; sort `newest` (default) / `price-asc` / `price-desc` via `?sort=` | empty catalog → friendly message; price sorts use the ₪ base price (research.md › R18) |
| `/{locale}/c/{categorySlug}` | Category | published products in category; sort `newest` (default) / `price-asc` / `price-desc` via `?sort=` | empty category → friendly message; unknown slug → 404; price sorts use the ₪ base price |
| `/{locale}/search?q=` | Search | published products whose name/description (he or en) contains `q` (1–80 chars, trimmed) | FR-010 |
| `/{locale}/p/{productSlug}` | Product | all photos (zoom), name, description, price (updates with options), option selectors (only if groups exist), prep time, orderable state, add-to-cart | `generateMetadata` → Open Graph image (800w), title, `og:description` starting with the price, price tags (FR-049). Hidden/draft/deleted → "not available" page, HTTP 404 |
| `/{locale}/cart` | Cart | lines from `priceCart`, quantities, remove, running total, flags | |
| `/{locale}/checkout` | Checkout | form (FR-013), delivery choice, live totals, order summary with each item's preparation time, payment choice, terms checkbox, marketing checkbox (unticked), collection notice | inputs are kept in `sessionStorage` (`ac_checkout`) and restored when the visitor comes back (e.g. with the browser's back button from the payment page); retry and switch-to-offline after a failed payment happen on the return page (US2 #5) |
| `/{locale}/checkout/return?c={token}&r=success\|failure` | Payment return | spinner → confirmed (redirect to order page) / failed (retry or switch to offline) | never marks paid itself; triggers server-side status check |
| `/{locale}/order/{token}` | Order confirmation | order number, items, totals, payment state, offline instructions (if offline), pickup instructions (if pickup), each item's prep time (order_line snapshot) | token valid 30 days; no address/phone shown; clears `ac_checkout`, and clears the cart when the order was created less than an hour ago |
| `/{locale}/pages/{slug}` | Content page | `about`, `privacy`, `terms`, `cookies`, `shipping-returns`, `accessibility` | `cookies` also renders the device-storage table |
| `/{locale}/contact` | Contact | contact form (name, email, message) + business details | FR-048 |
| `/{locale}/checkout/fake-pay?page={id}` | Fake payment page | Pay / Fail / Pay-and-close buttons | **development and test only** (`PAYMENT_PROVIDER=fake`, never in production) |
| `/sitemap.xml`, `/robots.txt` | SEO | published products, categories, content pages in both locales | admin paths disallowed |

Header brand, home h1, `<title>` and the © line use the shop name (`shop_settings.shop_name_*`).
Footer on every public page: shop name, legal business name, address, registration number, email, phone (FR-047), links to
all content pages and Contact, language switch, and a "cookie settings" link **only when** an
optional cookie category is enabled (FR-037a).

## Admin (`src/app/admin/`, Hebrew only, `dir="rtl"`)

All paths except the sign-in group require a `full` admin session; the check is done by
`requireAdmin()` in the protected layout **and** inside every Server Action / loader. Signed-out
requests redirect to `/admin/sign-in?next=<requested admin path>` and render no admin data (SC-007);
after Google + passkey the admin lands on that path (a validated same-origin admin path, otherwise
`/admin`). Admin links opened from another site (notification emails) pass through a one-step
same-site re-navigation so the Strict session cookie is sent (http-endpoints.md › Same-site bounce).
Unknown admin paths show a Hebrew not-found page (`src/app/admin/not-found.tsx`) — to signed-out
visitors only after the sign-in redirect. All admin responses carry
`Cache-Control: no-store` and `X-Robots-Tag: noindex`.

| Path | Purpose |
|---|---|
| `/admin/sign-in` | "Sign in with Google" button (passes a valid `next` on in a hidden field); error messages (not approved, blocked) |
| `/admin/sign-in/passkey` | step 2 (requires `pending_passkey` session) |
| `/admin/sign-in/recovery` | enter a recovery code, then register a new passkey |
| `/admin/setup#t={token}` | first-passkey enrolment from a setup link → Google → passkey → recovery codes shown once; the token is in the URL fragment (never sent to the server or its logs) and is posted to `/api/auth/google/start` by the page |
| `/admin` | dashboard: new orders count, awaiting-payment count, quick links |
| `/admin/products` | list (all states), filters by state/category, "new product" |
| `/admin/products/{id}` | product editor ("מוצר חדש" on the list creates a draft and opens it here): fields, photos (upload, reorder up/down, main, remove), options, state buttons, delete |
| `/admin/categories` | list, add, rename, reorder, remove |
| `/admin/orders` | list newest first, filters `status`, `payment` (FR-027) |
| `/admin/orders/{id}` | detail, status buttons, mark paid / refunded, tracking/pickup note, cancel, history, edit customer details |
| `/admin/customers` | search by email or phone (form POST, so emails/phones never appear in URLs) → orders, export JSON, withdraw marketing consent, anonymise (FR-039) |
| `/admin/settings` | shop name (he/en), payment methods, offline instructions, delivery per zone, pickup instructions, business details, notification emails |
| `/admin/content` and `/admin/content/{slug}` | edit content pages he/en with preview |
| `/admin/stats` | visits over time, top products, top referrers (FR-037) |
| `/admin/security` | admins list (add/remove, setup link), passkeys of every admin (add own / remove any / approve or reject a recovery passkey), my sessions, sign out all devices, regenerate recovery codes; every change except ending sessions asks for the passkey again unless it was confirmed in the last 5 minutes |
| `/admin/activity` | activity log, newest first, filter by action type |
