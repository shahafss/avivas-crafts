# Validation record: Hosting and Launch Readiness (006)

**Purpose**: spec FR-028, research D13. One row per scenario of the earlier features' quickstarts,
walked against the current local build of branch `006-launch-readiness`, plus the measurements of
this feature and the owner's stopwatch runs.

**How it was run**: `pnpm build`, then `pnpm start -p 3001` with the mock OIDC server (mock Google
sign-in), first with `PAYMENT_PROVIDER=fake` (card scenarios), then once with `PAYMENT_PROVIDER=none`.
Automated specs named in a row passed in CI (run noted below) unless the note says otherwise.

**Left out on purpose**: passkeys, recovery codes and setup links (removed by 004): 001 US1 step 1's
setup link and passkey, and the 001 security rows about passkeys, recovery and the security screen.
001 US2 step 7 (PayPlus sandbox) has no provider account at launch (owner decision 2026-11-13); it
moves to the launch checklist's "Later" section.

**Result values**: pass · fail (with a fix task) · n/a (with the reason) · owner (done by the owner).

CI run used: _(filled in at T040)_

## 001 Online crafts shop (`specs/001-online-crafts-shop/quickstart.md`)

| # | Scenario | Source | Result | Date | Note |
|---|----------|--------|--------|------|------|
| 1.1 | Sign in with Google (no setup link or passkey since 004) | 001 US1-1 (as changed by 004) | | | |
| 1.2 | Product with 3 photos published; public images carry no EXIF/GPS | 001 US1-2 | | | |
| 1.3 | Price change; earlier order keeps old price | 001 US1-3 | | | |
| 1.4 | Hide → gone from catalog/search, direct link 404 "not available" | 001 US1-4 | | | |
| 1.5 | "Not available to order" label and notice | 001 US1-5 | | | |
| 1.6 | Option group with price difference | 001 US1-6 | | | |
| 1.7 | Publish without photo/price blocked | 001 US1-7 | | | |
| 1.8 | Fake `.jpg` file rejected | 001 US1-8 | | | |
| 1.9 | Guest online checkout (fake provider), paid order, emails | 001 US2-1 | | | |
| 1.10 | Fake provider "Fail" → no order; retry / switch to offline | 001 US2-2 | | | |
| 1.11 | Pickup + offline payment → awaiting payment, instructions | 001 US2-3 | | | |
| 1.12 | Free-shipping threshold | 001 US2-4 | | | |
| 1.13 | Invalid email/phone, terms not accepted → field messages | 001 US2-5 | | | |
| 1.14 | Fake callback replayed → one order, one set of emails | 001 US2-6 | | | |
| 1.15 | PayPlus sandbox payment | 001 US2-7 | n/a | | No provider at launch; launch checklist › Later |
| 1.16 | Owner handles orders (paid, statuses, tracking email, cancel, refund, filters) | 001 US3 | | | |
| 1.17 | Language: `/`→`/he`, switch keeps product and cart, English checkout and emails, Hebrew fallback | 001 US4 | | | |
| 1.18 | Launch config: no banner, registry cookies only, no third-party requests, visit counted | 001 US5-1 | | | |
| 1.19 | Consent test category: banner, accept/reject, cookie settings | 001 US5-2 | | | |
| 1.20 | Footer legal links in he and en | 001 US5-3 | | | |
| 1.21 | Customer export, stop marketing, anonymise | 001 US5-4 | | | |
| 1.22 | Edit About → public page updated | 001 US5-5 | | | |
| 1.23 | Signed out: every admin page/endpoint refused, no admin data | 001 Security | | | |
| 1.24 | Admin Server Actions guarded before database access | 001 Security | | | |
| 1.25 | Unapproved Google account refused, security email, no address stored | 001 Security | | | |
| 1.26 | Removing an admin updates the notification list | 001 Security | | | |
| 1.27 | Admin deep link from email works signed in and after sign-in | 001 Security | | | |
| 1.28 | Response headers (CSP nonce, nosniff, frame-ancestors, referrer, permissions; sign-in form-action) | 001 Security | | | HSTS is production only (launch checklist) |
| 1.29 | axe: no WCAG 2.1 AA violations on the listed pages, he and en | 001 Security | | | |

