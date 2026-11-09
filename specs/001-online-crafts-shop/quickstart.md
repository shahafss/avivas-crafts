# Quickstart & Validation Guide: Aviva's Crafts Online Shop

How to run the shop locally and prove each user story works. Design details live in
[plan.md](./plan.md), [data-model.md](./data-model.md) and [contracts/](./contracts/).

## Prerequisites

- Node.js 24 LTS: installed with nvm (24.22.2); the global default is still 22, so run
  `nvm use` in the repo (reads `.nvmrc`) before any command; and
  pnpm **12.6.0** through Corepack (`corepack enable pnpm`; pinned in `package.json` ›
  `packageManager`, the version Corepack already runs here). pnpm 12 settings live in
  `pnpm-workspace.yaml` (`saveExact`, `engineStrict`, `allowBuilds`).
- PostgreSQL 17 for local development, E2E and the real-Postgres concurrency tests: Docker
  (`docker compose up -d db` using the repo's `compose.yaml`, which creates `avivas_crafts_dev`,
  `avivas_crafts_e2e` and `avivas_crafts_test` for `DATABASE_URL_TEST`) on host port **5433**. The local Postgres.app here is version 18 and
  already uses 5432; use Docker to match production's 17.
- No external accounts are needed locally: storage, email, payment and Google sign-in all have
  local stand-ins (filesystem storage, `pnpm dev:outbox` to read queued emails, `fake` payment provider, mock OIDC issuer).
- For staging: Render account, Cloudflare account (DNS + R2), Resend account, PayPlus sandbox
  credentials, Google Cloud OAuth client.

## Setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local          # local defaults: STORAGE_DRIVER=fs, EMAIL_DRIVER=outbox, PAYMENT_PROVIDER=fake, OIDC issuer = local mock
pnpm db:migrate                      # applies drizzle migrations
pnpm db:seed                         # Israel zone, settings, content-page drafts, 2 categories, 3 sample products
pnpm dev:oidc                        # local mock Google issuer on :4011 (separate terminal; exits with Ctrl-C)
pnpm dev                             # http://localhost:3001: uses the port in APP_ORIGIN and exits with a message if it is busy; to change it, set APP_ORIGIN and IMAGE_PUBLIC_ORIGIN in .env.local
pnpm admin:add you@example.com "Test Admin"   # prints a one-time setup link
pnpm admin:add helper@example.com "Second Admin"  # recovery needs a second admin: before launch, always set up BOTH admins
```

## Automated checks

```bash
pnpm verify        # typecheck + lint (incl. no hard-coded UI strings) + unit/integration tests (+ real-Postgres tests when DATABASE_URL_TEST is set) + pnpm audit --audit-level=high
pnpm test:e2e      # builds once, starts the app against avivas_crafts_e2e, runs Playwright (Chromium desktop + mobile, WebKit mobile for storefront specs)
```

All commands exit on completion (no watch mode by default).

## Validation scenarios

Each scenario maps to a user story's Independent Test. Automated E2E specs are named in brackets.

### US1 — Owner manages products [`tests/e2e/admin-products.spec.ts`]

1. Open the setup link from `pnpm admin:add`, sign in through the mock Google page, register a
   passkey (Chrome virtual authenticator in tests; your device locally), save the recovery codes.
2. Create a product with three photos (one phone photo with GPS EXIF — the E2E test generates it;
   locally use any phone photo with location turned on), Hebrew name/description, price, category, preparation time;
   publish. **Expect**: it appears on `/he` with main photo, name and price; the public image
   files contain no EXIF/GPS (`pnpm check:image-metadata <url>`).
3. Change the price → new price on the product page; an earlier test order keeps its old price.
4. Hide → gone from catalog and search, direct link shows "not available" (404).
5. Mark "not available to order" → visible with label; the product page shows a "not available to order right now" notice instead of the add-to-cart button (design/storefront.md §7.12).
6. Add option group "צבע שיער" with "חום" and "בלונד" (+₪20) → product page requires a choice
   and shows ₪ + 20 for blonde.
7. Try to publish without photo/price → blocked with message naming the missing fields.
8. Upload a `.jpg`-named text file → rejected with a clear message.

### US2 — Guest orders [`tests/e2e/checkout-online.spec.ts`, `checkout-offline.spec.ts`]

1. Mobile viewport, anonymous: add two items, open cart (reload → cart still there), checkout with
   shipping + online payment (the order summary shows each item's preparation time). The `fake` provider page appears; click "Pay".
   **Expect**: confirmation page with order number and preparation time; outbox has the customer
   confirmation and owner notification; the order is **paid** (checked in the database by the E2E
   spec; in the admin orders screen once US3 is built).
2. Repeat with "Fail" on the fake provider page → no order in admin, no emails; retry or "switch to
   offline" works without re-typing details.
3. Self-pickup + offline payment → order **awaiting payment**; confirmation page and email show the
   payment instructions and order number; no delivery fee.
4. Subtotal below free-shipping threshold → flat fee added; above → free.
5. Submit with invalid email/phone or without accepting terms → field messages, no order.
6. Replay the same fake callback twice (`pnpm fake-pay:replay <pendingId>`) → still one order, one
   set of emails.
7. Staging only: one real sandbox payment through PayPlus (test card from PayPlus docs) →
   order marked paid from the server-to-server confirmation even if the browser tab is closed
   before returning.

### US3 — Owner handles orders [`tests/e2e/admin-orders.spec.ts`]

Place an offline order → owner notification in outbox → mark paid (date recorded) → status
"in preparation" → "shipped" with tracking number → customer email in the order's language
contains the tracking number. Cancel a paid order → confirmation dialog + refund reminder → mark
refunded. Filters by status and payment state work.

### US4 — Language [`tests/e2e/language.spec.ts`]

First visit `/` → `/he`, `dir="rtl"`. Switch to English on a product page → same product at
`/en/p/...`, `dir="ltr"`, cart kept. Close and reopen `/` → `/en`. Open an `/en/...` link in a
fresh context → English. Complete an English checkout → English emails. Product without English
text shows Hebrew text.

### US5 — Privacy, consent, legal [`tests/e2e/privacy.spec.ts`, `consent.spec.ts`]

1. Fresh context, launch config: browse + checkout → no banner, cookies/storage only those in the
   registry, zero requests to third-party hosts (except the payment page navigation), visit counted
   in admin stats.
2. `CONSENT_TEST_CATEGORY=analytics`: banner with equal Accept/Reject; `ac_test_optional` absent
   before choice and after Reject; present after Accept; "Cookie settings" link reopens the dialog.
3. Every footer legal link opens in he and en.
4. Admin → customers → search the test email → export JSON → "stop marketing emails" (orders kept,
   consent shown as withdrawn) → anonymise → order shows "נמחק",
   no email/phone/address remain.
5. Edit the About page → public page shows the new text.

### Security and constitution checks [`tests/e2e/admin-access.spec.ts`, `tests/integration/*`]

- Signed out, every admin page and admin endpoint (enumerated from the route manifest) →
  redirect/401 and no admin data in the response body (SC-007).
- Google step done but passkey not → still no admin data; 5 bad passkey attempts → blocked +
  security email; a Google sign-in left at the passkey step → counted as a failure + security email.
- Every admin Server Action called without a full session → sign-in redirect before any database
  access (`tests/integration/admin-actions-guard.test.ts`).
- Unapproved Google account → refused, security email, no email address stored.
- Security-screen changes (approve a passkey, remove an admin, new recovery codes…) ask for the
  passkey again after 5 minutes; the action then completes. Ending sessions (revoke one, sign out
  everywhere) never asks.
- Removing an admin takes their address off the notification list; if it was the only one, the
  remaining admin's email replaces it.
- An admin link opened from another site (the order link in a notification email) opens that page
  directly when signed in, and after Google + passkey when signed out.
- Recovery code + Google → a new passkey is registered as "waiting for approval", cannot sign in
  until the other admin approves it on the security screen; the code cannot be reused. With a
  single admin, recovery is refused with the "contact the maintainer" message and no code is used.
- Response headers on public and admin pages: CSP with nonce, HSTS, nosniff, frame-ancestors none,
  referrer policy, permissions policy; on `/admin/sign-in` the CSP `form-action` also allows the OIDC
  issuer.
- axe-core: no WCAG 2.1 AA violations on home, product, cart, checkout, confirmation, legal pages
  in both languages, and on the admin product editor and order page.

## Pre-launch checklist (from `docs/launch-checklist.md`)

- OWASP ZAP baseline scan of staging: no High/Critical (SC-009).
- `pnpm audit --audit-level=high` clean.
- Backup restored into a scratch database and verified (row counts, one order readable).
- Legal pages reviewed by a qualified legal professional; business details filled in.
- Google 2-Step Verification confirmed on every admin Google account; **two admins** (the
  maintainer and the owner) are set up, each with ≥ 1 passkey (2 recommended) and saved recovery
  codes.
- `curl -sI https://img.<domain>/<a public image>` shows `X-Content-Type-Options: nosniff`
  (Cloudflare Response Header Transform Rule) and `Content-Type: image/webp`.
- Lighthouse mobile on product and catalog pages: usable within 3 s on "Slow 4G" profile (SC-005).
