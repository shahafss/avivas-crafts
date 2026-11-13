# Tasks: English Version and Language Switch

**Input**: Design documents from `/specs/005-english-language-switch/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: required (constitution VI names language switching as a critical path; spec FR-022).
Tests are written first and must fail before their implementation task.

**Organization**: the switch's link target (`/api/locale`) and the pure path rules serve both
US1 and US2, so they are foundational (Phase 2). `tests/e2e/language.spec.ts` is created in T005
and extended by later tasks in order; tasks that edit it or the message files are sequential.
Run commands with timeouts; never start watch mode or a dev server that does not exit. Run only
`tests/e2e/language.spec.ts` locally (CLAUDE.md); the full E2E run is CI's.

**Suggested implementation batches**: B1 = Phase 2 + US1 + US2 (T001–T011); B2 = US3 + US4
(T012–T020); B3 = US5 + US6 + Polish (T021–T033).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

No setup tasks: no new dependencies, directories, tools or schema.

---

## Phase 2: Foundational (path rules and the switch's target route)

**Purpose**: the validated `GET /api/locale` that writes the only language cookie. Blocks US1 and
US2.

### Tests first (must fail before T003–T004)

- [X] T001 [P] Write `tests/unit/locale-path.test.ts` for `src/lib/locale-path.ts` (contracts/locale-switch.md): `otherLocale('he') === 'en'` and back; `switchPath('/he', '')` → `/en`, `switchPath('/he/p/x', '?a=1')` → `/en/p/x?a=1`, `switchPath('/en/c/bowls', '?sort=price-asc')` → `/he/c/bowls?sort=price-asc`; `parseSwitchTarget(to, path, origin)` accepts every row of the contract's "Must be accepted" list (returns `{ locale, path }` where `path` is the normalised `url.pathname + url.search`, Hebrew query kept) and returns `null` for every row of "Must be refused" (`/hex`, `/en-x/a`, `/admin`, `/api/locale`, `https://evil.example/en`, `//evil.example/en`, `/en//evil.example`, `/en/%2F%2Fevil.example`, `/en/%2f`, `/en\evil`, `/\evil`, `/en/../admin`, `/en/./p`, encoded dot segments `/en/%2e%2e/admin`, `/en/.%2e/admin`, `/en/%2E%2e/api/locale`, `/en/%2E/p`, `%0d%0a` in the path, `to=fr`, `to=en` with `/he/p/x`, missing path, a 2,049-character path); a 2,048-character valid path is accepted.
- [X] T002 [P] Write `tests/integration/locale-redirect.test.ts` for `src/app/api/locale/route.ts` (spec 001 T096; mock `@/server/env` like `tests/integration/auth-routes.test.ts`; build `NextRequest`s): valid request → `303`, `Location` = `APP_ORIGIN` + path (`path=/en` → exactly `<origin>/en`), `Cache-Control: no-store`, `Set-Cookie` for `NEXT_LOCALE=en` whose parsed attributes (split on `;`, names and the `SameSite` value compared case-insensitively; Next writes `SameSite=lax` and adds `Expires`) include `HttpOnly`, `SameSite=lax`, `Path=/`, `Max-Age=31536000`, and `Secure` **exactly** when `APP_ORIGIN` is https (assert both an `http://localhost:3100` and an `https://shop.example` origin); `Sec-Fetch-Site: cross-site` and `same-site` → `303` without `Set-Cookie`; `same-origin`, `none` and no header → cookie set; no `Sec-Fetch-Site` but `Referer: https://evil.example/x` → `303` without cookie; no `Sec-Fetch-Site` and a same-origin `Referer` → cookie set; every refused case of T001 (sample at least `/hex`, `/admin`, `//host`, `%2F%2F`, backslash, `/en/%252e%252e/admin` in the raw query (decodes to `/en/%2e%2e/admin`), locale mismatch, `to=fr`) → `400`, no `Set-Cookie`, no `Location`.

### Implementation

