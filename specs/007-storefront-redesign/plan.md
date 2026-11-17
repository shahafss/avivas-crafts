# Implementation Plan: Storefront redesign

**Branch**: `007-storefront-redesign` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-storefront-redesign/spec.md`

## Summary

Restyle the whole storefront to look like the owner's Shopify shop, keeping every function and
every text. Most of the work is styling: a new colour set and the Assistant font (D1, D2), a plain
header that lies over a full-width photo on the home page using CSS only (D5), a new home page
with the owner's three photos served in phone-sized and computer-sized versions (D3, D4, D12),
square product photos (D7), a "You may also like" row (D8), and new looks for buttons, chips,
panels and the mint footer (D11). The one new function is the social links: three optional
addresses in admin Settings, checked strictly, shown as icon links in the footer (D9). The admin
area gets the new colours and font only (D10). Owner answers change categories (D17): a piece can be in
several categories, and a "Featured" category (created at release with every existing piece) feeds
a swipeable row on the home page (D18); the category and
sort buttons and the full list move to a new "All pieces" page `/{locale}/shop` (D19). The design
system and `PRODUCT.md` are rewritten to match, including the amended honesty rule (D15). No new
npm dependency, one tiny island (the row's arrow buttons), two small database migrations.

"Dn" refers to a decision in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 6 on Node 24.

**Primary Dependencies**: unchanged: Next.js 16, React 19, Tailwind CSS 4, next-intl 4, Drizzle,
Zod 4, sharp (already a dependency; used by the new photo script). Dev: Playwright 1.65,
`@axe-core/playwright`, Vitest. **No new npm dependency.** The Assistant font is fetched by
`next/font/google` at build time and self-hosted, like Heebo today.

**Storage**: PostgreSQL 17: three nullable columns on `shop_settings` (migration 0005); a
`product_category` join table replacing `product.category_id`, `shop_settings.home_category_id`,
and the release step that creates "Featured" (migration 0004, data-model.md §5). Three
original JPEGs (about 1 MB) in `assets/home-photos/` and their 18 WebP variants (about 3 MB) in
`public/site-photos/`, committed.

**Testing**: Vitest (unit, integration, pg) and Playwright E2E (projects `chromium-desktop`,
`chromium-mobile`, `webkit-mobile`, `consent`). One new spec, `tests/e2e/home.spec.ts`, added to
`STOREFRONT_SPECS` so it also runs on WebKit; no new project, so no CI matrix change.

**Target Platform**: Render web service (unchanged); visitors' phones and computers.

**Project Type**: web application (single Next.js project).

**Performance Goals**: first-load JS ≤ 150 KB gzipped per storefront route, checkout ≤ 155 KB, product page ≤ 152 KB (157 KB with the cart drawer open; owner answer 2026-11-17)
(unchanged; the only new client JavaScript is the row's arrow buttons, well under 1 KB); home hero download on a phone < 200 KB
(SC-005); product and catalog pages usable within 3 s on mobile 4G (SC-004).

**Constraints**: strict nonce CSP (no `style` attributes, no outside fonts or scripts); logical
CSS properties only (lint and `pnpm check:css`); WCAG 2.1 AA in RTL and LTR; no horizontal scroll
at 320 px; Hebrew first; admin layout, wording and steps unchanged; owner's git (no commits).

**Scale/Scope**: about 45 component and page files restyled (storefront and the token swaps in
admin), 6 new components (incl. `HomeRow`, `RowArrows`), 1 new public page, every category query moved
to the join table, 2 new queries, 2 settings sections, 1 script, 2 migrations, 2 documents
rewritten, about 14 test files changed or added.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How this plan meets it |
|---|---|---|---|
| I | Hebrew-first, bilingual | ✅ | Every new text (banner, band, row link and arrow names, "All pieces" title, category checkboxes and home-row setting labels, alt texts, social names, admin labels and errors) is in `he.json` and `en.json` (parity test). Header, hero, banners (scrim side flips with `dir`), product page and footer use logical properties, so English is a real left-to-right layout (FR-006). The shop name falls back to Hebrew with `lang="he"` as today. |
| II | Non-technical owner | ✅ | Social links: three plainly labelled fields with an example, scheme added automatically, one plain Hebrew message per mistake that says how to fix it; empty = removed. Owner guide gains a short section. Admin screens otherwise unchanged. |
| III | Frictionless guest shopping | ✅ | No step, field or account added; cart, checkout, payment return and order pages keep every function (FR-002, SC-002, SC-007). Mobile-first: phone layouts are designed first (375 px), 320 px checked. |
| IV | Security by design | ✅ | OWASP Top 10 (2025), relevant items: **A01 Broken access control** — the social fields and the home-row category are saved only through the existing `updateSettings` action behind `requireAdmin`; the piece's category set is saved only through the existing product save action behind `requireAdmin`, with every id checked to exist; no new admin route; the public row and "All pieces" page read published pieces only. **A02 Security misconfiguration** — CSP unchanged (`font-src 'self'`, `img-src 'self'`, no new host); the photo cache header adds no new origin; `nosniff` already on every path. **A03 Supply chain** — no new npm dependency; the font is fetched at build time from Google Fonts by `next/font` exactly as Heebo is today and served from the shop's own address. **A05 Injection (incl. XSS)** — social addresses must parse as `https` URLs on the platform's own domain (blocks `javascript:`, `data:`, look-alike hosts, credentials); React escapes the `href`; a database check repeats the `https` and length rule. **A09 Logging** — saving writes the existing `settings.updated` activity row, without the addresses; category-set changes are covered by the existing `product.updated` row. **A10 Exceptional conditions** — an invalid address is never saved (fail closed); a missing photo variant fails the unit test and the script, not the page. Uploads are unaffected (the home photos are not uploads; they are processed by the maintainer's script and stripped of metadata). |
| V | Simplicity and low cost | ✅ | No new dependency or service; one tiny island (row arrows, D18), no carousel library; the row swipes with CSS alone; categories are reused rather than adding a second grouping concept; a join table is the simplest way to allow several per piece (D17); the header behaviour is CSS; photos are static files. Generated photo variants are committed so the build never runs the script. Nothing beyond the simplest working approach needs Complexity Tracking. |
| VI | Tested critical paths | ✅ | Every critical-path test (order, payment, admin products, admin access, consent, language) runs unchanged on the new look; layout, accessibility and design-review specs are updated (D14). New behaviour has unit, integration and E2E tests (social links, "You may also like", photo budgets, header states). |
| VII | Privacy and legal | ✅ | No new cookie, storage item, tracker or third-party request: fonts and icons are self-hosted, social links are plain links that contact the platform only on a click, with the existing `strict-origin-when-cross-origin` referrer policy. The new columns hold the shop's own public addresses, not personal data (purpose and retention in [data-model.md](data-model.md)). The privacy launch-day test ("nothing from another origin") keeps guarding this. |
| Product constraints | Images, AA, indexable | ✅ | Home photos are resized into phone and wide variants (D3); AA over photos by construction (D4); headings and alt texts in both languages. |
| Workflow | Design doc, branch, CI | ✅ | `docs/design/storefront.md` rewritten with this feature (D15) and cited by section in tasks; `PRODUCT.md` honesty rule and look amended (owner decision 11); new E2E spec joins an existing project (no matrix entry needed); roadmap status at the end; no commits by tooling. |

No violations, so the Complexity Tracking table stays empty.

Amended 2026-11-17 (owner fixes, D21): principle V now also covers two small client islands
(`HeaderScrollState`, `DrawerController`) and the lazy cart drawer body; III: the cart page is
removed by owner decision and its function moves unchanged into the cart drawer (FR-048); VI: the
cart, checkout and accessibility specs are rewritten for the drawer (T092, T093); product
constraint "AA over photos" has one accepted owner exception (the two banners, spec 2026-11-17).
See the D21 re-check under "Menu and cart drawers".

## Design

### Tokens, font and global CSS (D1, D2, D4, D11)

- `src/app/globals.css`: new `@theme` colour tokens (D1 table), radius values (card 12 px, chip
  8 px, pill), re-tinted `shadow-float`, `--font-sans: var(--font-assistant), system-ui,
  sans-serif`, `--header-h` (64 px; 72 px from 900 px), `--scrim-large: 0.42` and `--scrim-text: 0.55`,
  text-band scrim classes (`.scrim-band` base with `-top`, `-bottom`, `-banner`; D4), the header-over-hero
  rules inside `@supports` (D5), `html { scroll-padding-top: var(--header-h) }`, selection
  colours, focus ring `ink` (`on-photo` inside photo sections, `currentColor` in the header),
  scrollbar colour.
- `src/app/fonts.ts`: `assistant` replaces `heebo`; used by `src/app/[locale]/layout.tsx`,
  `src/app/admin/layout.tsx`, `src/app/global-error.tsx`.
- `tests/unit/design-tokens.test.ts`: no removed token name in `src/**/*.{ts,tsx,css}`; the D1
  contrast pairs recomputed from `globals.css` meet their minimum; the worst-case contrast of
  `on-photo` over `--scrim-large` is ≥ 3:1 and over `--scrim-text` ≥ 4.5:1.

### Token mapping

Every use of a removed token is swapped as follows (storefront and admin alike):

| Old | New | Notes |
|---|---|---|
| `ground` | `paper` (the admin Markdown preview gets a `line` outline) | the admin page background is the global `body` rule, so `src/app/admin/layout.tsx` adds `bg-photo` to `<body>` (D10) |
| `panel` | `paper` | panels gain a 1 px `line` outline where they sat on cream before |
| `sun` (buttons, strip, active ring) | `forest` (text on it becomes `paper`) | |
| `sun` (cart badge) | `sage` | text stays `ink` |
| `sun-hover` | `forest-hover` | |
| `sun-soft` (selected fills, selection, offline panel, badges, check circle, hovers) | `sage` | selected states also get the `ink` border |
| `sun-ink` (facts icons) | `forest` | |
| `rose` | `peach` | made-to-order note |
| `rose-ink` | `ink` (text) / `forest` (yarn icon) | |
| `peach` (footer) | `mint` | `peach` now means the band and the note |

`ink`, `ink-2`, `line`, `field`, `photo` and `alert` keep their names with new values.

### Header and page frame (D5, D6, FR-007–FR-009)

- `src/components/shop/Header.tsx`: plain full-width bar (no pill, no shadow), three-column grid
  `1fr auto 1fr`, slots as in [contracts/ui.md](contracts/ui.md#page-frame-every-public-page);
  `id="site-header"`, test ids `site-header` and `header-brand`; menu sheet at inline-start;
  `IconButton` hover tint works on both white and photo.
- `src/components/shop/HeaderCategories.tsx`: link styles only.
- `src/components/shop/LanguageSwitch.tsx`: compact pill border and text in `currentColor`
  (white over the photo), hover `sage`; hit area unchanged.
- `src/components/shop/CartLink.tsx`: badge `sage`.
- `src/components/shop/AnnouncementBar.tsx`: `forest` strip, `paper` text (text and rules
  unchanged).
- `src/app/[locale]/layout.tsx`: font, skip link colours, `<main>` full-bleed variant (D6).

### Header redesign from the Phase D gate (D20, FR-008, FR-010, FR-039–FR-043)

Supersedes the layout lines above where they differ (the CSS-only see-through switch of D5 stays).

- `src/app/globals.css`: `--breakpoint-nav: 64rem`; the blended strip replaces `.scrim-band-top`
  (D20); drop the header-centred grid rules that no longer apply.
- `src/components/shop/Header.tsx`: below `nav` the grid menu | brand | cart; from `nav` one flex
  row: links, brand (≤ 160 px, ellipsis), `HeaderSearch`, cart; every item `shrink-0` except the
  brand. No search icon, no language switch, no `menuOnDesktop` rule.
- `src/components/shop/HeaderCategories.tsx`: desktop links = "All pieces" +
  `pickHeaderCategories(settings, categories)` + "About" + "Shipping & Returns" (`common.nav.*`
  labels; each category name in an inner span ≤ 95 px with an ellipsis, the focus ring on the
  `<a>`); menu sheet = search form, "All pieces", every category with pieces, "About", "Shipping &
  Returns", "Contact", full-word language link (as today). `HEADER_CATEGORY_LIMIT` goes.
- New `src/components/shop/HeaderSearch.tsx` (server, plain GET form, FR-043; 44 px, explicit ink
  colours, `maxLength` 80, its own `aria-label`), used in the header and in the menu sheet; the
  search page's own form gets a distinct `aria-label`.
- `src/components/shop/AnnouncementBar.tsx`: always rendered (`data-testid="announcement-bar"`),
  holds the compact `LanguageSwitch` at the inline end (FR-041), focus ring `paper` on `forest`;
  with no text it holds only the switch.
- `src/components/shop/HomeHero.tsx`: drop the tagline `<p>`; the top band becomes the blended
  strip only.
- Data: `shop_settings.header_category_1_id`, `header_category_2_id` (migration `0006`,
  data-model.md §6); `pickHeaderCategories` (pure, `src/server/catalog/header-categories.ts`) fed
  by the layout's existing `getSettings()` and `listCategoriesWithProducts()`, so no new query;
  Settings "דף הבית" section gets two selects; category name validation max 12 on create and
  update, with `nameTooLong` mapped to the name field in `categories.ts` (FR-040).
- Security (constitution IV): the two new settings are saved only through the existing
  `updateSettings` action behind `requireAdmin`, each id checked to exist (A01); the search form is
  a plain GET to the existing search page, whose query parsing and 80-character limit are
  unchanged (A05); no new route, dependency, island or third-party request.

### Menu and cart drawers (D21, FR-002, FR-044–FR-048; owner answers 2026-11-17)

Both drawers are native popovers restyled as full-height side drawers sliding in from the top of
the viewport (menu: reading start; cart: reading end), with CSS transitions (`@starting-style`,
`allow-discrete`), a dimmed backdrop and a CSS scroll lock. The menu's close button sits on the
menu button's pixels and turns its three lines into an X; the cart's close X sits on the cart
button's place. The cart drawer's body is the old cart page logic as a client island loaded on
first open; `/{locale}/cart` is removed, and every link to it opens the drawer
([research D21](research.md#d21-menu-and-cart-drawers-owner-answers-2026-11-17-fr-002-fr-008-fr-044fr-048)).
Constitution re-check for D21: no new data, no new server surface (the `priceCart` action moves
unchanged; one route is removed by owner decision, FR-048), CSP unchanged (no inline style or
script; `--drawer-top` is set through the CSSOM), WCAG 2.1 AA (modal drawers (every other top-level child of `<body>` is `inert`), focus
moved in and returned to the opener, named dialogs and close buttons, 44 px targets, reduced
motion), bundle limits unchanged (the drawer body is lazy; the `cart` messages add HTML, not JS).
Complexity added at the owner's request: one controller island (`DrawerController`) and the lazy
`CartDrawerBody`, on top of `HeaderScrollState`. Simplest option: native popovers give opening
without JavaScript, light dismiss, `Esc` and one-at-a-time for free; the island only adds what
popovers lack (position under the strip, modality, focus return, closing on navigation).

### Home page (D3, D4, D12, FR-010–FR-014)

- `scripts/build-home-photos.ts` + `package.json` script `photos:home`;
  `src/lib/home-photos/{config.ts,manifest.json}`; `assets/home-photos/*.jpg`;
  `public/site-photos/*.webp`; cache header in `next.config.ts`
  ([contracts/home-photos.md](contracts/home-photos.md)).
- New server components: `src/components/shop/HomePhoto.tsx` (`<picture>`),
  `src/components/shop/HomeHero.tsx`, `src/components/shop/PhotoBanner.tsx`,
  `src/components/shop/StatementBand.tsx`.
- `src/app/[locale]/(shop)/page.tsx`: the new structure and test ids
  ([contracts/ui.md](contracts/ui.md#home-page-locale)); section order as in the Shopify shop (owner answer Q1).
- `src/components/shop/ProductGrid.tsx` / `ProductCard.tsx`: `eager` prop / `eagerCount` (the
  home row's cards lazy; "All pieces", category and search first 4 eager) (D13).
- `src/i18n/messages/{he,en}.json`: `shop.home.*`.

### Categories per piece, home row and "All pieces" page (D17–D19, FR-031–FR-038)

- Schema: `product_category` join table; `product.categoryId` removed;
  `shopSettings.homeCategoryId`; migration `0004_product_categories.sql` with the hand-written
  release step ([data-model.md §5](data-model.md#5-several-categories-per-piece-and-the-home-row-category)).
- Server: every use of `product.categoryId` moves to the join table (`public-queries.ts`,
  `admin-queries.ts`, `categories.ts` counts and delete check, `products.ts` save and
  `missingForPublish`, `sample-products.ts`, `sitemap`); `listPublishedProducts` gains `limit`;
  `getHomeRow(locale)`; product detail gains `categories` and `mainCategory`; `listAlsoLike` takes
  `categoryIds`; settings save accepts `homeCategoryId`; seed sets the home category on a new
  settings row and links samples to `featured`.
- Admin: `ProductEditor` checkboxes instead of the dropdown; products list shows several names;
  "Home page" section in `SettingsManager`.
- Public: `src/components/shop/HomeRow.tsx` (server), `src/components/shop/RowArrows.tsx`
  (client); new route `src/app/[locale]/(shop)/shop/page.tsx` with the old home catalog content;
  `CategoryChips` "All" → `/shop`; header "All pieces" link and `HEADER_CATEGORY_LIMIT` 4; sitemap;
  "continue shopping" and not-found links → `/shop`; statistics count `/shop`.
- Contract: [contracts/home-row.md](contracts/home-row.md).

### Product photos and cards (D7, D11, FR-015, FR-016)

- `ProductCard.tsx`: square well, no radius, larger regular-weight name, small `ink-2` price;
  "not available" label unchanged.
- `Gallery.tsx`: square main track and wells, 72×72 square thumbnails, current thumbnail ring
  `forest` 3 px; zoom dialog unchanged except colours (`photo` background, `object-contain`).
- `CartLine.tsx` (72×72), `OrderSummary.tsx` (48×48): square, no radius.

### Product page (D8, D11, FR-017–FR-020)

- `src/app/[locale]/(shop)/p/[slug]/page.tsx`: details without the white panel, larger title,
  facts icons `forest`, the "You may also like" section (test id `also-like`).
- `src/server/catalog/public-queries.ts`: `listAlsoLike` replaces `listRelatedProducts`.
- `BuyBox.tsx`, `QuantityStepper.tsx`, `OptionSelector.tsx`, `AddToCart.tsx`: colours, outlined
  pill quantity box, `forest` add-to-cart (behaviour unchanged).
- Messages: `shop.product.alsoLike` added, `shop.product.related` removed.

### Shared UI primitives (D11, FR-021, FR-022)

`src/components/ui/`: `button-styles.ts` (primary `forest`; secondary stays the outlined
button with the new colours, so no caller changes; new `soft` = sage fill for the banner buttons;
quiet), `Button`, `LinkButton`, `IconButton`, `ChipLink`, `ChipRow`, `Notice` (made = peach),
`EmptyState` (sage circle), `Checkbox`, `RadioCard` (selected sage + ink border), `TextField`,
`TextArea`, `SelectField`, `Field`, `ErrorSummary`, `Skeleton`, `ConfirmDialog`, `Toast`,
`Breadcrumbs`, `Disclosure`, `Prose`, `Price`, `Icon` (adds `instagram`, `facebook`, `tiktok`).
Consent banner choices stay `secondary`, equal in size and style (003 FR-021).

### Other public pages (FR-021)

Restyle only (colours, panels with `line` outline, page titles 32/44 px, spacing): category and
search pages, cart (`CartView.tsx`), checkout (`CheckoutForm.tsx`, `CheckoutProblems.tsx`),
payment return (`ReturnView.tsx`), order page (`OrderProgress.tsx` current ring `forest`, payment
chip `sage`), content pages, contact (`ContactForm.tsx`), `StorageTable.tsx`, consent
(`ConsentBanner.tsx`, `ConsentRoot.tsx`), `not-found.tsx`, `p/[slug]/not-found.tsx`,
`error.tsx`, `global-error.tsx`.

### Footer and social links (D9, FR-023–FR-026)

- `src/server/db/schema/commerce.ts` + migration `0005_social_links.sql`
  ([data-model.md](data-model.md)).
- `src/lib/validation/settings.ts`: `socialUrl(platform)` rules
  ([contracts/social-links.md](contracts/social-links.md)).
- `src/server/settings/settings.ts`: no logic change (the fields flow through the existing
  partial-update path); `src/app/admin/(protected)/settings/page.tsx` passes the three fields.
- `src/components/admin/SettingsManager.tsx`: new `SocialSection`.
- `src/components/shop/Footer.tsx`: mint, no rounded top, social list; new
  `src/components/shop/SocialLinks.tsx` (server).
- Messages: `common.footer.social.*`, `admin.settings.social.*`,
  `admin.settings.errors.social.*`.

### Admin colours and font (D10, FR-027)

Token swaps in every file under `src/app/admin/` and `src/components/admin/` that uses a removed
token (found by the grep in the token-swap task), plus `bg-photo` on the admin `<body>`.
Reviewer rule: in these folders the diff contains only colour-token class changes, apart from the
social section in `SettingsManager.tsx` and the settings page props.

### Documents (D15, FR-028–FR-030)

`docs/design/storefront.md` (rewrite in place, same section numbers), new
`docs/design/home-example.src.html` and `PRODUCT.md` are written **first**, before any code, so
they are binding for the implementation and its reviews (tasks then cite storefront.md sections);
then `docs/owner-guide-he.md`,
`docs/launch-checklist.md` (backup before releasing 007), `docs/security/threat-model.md`,
`docs/roadmap.md`, `CLAUDE.md`.

### Tests (D14)

As listed in research D14. Order in tasks: unit and integration tests are written with the code
they test; the E2E updates come with their screens; the full design review and the
accessibility run close the feature.

## Project Structure

### Documentation (this feature)

```text
specs/007-storefront-redesign/
├── spec.md               # approved 2026-11-16
├── plan.md               # this file
├── research.md           # D1–D20
├── data-model.md         # social-link columns; home-photo config and manifest; categories per piece
├── quickstart.md         # how to check each story locally
├── contracts/
│   ├── ui.md             # page frame, header states, home sections, texts for approval, test ids
│   ├── home-photos.md    # files, script, serving, markup, budgets
│   ├── social-links.md   # validation, messages, admin form, footer output
│   └── home-row.md       # categories per piece, home row, "All pieces" page
├── checklists/
│   └── requirements.md
└── tasks.md              # /speckit-tasks
```

### Source Code (repository root)

```text
assets/home-photos/{hero-workshop,banner-child-play,banner-shelf}.jpg   # new (originals)
public/site-photos/*.webp                                               # new (generated)
scripts/build-home-photos.ts                                            # new
package.json                                                            # + photos:home
next.config.ts                                                          # cache header for /site-photos
playwright.config.ts                                                    # + home spec in STOREFRONT_SPECS
src/app/globals.css                                                     # tokens, scrims, header rules
src/app/fonts.ts                                                        # Assistant
src/app/[locale]/layout.tsx, error.tsx, not-found.tsx
src/app/[locale]/(shop)/page.tsx                                        # new home page
src/app/[locale]/(shop)/shop/page.tsx                                   # new "All pieces" page
src/app/sitemap.ts                                                      # + /shop
src/app/[locale]/(shop)/p/[slug]/page.tsx, p/[slug]/not-found.tsx
src/app/[locale]/(shop)/{c/[slug],search,cart,checkout,checkout/return,order/[token],pages/[slug],contact}/page.tsx
src/app/admin/layout.tsx, src/app/admin/(protected)/**                  # token swaps; settings page props
src/app/global-error.tsx
src/components/shop/{HomePhoto,HomeHero,PhotoBanner,StatementBand,SocialLinks,HomeRow,RowArrows}.tsx   # new
src/components/shop/HeaderSearch.tsx                                    # new (Phase 9, D20)
src/server/catalog/header-categories.ts                                 # new: pickHeaderCategories (Phase 9)
src/components/admin/ProductEditor.tsx, src/app/admin/(protected)/products/**   # category checkboxes, list
src/components/shop/*.tsx                                               # restyle (see Design)
src/components/ui/*.tsx, button-styles.ts                               # restyle, Icon additions
src/components/admin/SettingsManager.tsx                                # social section
src/components/admin/*.tsx                                              # token swaps
src/lib/home-photos/{config.ts,manifest.json}                           # new
src/lib/validation/settings.ts                                          # social rules
src/server/catalog/public-queries.ts                                    # listAlsoLike, getHomeRow, join table
src/server/catalog/{admin-queries,categories,products,sample-products}.ts, src/lib/validation/product.ts   # categoryIds
src/lib/analytics/normalise-path.ts                                     # count /shop
src/server/db/seed.ts                                                   # home category, samples in featured
src/server/db/schema/{commerce,catalog}.ts, src/server/db/migrations/{0004_product_categories,0005_social_links,0006_header_categories}.sql
src/i18n/messages/{he,en}.json
tests/unit/{design-tokens,social-links,home-photos}.test.ts             # new
tests/unit/header-categories.test.ts                                    # new (Phase 9)
tests/integration/{public-queries,settings,schema}.test.ts              # extended
tests/integration/{catalog-products,sitemap,seed}.test.ts + a 0004 migration test   # categories per piece
tests/helpers/checkout.ts                                               # products inserted with categories
tests/e2e/home.spec.ts                                                  # new
tests/e2e/{storefront-layout,language,a11y,admin-settings,design-review,catalog,headers,privacy}.spec.ts
docs/design/storefront.md, docs/design/home-example.src.html, PRODUCT.md
docs/owner-guide-he.md, docs/security/threat-model.md, docs/roadmap.md, CLAUDE.md
```

**Structure Decision**: the existing single Next.js project. Photo originals go in a new
top-level `assets/` folder (sources, not served); generated files in `public/` (served).

## Risks

- **Scroll-driven CSS behaves differently between browsers.** Mitigation: the resting state is
  the safe white bar; tests require the white bar after scrolling on every browser and the
  transparent state only on Chromium; the IntersectionObserver island (D5 alternative) is the
  fallback plan, raised with the owner before use because it adds JavaScript.
- **Restyling about 45 files breaks existing E2E locators.** Mitigation: test ids and accessible
  names are kept (contracts/ui.md); the changed locators are listed in D14; the layout and
  accessibility specs run after each batch on single spec files (CLAUDE.md: long local E2E runs
  hang; full run in CI).
- **The Google font download fails during a build.** Same risk as Heebo today; fallback is
  `next/font/local` with committed files (D2).
- **Text over very bright photo areas.** Handled by construction (D4); the design review still
  checks the look.
- **Swipe rows and right-to-left**: browsers report `scrollLeft` as negative in RTL; the arrow
  logic and its E2E test cover both directions on Chromium and WebKit.
- **The release step changes live data** (moves every piece's category into the join table and
  adds "Featured"). Mitigation: it runs inside the migration's transaction; a migration test runs
  it on a database with pieces; the 006 backup is taken before release (launch checklist).
- **Several categories per piece touches many queries and tests** (every `category_id` use).
  Mitigation: one batch does all of them with the integration tests first; `grep -rn
  "categoryId\|category_id" src tests` must show only the join table afterwards.
- **Darker strip behind the header and final texts are judged on the finished page** (owner
  answers, research D16). A change there is a small follow-up task.

## Post-design Constitution Check

Re-checked after D1–D19 and the contracts: still no violations. Re-checked again after D20 (the
Phase D gate header): no violations. I and II: the header row uses logical properties and runs
right to left in Hebrew; every new text (search labels, setting names, the name-length error) is in
both message files. III: the header stays server-rendered with no new island; the search form
works without JavaScript; first-load JavaScript does not grow (checked by `bundle-size.spec.ts`).
IV: as listed under "Header redesign" above. V: two nullable columns and a pure function, no new
query or dependency; overlap is prevented by fixed widths rather than measuring code. VI: unit,
integration and E2E tests are written first (tasks T073, T074). The feature adds one tiny island
(row arrows), no third-party request and no personal data; the new inputs (social links,
category sets, the home-row category) are validated on the server behind `requireAdmin` and
constrained again in the database.

## Complexity Tracking

None.