## 002 Order handling (`specs/002-order-handling/quickstart.md`)

| # | Scenario | Source | Result | Date | Note |
|---|----------|--------|--------|------|------|
| 2.1 | Notification link, orders list, chips, number search | 002 walkthrough 1 | | | |
| 2.2 | Order page details; snapshot survives product deletion | 002 walkthrough 2 | | | |
| 2.3 | Forward and back, mark-paid-and-complete, pickup note, tracking edit | 002 walkthrough 3 | | | |
| 2.4 | Mark paid, mark refunded, one refund email; online order never offers mark-paid | 002 walkthrough 4 | | | |
| 2.5 | Cancel paid order: refund reminder, one cancel email | 002 walkthrough 5 | | | |
| 2.6 | Customer details correction, invalid email refused | 002 walkthrough 6 | | | |
| 2.7 | Admin home counts and the "needs attention" notice | 002 walkthrough 7 | | | Now also lists empty Hebrew offline instructions (006 FR-010b) |
| 2.8 | Customer order page in he and en, no personal data | 002 walkthrough 8 | | | |
| 2.9 | Link lifetime | 002 walkthrough 9 | | | |
| 2.10 | Exactly one confirmation / at most one cancel / refund email per order | 002 walkthrough 10 | | | |
| 2.11 | Order email failure → warning and owner email | 002 walkthrough 11 | | | |
| 2.12 | Design check: admin §12 and customer page §8.8 at 375 and 1280 px | 002 design check | | | |

## 003 Privacy and legal pages (`specs/003-privacy-legal-pages/quickstart.md`)

| # | Scenario | Source | Result | Date | Note |
|---|----------|--------|--------|------|------|
| 3.1 | Footer contents, legal links with draft notice, cookies table, terms box, no 404 links | 003 US1 | | | |
| 3.2 | Contact form, outbox, rate limit | 003 US2 | | | |
| 3.3 | Customer data request: search, export, withdrawal, anonymise | 003 US3 | | | |
| 3.4 | Editing pages, versions, seed leaves edits alone | 003 US4 | | | |
| 3.5 | Statistics: no cookies, beacons 204, stats screen | 003 US5 | | | |
| 3.6 | Consent test category | 003 US6 | | | |
| 3.7 | Retention test | 003 US7 | | | |
| 3.8 | Data Security Regulations drafts (10 files) match the register and services | 003 US8 | | | Now offline payment only (006 T029) |

## 004 Simpler admin access (`specs/004-simpler-admin-access/quickstart.md`)

| # | Scenario | Source | Result | Date | Note |
|---|----------|--------|--------|------|------|
| 4.1 | Fresh database: first admin, Google only, admin home | 004 by hand 1 | | | |
| 4.2 | Deep link signed out → sign in → Orders | 004 by hand 2 | | | |
| 4.3 | `admin:role … user` ends the session; "no access" | 004 by hand 3 | | | |
| 4.4 | `admin:role … admin` restores access | 004 by hand 4 | | | |
| 4.5 | Export / anonymise without a passkey prompt | 004 by hand 5 | | | |
| 4.6 | Removed passkey/recovery/setup addresses → 404 or sign-in | 004 by hand 6 | | | |
| 4.7 | No passkey/recovery tables; `admin_user.role` exists | 004 by hand 7 | | | |
| 4.8 | Production role command and notification email | 004 production | owner | | Launch checklist step for both admins |

## 005 English language switch (`specs/005-english-language-switch/quickstart.md`)