- [X] T003 Implement `src/lib/locale-path.ts` per research R2 and contracts/locale-switch.md: `otherLocale()`, `switchPath(pathname, search)` (swap the first segment `/he` ↔ `/en`, keep the rest and the query), `parseSwitchTarget(to, path, origin)` with exactly the rules "≤ 2,048 chars; `^/(he|en)(?=$|/|\?)`; first segment equals `to`; the part before `?` has no `//`, `\`, ASCII control character, `%2f`/`%5c`/`%2e` (any case), `.` or `..` segment; then `url = new URL(path, origin)`: `url.origin === origin` **and** the normalised `url.pathname` still matches `^/(he|en)(/|$)` with that segment equal to `to`"; return `{ locale: to, path: url.pathname + url.search }` (same pattern as `safeAdminNext` in `src/server/auth/next-path.ts`: parse first, then re-check the normalised pathname). No imports from `server-only` code (the client island uses `switchPath`). T001 passes.
- [X] T004 Implement `src/app/api/locale/route.ts` (`GET` only, `export const dynamic = 'force-dynamic'`) per contracts/locale-switch.md using `parseSwitchTarget` and `getEnv().APP_ORIGIN`: invalid → `400` with an empty body and `Cache-Control: no-store`; valid → `NextResponse.redirect(origin + parsed.path, 303)` (the normalised path from `parseSwitchTarget`, never the raw input) with `no-store`, and `response.cookies.set('NEXT_LOCALE', to, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 31536000, secure: origin starts with 'https://' })` unless `Sec-Fetch-Site` is present and not `same-origin`/`none`, or, when `Sec-Fetch-Site` is absent, a `Referer` is present whose origin is not `APP_ORIGIN`. Keep `src/proxy.ts` unchanged (it already lets `/api/` through without the locale middleware and adds security headers). T002 passes.

**Checkpoint**: T001 and T002 pass (no dev server needed).

---

## Phase 3: User Story 1 - Switch to English on any page (Priority: P1) 🎯 MVP

**Goal**: a visible switch on every public page shows the same page in the other language, keeping
the cart, sort and search; none in the admin.

**Independent Test**: on a Hebrew product with items in the cart, press the switch → same product
in English, LTR, same cart count; press again → Hebrew.

### Tests first (must fail before T006–T007)

- [X] T005 [US1] Create `tests/e2e/language.spec.ts` (runs on `chromium-desktop` and `chromium-mobile`; `test.skip` on other projects unless a test says otherwise; `resetDb()` + `clearThrottles` like other specs) with the US1 tests: on `/he` the header switch reads "EN", has `aria-label` "EN – English" (it must start with the visible text, WCAG 2.5.3; T027 axe), `lang="en"`, `rel="nofollow"`, and is an `<a>` whose `href` starts with `/api/locale?to=en&path=`; pressing it on `/he` lands on exactly `/en` (`html[lang=en][dir=ltr]`), and the "עב" switch lands on exactly `/he`; open `/he`, follow an in-page link to category `sample-ceramics`, open `/he/c/sample-ceramics?sort=price-asc` and press the switch with JavaScript on → the browser lands on exactly `/en/c/sample-ceramics?sort=price-asc`; in a separate test that skips `chromium-desktop` (cart flows run on phones, CLAUDE.md): on `/he/c/sample-ceramics?sort=price-asc` click the card of `sample-clay-mug` (the orderable product in that category; `sample-ceramic-bowl` is seeded `orderable: false`), add it to the cart, press the switch → URL is `/en/p/sample-clay-mug`, `dir="ltr"`, cart count unchanged; on `/he/search?q=<Hebrew word>` the switch keeps the query; the menu (open the menu popover) and the footer each contain the full-word switch "English" on `/he` and "עברית" on `/en`; on the `/he` 404 page (`/he/no-such-page`) the switch leads to `/en/no-such-page` (English 404); in a test that skips `chromium-desktop` (admin flows run on phones), `/admin` (signed in via `signInAsAdmin`) has no element linking to `/api/locale`; at viewport widths 320 and 375 px, `/he` and `/en` home and a product page have no horizontal overflow (`document.documentElement.scrollWidth <= clientWidth`, as in `tests/e2e/order-tracking.spec.ts`) and the header switch is visible (storefront §11); in a context with `javaScriptEnabled: false`, `/he/c/sample-ceramics?sort=price-asc` serves a header switch whose `href` decodes to `path=/en/c/sample-ceramics?sort=price-asc` (FR-004; if T006 had to use the Suspense fallback, assert `path=/en/c/sample-ceramics` and note it). Constant `PUBLIC_ROUTES` (path without locale): `''`, `/c/sample-ceramics`, `/p/sample-ceramic-bowl`, `/search?q=bowl`, `/cart`, `/pages/about`, `/pages/shipping-returns`, `/pages/terms`, `/pages/privacy`, `/pages/cookies`, `/pages/accessibility`, `/contact`; every one in both locales shows the header switch.

