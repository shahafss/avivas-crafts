# Threat model: Aviva's Crafts

Status: written for feature 006 (launch readiness). It describes the shop as it launches: Render
(Frankfurt), Cloudflare R2 and DNS, Resend, Google sign-in for the two admins, **offline payment
only** (`PAYMENT_PROVIDER=none`). It replaces the plan written for spec 001, which assumed
passkeys, recovery codes and card payment.

The bar is constitution principle IV: the **OWASP Top 10 (2025)**. Spec 001's ASVS table
(`specs/001-online-crafts-shop/plan.md` > Security design) is background only; since constitution
2.0 ASVS is guidance, not a requirement.

OWASP Top 10 (2025) items used below: A01 Broken Access Control, A02 Security Misconfiguration,
A03 Software Supply Chain Failures, A04 Cryptographic Failures, A05 Injection, A06 Insecure Design,
A07 Authentication Failures, A08 Software or Data Integrity Failures, A09 Security Logging and
Alerting Failures, A10 Mishandling of Exceptional Conditions.

## 1. Assets

| Asset | Where it lives | Why it matters |
|---|---|---|
| Customer data (name, phone, email, address, order contents, marketing consent) | Postgres tables `orders`, `pending_checkout`, consent records; order emails in the outbox until sent | Personal data under the Privacy Protection Law; kept only as long as its retention period (`docs/privacy/database-definition.*.md`) |
| Orders and their state (status, offline-payment-received flag, tracking number) | Postgres | Losing or forging an order costs the owner money; the shop is the record of sale |
| Admin sessions and the two admin identities | `session` and `user` tables, cookie `__Host-ac_admin`; the admins' Google accounts | An admin can read all customer data and change prices, content and orders |
| Product content and photos | Postgres (text), R2 public bucket (published photos), R2 private bucket (drafts, order photos) | Defacement or loss; photos can leak location if metadata is not stripped |
| Backups | R2 bucket `ac-backups`: encrypted daily and monthly database dumps, plain copies of both image buckets | A full copy of every asset above; the database dumps are encrypted, the image copies are not |
| Secrets | Render environment (`DATABASE_URL`, `SECRET_HMAC_KEY`, R2 tokens, `RESEND_API_KEY`, `GOOGLE_CLIENT_SECRET`), the backup **private** key (offline), the owner's account passwords | A leaked secret gives the same power as the service it opens |
| Shop domain and DNS | Domain registrar, Cloudflare DNS | A hijacked domain defeats every other control |

## 2. Trust boundaries

```
 [Visitor browser] --HTTPS--> [Render web service] --private network--> [Postgres]
 [Admin browser]   --HTTPS-->        |  \--HTTPS--> [Cloudflare R2: images]   (B3)
                                     |  \--HTTPS--> [Resend: email]           (B4)
                                     |  \--HTTPS--> [Google: sign-in only]    (B5)
 [Render cron backup job] --HTTPS--> [R2: ac-backups]  (writes) and [R2 image buckets] (reads)   (B6)
 [Render cron backup job] --private network--> [Postgres] (pg_dump)
 [Owner] --Render account + shell--> [Render web service] (admin:role, migrations)              (B7)
```

| # | Boundary | What crosses it | What protects it |
|---|---|---|---|
| B1 | Browser and shop | Every request: forms, uploads, cookies | TLS and HSTS, strict CSP, CSRF origin checks, server-side validation, rate limits |
| B2 | Shop and Postgres | All data | Render private network, `ssl: 'require'` in production, no public IP allow-list (`ipAllowList: []`), one database account (accepted, see section 5) |
| B3 | Shop and R2 | Image bytes | App token limited to the two image buckets; public bucket served from the `img.` subdomain of the shop domain with `nosniff`; private bucket reachable only through an authenticated admin route |
| B4 | Shop and Resend | Customer name, address, order contents in order emails | Sending domain with SPF, DKIM, DMARC; API key only in Render; Resend account has 2FA |
| B5 | Shop and Google | OAuth redirect, ID token | Authorization code with PKCE, `state` bound to a cookie, `nonce`, exact redirect URI, token checked by `openid-client`; Google receives no customer data |
| B6 | Backup job and R2 | Encrypted dumps, image copies | Three scoped tokens: the backup token writes only `ac-backups`; the images token only reads the two image buckets; dumps encrypted with age to a public key |
| B7 | Owner and Render | Shell, dashboard, secrets | Render account 2FA; this is the only way to make or remove an admin |

## 3. Flows, STRIDE, mitigations

Each row: the threat, the mitigation that exists in the shop, and the OWASP Top 10 (2025) item it
addresses. "004" marks what feature 004 changed (Google-only sign-in); "006" marks what this
feature added or changed.

