# Implementation Plan: English Version and Language Switch

**Branch**: `005-english-language-switch` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-english-language-switch/spec.md`

## Summary

Finish the English shop promised by spec 001 User Story 4. Locale routing, English interface text,
the Hebrew fallback and per-order email language already exist; 005 adds the visible switch (a
client island in the header, menu and footer), `GET /api/locale` (the only writer of the
`NEXT_LOCALE` cookie, with open-redirect and cross-site protection), canonical + hreflang on every
public page through one helper, a live sitemap and robots file, a "no English" badge in the admin
product list, an audit of locale-dependent formatting, one English copy pass with a reviewable diff,
and the tests constitution VI requires for language switching. No schema change. Decisions:
[research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 24

**Primary Dependencies**: Next.js 16.4.5 (App Router, proxy, metadata routes), next-intl, Drizzle
ORM. No new dependency.

**Storage**: PostgreSQL; nothing new stored (one existing cookie, written by the new route).

**Testing**: Vitest (unit, integration on PGlite), Playwright (`chromium-desktop`,
`chromium-mobile`, `webkit-mobile`), `pnpm verify`.

**Target Platform**: Render (Frankfurt) web service; phones first.

**Project Type**: single Next.js web application.

**Performance Goals**: the switch island adds < 1 KB gzipped to the shared client bundle; first-load
JS budget (≤ 150 KB gzipped, `tests/e2e/bundle-size.spec.ts`) still passes. Sitemap answers in one
query pair.

**Constraints**: logical CSS only (lint + `check:css`); `docs/design/storefront.md` edited by hand,
never through prettier; spec 001 frozen; message files keep identical keys (parity test); the switch
must not be a Next `<Link>`; local E2E only for single spec files.

**Scale/Scope**: ~6 new files (`LanguageSwitch.tsx`, `api/locale/route.ts`, `lib/locale-path.ts`,
`server/seo.ts`, `sitemap.ts`, `robots.ts`), ~15 edited (layout, Header, Footer, 10 page
`generateMetadata`s, admin product list + query, message files), ~6 test files new or extended,
one copy-review document, storefront.md §12.9, roadmap status.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* Constitution v2.0.1.

| Principle | Status | How |
|---|---|---|
| I. Hebrew-first, bilingual | Pass | Hebrew stays the default (`/` → `/he`, `x-default` = he); English is completed and LTR; owner text falls back to Hebrew marked `lang="he"`; new admin string in both files. |
| II. Non-technical owner | Pass | Aviva sees untranslated products at a glance (badge); no new settings or steps. |
| III. Guest shopping | Pass | Switching keeps the cart; English checkout needs nothing extra. |
| IV. Security by design | Pass | `/api/locale` allow-lists two path prefixes, ties the path to `to`, rejects `//`, backslashes, encoded slashes, dot segments (literal and percent-encoded) and control characters, re-checks the origin and the normalised path after parsing (OWASP A01 open redirect); browsers that report a cross-site or same-site request (`Sec-Fetch-Site`) cannot set the cookie (CSRF; old browsers without the header are a stated limit, research R2); `HttpOnly`, `SameSite=Lax`, `Secure` on https; `no-store`. Proxy CSP/headers apply to the route. |
| V. Simplicity, low cost | Pass | No dependency, no schema change, one helper replaces inline metadata; reuses the existing cookie, routing and fallback. |
| VI. Tested critical paths | Pass | Language switching is a named critical path: unit (path rules, alternates), integration (route, sitemap, admin flag, emails), E2E (switch, memory, shared links, English checkout + email, hreflang, stray Hebrew). |
| VII. Privacy | Pass | `NEXT_LOCALE` is strictly necessary, set only on a same-site click, already in the cookie policy and registry; no personal data; nothing stored on view or hover. |

Post-design re-check: unchanged, all pass.

## Design

### Switch (see [contracts/locale-switch.md](contracts/locale-switch.md), research R1–R3)

- `src/lib/locale-path.ts`: `otherLocale(locale)`, `switchPath(pathname, search)` (first segment
  swap, query kept) and `parseSwitchTarget(to, path, origin)` (all validation, pure).
- `src/app/api/locale/route.ts`: GET only; uses `parseSwitchTarget`; `Sec-Fetch-Site` check; cookie
  via `NextResponse.cookies.set`; 303 / 400 as the contract table.
- `src/components/shop/LanguageSwitch.tsx`: `'use client'`, `variant: 'compact' | 'full'`, plain
  `<a rel="nofollow">`, strings from `common.language` (already passed to the client provider).