### Implementation

- [X] T006 [US1] Create `src/components/shop/LanguageSwitch.tsx` (`'use client'`) per contracts/locale-switch.md and storefront.md §7.19: props `variant: 'compact' | 'full'`; reads `usePathname()` and `useSearchParams()` from `next/navigation` and `useLocale()`/`useTranslations('common.language')` from next-intl; href `/api/locale?to=<other>&path=${encodeURIComponent(switchPath(pathname, search))}`; a plain `<a>` (never Next/next-intl `Link`) with `rel="nofollow"`, `lang` and `hrefLang` = target; compact: text `toEnglishShort`/`toHebrewShort`, `aria-label` short text + " – " + full word (`EN – English`), 36 px tall box with 1.5 px `ink` border, `px-2.5` (design sample: `padding: 0 10px`), 13 px / 700, rounded pill, hover `bg-sun-soft`, `me-1` after it (design sample: `margin-inline-end: 4px`), `relative`, and a 44×44 hit area from `before:absolute before:-inset-[5.5px] before:content-['']` (4 px beyond the 36 px box on every side: the inset counts from the padding box, so 4 px plus the 1.5 px border; not padding), logical properties only. If the header overflows at 320 px (T005), the brand link gets `min-w-0 truncate` (ellipsis) so the icons and the switch always fit; the switch is never hidden (owner decision 2026-11-12). full: visible text `toEnglish`/`toHebrew`, `flex min-h-11 items-center hover:underline` like the footer links. If `next build` requires a Suspense boundary for `useSearchParams`, wrap it as research R1 says (fallback = path-only link).
- [X] T007 [US1] Wire the switch in `src/app/[locale]/layout.tsx` (pass `languageSwitch={<LanguageSwitch variant="compact" />}` and `menuLanguageSwitch={<LanguageSwitch variant="full" />}` to `Header`; pass `languageSwitch={<LanguageSwitch variant="full" />}` to `Footer`) and add the `languageSwitch?: ReactNode` prop to `src/components/shop/Footer.tsx`, rendered in the bottom row beside the copyright line (a flex row, wrapping on narrow screens; storefront §7.20); update the Footer doc comment ("added by roadmap item 005" → describe it). In the same row, the shop name inside the copyright line gets `lang="he" dir="auto"` when `brand.lang` is set (render it with `t.rich` and a `name` tag, or as a separate `<span>`; keep the `copyright` key and its placeholders identical in both message files). `src/app/admin/layout.tsx` unchanged. The client messages in the layout already include `common.language`. T005 passes.

**Checkpoint**: US1 works end to end; MVP.

---

## Phase 4: User Story 2 - Choice remembered, shared links keep their language (Priority: P1)

**Goal**: the choice is stored only on a click, `/` follows it, addresses with a language win.

**Independent Test**: fresh browser → switch to English → open `/` → English; another fresh
browser opens an `/en` link → English, no cookie.