### 3.1 Checkout (guest order, offline payment)

| STRIDE | Threat | Mitigation | OWASP |
|---|---|---|---|
| S | Someone orders in another person's name | Orders are guest orders with no account to take over; an order paid directly waits for payment, and the owner starts preparing it as agreed with the customer (Terms of Sale), so a false order costs little | A06 |
| T | The browser sends changed prices or quantities | The server re-prices every cart; quantity 1 to 20, at most 50 lines; Zod validation on every action; the order stores the prices at order time | A06, A05 |
| T | Cross-site request forces an order | Server Actions' origin check with `allowedOrigins` = the shop domain; same-origin check on cookie-authenticated routes | A01 |
| R | Customer denies accepting the Terms | The accepted Terms and Privacy versions and the time are stored with the order | A09 |
| I | Order page or link leaks to others | Order links carry a random 128-bit token, show no address or phone, expire, are `no-store`, and send a restricted Referrer-Policy; they do appear in Render's request logs (listed in the personal-data register) | A01, A04 |
| I | Customer data in logs | The logger has an allow-list of fields: no emails, phones, addresses, tokens or IPs | A09 |
| D | Bots flood checkout or fill the database with pending checkouts | Rate limits on checkout and contact (IP only as a daily-rotating keyed hash), honeypot field, no puzzle; unfinished checkouts are deleted by the daily job | A06, A10 |
| E | A visitor reaches an admin function through checkout | Checkout code never calls admin modules; every admin action calls `requireAdmin()` itself | A01 |
| 006 | Card data | None exists: with `PAYMENT_PROVIDER=none` checkout offers only offline methods (`effectivePaymentMethods`), the settings form refuses card on, and the CSP allows no payment host | A06, A02 |

### 3.2 Admin sign-in (Google only)

| STRIDE | Threat | Mitigation | OWASP |
|---|---|---|---|
| S | A stranger signs in with their own Google account | Only a user whose role is `admin` is admitted; roles are set only from the Render shell (`pnpm admin:role`); the production OAuth client is External in **Testing** mode with only the admins as test users | A07, A01 |
| S | Stolen or phished admin Google password | Google's 2-Step Verification, confirmed on both accounts by the launch checklist. The shop cannot enforce or verify it (residual risk R1) | A07 |
| S | Login CSRF or a replayed authorization response | Single-use `state` bound to the `__Host-ac_oauth` cookie (`Secure; HttpOnly; SameSite=Lax`), PKCE (S256), `nonce`, exact redirect URI, `email_verified` required (004) | A07, A08 |
| T | Session cookie tampering | Opaque 256-bit random token, stored only as a hash; the cookie is `__Host-ac_admin; Secure; HttpOnly; SameSite=Strict; Path=/` | A07, A04 |
| R | An admin denies a change | The activity log records which admin acted and when, with no customer data | A09 |
| I | Sign-in error pages reveal whether an address is an admin | Refused sign-ins show one generic "no access" message | A07 |
| D | Sign-in flood or lock-out of the admins | Sign-in starts limited to 10 per 15 minutes per IP hash; failures cost nothing for the real admins because there is no per-account lock (004) | A06 |
| E | A signed-out or non-admin user opens an admin page | `requireAdmin()` in every admin page, Server Action and route handler (not only in the layout); a static test checks the pages, and E2E tests open every admin page and API route signed out | A01 |
| E | Session stays valid after the admin loses a phone | Idle timeout 30 minutes, absolute 12 hours; the owner ends an admin's sessions with `pnpm admin:role <gmail> user`, which deletes that user's sessions, then `pnpm admin:role <gmail> admin` restores the role (004) | A07 |
| 004 | Passkeys, recovery codes, setup links, `admin:add` and `admin:reset` | Removed. There is nothing to steal or social-engineer there; the remaining recovery path is the owner's Render access | A06 |

### 3.3 Uploads (product photos)

| STRIDE | Threat | Mitigation | OWASP |
|---|---|---|---|
| S | A non-admin uploads | The upload route and action call `requireAdmin()` and check the origin | A01 |
| T | A file that is not an image (script, HTML, SVG, polyglot) | Type is detected from the bytes, not the name; the file is decoded and **re-encoded to WebP**; the original is never stored; random object keys | A05, A06 |
| I | GPS or camera data leaks in a published photo | All metadata is stripped by the re-encode; `pnpm check:image-metadata` checks a published photo on production (006) | A02 |
| I | Draft or order photos are visible to the public | They sit in the private bucket and are served only through an authenticated admin route | A01 |
| D | A huge image exhausts the 512 MB server | Limits: 20 MB, 51 megapixels for JPEG, PNG and WebP, 16 megapixels for HEIC (`HEIC_MAX_PIXELS`); larger HEIC is refused with a message; memory peak measured on Render by the checklist (006) | A10 |
| E | Stored file executes in the browser | The public bucket is on its own origin (the `img.` subdomain of the shop domain) with a fixed `Content-Type` and a Cloudflare rule adding `X-Content-Type-Options: nosniff`; the shop's CSP does not allow scripts from it | A02 |