- `src/app/[locale]/layout.tsx`: pass `<LanguageSwitch variant="compact" />` and `variant="full"`
  to `Header` (`languageSwitch`, `menuLanguageSwitch`) and `Footer` (new `languageSwitch` prop,
  rendered in the bottom row per storefront §7.20). Admin layout untouched.
- `src/proxy.ts`: no change (root redirect already reads the cookie; `/api/` already bypasses the
  locale middleware). `src/i18n/routing.ts`: `alternateLinks: false` (R4).

### Search engines (see [contracts/seo.md](contracts/seo.md), R4–R5)

- `src/server/seo.ts` `alternates()`; used in `generateMetadata` of home, category, product, search,
  cart, checkout, fake-pay, return, order, content page, contact. Product and category drop their
  inline objects. Pages that have no `generateMetadata` get one (title from their existing
  translation key, plus alternates; keep existing `robots: noindex`).
- `src/server/catalog/public-queries.ts` `listSitemapEntries()`; `src/app/sitemap.ts`,
  `src/app/robots.ts` (`force-dynamic`).

### Owner view (R6)

- `listAdminProducts()` gains `missingEnglish`; `ProductRow` shows badge `admin.products.noEnglish`
  ("אין אנגלית" / "No English"); storefront.md new §12.9 "Products list `/admin/products`" with the
  badge rule.

### Formatting and copy (R7, R9)

- Grep audit of `formatMoney`/`formatDate`/`formatDateTime`/`'he-IL'`/`Intl.` in public pages,
  shop components and customer email templates; fix any hard-coded Hebrew locale.
- English copy pass on `en.json` values (non-admin namespaces) per storefront §1 › Voice; every
  change listed in `copy-review.md` (key, before, after).

### Tests (R8, R10)

Unit `locale-path`, `seo`; integration `locale-redirect`, `sitemap`, extended `catalog-products`
and (if not already covered) `order-emails`; E2E `language.spec.ts` with `PUBLIC_ROUTES` (home,
category, product, search, cart, six content pages, contact). Accessibility: axe (WCAG 2.1 AA) on Hebrew and English home and product pages with the switch, and the switch's 44×44 hit area. Projects: navigation + cookie on
`chromium-desktop` and `chromium-mobile`, English checkout on phones only, one smoke test on
`webkit-mobile`. No new Playwright project, so `ci.yml` is unchanged.

### Docs

`docs/design/storefront.md` §12.9 (badge); `docs/roadmap.md` item 005 → Done at the end;
`copy-review.md` in this folder. Spec 001 untouched.

## Project Structure

### Documentation (this feature)

```text
specs/005-english-language-switch/
├── spec.md
├── plan.md              # this file
├── research.md
├── data-model.md        # no schema change; derived values and the cookie
├── quickstart.md
├── contracts/
│   ├── locale-switch.md # GET /api/locale + LanguageSwitch
│   └── seo.md           # alternates(), sitemap, robots
├── copy-review.md       # written during implementation (English copy diff)
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── [locale]/layout.tsx                    # wire the switch into Header and Footer
│   ├── [locale]/(shop)/**/page.tsx            # generateMetadata → alternates()
│   ├── admin/(protected)/products/page.tsx    # "no English" badge
│   ├── api/locale/route.ts                    # NEW
│   ├── sitemap.ts                             # NEW
│   └── robots.ts                              # NEW
├── components/shop/
│   ├── LanguageSwitch.tsx                     # NEW (client island)
│   ├── Header.tsx                             # unchanged slots (already exist)
│   └── Footer.tsx                             # languageSwitch prop
├── lib/
│   └── locale-path.ts                         # NEW (pure path rules)
├── server/
│   ├── seo.ts                                 # NEW (alternates(); reads getEnv)
│   └── catalog/
│       ├── admin-queries.ts                   # missingEnglish
│       └── public-queries.ts                  # listSitemapEntries()
└── i18n/messages/{he,en}.json                 # admin.products.noEnglish; English copy pass

tests/
├── unit/locale-path.test.ts                   # NEW
├── unit/seo.test.ts                           # NEW
├── integration/locale-redirect.test.ts        # NEW
├── integration/sitemap.test.ts                # NEW
├── integration/catalog-products.test.ts       # extend
├── integration/order-emails.test.ts           # extend if needed
└── e2e/language.spec.ts                       # NEW
```

**Structure Decision**: the existing single Next.js app; new code goes where its kind already
lives (`src/lib` pure helpers, `src/app/api` route handlers, `src/components/shop` islands).

## Complexity Tracking

No constitution violations; nothing to justify.
