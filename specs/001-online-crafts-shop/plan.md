# Implementation Plan: Aviva's Crafts Online Shop

**Branch**: `001-online-crafts-shop` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-online-crafts-shop/spec.md`

**Status**: Approved by the maintainer at the Phase B gate (2026-11-07). The storefront design
was shaped and approved on 2026-11-08 (`design/storefront.md`), adding one nullable column
(`option_value.swatch`, a fixed 12-colour palette) and no dependency, font or service; tasks.md
was regenerated to carry it. After plan-review round 2 the user decided (2026-11-08) that
recovery always needs the other admin (the 24-hour restricted mode is dropped) and that the shop
name is a separate setting from the legal business name; after round 3 the user chose a passkey
re-check before security changes (ASVS 5.0 V7.5) and pnpm 12.6.0; after round 4 the user accepted
(2026-11-08) the single-database-role fallback as an exception to constitution IV, synced Android
passkeys as a residual risk, automatic replacement of a removed admin's sole notification address,
and no passkey re-check for ending sessions; the artifacts were revised accordingly.
Phase C not started.

## Summary

A bilingual (Hebrew-first, RTL; English LTR) online shop for handmade wool crafts, with a guest
checkout (online payment through an Israeli payment provider's hosted page, or offline payment
confirmed by the owner), shipping or self-pickup, and a mobile-friendly Hebrew admin area
protected by Google sign-in plus a passkey.

Technical approach: one **Next.js 16 / TypeScript** application on **Render** (Frankfurt) with
**PostgreSQL 17** (Drizzle ORM), product images processed by **sharp** (re-encoded, metadata
stripped) and stored on **Cloudflare R2** (separate private and public buckets),
**PayPlus** hosted payment page behind a swappable adapter with double server-side verification
(signed callback + authenticated status query, plus a recovery sweep),
**Resend** for transactional email through a transactional outbox, a built-in cookieless
statistics counter, and a custom two-step admin auth (openid-client + SimpleWebAuthn).
Estimated running cost ≈ ₪58/month plus the payment provider's monthly fee (see *Cost*).

## Technical Context

**Language/Version**: TypeScript 6.0 (strict; typescript-eslint 8 supports <6.1) on Node.js 24 LTS

**Primary Dependencies** (runtime; each justified in *Dependencies*): next 16, react 19,
next-intl, drizzle-orm + postgres (postgres.js), zod, sharp, heic-decode, @aws-sdk/client-s3, openid-client, @simplewebauthn/server + @simplewebauthn/browser,
resend, markdown-it, libphonenumber-js, tailwindcss 4 (build-time)

**Storage**: PostgreSQL 17 (Render managed, Basic-256mb, EU-Frankfurt); Cloudflare R2 buckets
`ac-images-private`, `ac-images-public`, `ac-backups` (EU jurisdiction); visitor device:
`localStorage` cart and a language cookie only

**Testing**: Vitest (unit + integration on PGlite, plus real-PostgreSQL concurrency tests),
Playwright (E2E, Chromium desktop + mobile, WebKit mobile for the storefront specs, virtual WebAuthn
authenticator, mock OIDC issuer, fake payment provider), @axe-core/playwright,
OWASP ZAP baseline before launch

**Target Platform**: Linux container on Render (Node server); browsers: last 2 versions of
Safari iOS, Chrome Android, Chrome/Edge/Firefox/Safari desktop

**Project Type**: Web application (single full-stack Next.js project)

**Performance Goals**: product and catalog pages usable within 3 s on mobile 4G (SC-005);
order notification within 1 min of confirmation (SC-003); first-load JS on storefront pages
≤ 150 KB gzipped, checkout ≤ 155 KB (user decision 2026-11-09)

**Constraints**: running cost < ₪100/month excluding per-transaction fees (SC-011); no card data
ever touches the shop; 512 MB RAM instance (image processing serialised); only strictly
necessary device storage at launch; WCAG 2.1 AA in RTL and LTR

**Scale/Scope**: 2 admins (the maintainer and the owner, both always present); up to a few hundred products; up to a few hundred
orders per month; ~25 public routes × 2 locales, ~15 admin screens

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| # | Principle | Status | How the design meets it |
|---|---|---|---|
| I | Hebrew-first, bilingual | ✅ | next-intl, `/he` default + `/en`; `<html lang dir>` per locale; all strings in `he.json`/`en.json` with a key-parity test and a lint rule against literal UI strings; logical CSS properties for true LTR; owner content `_he` required / `_en` optional with Hebrew fallback (data-model); admin Hebrew-only but still translated-string based; emails rendered per order locale. |
| II | Non-technical owner | ✅ | Admin screens designed mobile-first, plain Hebrew; photo upload from phone camera roll with automatic processing; reorder photos with large up/down buttons (no drag precision); confirmation dialogs on every destructive action (server also requires `confirm: true`); clear success/error toasts; publishing errors name the missing field; usability walkthrough task with SC-001 timing. |
| III | Frictionless guest shopping | ✅ | No customer accounts at all; checkout collects exactly the FR-013 fields; cart in localStorage; mobile-first storefront; retry/switch payment without re-entering details. |
| IV | Security by design (ASVS L2) | ✅ | See *Security design (ASVS 5.0 L2)* below: no card data (hosted page + signed callback + server-to-server status query), Google + passkey admin 2FA with allowlist, throttling, expiring/revocable sessions, nonce CSP + HSTS + secure cookies, CSRF via Origin checks, Zod validation + parameterised ORM, sharp re-encoding with metadata stripping, separate non-executing image storage, secrets in Render secret store, pinned + audited dependencies, rate limits + honeypot, security event log without personal data, encrypted off-site backups + restore test. **Note**: constitution 1.3.0 (IV relaxed at the maintainer's request, 2026-11-08) explicitly allows what this plan does: payment confirmation by the signed callback or an authenticated status query, one database account for the app, passkeys synced through Google Password Manager, and recording which admin acted in the activity log. Google 2-Step Verification on admin accounts cannot be enforced by the shop; it is a launch-checklist step and a residual risk. |
| V | Simplicity and low cost | ✅ | One deployable, one database, no queue/cache services; built-in statistics instead of a paid tool; ≈ ₪58/month infra. Each paid service and dependency justified below; complexity items recorded in *Complexity Tracking*. |
| VI | Tested critical paths | ✅ | Tests planned for: order path (online + offline), payment confirmation (signature, idempotency, mismatch, race), admin product CRUD, admin auth incl. passkey/recovery/throttling, access control on every admin route (enumerated), cookie consent (launch + enabled modes), language switching. Test tasks precede implementation in tasks.md. |
| VII | Privacy and legal by default | ✅ | See *Privacy and legal compliance* below: personal-data register with purpose + retention per field (data-model), 7-year automatic anonymisation, export/correct/anonymise tools, cookieless first-party stats, consent mechanism ready but dormant, separate unticked marketing checkbox, legal page drafts (he/en), processor list, EU hosting, Amendment 13 documentation drafts. |

**Result: PASS** against constitution 1.3.0. Complexity items that are not violations but go beyond the
most basic approach are recorded in *Complexity Tracking* for transparency.

## Security design (OWASP ASVS 5.0, Level 2)

| ASVS chapter | Relevant? | How it is met |
|---|---|---|
| V1 Encoding & Sanitization | Yes | React escapes output by default; `dangerouslySetInnerHTML` allowed in exactly two components (lint rule): `ui/Markdown` (markdown-it output with HTML disabled) and `shop/JsonLd` (`JSON.stringify` output with `<` escaped); emails escape all interpolations; JSON-LD built with `JSON.stringify` + `<` escaping; no raw SQL (Drizzle parameterised; a lint rule forbids `sql.raw`). |
| V2 Validation & Business Logic | Yes | Zod schemas on every Server Action/route; server re-prices every cart (client prices never trusted); state machines for product/order/payment/pending checkout enforced server-side; quantity 1–20, ≤ 50 lines; rate limits on checkout, contact, sign-in, beacon; amount + currency match required to confirm payment. |
| V3 Web Frontend Security | Yes | Nonce CSP with `strict-dynamic`, `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`, no inline styles; HSTS; `nosniff`; Referrer-Policy; Permissions-Policy; COOP; every cookie Secure + HttpOnly + SameSite (admin: `__Host-` prefix, Strict; the Google callback hands over via a same-site page so the Strict cookie is sent, and an admin page link opened from another site — e.g. the order link in a notification email — gets the same one-step same-site re-navigation from the proxy (no session is read, nothing is granted), while a signed-out visit returns to the requested admin page after sign-in through a validated same-origin `next` path); `form-action 'self'` + the payment host, and on `/admin/sign-in*` and `/admin/setup` also the OIDC issuer's origin, because Chromium applies `form-action` to the `303` after the Google sign-in form POST; `'unsafe-eval'` in `script-src` only in development (React dev build); no third-party scripts; self-hosted fonts. |
| V4 API & Web Service | Yes | Route handlers validate `Content-Type` and size; same-origin `Origin` check on all cookie-authenticated POST handlers; Server Actions' built-in Origin check with `allowedOrigins` = shop domain; webhook authenticated by signature + status query. Deliberately without an Origin check (no cookies read, no customer-visible state changed by the caller): the payment callback (provider signature instead), `POST /api/v` (cookieless beacon; only increments aggregate counters; rate-limited) and `GET /api/payments/status` (can confirm a payment only from the provider's own verified status; rate-limited); `GET /api/locale` is covered in *Risks*. |
| V5 File Handling | Yes | Uploads admin-only, ≤ 20 MB, ≤ 51,000,000 pixels (50 MP phone photos such as 8160×6144 fit), type detected from content, re-encoded to WebP, metadata stripped, originals never stored, random object keys, public copies served from a separate storage origin with fixed `Content-Type` and `nosniff`; private (draft, order) images only through an authenticated admin route; ≤ 12 images per product. |
| V6 Authentication | Yes | Two factors: Google OIDC (allowlist, `email_verified`, bound `sub`) + WebAuthn passkey (`userVerification: required`, PIN sufficient); no passwords; recovery codes (60-bit, scrypt-hashed, single use) with **hardened recovery**: a passkey added via a recovery code stays `pending_approval` until another admin approves it, with alerts to all admins; when no other admin with an active passkey exists, recovery with a code is refused and the maintainer restores access with `pnpm admin:reset` (server-side CLI, new setup link) — the shop always has two admins (user decision 2026-11-08); setup links for first passkey; throttling 5 fails/15 min (abandoned passkey steps count) + notification; all auth events logged. |
| V7 Session Management | Yes | 256-bit random opaque token, stored hashed; rotated after each auth step; idle 30 min, absolute 12 h; pending-2FA session limited to auth endpoints, 5 min; logout and "sign out everywhere"; sessions list per admin. **Re-authentication (V7.5.1/V7.5.2)**: `requireRecentAuth()` refuses security changes — add/remove admin, new setup link, add/remove/approve/reject passkey, regenerate recovery codes, clear another admin's sign-in block — unless the session's `reauth_at` (set by a passkey sign-in or by a passkey re-check through `/api/auth/reauth/*`, UV required) is less than 5 minutes old; failed re-checks count toward the passkey throttle (user decision 2026-11-08). Revoking a session and "sign out everywhere" are deliberately exempt: they only reduce access, and an admin whose re-checks are blocked must still be able to end sessions (user decision 2026-11-08). |
| V8 Authorization | Yes | Single role (admin) with identical permissions (FR-034); `requireAdmin()` called by every admin `page.tsx`, Server Action and route handler itself (not in the proxy, and not only in the protected layout, which Next.js does not re-run on client-side navigation; a static test enforces the page calls); automated tests enumerate all admin pages and API routes (E2E) and all admin Server Actions (integration) signed-out and in pending-2FA state. Public order page accessible only via 128-bit token. |
| V9 Self-contained Tokens | Partly | Only Google ID tokens (validated by openid-client: signature via JWKS, `iss`, `aud`, `exp`, `nonce`). No JWTs issued by the shop. |
| V10 OAuth & OIDC | Yes | Authorization-code flow with PKCE (S256), single-use `state` bound to a `__Host-` cookie, `nonce`, exact redirect URI registered, no implicit flow, scopes `openid email` only. |
| V11 Cryptography | Yes | Node `crypto` only: `randomBytes` for tokens, SHA-256 for token hashes, scrypt for recovery codes, HMAC-SHA256 for IP keys and form tokens; secrets ≥ 32 bytes from secret store; constant-time comparisons. |
| V12 Secure Communication | Yes | TLS by Render/Cloudflare (TLS 1.2+), HSTS; app → Postgres over Render private network with TLS; outbound calls (PayPlus, Resend, R2, Google) HTTPS only. |
| V13 Configuration | Yes | Secrets only in Render secret store/env, validated at startup by a Zod env schema (app refuses to start if missing); `.env*` git-ignored; `fake` payment provider refuses to load in production; source maps not served publicly; `X-Powered-By` disabled; dependencies pinned, `pnpm audit --audit-level=high` blocks CI; Renovate updates. |
| V14 Data Protection | Yes | Data minimisation (FR-013 fields only); personal-data register with retention; automatic anonymisation; pending-checkout copies cleared on confirmation; `Cache-Control: no-store` on admin, checkout and order pages; no personal data in logs or URLs (search uses POST; the setup-link token travels in the URL fragment, which browsers never send); the order page and payment-return links are capability URLs carrying a random token (the order link is emailed to the customer, so it must be a link): they show no address or phone, expire (order 30 days, return 48 h), are `no-store`, and leave the site with `Referrer-Policy: strict-origin-when-cross-origin`, but they do reach Render's request logs (personal-data register); encrypted backups (age, offline private key). |
| V15 Secure Coding & Architecture | Yes | Layered `src/server/*` modules with the data-access layer as the only DB entry point; threat model in `docs/security/threat-model.md`; least-privilege R2 tokens per bucket (app: read/write images buckets only; backup job: write backups + read private images); database: the single Render-provided account for app, migrations and backups (allowed by constitution IV 1.3.0). |
| V16 Logging & Error Handling | Yes | Structured JSON logger with an allow-list of fields (no emails, phones, addresses, tokens, IPs); security events (sign-ins, failures, blocks, admin changes, payment confirmations, signature failures) logged and stored in `admin_activity`; generic error pages; unhandled errors logged with a correlation id. |
| V17 WebRTC | No | Not used. |

OWASP Top 10 (2025) is covered by the rows above (access control V8, misconfiguration V13,
supply chain V13 + audit, crypto V11, injection V1/V2, insecure design V15 + threat model, auth
V6/V7, integrity V2 (payment verification) + V13, logging V16, exceptional conditions V16).

## Privacy and legal compliance (constitution VII)

| Requirement | Where met |
|---|---|
| Data minimisation, purpose + retention per field | data-model › *Personal data register*; checkout collects only FR-013 fields |
| Retention enforcement | daily job: 7-year order anonymisation (FR-040), pending checkouts 48 h (personal columns cleared at confirmation; unresolved payment mismatches 30 days), encrypted backups ≤ 12 months (stated in the Privacy Policy), outbox bodies on send / rows 30 days, rate-limit rows 24 h, activity log 2 years, consent records 2 years |
| Individual rights (find, export, correct, delete/anonymise) | `/admin/customers` (FR-039, SC-010) |
| Cookies: necessary only before consent; consent mechanism | device-storage registry + dormant consent banner that activates automatically (FR-037a); E2E test against the registry |
| Cookieless analytics | built-in aggregate counter (R10), no third party |
| Marketing consent (Communications Law 30A) | separate unticked checkbox, consent + date stored, owner can record a withdrawal per person without deleting orders (`withdrawMarketingConsent`), no sending in scope (FR-038) |
| Transparency pages in he/en | 7 content pages seeded with drafts (FR-046), footer business details incl. address (FR-047) |
| Collection notice at checkout (Privacy Protection Law s.11) | short notice beside the submit button linking to the Privacy Policy |
| Distance-selling disclosure + cancellation (Consumer Protection Law s.14C) | checkout shows seller identity, full price, delivery terms, each item's preparation time (order summary, from `priceCart` lines); confirmation email contains written disclosure + cancellation policy; contact form as online cancellation channel; terms acceptance required and recorded with version |
| Data Security Regulations (basic level) | drafts in `docs/privacy/`: database definition, security procedure, access list, incident response, annual review |
| GDPR-ready | EU hosting/processing, consent framework, rights tooling, processor list, international address format |
| Third parties listed and justified | Render, Cloudflare, PayPlus, Resend (customers); Google (admins only) — see *Paid services* and research R19 |
| Legal review before launch | launch checklist task; drafts clearly marked "draft — requires legal review" |

## Cost (monthly, at expected volume)

| Item | Service | USD | ₪ (×3.7) | Justification |
|---|---|---|---|---|
| App hosting | Render Web Service Starter (512 MB) | 7.00 | 25.9 | Always-on Node server needed for sharp and the job loop; managed TLS/deploys |
| Database | Render Postgres Basic-256mb + 1 GB storage | 6.30 | 23.3 | Managed Postgres with PITR, private network to the app |
| Backups | Render Cron Job (nightly, ~1 min) | 1.00 | 3.7 | Off-platform encrypted backups (constitution IV) |
| Bandwidth | Render Hobby 5 GB included; overage $0.15/GB | 0–1.50 | 0–5.6 | Images are on R2; optional Cloudflare proxy caches static assets |
| Images, backups storage | Cloudflare R2 (free tier: 10 GB, 1M writes, 10M reads) | 0 | 0 | Free egress, CDN, EU jurisdiction |
| DNS / CDN | Cloudflare Free | 0 | 0 | |
| Email | Resend Free (3,000/month) | 0 | 0 | Expected ≤ 1,000/month |
| Statistics | built-in | 0 | 0 | |
| Domain | `.co.il` or `.com`, ≈ ₪60/year | — | 5 | Spec assumes the family provides it |
| **Subtotal** | | **≈ 14.3–15.8** | **≈ 58–63** | |
| Payment provider monthly fee | PayPlus (confirmed by the user; pricing not published, quote pending) | ? | ? | Must be ≤ ~₪37 to stay under ₪100 total; if the quote is higher, switch adapters (Cardcom/Grow) before launch |

Per-transaction payment fees are excluded by SC-011. Growth headroom: Render Postgres storage
and Resend are the first limits; both have cheap next steps.

## Dependencies

Runtime dependencies (all pinned to exact versions, audited in CI):

| Package | Why it is needed | Simpler alternative rejected |
|---|---|---|
| next, react, react-dom | framework (R1) | — |
| next-intl | locale routing, message formatting, RTL/LTR (R5) | hand-rolled i18n: more code, worse plural/number formatting |
| drizzle-orm, postgres | parameterised DB access, migrations, row locks (R3) | raw `pg`: invites string-built SQL |
| drizzle-kit (dev) | migration generation | hand-written SQL migrations: error-prone |
| zod | one validation schema for client and server (V2) | manual validation: inconsistent |
| sharp | image decode/re-encode/metadata strip (R7) | none viable on Node |
| server-only | build-time guard that keeps server modules out of client bundles | convention alone: easy to break silently |
| heic-decode | decodes HEIC/HEIF photos from the owner's Android phone into raw pixels for sharp (R7); WebAssembly, no native code | rejecting HEIC: the owner's phone can save in that format; client-side conversion: heavier admin bundle and still needs server checks |
| @aws-sdk/client-s3 | R2 access (R8) | hand-rolled SigV4: risky |
| openid-client | certified OIDC relying party for Google (R6) | hand-rolled ID token validation: risky |
| @simplewebauthn/server, @simplewebauthn/browser | WebAuthn ceremonies (R6) | hand-rolled WebAuthn: very risky |
| resend | email API client (R9) | `fetch` to the REST API would also work; SDK kept because it is tiny and typed — may be replaced by `fetch` if the implementer prefers |
| markdown-it | safe rendering of owner-edited pages (R16) | WYSIWYG editor + sanitiser: much heavier |
| libphonenumber-js | correct Israeli and international phone validation (FR-014, FR-025) | regex: wrong for many valid numbers |
| tailwindcss (build) | utility CSS with logical properties for RTL/LTR | hand-written CSS: slower to build consistent RTL/LTR |

Dev/test only (never shipped to the server bundle; audited with the rest):

| Package | Why |
|---|---|
| typescript, @types/node, @types/react, @types/react-dom, @types/markdown-it | type checking (strict) |
| @tailwindcss/postcss | Tailwind 4's PostCSS integration used by Next.js |
| vitest | unit and integration tests |
| @electric-sql/pglite | in-process Postgres for fast integration tests without Docker |
| @playwright/test | E2E tests incl. virtual WebAuthn authenticator |
| @axe-core/playwright | automated WCAG 2.1 AA checks (constitution › Product Constraints) |
| oauth2-mock-server | local OIDC issuer standing in for Google in tests/dev |
| eslint, typescript-eslint, eslint-config-next | linting incl. Next.js rules |
| eslint-plugin-i18next | enforces "no hard-coded display text" (constitution I) |
| prettier | formatting |
| tsx | runs TypeScript scripts (seed, admin:add, migrations) |
| exifr | asserts that stored images carry no EXIF/GPS (SC-009) |

Deliberately **not** used: auth frameworks, UI component libraries, state managers, form
libraries, chart libraries, analytics SDKs, CAPTCHA services.

## Paid services and third parties

| Service | Receives personal data? | Purpose | Location |
|---|---|---|---|
| Render | Yes (all app data) | hosting, database, backups job | EU (Frankfurt) |
| Cloudflare | Visitor IP addresses in transit when images load from `img.`; client-side encrypted backups (no key held); the shop domain is DNS-only at launch, not proxied (user decision 2026-11-08), though Cloudflare may still carry page traffic as Render's own network provider — check Render's sub-processor list before the Privacy Policy is written (T112) | DNS, R2 storage, image CDN | R2 EU jurisdiction; global edge |
| PayPlus | Yes (name, email, phone for the payment page; card data entered by customer directly) | online payments | Israel |
| Resend | Yes (recipient email, email content) | transactional email | EU region (Ireland); US company |
| Google | Admins only (sign-in) | admin first factor | global |

## Project Structure

### Documentation (this feature)

```text
specs/001-online-crafts-shop/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R19
├── data-model.md        # Phase 1: tables, state machines, personal-data register
├── quickstart.md        # Phase 1: run + validation scenarios
├── contracts/           # Phase 1: routes, server actions, HTTP endpoints, payment adapter, emails, device storage
├── checklists/requirements.md
├── design/storefront.md # storefront design system: tokens, components, per-screen specs (binding for UI tasks)
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
package.json, pnpm-lock.yaml, tsconfig.json, next.config.ts, eslint.config.mjs,
drizzle.config.ts, vitest.config.ts, playwright.config.ts, compose.yaml, .env.example, render.yaml
src/
├── app/
│   ├── [locale]/
│   │   ├── layout.tsx                 # <html lang dir>, header, footer, language switch, consent gate
│   │   ├── (shop)/
│   │   │   ├── page.tsx               # catalog
│   │   │   ├── c/[slug]/page.tsx      # category
│   │   │   ├── search/page.tsx
│   │   │   ├── p/[slug]/page.tsx      # product (+ generateMetadata for share preview)
│   │   │   ├── cart/{page.tsx,actions.ts}
│   │   │   ├── consent/actions.ts
│   │   │   ├── checkout/{page.tsx,actions.ts,return/{page.tsx,actions.ts},fake-pay/{page.tsx,actions.ts}}
│   │   │   ├── order/[token]/page.tsx
│   │   │   ├── pages/[slug]/page.tsx
│   │   │   └── contact/{page.tsx,actions.ts}
│   ├── admin/
│   │   ├── layout.tsx                 # Hebrew RTL shell, noindex
│   │   ├── not-found.tsx              # Hebrew 404 for admin paths
│   │   ├── sign-in/…, setup/page.tsx
│   │   └── (protected)/
│   │       ├── layout.tsx             # requireAdmin()
│   │       ├── page.tsx               # dashboard
│   │       ├── products/…, categories/…, orders/…, customers/…,
│   │       ├── settings/…, content/…, stats/…, security/…, activity/…
│   │       └── [...rest]/page.tsx     # requireAdmin(), then notFound()
│   ├── api/
│   │   ├── payments/[provider]/callback/route.ts
│   │   ├── payments/status/route.ts
│   │   ├── auth/google/{start,callback}/route.ts
│   │   ├── auth/passkey/{options,verify,register/options,register/verify}/route.ts
│   │   ├── auth/{recovery,sign-out}/route.ts
│   │   ├── auth/reauth/{options,verify}/route.ts
│   │   ├── locale/route.ts            # language switch: sets NEXT_LOCALE, safe redirect
│   │   ├── test/advance-sessions/route.ts # APP_ENV=test only (404 otherwise)
│   │   ├── admin/images/route.ts          # upload
│   │   ├── admin/media/[...key]/route.ts  # authenticated private image delivery
│   │   ├── v/route.ts                 # stats beacon
│   │   └── health/route.ts
│   ├── dev-images/[...key]/route.ts   # development/test only: serves the fs public bucket
│   ├── test-optional.js/route.ts      # only with CONSENT_TEST_CATEGORY (consent tests)
│   ├── sitemap.ts, robots.ts, fonts.ts, globals.css
├── components/{shop,admin,ui}/        # presentational components, no hard-coded strings (storefront: design/storefront.md)
├── i18n/{routing.ts,request.ts,navigation.ts,messages/he.json,messages/en.json}
├── lib/
│   ├── money.ts                       # minor units, formatting per currency/locale
│   ├── i18n-fallback.ts, seo.ts       # Hebrew fallback {text, lang}; hreflang/canonical
│   ├── security-headers.ts            # static header values shared by next.config.ts and the proxy
│   ├── consent/registry.ts            # device storage registry + optional categories
│   ├── cart/                          # client cart store (localStorage)
│   └── validation/                    # shared Zod schemas (checkout, product, contact)
├── server/
│   ├── env.ts                         # Zod-validated environment
│   ├── db/{client.ts,schema/{catalog,commerce,admin,system,index}.ts,migrations/}
│   ├── auth/{session.ts,require-admin.ts,google.ts,passkeys.ts,recovery.ts,setup-links.ts,throttle.ts,admins.ts,next-path.ts}
│   ├── catalog/{products.ts,categories.ts,options.ts,images.ts,public-images.ts,public-queries.ts,search.ts}
│   ├── checkout/{pricing.ts,zones.ts,place-order.ts,form-token.ts,validate.ts}  # validate.ts: server-only phone check
│   ├── orders/{orders.ts,confirm-online-payment.ts,status.ts,snapshots.ts}
│   ├── payments/{provider.ts,payplus.ts,fake.ts,index.ts}
│   ├── email/{outbox.ts,sender.ts,layout.ts,drivers/{resend.ts,outbox-only.ts},templates/*.ts}
│   ├── storage/{storage.ts,r2.ts,fs.ts}
│   ├── images/{process.ts,queue.ts,heic-worker.mjs}  # sharp pipeline; unbundled HEIC worker
│   ├── privacy/{customers.ts,consent.ts,anonymize.ts,export.ts}
│   ├── analytics/{beacon.ts,stats.ts}
│   ├── content/{pages.ts,markdown.ts}
│   ├── settings/{settings.ts}
│   ├── activity/{log.ts,queries.ts}
│   ├── security/{headers.ts,admin-bounce.ts,rate-limit.ts,client-ip.ts,logger.ts,origin.ts,notify.ts}
│   └── jobs/{loop.ts,daily-maintenance.ts}
├── instrumentation.ts                 # starts job loop (Node runtime)
└── proxy.ts                           # Next.js 16 proxy: locale routing + CSP nonce + security headers + same-site bounce of cross-site admin links (no auth)
scripts/{admin-add.ts,admin-reset.ts,zone-add.ts,seed.ts,migrate.ts,oidc-mock.ts,dev-outbox.ts,fake-pay-replay.ts,
         check-image-metadata.ts,check-logical-css.ts,measure-image-memory.ts,measure-app-memory.ts}
ops/backup/{Dockerfile,backup.sh,README.md}, ops/dev/init-db.sql
docs/{security/threat-model.md,privacy/*.md,legal-drafts/*.md,launch-checklist.md,owner-guide-he.md}
tests/
├── unit/                              # pure functions (money, pricing, state machines, validation, i18n parity)
├── integration/                       # server modules on PGlite (orders, payments, auth, privacy, jobs)
├── integration-pg/                    # concurrency/locking tests on real PostgreSQL 17 (two connections)
├── e2e/                               # Playwright specs per user story + access control + consent
└── fixtures/{images/,oidc/,payments/}
```

**Structure Decision**: single Next.js project at the repository root (no separate
frontend/backend), because one deployable is the simplest secure option (principle V). Business
logic lives in `src/server/*` (server-only modules, importable by Server Actions and route
handlers), which keeps it unit-testable without the framework.

## Key flows

- **Online order**: checkout form → `placeOrder` (validate, re-price, rate limit) →
  `pending_checkout` → PayPlus page → callback (HMAC) + IPN query → `confirmOnlinePayment`
  (locked transaction, unique transaction id) → order + outbox → emails within seconds →
  browser return page polls `/api/payments/status` → confirmation page.
- **Offline order**: `placeOrder` → order `awaiting_payment` + outbox (instructions) →
  confirmation page; owner later `markOrderPaid`.
- **Admin sign-in**: `/admin/sign-in` → Google (PKCE, state, nonce) → allowlist + sub check →
  pending session → passkey assertion (UV required) → rotated full session → the validated `next`
  admin path (or `/admin`).
- **Publish product**: draft edits → images processed (sharp) into private bucket → publish
  validates fields → variants copied to public bucket → visible on the next request (no data cache).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Payment provider monthly fee breaks the budget | Adapter design; user confirms provider after quotes (gate question); Cardcom/Grow adapters are drop-in alternatives |
| PayPlus callback HMAC input ambiguity | Signature check plus mandatory IPN status query; five-minute recovery sweep for lost callbacks; sandbox verification is a launch-checklist item |
| Double payment (old page paid after retry/switch) | previous pages disabled via the provider API (*Disable Payment Link* and page expiry are verified in the PayPlus sandbox before launch, T130); if disabling is unavailable or fails, retry/switch still proceed and the fallback is detection: any extra paid transaction for the checkout (`second_payment`, paid after switching, mismatch, unknown reference) alerts the owner instead of creating an order, and the owner refunds it in the provider dashboard |
| `GET /api/locale` writes a cookie on a GET | it sets the cookie only when `Sec-Fetch-Site` is absent, `same-origin` or `none` (otherwise it redirects without setting it), redirects only to same-origin `/he` or `/en` paths, and changes no data |
| Someone holding an admin's Google account repeatedly triggers passkey blocks | residual risk: alerts tell admins to secure the Google account; another admin can clear a block; the attacker still cannot sign in |
| Synced Android passkeys live in the same Google account as the first factor | allowed by constitution IV 1.3.0: restoring them needs an old device's screen lock or the Password Manager PIN; 2-Step Verification on the admin Google accounts; every added passkey alerts all admins |
| Resend free plan caps at 100 emails/day | expected volume is far below it; the sender drains owner `new-order` and `security-alert` rows before customer emails; if the cap is reached, rows retry for 24 h and the failure is visible on the order page; Resend's paid plan is the next step |
| Deploying with vulnerable dependencies | Render deploys only after CI checks pass (`autoDeployTrigger: checksPass`), CI runs `pnpm audit --audit-level=high` |
| 512 MB instance OOM during image processing | sharp concurrency 1, serialised upload queue, 51,000,000-pixel limit; HEIC decoded in a short-lived worker thread terminated after each image (frees the WASM heap). Measured three times, natively (`linux/arm64` containers on the maintainer's Mac: same libvips/WASM memory profile, no emulation): the pipeline alone right after it is built (T025, early warning), the whole app — idle `next start` baseline plus an 8160×6144 JPEG and a ≥ 48 MP HEIC uploaded through `/api/admin/images` in a 512 MB container — at the end of the upload work in US1 (T052, the gate), and once more on the real 512 MB Render staging instance (T130). **Fallback (user decision 2026-11-08, after T025 measured 544 MB for a 50 MP HEIC)**: a lower pixel limit for HEIC/HEIF only (`HEIC_MAX_PIXELS`, about 12–16 MP, the phone's normal resolution), set in T052 as the largest value that passes the whole-app gate; JPEG/PNG/WebP keep 51,000,000 pixels |
| Render Hobby bandwidth (5 GB) | Images on R2; Cloudflare proxy for static assets if usage approaches the limit |
| Owner loses passkey device | multiple passkeys per admin, recovery codes approved by the second admin (FR-033/FR-034); both admins set up before launch (launch checklist); `pnpm admin:reset` by the maintainer as the last resort |
| Legal texts inaccurate | drafts only; legal review is a launch gate |
| Email deliverability | SPF/DKIM/DMARC on the domain; failures visible on the order page |

## Post-design Constitution Check

Re-evaluated after Phase 1 (data model and contracts): all seven principles still **PASS** (against constitution 1.3.0).
The data model names purpose and retention for every personal-data field; contracts enforce
`requireAdmin()` in every admin entry point and signature + status verification for payments;
the device-storage registry makes the cookie policy and consent tests mechanical. No new
violations were introduced.

## Complexity Tracking

No exceptions to the constitution (1.3.0). These items go beyond the most basic approach and are
recorded for transparency:

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Two R2 buckets (private + public) with copy-on-publish | Draft and hidden product photos must not be publicly reachable (SC-007) | One public bucket with unguessable keys still exposes drafts by URL |
| Transactional email outbox + job loop | Exactly-once order emails, retries, SC-003, FR-019 | Sending inline from the request loses emails on provider hiccups and duplicates on retries |
| `pending_checkout` separate from `order` | Failed/abandoned payments must not create orders or notifications (FR-019) and order numbers are not consumed by abandoned payments (Postgres sequences can still skip a number on rollback; that is harmless) | A single order table with a "pending" status leaks into admin lists and notifications |
| Hardened recovery (another admin approves every recovery passkey) | Google + recovery code are both phishable; the constitution requires a phishing-resistant factor for admin access (user chose to harden, 2026-11-07, and to always require the other admin, 2026-11-08) | Accepting it as an exception: a phished recovery would give full control. A 24-hour restricted session for a sole admin (the first design) was dropped: the shop always has two admins, and the restricted mode added code paths to every sensitive action |
| Setup links for first passkey | Prevents a stolen-but-approved Google account from enrolling its own passkey | Enrol on first Google sign-in: one factor would be enough to take over a new admin |
| Built-in statistics counter | Zero cost, zero third parties (FR-037) | Plausible ($9/month) uses a third of the budget; free third-party tools add a processor and a CSP exception |
| Nightly backup cron with age encryption | Off-platform encrypted backups (constitution IV) | Relying on Render PITR alone: 3-day window, same account as production |