### 3.4 Content editing (pages, product text, settings)

| STRIDE | Threat | Mitigation | OWASP |
|---|---|---|---|
| T | Script injected through a page or product text | React escapes output; Markdown is rendered with raw HTML disabled; `dangerouslySetInnerHTML` is allowed in two components only (lint rule); emails escape every value; nonce-based CSP with `strict-dynamic` and no inline styles | A05 |
| T | Cross-site request changes content with an admin's cookie | `SameSite=Strict` cookie plus the origin check on every state-changing request | A01 |
| R | A page change is later disputed | The Terms and Privacy pages are versioned (orders record the version accepted); the activity log names the admin | A09 |
| I | Admin pages cached or indexed | `Cache-Control: no-store` on admin pages; `/admin` excluded in robots | A02 |
| D | An admin saves an unusable setting (for example card payment on with no provider) | Server-side validation; with no card provider the settings action rejects card on or offline off (006) | A06, A10 |
| E | Open redirect after sign-in sends the admin elsewhere | Only a validated same-origin `next` path is accepted | A01 |
| 007 | Owner-controlled outbound links (the three social links in the footer) lead visitors to a harmful site, or carry a `javascript:` or `data:` address | Only `https` addresses on the platform's own domains (Instagram, Facebook, TikTok) are accepted; checked on the server on save and constrained in the database (`https://` prefix, at most 300 characters). Rendered as plain same-tab links (no `target`): no embeds, no third-party scripts, and the CSP is unchanged | A05 |

### 3.5 Customer data tools (find, export, anonymise)

| STRIDE | Threat | Mitigation | OWASP |
|---|---|---|---|
| S, E | A non-admin reaches the customer tools | Same `requireAdmin()` rule on every page and action; tested signed out | A01 |
| T | Wrong customer anonymised | The action works on the order set found by the exact email, shows what will change and asks for confirmation (constitution II); it is recorded in the activity log | A06 |
| I | An export leaks to someone else | Export is generated on request for a signed-in admin, never stored on the server and never emailed; Aviva sends it herself after checking who asked (owner guide) | A01 |
| R | A data request is later denied | The activity log records the action, the admin and the time, with no customer data | A09 |
| D | Mass export slows the shop | Per-customer export only; no bulk download | A10 |
| I | Old data stays beyond its retention | Daily job: order records anonymised after 7 years, unfinished checkouts after 48 to 72 hours (30 days for a payment mismatch), outbox and rate-limit rows pruned | A06 |

### 3.6 Backups

| STRIDE | Threat | Mitigation | OWASP |
|---|---|---|---|
| I | The backup bucket is read by someone else | Database dumps are encrypted with age to a **public** key; the private key lives offline in two places and never on Render, GitHub or email; the bucket is not public and sits in the EU jurisdiction. The image copies are not encrypted (they are the same photos as the live buckets) | A04, A02 |
| T | Someone deletes or corrupts backups | The backup token can write only `ac-backups`; the job never deletes (copies only add); lifecycle rules expire only the daily (30 days) and monthly (365 days) dumps | A08, A02 |
| R | A failed backup goes unnoticed | The job stops at the first failing step with a non-zero exit, prints one line per step without secrets, and Render emails the owner about failed cron runs | A09, A10 |
| I | Secrets in the job output | Output carries no URL, key or connection string | A09 |
| D | The restore does not work when needed | A restore into a scratch database is done and recorded before launch, from `ops/backup/README.md` | A10 |
| E | A leaked backup token reaches live data | The backup job's tokens are separate from the app's token; the images token is read-only; the app token cannot touch `ac-backups` | A01 |

### 3.7 Payment callback (state `none`, and later)

| STRIDE | Threat | Mitigation | OWASP |
|---|---|---|---|
| S, T | A forged "paid" message marks an order paid | In the launch state the callback route answers 404 for every provider name, and the status route never confirms for an unconfigured provider. An order is marked paid only by the owner by hand | A08, A01 |
| I | A payment host is allowed in the CSP | In the `none` state the CSP allows no payment host (`form-action 'self'`, tested in `headers.spec.ts`) | A02 |
| D | Callback flood | A closed route costs nothing; the 404 is cheap | A10 |
| E | A configuration slip enables the fake provider in production | The env check refuses `PAYMENT_PROVIDER=fake` (and local storage, a non-https issuer, the consent test category) when `APP_ENV=production`; the blueprint writes the production values so they cannot be mis-set | A02 |