| # | Scenario | Source | Result | Date | Note |
|---|----------|--------|--------|------|------|
| 5.1 | `/` → `/he`, no `NEXT_LOCALE` cookie | 005 walk-through 1 | | | |
| 5.2 | EN switch keeps product and cart; cookie set | 005 walk-through 2 | | | |
| 5.3 | עב back; menu and footer switch in full words | 005 walk-through 3 | | | |
| 5.4 | Search query kept on switch | 005 walk-through 4 | | | |
| 5.5 | Reopen `/` → `/en` | 005 walk-through 5 | | | |
| 5.6 | `/en/p/...` in a fresh window → English, no cookie | 005 walk-through 6 | | | |
| 5.7 | English offline checkout and English emails | 005 walk-through 7 | | | |
| 5.8 | Product with no English → Hebrew text, aligned | 005 walk-through 8 | | | |
| 5.9 | "אין אנגלית" badge; admin has no switch | 005 walk-through 9 | | | |
| 5.10 | Canonical, hreflang, sitemap, robots | 005 walk-through 10 | | | |
| 5.11 | `/api/locale` open redirect refused (400) | 005 walk-through 11 | | | |
| 5.12 | English copy review approved | 005 walk-through 12 | owner | | Approved in 005 |

## 006 Hosting and launch readiness (`specs/006-launch-readiness/quickstart.md`)

| # | Scenario | Source | Result | Date | Note |
|---|----------|--------|--------|------|------|
| 6.1 | `PAYMENT_PROVIDER=none`: offline only on product, checkout, admin settings; callbacks 404; CSP form-action `'self'` | 006 §1 | | | |
| 6.2 | Render blueprint test | 006 §2 | | | |
| 6.3 | Backup job local run, restore, wrong recipient | 006 §3 | pass | 2026-11-15 | Implementer run in Docker (B2; repeated after the stderr change in B3): six step lines, restore counts equal to dev, both image folders copied, wrong recipient exit 1 with no file |
| 6.4 | Security, accessibility, layout, bundle, image-metadata checks | 006 §4 | | | |
| 6.5 | Launch checklist, threat model, legal drafts | 006 §5 | | | |

## Measurements

| Measurement | Value | Limit / target | Date | Source |
|-------------|-------|----------------|------|--------|
| Bundle, home / category / search / terms (gzipped) | 143.8 KB | ≤ 150 KB | 2026-11-15 | T025, `bundle-size.spec.ts` |
| Bundle, product | 149.4 KB | ≤ 150 KB (target 145 KB, not reached) | 2026-11-15 | T025; the zoom-dialog split grew it to 150.6 KB and was reverted (stop rule) |
| Bundle, cart | 148.6 KB | ≤ 150 KB | 2026-11-15 | T025 |
| Bundle, checkout | 151.3 KB | ≤ 155 KB | 2026-11-15 | T025 |
| Bundle, payment return | 147.0 KB | ≤ 150 KB | 2026-11-15 | T025 |
| Bundle, order page | 144.1 KB | ≤ 150 KB | 2026-11-15 | T025 |
| Bundle, contact | 147.2 KB | ≤ 150 KB | 2026-11-15 | T025 |
| Memory, idle (container) | 129 MB (node RSS 178 MB) | | 2026-11-15 | T025, `scripts/measure-app-memory.ts` |
| Memory, JPEG 8160×6144 upload | peak 247 MB, 1.1 s, 201 | < 460 MB | 2026-11-15 | T025 |
| Memory, HEIC 16 MP upload | peak 430 MB, 2.5 s, 201 | < 460 MB | 2026-11-15 | T025 |
| HEIC 50 MP refused | 400 `too_many_pixels`, no restart, 0 OOM kills | refused | 2026-11-15 | T025 |
| Design review screenshots | 238 PNGs, no unreachable screen beyond the listed known gaps | every §8–§9 state, §12 admin | 2026-11-15 | T027 |

## Owner's stopwatch runs (spec 001 SC-001, SC-002, SC-010; scripts in `docs/owner-guide-he.md`)

| Run | Target | Date | Who | Time | Without help (yes/no) | Notes |
|-----|--------|------|-----|------|-----------------------|-------|
| SC-001 publish a product with 3 photos | < 5 min | | | | | |
| SC-002 phone visitor, product link to confirmed order | < 3 min | | | | | |
| SC-010 customer data request | < 10 min | | | | | |