- [X] T008 [US2] Extend `tests/e2e/language.spec.ts` with US2 tests (`chromium-desktop`, `chromium-mobile`): a fresh context opening `/` lands on `/he` with `lang="he" dir="rtl"`, also with `locale: 'en-US'` / `Accept-Language: en` set on the context; after loading `/he`, a product and `/he/cart` and hovering the header switch (and focusing it), `context.cookies()` holds no `NEXT_LOCALE`; after pressing the switch, `NEXT_LOCALE=en` exists with `httpOnly: true`, `sameSite: 'Lax'`, an expiry about one year ahead; a new page load of `/` then lands on `/en`; with `NEXT_LOCALE=en`, opening `/he/p/sample-ceramic-bowl` renders Hebrew and the cookie stays `en`; a fresh context opening `/en/p/sample-ceramic-bowl` renders English and has no `NEXT_LOCALE`; a context with cookie `NEXT_LOCALE=fr` opening `/` lands on `/he`. Add one smoke test that also runs on `webkit-mobile`: press the switch on `/he` → `/en`, then `/` → `/en`.
- [X] T009 [US2] Confirm `src/proxy.ts` and `src/i18n/routing.ts` need no change for T008 (root redirect reads the cookie, `localeDetection: false`, `localeCookie: false`); if any T008 case fails, fix it in `src/proxy.ts` without adding `Accept-Language` detection or writing the cookie anywhere but `/api/locale`. T008 passes.
- [X] T010 [P] [US2] Confirm `src/lib/consent/registry.ts` › `NEXT_LOCALE` and the `consent.items.locale.*` strings in both message files describe the cookie as written (set only when the visitor switches language; one year); adjust the wording only if it differs. `tests/unit/consent-registry.test.ts` still passes.
- [X] T011 [US2] Run `tests/unit/locale-path.test.ts`, `tests/integration/locale-redirect.test.ts`, then `pnpm build` and `pnpm exec playwright test tests/e2e/language.spec.ts` (each with a timeout; first make sure nothing old listens on 3100/3101, since `reuseExistingServer` would test a stale build); all pass.

**Checkpoint**: US1 + US2 complete (batch B1).

---

## Phase 5: User Story 3 - Buy in English and get English emails (Priority: P1)

**Goal**: the whole purchase, order page and customer emails are English for an English order;
owner emails stay Hebrew; dates and prices use English formatting.

**Independent Test**: switch to English, add a product, check out offline; every screen and the
confirmation email are English and LTR.

- [X] T012 [P] [US3] Regression test (the behaviour exists; these assertions may pass at once): extend the existing case "an English order gets an English email with the English texts" in `tests/integration/place-order.test.ts` (it already checks `locale = 'en'`, English texts, `/en/order/`, `dir="ltr"`) with what it lacks: `lang="en"` on the html, the total formatted exactly as `formatMoney(<total>, 'ILS', 'en')`, the link `<origin>/en/pages/shipping-returns`, and the owner's `new-order` row for the same order having `locale = 'he'` and `lang="he"`. The cancelled/refunded English cases in `tests/integration/order-emails.test.ts` already exist; leave them.
- [X] T013 [US3] Audit locale use: `grep -rnE "formatMoney\(|formatDate(Time)?\(|'he-IL'|Intl\." src/app/\[locale\] src/components/shop src/server/email/templates`; every call in public pages, shop components and customer email templates (`order-confirmation`, `order-cancelled`, `order-refunded`, `order-parts`) must take the page or order locale, not a literal `'he'`; owner templates (`new-order`, `payment-attention`, `payment-mismatch`, `order-email-failed`, `security-alert`, `contact-message`) and admin keep `'he'`. Fix any mismatch; list what was checked and changed in the task's report. T012 passes.
- [X] T014 [US3] Extend `tests/e2e/language.spec.ts` with the English checkout (phone projects only: `test.skip` on `chromium-desktop`, like `tests/e2e/cart.spec.ts`): from `/en`, open `/en/p/sample-soy-candle`, pick a colour (`option-chip`, as `addCandle` in `tests/e2e/cart.spec.ts`) and add it (`sample-ceramic-bowl` is not orderable), open `/en/cart`, check out with offline payment and self-pickup (reuse the field filling of `tests/e2e/checkout-offline.spec.ts`), land on the English order page; every step has `html[lang=en][dir=ltr]` and shows the header switch; pressing it on the order page opens the same order (same token) under `/he/order/`, and the outbox row's `locale` is still `en`; `readOutbox('order-confirmation')` has one row with `locale = 'en'` whose body contains the English intro and `/en/order/`; the price on the product page and the total in the email are in the English format (`₪` followed by the amount with `.00`); no order date assertion: no public order page or customer email shows a date (FR-013 applies only when a date is shown), so there is no date to assert. On the English order page also run the stray-Hebrew helper (T027 defines it; until then, inline it) and check its canonical and `hreflang` links (`/order/<token>` in both locales). Open `/en/checkout/return?c=<order token>` (the payment return page; reachable directly) and check `html[lang=en][dir=ltr]`, no stray Hebrew, canonical and `hreflang`.

**Checkpoint**: US3 complete.

---