**When card payment is added** (a later feature; see the launch checklist > Later): the callback
must verify the provider's signature and the amount and currency, the order is marked paid only
from that verified callback or the shop's own server-to-server status query, the CSP gains
the provider's host (and only then), no card data may reach the shop, and this model gets
a new section for the provider before it is switched on.

## 4. Mitigations by OWASP Top 10 (2025)

| Item | Where it is met |
|---|---|
| A01 Broken Access Control | `requireAdmin()` in every admin page, action and route; capability links for orders; closed callback; per-bucket R2 tokens |
| A02 Security Misconfiguration | Strict headers (tested), production env guard, blueprint with fixed values, database with no public address, DNS-only shop domain, `nosniff` on the image host, Bot Fight Mode off |
| A03 Software Supply Chain Failures | Pinned dependencies, `pnpm run audit` in CI and before announcing, no new npm dependency in 006, pinned Alpine and ZAP image tags (yearly bump step) |
| A04 Cryptographic Failures | TLS and HSTS, age-encrypted backups, hashed session tokens, random tokens, secrets only in Render |
| A05 Injection | Drizzle with parameters (no `sql.raw`), Zod validation, escaped output, re-encoded uploads |
| A06 Insecure Design | Server-side pricing and state machines, guest orders without accounts, rate limits, this model |
| A07 Authentication Failures | Google sign-in with PKCE, `state`, `nonce`, admin role only, Testing-mode OAuth client, session limits |
| A08 Software or Data Integrity Failures | Deploy only after CI passes (`checksPass`), pinned images, payment never confirmed from the browser |
| A09 Security Logging and Alerting Failures | Structured logs with a field allow-list, activity log, Render failure email for the backup job, owner alerts for payment problems |
| A10 Mishandling of Exceptional Conditions | Fail closed: the app refuses to start on a bad environment, the backup stops on the first error, unknown payment providers are refused |

## 5. Residual risks

These are accepted and stated, not mitigated:

- **R1. The shop cannot enforce Google 2-Step Verification.** An admin whose Google account is
  taken over is an admin of the shop. The launch checklist makes the owner confirm it on both
  accounts; the shop cannot check it later.
- **R2. One shared database account.** The web service, the migrations and the backup job use the
  single account Render provides (allowed by constitution IV). A bug that can run SQL can read
  and change everything.
- **R3. Render shell access is protected only by the owner's Render account** (and its 2FA).
  Whoever holds it can make an admin, read the environment and change data.
- **R4. The same-site bounce makes the `SameSite=Strict` admin cookie behave like `Lax` for GET
  navigations.** After Google sign-in, and when an admin opens a link from another site (for
  example the order link in a notification email), the proxy sends the browser through one
  same-site hop so the cookie is sent. This is safe only because admin GET pages never change
  state (a project convention).
- **R5. Proxying the shop domain through Cloudflare later needs research R19 and the Privacy
  Policy updated first.** At launch Cloudflare provides DNS and the image host only; the shop
  domain is DNS-only and `TRUSTED_PROXY_HOPS=1` counts Render's hop.
- **R6. `GHSA-fc5q-39xc-vjpf` (picomatch ReDoS, high) is ignored in the dependency audit**
  (`auditConfig.ignoreGhsas` in `pnpm-workspace.yaml`, since 2026-11-17). No patched version
  exists. picomatch arrives through next-intl's build-time file watcher (`@parcel/watcher`, part of a
  production dependency that never runs at request time) and through development tooling
  (eslint-config-next, vitest). No code that handles a visitor's request reaches it.
  Remove the ignore as soon as a fixed version ships.

Also worth knowing:

- The image copies in the backup bucket are plain (the photos are not secret), and order links
  appear in Render's request logs.
- The production OAuth client stays in Testing mode: Google lists only the admins as users, which
  is the second gate behind the `admin` role.

## 6. Ending an admin's sessions

When an admin loses a phone or a laptop (or a Google account may be taken over), the owner, from
the Render shell of the web service:

```bash
pnpm admin:role <gmail> user    # removes the admin role and deletes that user's sessions
pnpm admin:role <gmail> admin   # restores the role once the Google account is secured
```

The admin then signs in again with Google. There are no other credentials to rotate: the shop
holds no passwords, passkeys or recovery codes. The admin should also secure the Google account
(sign out other devices, change the password).

## 7. Keeping this document true

Update it when a feature adds a flow that takes input from outside, a new third party, a new
secret or a new way to become an admin. Re-read it before choosing a card-payment provider and
before proxying the domain through Cloudflare.