## Phase 6: User Story 4 - Untranslated owner text and the admin marker (Priority: P2)

**Goal**: silent, correctly marked Hebrew fallback on English pages; "no English" badge in the admin
product list.

**Independent Test**: `/en/p/sample-clay-mug` shows Hebrew name and description marked `lang="he"`;
`/admin/products` marks it "אין אנגלית"; filling English removes the badge.

- [X] T015 [P] [US4] Extend `tests/integration/catalog-products.test.ts` (or `tests/integration/public-queries.test.ts` if admin queries are tested there) for `listAdminProducts()`: `missingEnglish` is `true` when `name_en` is null, when it is only spaces, when `description_he` is filled and `description_en` is null or only spaces; `false` when both English fields are non-empty, and `false` when `name_en` is filled and both descriptions are empty.
- [X] T016 [US4] Add `missingEnglish: boolean` to `AdminProductListRow` and `listAdminProducts()` in `src/server/catalog/admin-queries.ts` (true when `name_en` is null or only whitespace, or when `description_he` is non-empty and `description_en` is null or only whitespace — a draft with no Hebrew description is not asked for an English one; owner decision 2026-11-12; select `nameEn`, `descriptionHe`, `descriptionEn`, compute in the mapper). T015 passes.
- [X] T017 [US4] Add key `admin.products.noEnglish` to `src/i18n/messages/he.json` ("אין אנגלית") and `src/i18n/messages/en.json` ("No English"); in `ProductRow` of `src/app/admin/(protected)/products/page.tsx` render one more badge `cn(BADGE, 'border-[1.5px] border-dashed border-field bg-panel text-ink-2')` (distinct from every state badge) when `item.missingEnglish`, after the state and "not orderable" badges. `tests/unit/i18n-parity.test.ts` passes.
- [X] T018 [US4] Add §12.9 "Products list `/admin/products`" to `docs/design/storefront.md` (edit by hand, never prettier): the "אין אנגלית" badge rule (shown when the English name or description is empty; dashed-border badge after the state badges, distinct from them; options and image descriptions not counted). In §7.20 replace "(added by roadmap item 005; 003 does not build it)" (or its equivalent wording) with a description of the built footer switch.
- [X] T019 [US4] Extend `tests/e2e/language.spec.ts`: `/en/p/sample-clay-mug` shows the Hebrew name and description inside elements with `lang="he"` and `dir="auto"`, the page `html` stays `lang="en" dir="ltr"`, and no visible "not translated" note; on `chromium-mobile` only, signed in with `signInAsAdmin`, `/admin/products` shows "אין אנגלית" on the clay mug and not on `sample-ceramic-bowl`.
- [X] T020 [US4] Run T015–T019's tests (unit parity, the integration file, then `pnpm build` and `language.spec.ts`, each with a timeout, nothing old on 3100/3101); all pass.

**Checkpoint**: US3 + US4 complete (batch B2).

---

## Phase 7: User Story 5 - Search engines find both languages (Priority: P2)

**Goal**: canonical + hreflang on every public page, a live sitemap and a robots file.

**Independent Test**: any public page names its canonical and both versions; `/sitemap.xml` and
`/robots.txt` match contracts/seo.md.

- [X] T021 [P] [US5] Write `tests/unit/seo.test.ts` for `alternates()` (mock `@/server/env` `getEnv` → `APP_ORIGIN: 'https://shop.example'`): `alternates('', 'en')` and `alternates('/p/clay-bowl', 'he')` equal the objects in contracts/seo.md exactly (`x-default` = Hebrew; home is `/he`, not `/he/`).
- [X] T022 [P] [US5] Write `tests/integration/sitemap.test.ts` (PGlite, `runSeed` with samples or explicit inserts; mock env): `sitemap()` from `src/app/sitemap.ts` returns, for each locale, home, every category that has a published product (an empty category is left out), every `published` product (not `draft`, not `hidden`), `/pages/<slug>` for `about`, `privacy`, `terms`, `cookies`, `shipping-returns`, `accessibility`, and `/contact`; each entry's `alternates.languages` has `he` and `en`; products carry `lastModified`; nothing for search, cart, checkout, order, admin or api. `robots()` from `src/app/robots.ts` returns `allow: '/'`, `disallow: ['/admin', '/api/']`, `sitemap: '<origin>/sitemap.xml'`.
- [X] T023 [US5] Implement `src/server/seo.ts` (server module, imports `server-only` like its neighbours) `alternates(pathWithoutLocale, locale)` per contracts/seo.md (absolute URLs from `getEnv().APP_ORIGIN`, `languages: { he, en, 'x-default': he }`). T021 passes.
- [X] T024 [US5] Use `alternates()` in `generateMetadata` of every page in contracts/seo.md's table: `src/app/[locale]/(shop)/page.tsx` (add a `generateMetadata` returning only `alternates`; the layout keeps the title), `c/[slug]`, `p/[slug]` (replace their inline `alternates`; keep openGraph), `search`, `cart`, `checkout`, `checkout/fake-pay` (it exports static `metadata`: replace it with a `generateMetadata` that keeps `robots: { index: false, follow: false }`, since a page cannot export both), `checkout/return`, `order/[token]`, `pages/[slug]`, `contact`. Canonicals never include the query; keep each page's existing `robots: noindex`. Not on `not-found.tsx`. Set `alternateLinks: false` in `src/i18n/routing.ts`: next-intl's middleware otherwise sends a `Link` hreflang header whose `x-default` is the unprefixed path and which keeps the query, conflicting with the HTML tags (research R4).
- [X] T025 [US5] Add `listSitemapEntries()` to `src/server/catalog/public-queries.ts` (product `slug` + `updatedAt` where `state = 'published'`; slugs of categories with at least one published product, as `listCategoriesWithProducts()` decides) and implement `src/app/sitemap.ts` and `src/app/robots.ts` (both `export const dynamic = 'force-dynamic'`) per contracts/seo.md, using `CONTENT_SLUGS` minus `contact` from `src/server/content/slugs.ts`. T022 passes. T026's requests confirm that `/robots.txt` and `/sitemap.xml` are served (the proxy matcher skips paths with an extension).
- [X] T026 [US5] Extend `tests/e2e/language.spec.ts` (`chromium-desktop` only): for every `PUBLIC_ROUTES` entry in both locales, the HTML head has `link[rel=canonical]` = `<baseURL>/<locale><path without query>` and `link[rel=alternate]` with `hreflang` `he`, `en` and `x-default` (= the `he` URL); `GET /sitemap.xml` contains `/en/p/sample-ceramic-bowl` and `/he/p/sample-ceramic-bowl`; `GET /robots.txt` contains `Disallow: /admin` and `Disallow: /api/`; `/en/search?q=bowl`, `/en/cart`, `/en/checkout` and an English order page have `meta[name=robots]` containing `noindex` (FR-021); the response for `/he/p/sample-ceramic-bowl` has no `Link` header with `hreflang`.

---

**Checkpoint**: US5 complete.

---

## Phase 8: User Story 6 - The English reads naturally (Priority: P3)

**Goal**: natural English in Aviva's voice; no stray Hebrew on English pages.

**Independent Test**: the owner approves `copy-review.md`; the stray-Hebrew check passes on every
English public page.

- [X] T027 [US6] Extend `tests/e2e/language.spec.ts` (`chromium-desktop` and `chromium-mobile`) with the stray-Hebrew check (research R8): on every `PUBLIC_ROUTES` page under `/en`, no visible text node of `<body>` whose closest `[lang]` ancestor is not `lang="he"` contains a character in `[֐-׿]` (the "עברית" switch carries `lang="he"`); Any Hebrew outside an element with `lang="he"` is a bug (the category page and related products legitimately show `sample-clay-mug`'s Hebrew fallback inside `lang="he"`). Also run it on the English cart with an item and on the English checkout page (phones). Accessibility (constitution › Product Constraints, WCAG 2.1 AA in RTL and LTR): run `AxeBuilder` with tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` (as in `tests/e2e/privacy.spec.ts`) on `/he` and `/en` home and `/he/p/sample-ceramic-bowl` and `/en/p/sample-ceramic-bowl`, with the menu popover open once; no violations. The compact switch's hit area is at least 44×44 px on both `/he` and `/en`: its visible box width + 8 ≥ 44 and height + 8 ≥ 44, and `document.elementFromPoint()` at points 3 px outside each edge of the visible box returns the switch link. Owner text fallback (US4-2): with `shop_settings.shop_name_en` and `sample-ceramics`'s `name_en` set to NULL (SQL through the `sql` fixture, restored by `resetDb()`), run the stray-Hebrew check on `/en` and `/en/c/sample-ceramics` (header brand, footer heading and copyright, breadcrumbs and h1 must carry `lang="he"`).
- [X] T028 [US6] English copy pass on `src/i18n/messages/en.json` values only, namespaces `common`, `shop`, `cart`, `checkout`, `order`, `emails`, `errors`, `consent`, `legal`, `contact` (not `admin`), following `docs/design/storefront.md` §1 › Voice (Aviva in the first person, customers addressed directly, natural English, no literal translation, consistent terms such as "piece", "self-pickup"); keep every key and ICU placeholder (parity test). Do not change Hebrew. Also reword `docs/legal-drafts/terms.en.md` line 7 "operated by a licensed dealer (עוסק מורשה)" to "operated by a licensed dealer (an Israeli VAT-registered business)" (owner decision 2026-11-12: English legal text carries no Hebrew, since Markdown pages cannot mark it `lang="he"`); this re-seeds the `terms` page with the next version on databases where it was not edited, which is expected before launch; confirm `grep -rn "[א-ת]" docs/legal-drafts/*.en.md` finds nothing, and update any test that asserts the old sentence or a fixed `terms` version. Write `specs/005-english-language-switch/copy-review.md`: a table of every changed string (key, before, after) plus a short list of strings deliberately left as they are and why. Before changing a string, grep `tests/` for it (other E2E specs only run in CI) and update any assertion of the old text. `tests/unit/i18n-parity.test.ts` passes.
- [X] T029 [US6] Run `pnpm build`, then `tests/e2e/language.spec.ts` in full (timeouts; nothing old on 3100/3101); all pass (T027 stray-Hebrew included).

---

**Checkpoint**: US6 complete; owner reviews `copy-review.md` at the gate.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T030 Grep `src/` for physical direction (`\b(ml|mr|pl|pr|left|right)-`, `text-(left|right)`, `rounded-[lr]-`, `border-[lr]\b`, and CSS `left:`/`right:`/`margin-left` etc.) and confirm none were introduced; `pnpm lint` and `pnpm check:css` pass.
- [X] T031 After `pnpm build` (reuse T029's build if nothing changed since), run `pnpm exec playwright test tests/e2e/bundle-size.spec.ts` (first-load JS ≤ 150 KB gzipped still holds with the switch island).
- [X] T032 Run `pnpm verify` (typecheck, lint, CSS, unit + integration, audit; `test:pg` when `DATABASE_URL_TEST` is set); all pass.
- [X] T033 Update `docs/roadmap.md`: item 005 status → Done with the spec link (same style as 002–004), and note in its "Source" paragraph that spec 001 T095–T099 are done here. Do not start a dev server: the owner walks through `quickstart.md` at the Phase D gate.

---

## Dependencies & Execution Order

- **Phase 2** (T001–T004) blocks US1 and US2.
- **US1** (T005–T007) → **US2** (T008–T011): US2's e2e cases press the switch.
- **US3** (T012–T014) and **US4** (T015–T020) need only Phase 2 + US1 (they extend the shared `language.spec.ts`).
- **US5** (T021–T026) is independent of US3/US4 in code; T026 edits `language.spec.ts`.
- **US6** (T027–T029) last among stories: the copy pass may change strings other tests assert.
- **Polish** after all stories.
- Sequential by shared file: `tests/e2e/language.spec.ts` (T005 → T008 → T014 → T019 → T026 →
  T027); message files (T017 → T028); `src/app/[locale]/layout.tsx` (T007 only).

### Parallel opportunities

- T001 ∥ T002; T012 ∥ T015 (different test files); T021 ∥ T022; T010 alongside T008/T009.

## Implementation Strategy

1. **MVP**: Phase 2 + US1 → the switch works on every page (B1 also brings US2, which completes
   spec 001's acceptance scenarios 1–4).
2. **B2**: English checkout and emails verified; owner sees untranslated products.
3. **B3**: search engines, copy pass, polish, roadmap.
4. Each batch is reviewed by the `reviewer` before the next; the owner approves `copy-review.md`
   at the Phase D gate.
