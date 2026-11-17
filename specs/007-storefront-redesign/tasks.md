# Tasks: Storefront redesign

**Input**: Design documents from `specs/007-storefront-redesign/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D20), data-model.md, contracts/ (ui.md,
home-photos.md, social-links.md, home-row.md), quickstart.md

**Tests**: required. The spec's success criteria SC-002, SC-003, SC-005 and SC-006 are checked by
automated tests, the constitution (VI) requires the critical paths to keep passing, and the one
new input (social links) is security-relevant. Tests for new logic are written first and must
fail before their implementation task.

**Organization**: the new colours and font replace the old ones everywhere at once (a removed
colour name would silently render nothing), so tokens, font, the shared building blocks, the
header and the footer frame are foundational (Phase 2). Then the spec's stories in priority order.
Documents and the full checks close the feature.

**Rules for every batch**: no `style` attribute or prop (CSP); logical properties only
(`ms-/me-/ps-/pe-/start-/end-`, `pnpm check:css`); every visible string from
`src/i18n/messages/{he,en}.json` with both languages; keep every existing `data-testid` and
accessible name unless a task says otherwise; no new npm dependency. Run commands with timeouts;
never start watch mode or a dev server that does not exit. Run E2E specs one file at a time
(`pnpm build` once, then `pnpm exec playwright test <file> --project=<project>`); the full E2E
run is CI's (CLAUDE.md). Design system: `docs/design/storefront.md`, rewritten first (T004–T006, in
Phase 2) so it is binding before any code changes. Section map for this feature: tokens §3;
page frame and header states §4; icons §5; photos and home photos §6; buttons §7.1; chips §7.3;
notices §7.4; form controls §7.10; quantity box §7.11; gallery §7.14; cards §7.15; strip §7.17;
header §7.18; language switch §7.19; footer §7.20; consent §7.21; cart and summary lines
§7.22–§7.23; home components §7.27–§7.30; social links §7.31; home row §7.32; home page §8.1; "All
pieces" page §8.14; categories per piece §12.11; product page §8.4;
other screens §8.2–§8.13; performance §10; verification §11; admin §12.

**Owner answers** (2026-11-16, recorded in the spec and research D16): lower home page as in the
Shopify shop (child banner, peach band with a "shop now" link, shelf banner); thin hero shop name
and band sentence; white-bar fallback in older browsers accepted; header see-through only at the
very top of the home page, the same for everyone; darker strip behind the header accepted for
now; no marking of the AI photos; texts fine for now, reviewed on the finished page (T069).
Second and third rounds: the home page shows a swipeable row of the pieces in the home-row
category, "Featured" at release (research D17, D18); a piece can be in several categories (D17); the category and sort buttons and the full list move to a new "All pieces"
page `/{locale}/shop` (D19), and the "continue shopping" links lead there; reduced motion is respected for real movement (card zoom, the row's
sliding) while the header switch stays the same for everyone.

**Suggested implementation batches**: B0 = photos and binding documents (T001–T006); B1 =
Phase 2 code (T007–T016); B2a = US1 photos and home sections (T017–T026); B2b = US1 categories
per piece, home row and "All pieces" page (T027–T033); B3 = US2 product page and "You may also like"
(T034–T039); B4 = US2 other pages and their tests (T040–T044); B5 = US3 social links (T045–T054);
B5b = US5 home-row setting and category checkboxes tests (T055–T059); B6 = US4 admin (T060–T062); B7 = remaining documents
and design review (T063–T065); B8 = final checks (T066–T068). T069 and T071 are the
coordinator's; T070 is a small implementer batch after the owner answers. Phase 9 (the header from
the Phase D gate) has its own batches B9a–B9e, listed at the top of that phase; T071 follows it.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Copy the owner's three original photos, unchanged, from `/Users/shahaf/Library/Application Support/Claude/side-session-notes/local_52d00e93-2e11-427a-bec0-bfcdff50c114/photos/` (`hero-workshop.jpg`, `banner-child-play.jpg`, `banner-shelf.jpg`, each 2000×848) to `assets/home-photos/` (new folder, not served). Check with `sharp(...).metadata()` that each is 2000×848 and report their sizes. If the source folder is unreadable, stop and report (do not substitute other images).

---

## Phase 2: Foundational (colours, font, building blocks, header, footer frame)

**Purpose**: first the binding documents are rewritten (T002 the visual reference, T003
`PRODUCT.md` with the amended honesty rule, T004–T006 the design system), so every later task and
review works against them. Then every page uses the new tokens and Assistant (research D1, D2,
D11; storefront.md §2–§3); the header is the plain bar (§4, §7.18; without the over-photo
behaviour, which is US1) and the footer is mint (§7.20; without social links, which is US3).
Blocks every story.

- [X] T002 [P] Create `docs/design/home-example.src.html` from `/Users/shahaf/Library/Application Support/Claude/side-session-notes/local_52d00e93-2e11-427a-bec0-bfcdff50c114/home-mock.html`: replace every embedded `data:image/...` photo with a relative link to `../../assets/home-photos/<file>.jpg` (hero, child, shelf as used in the mock); the fourth embedded image (a product-card photo) is replaced by the example's own "photo goes here" placeholder markup used on its other cards; keep the rest as is (it is a reference document, not served). Report its size (expected well under 100 KB).
- [X] T003 [P] Update `PRODUCT.md` per research D15: Brand Commitments "Storefront look (approved 2026-11-16)" describes the Shopify-like direction (white page, near-black green text, sage and dark green buttons, peach band, mint footer, Assistant; full-width photos on the home page; square product photos) and still says it must not feel like a childish toy store or a cold luxury boutique, binding reference `docs/design/storefront.md`; Evidence on Hand "Exists" adds "three lifestyle images supplied by the owner for the home page (AI-generated from Aviva's real pieces and her real look; approved 2026-11-16)"; "never fabricate" list: "photos of Aviva or her workspace" → "any other photos of Aviva or her workspace"; Product principle 5 adds "The owner-supplied lifestyle images on the home page are the one allowed exception to 'never invent'; no other invented photos." Principle 1 unchanged (product photos stay Aviva's own).
- [X] T004 Rewrite `docs/design/storefront.md` in place per research D15, keeping every section number: header note "Amended 2026-11-16 by `007-storefront-redesign`" and the new visual authority (`docs/design/home-example.src.html`; the old product sample kept, marked superseded 2026-11-16); §1 selected direction, proof and the amended honesty rule (text in research D15); §2 fonts row (Assistant, variable, hebrew + latin, `--font-assistant`); §3.1 colour table and rules exactly as research D1 (with the contrast numbers); §3.2 type scale (research D11); §3.3 radius, shadow, header height, the two scrim strengths and text bands (research D4); §3.5 motion (reduced motion turns off the card zoom, smooth scrolling and the row's sliding; the header's instant switch is the one exception and stays the same for everyone; no autoplay anywhere); §2 "Images" row extended to the home photos' `<picture>` markup; §4 page frame (contracts/ui.md), full-bleed home (D6), header states (D5); §5 icons + `instagram`, `facebook`, `tiktok`; §6 square display (D7), the home-photo table and "Changing a home photo" steps (D3). (Part 1 of 3; parts 2 and 3 follow in the next two tasks, done in the same batch before any code task.)
- [X] T005 Continue `docs/design/storefront.md` (part 2 of 3): §7 updated components (7.1 buttons incl. the new `soft` variant, 7.2, 7.3 chips, 7.4 notices, 7.8, 7.10, 7.11 quantity box, 7.14 gallery, 7.15 cards and `eagerCount`, 7.17 strip, 7.18 header, 7.19 switch, 7.20 footer with social links, 7.21 consent buttons, 7.22, 7.23) and new 7.27 `HomePhoto`, 7.28 `HomeHero`, 7.29 `PhotoBanner`, 7.30 `StatementBand`, 7.31 `SocialLinks`, 7.32 `HomeRow` and `RowArrows` (contracts/home-row.md "Home row": scroll snap, card widths, arrows, reduced motion, RTL).
- [X] T006 Finish `docs/design/storefront.md` (part 3 of 3): §8.1 home (contracts/ui.md, in the Shopify order: child banner, peach band with its "shop now" link, shelf banner), §8.4 product page (no panel, "You may also like" rule), short "new look" notes on §8.2–§8.13, new §8.14 "All pieces" page (contracts/home-row.md); §10 performance (hero LCP, cards lazy on home, one tiny island `RowArrows`); §11 verification table (+ `home.spec.ts`, `design-tokens.test.ts`, `home-photos.test.ts`, square-photo, row and header-state checks); §12.1 admin frame colours and badge table, §12.9 products list (several category names; the filter goes through the links), §12.8 chart colours, new §12.10 paragraph for the social section and the home-row category select, new §12.11 the piece editor's category checkboxes; §13 deviations from the home example (e.g. the example's 18 px hero line → 24 px for contrast by construction; hero name max 150 → 128 px; stronger scrims, 55 % behind the header; the example's JS header switch → CSS; mock note removed); §14 add decisions 3–9 with the owner's answers of 2026-11-16 (research D16). From this task on, the document is the binding reference for every later task, which cites its sections.
- [X] T007 [P] Write `tests/unit/design-tokens.test.ts` (must fail before T008–T010): (a) scan `src/**/*.{ts,tsx,css}` and fail on any use of a removed colour name — utility classes matching `\b(bg|text|border|border-[setbx]|ring|outline|fill|stroke|from|via|to|decoration|caret|accent|divide|placeholder)-(ground|panel|sun|sun-hover|sun-soft|sun-ink|rose|rose-ink)\b` (also with `hover:`/`focus:`/other variant prefixes and `/opacity` suffixes) and `var(--color-(ground|panel|sun|sun-hover|sun-soft|sun-ink|rose|rose-ink))`; (b) parse the `@theme` block of `src/app/globals.css` and assert these contrast minima (WCAG formula): ink/paper ≥ 4.5, ink-2/paper ≥ 4.5, ink-2/photo ≥ 4.5, ink-2/peach ≥ 4.5, ink-2/mint ≥ 4.5, ink-2/sage ≥ 4.5, ink/sage ≥ 4.5, ink/sage-hover ≥ 4.5, ink/mint ≥ 4.5, ink/peach ≥ 4.5, paper/forest ≥ 4.5, paper/forest-hover ≥ 4.5, alert/paper ≥ 4.5, alert/photo ≥ 4.5, alert/peach ≥ 4.5, alert/sage ≥ 4.5, field/paper ≥ 3, field/photo ≥ 3, forest/photo ≥ 3, forest/paper ≥ 3; (c) parse `--scrim-large` and `--scrim-text` from `globals.css`, and assert that `on-photo` (#FFFFFF) over pure white darkened by black of that alpha has contrast ≥ 3.0 (`--scrim-large`) and ≥ 4.5 (`--scrim-text`) (research D4).
- [X] T008 Rewrite the tokens in `src/app/globals.css` per research D1 and D11: in `@theme` keep `--color-*: initial`, then exactly `paper #FFFFFF`, `photo #EEF2EE`, `ink #061406`, `ink-2 #3E4E3F`, `line #DDE5DD`, `field #6B7D6C`, `sage #CFE2D0`, `sage-hover #BCD6BE`, `forest #1E4620`, `forest-hover #163518`, `peach #F7E5D7`, `mint #A3D9A5`, `alert #A32018`, `on-photo #FFFFFF`, `transparent`, `current`; radius `--radius-card: 12px`, `--radius-chip: 8px`, `--radius-pill: 999px`; `--shadow-float: 0 3px 14px rgb(6 20 6 / 0.12)`; `--font-sans: var(--font-assistant), system-ui, sans-serif`; breakpoints and z-index unchanged. Outside `@theme`: `:root { --header-h: 64px; --scrim-large: 0.42; --scrim-text: 0.55 }` and `--header-h: 72px` from 900 px; `html { scroll-padding-top: var(--header-h) }`; `body` background `paper`; `::selection` `sage`/`ink`; focus ring `3px solid ink`, offset 3 px; scrollbar thumb `line`. Option swatch classes and the reduced-motion block unchanged.
- [X] T009 Replace Heebo with Assistant (research D2): `src/app/fonts.ts` exports `assistant = Assistant({ subsets: ['hebrew', 'latin'], variable: '--font-assistant', display: 'swap' })` (no `weight`, so the variable font is used) and no longer exports `heebo`; use `assistant.variable` in `src/app/[locale]/layout.tsx`, `src/app/admin/layout.tsx` and `src/app/global-error.tsx`. `grep -rn heebo src` returns nothing.
- [X] T010 Swap every removed token in `src/` per the plan's [Token mapping](plan.md#token-mapping) (find them with `grep -rnE "(bg|text|border|ring|outline|fill|stroke|decoration|caret|accent|divide)-(ground|panel|sun|sun-hover|sun-soft|sun-ink|rose|rose-ink|peach)\b" src`). Rules: `ground`→`paper` (the Markdown preview in `src/components/admin/MarkdownEditor.tsx` becomes `bg-paper` with a 1 px `border-line` outline; the admin page background is not a class today, see T060), `panel`→`paper`, `sun` on buttons/strip/rings→`forest` with the text on it `paper`, `sun` on the cart badge→`sage`, `sun-hover`→`forest-hover`, `sun-soft`→`sage`, `sun-ink`→`forest`, `rose`→`peach`, `rose-ink`→`ink` (text) and `forest` (icon), old footer `peach`→`mint`. Change only class names in this task (no layout, spacing or text). In admin files (`src/app/admin/**`, `src/components/admin/**`) the diff must contain nothing but these class swaps (research D10). T007 (a) and (b) pass; `pnpm typecheck && pnpm lint && pnpm check:css` pass.
- [X] T011 Restyle the button set (research D11, FR-022) in `src/components/ui/button-styles.ts`, `Button.tsx`, `LinkButton.tsx`: `primary` = `bg-forest text-paper font-semibold rounded-pill h-[52px] hover:bg-forest-hover active:scale-[0.98]` (motion-safe); `secondary` keeps its meaning (the outlined button) and every caller: transparent, 1.5 px `ink` border, `ink` text, font-semibold, `rounded-pill h-12`, hover `photo`; new variant `soft` = `bg-sage text-ink font-semibold rounded-pill h-12 hover:bg-sage-hover`, used only where a task says so (banner buttons); `quiet` = text link, underline offset 3 px. Busy state unchanged. No existing caller changes variant (research D11). `IconButton.tsx`: 44×44, `rounded-pill`, colour `currentColor`, hover `hover:bg-current/10` (a 10 % tint of `currentColor`, Tailwind v4, so it works on the white bar and over the photo, plan.md).
- [X] T012 Restyle the remaining primitives in `src/components/ui/` per research D11: `ChipLink.tsx`/`ChipRow.tsx` (pill, min-height 44, padding-inline 18, 15 px, 1 px `ink-2` border, `paper` fill, hover `photo`; current = `bg-sage`, 1.5 px `ink` border, bold, `aria-current` kept); `Notice.tsx` (`made`: `bg-peach text-ink`, yarn icon `text-forest`; `info`: `paper` with 1 px `line` border; `attention`: `bg-sage text-ink`; `alert`: `paper`, 1.5 px `alert` border, `alert` text and icon; radius `rounded-card`); `EmptyState.tsx` (56 px `sage` circle, no panel fill on white: 1 px `line` outline); `TextField.tsx`, `TextArea.tsx`, `SelectField.tsx`, `Field.tsx` (`rounded-chip`, 1.5 px `field` border, 52 px, 16 px text); `Checkbox.tsx` (checked fill `ink`, disabled `photo` with `line` border); `RadioCard.tsx` (`rounded-chip`, `field` border; selected `bg-sage` + `ink` border + inset ring); `ErrorSummary.tsx`, `Skeleton.tsx` (`photo` blocks), `ConfirmDialog.tsx` (`rounded-card`, `shadow-float`), `Toast.tsx`, `Disclosure.tsx`, `Breadcrumbs.tsx`, `Prose.tsx`, `Price.tsx`. Behaviour, props and test ids unchanged.
- [X] T013 Restyle the header frame per research D5 (layout part only) and contracts/ui.md "Page frame": `src/components/shop/Header.tsx` becomes a full-width bar sticky bar element carrying `id="site-header"` and `data-testid="site-header"` (contracts/ui.md), `class="sticky top-0 z-header bg-paper text-ink border-b border-line"` (no pill, no shadow), height `var(--header-h)`, inner container max 1240 px with 16 px gutters (24 px from 900 px), a three-column grid `grid-cols-[1fr_auto_1fr]`; start column: phone = menu button + search link, from 900 px = menu button (only when `menuOnDesktop`) + category links; centre: brand link `data-testid="header-brand"`, Assistant 700, `clamp(19px,4.6vw,22px)`, truncates with an ellipsis; end column: phone = compact language switch + cart; from 900 px = language switch + search + cart. The search link is rendered twice (phone slot `lg:hidden`, desktop slot `hidden lg:inline-grid`), both with the same accessible name; nothing else is duplicated. Menu sheet (`site-menu` popover) anchored at `start-3`/inline-start and placed right under the header bar (today it is fixed at `top-[76px]`): the header gets `anchor-name: --site-header` and the popover `position-anchor: --site-header; top: anchor(bottom)` inside `@supports (anchor-name: --a)` in `globals.css`; without support (Firefox) it falls back to `top: var(--header-h)`, which may overlap the header's lower edge while the free-shipping strip is still on screen (accepted; the sheet has its own close button). The disabled look for `IconButton` (`disabled:opacity-40 disabled:cursor-default`) is added here too (used by the row arrows). `HeaderCategories.tsx`: 15 px regular, hover underline offset 4 px. `LanguageSwitch.tsx` compact variant: border and text `currentColor`, hover `sage` with `ink` text; 44×44 hit area unchanged. `CartLink.tsx`: badge `bg-sage text-ink` (from T010), icon `currentColor`. `AnnouncementBar.tsx`: `bg-forest text-paper` 13 px bold (text and rules unchanged, FR-007).
- [X] T014 `src/app/[locale]/layout.tsx`: `<main>` changes its gutter from `px-3` to `px-4` (16 px, as the example) and keeps `mx-auto w-full max-w-[1240px] flex-1 pb-10 lg:px-6`, and adds the full-bleed variant `has-[>[data-full-bleed]]:max-w-none has-[>[data-full-bleed]]:px-0 has-[>[data-full-bleed]]:pb-0` (research D6); skip link `bg-forest text-paper`.
- [X] T015 Restyle the footer frame in `src/components/shop/Footer.tsx` per research D11 and contracts/ui.md "Footer": `bg-mint text-ink`, no rounded corners, padding 48/16 px (64/24 from 900 px), 15 px text, columns as today (`2fr 1fr 1fr` from 900 px), headings h2 18 px 700, link rows min-height 44 px, a 1 px `ink/25` rule above the bottom row (language switch, copyright in `ink-2`). Every existing test id and nav label unchanged. No social links yet (T052).
- [X] T016 Update the locators that the new header breaks, without weakening any check: `tests/e2e/storefront-layout.spec.ts` (`header > a` first → `getByTestId('header-brand')`; the "brand at the mirrored side" assertion stays), `tests/e2e/language.spec.ts` (menu and header-order tests follow contracts/ui.md positions). Run `pnpm verify`, then `storefront-layout.spec.ts` and `language.spec.ts` on `chromium-desktop` and `language.spec.ts` on `chromium-mobile`, one at a time; fix product code, not tests, unless a test contradicts contracts/ui.md (say so).

**Checkpoint**: `pnpm verify` passes; T007 passes; storefront and admin render in Assistant with the new colours; header and footer frames match contracts/ui.md.

---

## Phase 3: User Story 1 - A visitor lands on the new home page (Priority: P1) 🎯 MVP

**Goal**: the new home page: hero with the header over it, the swipeable row of the home-row
category, banners, peach band, mint footer; the "All pieces" page with the category and sort
buttons (FR-008–FR-016, FR-031–FR-036 data and public parts; the admin parts are US5).

**Independent Test**: quickstart §1–§2; `tests/e2e/home.spec.ts` on `chromium-mobile`,
`chromium-desktop` and `webkit-mobile`; `catalog.spec.ts` on `/he/shop`.

### Tests first

- [X] T017 [P] [US1] Write `tests/unit/home-photos.test.ts` per contracts/home-photos.md "Budgets" (must fail before T020): read `src/lib/home-photos/manifest.json`; for each of `hero`, `bannerChild`, `bannerShelf`: phone variants 400×600 and 565×848 and wide variants 800, 1200, 1600, 2000 wide (height = round(width × 848 / 2000), ±1 px for sharp's rounding; the manifest is the reference) exist in `public/site-photos/`, are WebP with the listed dimensions (`sharp().metadata()`), carry no EXIF or XMP (reuse the exported function of `scripts/check-image-metadata.ts`), every phone file ≤ 190 KB, every wide file ≤ 450 KB; `public/site-photos/` holds no file the manifest does not list; every file name matches `<name>-<variant>.<8 hex>.webp`.
- [X] T018 [US1] Write `tests/e2e/home.spec.ts` first (it fails until the home page task is done; test-first) and add `home` to `STOREFRONT_SPECS` in `playwright.config.ts` (no new project; no CI matrix change). Test data (C1 of review round 3): the E2E seed has only 3 sample products and 2 categories, and `catalog.spec.ts` relies on exactly 3, so do not add products to the seed; instead a `beforeAll` inserts by SQL 7 extra published products (copying one sample's `product_image` rows, distinct slugs prefixed `e2e-home-`, staggered `published_at`), links each to `featured` and spreads them over 2 extra categories, then renames the five categories with pieces (2 samples, `featured`, 2 extra) to 20-character names (so the header has five categories and the menu button shows); `afterAll` restores the names; `afterAll` deletes exactly these rows. Tests (both locales unless stated): the home-row category is `featured` and holds every sample (data-model.md §5 "Seed"); section order by test id (`home-hero`, `home-row`, then T031's `LOWER_SECTIONS`); exactly one h1 and it is the shop name; each banner button's, the band link's and `home-row-view-all`'s `href` is `/{locale}/shop` and clicking one opens the "All pieces" page; the home page has no category chips and no sort links; every hero/banner `<img>` has the translated alt text and `srcset`/`sizes`/`width`/`height`; on the phone projects at 375 px: the hero image's `currentSrc` contains `-p400.` or `-p565.` and its `performance.getEntriesByName(currentSrc)[0]` transfer size (or the response body size when transfer size is 0) is < 200 KB (SC-005); text bands (research D4) at 320, 375 and 1280 px, with the seeded shop name and again with a 60-character shop name: every text element and button over a photo lies inside an ancestor matching `[class*="scrim-band"]`; at 1280 px each banner's copy box is in the right half of the banner on `/he` and the left half on `/en`, and the first header link ("כל היצירות" / "All pieces") is at the reading start (US1 acceptance scenario 2); at 900 px with the five categories from the test data there is no sideways scroll, and at the top of the page the header's bottom edge is within the hero's `--scrim-text` strip; no "sold out" text and no account icon or link on the home page, a card and a product page (FR-004); header state: on Chromium projects at scroll 0 on `/he` the header's computed background is transparent and its colour white, and on `/he/c/<slug>` it is white; on every project, after scrolling 1 px, 100 px, halfway through the hero and past the hero, the header background is `rgb(255, 255, 255)` and its colour `ink`, and scrolling back to 0 makes it transparent again (Chromium); on WebKit the top state may be either (support differs by version); with `reducedMotion: 'reduce'` the Chromium results are exactly the same as without it (owner answer). The peach band contains `home-band-link`, which contains the `arrow` icon, and whose box is at least 44 px tall; the hero h1 and the band sentence have computed `font-weight` 300. No horizontal scroll at 320 px on `/he` and `/en`; then set `shop_settings.shop_name_he` and `shop_name_en` by SQL to a 60-character name containing a 25-letter word, and check at 320 px that there is still no horizontal scroll and the h1 box stays inside the hero box; restore the names in `afterAll`. Home row (contracts/home-row.md "Home row"; FR-034–FR-036): its h2 is the home-row category's name; `home-row-track` holds only published products of the home-row category, newest first (unlink one `e2e-home-` product from `featured` and check it leaves the row but stays on its category page) (set one sample to draft by SQL and check it disappears; restore); at 375 px about two cards and part of a third are visible (third card's box crosses the track's end edge), at 1280 px four whole cards; the track scrolls sideways (set `scrollLeft` toward the reading end and check a later card becomes visible) while `document.documentElement.scrollWidth <= innerWidth` at 320 and 375 px; keyboard (FR-035): at 1280 px, pressing Tab from the "view all" link through the cards brings card 5 fully inside the track's box; on `chromium-desktop` at 1280 px with the 10 cards of the test data: the arrows `home-row-previous`/`home-row-next` have the translated names, "previous" is disabled at the start, pressing "next" brings card 5 fully into view and enables "previous", at the end "next" is disabled; in Hebrew pressing "next" moves toward the left (card 5 is left of card 4), in English toward the right; with `reducedMotion: 'reduce'` one "next" press reaches its final position on the next animation frame (no smooth sliding); below 900 px no arrow is visible; with `home_category_id` set to null by SQL (restored after) `home-row` is absent and the page still shows hero, banners, band.

### Implementation

- [X] T019 [US1] Create `src/lib/home-photos/config.ts` per data-model.md §2: `HOME_PHOTOS` with `hero` (`source: 'hero-workshop.jpg'`, `focusX: 0.30`, `wideObjectPosition: 'sm:object-[50%_50%]'`, `altKey: 'shop.home.hero.alt'`), `bannerChild` (`banner-child-play.jpg`, `0.58`, `'sm:object-[58%_50%]'`, `shop.home.bannerChild.alt`), `bannerShelf` (`banner-shelf.jpg`, `0.50`, `'sm:object-[50%_50%]'`, `shop.home.bannerShelf.alt`). Class strings literal (Tailwind must see them). Exported types `HomePhotoId`, `HomePhotoConfig`.
- [X] T020 [US1] Write `scripts/build-home-photos.ts` exactly per contracts/home-photos.md "Script" (2:3 phone crops around `focusX` at 565×848 and 400×600; wide 800/1200/1600/2000; WebP; metadata stripped; fingerprinted names; empties `public/site-photos/` first; writes `src/lib/home-photos/manifest.json` with sorted keys; exits 1 when a source is missing, smaller than 2000×848, or any phone file is over 190 KB or any wide file over 450 KB, the same budgets as T017). Add `"photos:home": "tsx --conditions=react-server scripts/build-home-photos.ts"` to `package.json`. Pick WebP quality constants that keep every phone file ≤ 190 KB and say which in the report. Run it (with a timeout), run it again and confirm `shasum public/site-photos/* src/lib/home-photos/manifest.json` is identical between the two runs. T017 passes.
- [X] T021 [US1] Serve the photos with a long cache (contracts/home-photos.md "Serving"): in `next.config.ts` `headers()` add `{ source: '/site-photos/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }`. Extend `tests/e2e/headers.spec.ts`: a `/site-photos/<hero p565 file from the manifest>` response is 200, `image/webp`, has that `Cache-Control` and `X-Content-Type-Options: nosniff`; the storefront CSP is unchanged.
- [X] T022 [P] [US1] Create `src/components/shop/HomePhoto.tsx` (server) exactly per contracts/home-photos.md "Markup": props `id: HomePhotoId`, `alt: string`, `priority: boolean`; `<picture>` with the wide `<source media="(min-width: 640px)" … sizes="100vw">` and the phone `<img>` (`srcset` 400w/565w, `sizes="100vw"`, `width={565}` `height={848}`, `decoding="async"`, `loading`/`fetchPriority` from `priority`), classes `size-full object-cover object-center` plus the config's `wideObjectPosition`. No `style`.
- [X] T023 [US1] Add the photo-section CSS to `src/app/globals.css` per research D4 and D5: (a) text-band scrims (research D4): `.scrim-band` = background `rgb(0 0 0 / var(--scrim-large))` with a 48 px feathered edge outside the text (a pseudo-element gradient from `--scrim-large` to 0, placed beyond the band so no text sits on the fade); `.scrim-band-top` = the hero's top band, whose first `var(--header-h)` uses `rgb(0 0 0 / var(--scrim-text))` (the strip behind the transparent header) and the rest `--scrim-large`, feathered at its bottom edge; `.scrim-band-bottom` feathered at its top edge; `.scrim-band-banner` = the banner band as one class: below 640 px a full-width band at the bottom feathered at its top edge, and from 640 px (an `@media (min-width: 640px)` inside the class, because plain classes in `globals.css` take no `sm:` prefix) the inline-start half at full height feathered at its inline-end edge, using logical properties or `:dir()` so it sits on the right in Hebrew and on the left in English. `.scrim-band` is the base class (colour and feather mechanism); every band element carries it together with one of `scrim-band-top`, `scrim-band-bottom`, `scrim-band-banner`; text over photos `text-on-photo` with `text-shadow: 0 1px 8px rgb(0 0 0 / 0.35)`; `[data-on-photo] :focus-visible { outline-color: var(--color-on-photo) }`; `#site-header :focus-visible { outline-color: currentColor }` (follows the header's colour in both states). (b) Header over the hero (research D5; owner answer: see-through only when the page is scrolled all the way to the top, white as soon as it is scrolled down, the same for everyone), all inside `@supports (animation-timeline: scroll())` and `body:has([data-hero])`: `#site-header { animation: header-solid steps(1, jump-end) both; animation-timeline: scroll(root); animation-range: 0px 1px }` with `@keyframes header-solid { from { background-color: transparent; color: var(--color-on-photo); border-color: transparent } to { background-color: var(--color-paper); color: var(--color-ink); border-color: var(--color-line) } }` (verify in Chromium that scroll 0 shows the `from` state and 1 px or more the `to` state; adjust the step position if not). Without support the header stays the white bar (accepted by the owner). In the existing `@media (prefers-reduced-motion: reduce)` block, exclude `#site-header` from `animation: none !important` (for example `*:not(#site-header), *::before, *::after` for the `animation` line), keeping `transition: none` for everything: the switch is instant, so it is the same for every visitor (spec edge case "Reduced motion" as amended). `[data-hero]` gets `margin-top: calc(-1 * var(--header-h))`. Physical CSS properties are not allowed (`pnpm check:css`).
- [X] T024 [US1] Create the home sections (server components) per contracts/ui.md "Home page" and research D11/D12: `src/components/shop/HomeHero.tsx` (`<section data-hero data-on-photo data-testid="home-hero" aria-labelledby>`: `relative bg-ink`, `min-h-[clamp(560px,150vw,640px)] sm:min-h-[clamp(460px,48vw,720px)]`, a grid with rows `auto 1fr auto`; `HomePhoto id="hero" priority` absolutely filling the section behind; row 1 = full-width `scrim-band scrim-band-top` band with padding-top `calc(var(--header-h) + 28px)` (`+ 32px` from 900 px) and bottom 20 px holding, in the 1240 px container, the line `<p>` at 24 px regular, line height 1.3, max 32ch; row 2 empty (light photo); row 3 = full-width `scrim-band scrim-band-bottom` band, padding 20 px top and 28 px bottom (40 px from 900 px), holding `<h1>` = shop name, `clamp(56px,12vw,128px)`, line height 0.95, `text-balance`, `[overflow-wrap:anywhere]` (a long shop name wraps inside the photo, spec edge case), weight 300 (thin, as in the Shopify shop; owner answer), `lang="he"` on an English fallback); `src/components/shop/PhotoBanner.tsx` (props `id`, `testId`, `heading`, `line`, `button`, `href`; `<section data-on-photo aria-labelledby>`, `relative bg-ink`, `min-h-[clamp(520px,140vw,600px)] sm:min-h-[clamp(420px,42vw,620px)]`, `HomePhoto` lazy absolutely filling the section behind; the copy sits in one `scrim-band scrim-band-banner` element (bottom band below 640 px; inline-start half at full height from 640 px) with the copy vertically centred, max 30rem: h2 `clamp(40px,6.4vw,76px)` weight 800, line 24 px with line height 1.35, `LinkButton variant="soft"` to `/{locale}/shop` with `data-testid="home-banner-button"`); `src/components/shop/StatementBand.tsx` (`data-testid="home-band"`, `bg-peach`, padding 80 px (128 px from 900 px), one centred `<p>` `clamp(28px,4.4vw,52px)`, max 24ch, `text-balance`, weight 300 (owner answer); under it a text link `shop.home.band.link` ("לקנייה" / "Shop now", 18 px, weight 600, underline offset 4 px) with the directional `arrow` icon at its reading-end side (flips in RTL), linking to `/{locale}/shop`, `data-testid="home-band-link"`, at least 44 px tall).
- [X] T025 [US1] Add the home texts to `src/i18n/messages/he.json` and `en.json` under `shop.home` exactly as in contracts/ui.md "Texts for owner approval" (`row.viewAll`, `row.previous`, `row.next`, `hero.alt`, `bannerChild.{heading,line,button,alt}`, `bannerShelf.{heading,line,button,alt}`, `band.sentence`, `band.link`), plus `shop.allPieces.title` and `common.nav.allPieces` ("כל היצירות" / "All pieces"); the hero line stays `shop.catalog.intro`. `tests/unit/i18n-parity.test.ts` passes.
- [X] T026 [US1] Square product cards (research D7, D11, FR-015, FR-016) in `src/components/shop/ProductCard.tsx`: well `block aspect-square overflow-hidden bg-photo` (no radius), image `size-full object-cover object-center` with the hover zoom kept (motion-safe), `width`/`height` unchanged; name 19 px (22 px from 900 px), weight 400, line height 1.2, max 2 lines; price `Price` 14 px `ink-2`; "not available" label unchanged; gap 10 px. `ProductCard` gets prop `eager: boolean` (replacing the `index < 4` rule; `fetchPriority="high"` only when `eager && index === 0`). `src/components/shop/ProductGrid.tsx`: prop `eagerCount` (default 4) passed down; row gap 28 px (40 px from 900 px), column gap 12/20 px.
- [X] T027 [P] [US1] Tests first for several categories per piece and the home row (must fail before T028–T029; contracts/home-row.md, data-model.md §5): `tests/integration/public-queries.test.ts`: a piece linked to two categories is listed once on each category page and once on the full list; `listCategoriesWithProducts` and the sitemap categories go through the links; `limit` caps `listPublishedProducts`; `getHomeRow('he')` is `null` with no home category, `null` when it has only drafts or hidden pieces, otherwise the Hebrew name, slug and published pieces newest first, the English name on `'en'` (Hebrew with the fallback marker when English is empty), at most 12 of 13; product detail `mainCategory` follows FR-037 (first non-home category in category order; the home category when it is the only one; `null` with none). `tests/integration/catalog-products.test.ts`: save `categoryIds` with two ids, replace with one, `[]` allowed for a draft, a save that changes only the categories writes one `product.updated` row, unticking every category on a published piece is refused with the missing-category key, an unknown id → `admin.products.errors.category_not_found`, duplicates collapse, publish with none → the existing missing-category key; `tests/integration/categories` tests: piece count through links, deleting a category with linked pieces still blocked. A migration test (`tests/integration/migration-0004-product-categories.test.ts`, pglite; not to be confused with the existing `migration-004.test.ts`): apply migrations up to `0003`, insert two categories, three products (one with no category), a settings row, then apply `0004`: each product keeps its category, all three are linked to `featured`, `featured` is last in order, `home_category_id` points to it; a second database that already has a category `featured` reuses it. `tests/integration/seed.test.ts`: after the tests' `reset()` (every table emptied, so no `featured` row), a seed creates `featured` last in order and sets the new settings row's `home_category_id` to it; with samples every sample is linked to its category and to `featured`; a second run changes nothing; a `null` home category on an existing row stays `null`; a seed without samples on an existing settings row does not re-create a deleted `featured`; update the existing assertions at lines ~53 ("two sample categories"), ~85–89 (`samples: false` now gives exactly one category, `featured`, with no pieces) and ~98 (category order) to the new category list. Update the helpers and fixtures that insert `product.category_id` (`tests/helpers/checkout.ts`, the `make()` helper in `public-queries.test.ts`, the `categoryId` saves in `catalog-products.test.ts`, `public-images.test.ts`, `schema.test.ts`, `sitemap.test.ts`) to insert links instead, without weakening any assertion.
- [X] T028 [US1] Schema and migration per data-model.md §5: in `src/server/db/schema/catalog.ts` add `productCategory` (`product_id` → `product.id` on delete cascade, `category_id` → `category.id` on delete restrict, `created_at`, primary key on both, index `product_category_category_idx`) and remove `product.categoryId` and its index; in `src/server/db/schema/commerce.ts` add `shopSettings.homeCategoryId` (`uuid('home_category_id').references(() => category.id, { onDelete: 'set null' })`). Generate with `pnpm db:generate --name product_categories` (→ `src/server/db/migrations/0004_product_categories.sql`), then edit the SQL by hand so the release steps 2–5 of data-model.md §5 run after the table is created and before the column is dropped (statement breakpoints as drizzle expects; the snapshot is not edited). Seed (`src/server/db/seed.ts`) exactly per data-model.md §5 "Seed": `seedInTx` creates or reuses `featured` (`sort_order` = `coalesce(max(sort_order), -1) + 1`, after the sample categories) only when it inserts a new settings row or `samples` is true, and points a new settings row at it; with `samples`, after `seedSampleProducts`, link each sample to its sample category (replacing `categoryId` in `sample-products.ts`) and to `featured` with `ON CONFLICT DO NOTHING`; an existing settings row is never changed. In the migration's step 3 use `coalesce(max(sort_order), -1) + 1` (an empty table gives 0). Run `pnpm db:migrate` on the local database (which has pieces) and report the counts before and after; run `pnpm test:pg` when `DATABASE_URL_TEST` is set.
- [X] T029 [US1] Move every use of the single category to the links (contracts/home-row.md "Queries" and "Admin"), all in this task because the types change together: `src/server/catalog/public-queries.ts` (`listPublishedProducts` filters with `EXISTS` on `product_category` and gains `limit`; `listCategoriesWithProducts`; sitemap entries; product detail returns `categories` and `mainCategory` per FR-037; `listRelatedProducts` keeps working with `mainCategory` until T035 replaces it; new `getHomeRow(locale)` reading `homeCategoryId` from `getSettings()`, at most 12 cards); `src/server/catalog/admin-queries.ts` (category filter through the links; the list shows every category name in category order, comma-separated; product edit data `categoryIds`); `src/server/catalog/categories.ts` (counts and the delete check through the links); `src/lib/validation/product.ts` (`categoryIds: z.array(z.uuid()).max(50)` deduplicated; `PublishFacts.categoryIds`; `missingForPublish` pushes the existing `categoryId` key when empty, so the message is unchanged); `src/server/catalog/products.ts` (`categoryIds` is taken out of `changes` before the column update; every id is checked to exist; a set that differs from the stored links (compared as sets) counts as one entry in `changed`, so a save that only changes categories is not dropped by the early return and writes the `product.updated` row; the links are replaced in the save transaction; `publishFacts` reads the links, or the new set when one is being saved, for both `updateProduct` and `setProductState`, so unticking every category on a published piece is refused with the existing missing-category result); `src/app/admin/(protected)/products/[id]/page.tsx` (passes the categories and the home-row category's name for the hint) and `src/app/admin/(protected)/products/page.tsx` (the list row shows every category name); `src/components/admin/ProductEditor.tsx` (the dropdown becomes a fieldset of `Checkbox`es in category order with the hint and test ids from contracts/home-row.md; the field-error mapping follows); update `tests/e2e/admin-products.spec.ts` test 1 (the `field-category` `selectOption` near line 117 and the header comment near line 15) to tick "נרות" in `field-categories`; `src/app/[locale]/(shop)/p/[slug]/page.tsx` breadcrumb and JSON-LD use `mainCategory`. Messages: `admin.products.categoriesLabel`, `admin.products.categoriesHint` (he, en). Afterwards `grep -rn "categoryId\b\|category_id" src --exclude-dir=migrations` shows only: the join table schema, `listPublishedProducts`' `categoryId` option and its callers (category page, admin list filter), validation and messages; report the remaining hits. T027 passes; run `pnpm verify`.
- [X] T030 [US1] Home row components per contracts/home-row.md "Home row" and research D18: `src/components/shop/HomeRow.tsx` (server: section, h2 with `fallbackAttrs`, "view all" link with the `arrow` icon, the `<ul id data-testid="home-row-track">` with `ProductCard eager={false}` items, the CSS-only scroll-snap track with the card widths and gaps in the contract, scrollbar hidden, `overscroll-behavior-x: contain`; classes only, no `style`) and `src/components/shop/RowArrows.tsx` (`'use client'`; props `trackId`, `labels`; renders `null` until it has measured the track; from 900 px two `IconButton`s with `data-testid="home-row-previous"`/`"home-row-next"`, `aria-controls`, the directional `chevron` icon; `scrollBy({ left: ±track.clientWidth, behavior })` with the sign from `getComputedStyle(track).direction` and `behavior` `'auto'` when `matchMedia('(prefers-reduced-motion: reduce)')` matches, else `'smooth'`; disabled states from `scrollLeft`/`scrollWidth`/`clientWidth` with a 2 px tolerance, handling negative `scrollLeft` in RTL; passive `scroll` listener and a `ResizeObserver`, both removed on unmount; no timers, no autoplay). Add the CSS the track needs to `globals.css` only if Tailwind classes cannot express it (e.g. `::-webkit-scrollbar { display: none }` as `.row-track`), logical properties only.
- [X] T031 [US1] Rewrite `src/app/[locale]/(shop)/page.tsx` per contracts/ui.md "Home page": root `<div data-full-bleed>`; `HomeHero` (line `shop.catalog.intro`, h1 shop name via `pick`/`fallbackAttrs`); `HomeRow` fed by `getHomeRow(locale)` (T030), omitted when it returns `null`; then a constant `LOWER_SECTIONS` in the order banner child → band → banner shelf (FR-010 as amended, as in the Shopify shop), each banner button linking to `/{locale}/shop`. The category chips, sort links, grid and empty state leave the home page (they move to the "All pieces" page, T032). Metadata unchanged. The `searchParams`/`sort` handling leaves the home page with them.
- [X] T032 [US1] The "All pieces" page per contracts/home-row.md "All pieces page" and research D19: new `src/app/[locale]/(shop)/shop/page.tsx` with the current home catalog content (h1 `shop.allPieces.title` 32/44 px, intro `shop.catalog.intro`, `CategoryChips currentSlug={null}`, `SortLinks basePath={`/${locale}/shop`}`, `ProductGrid` with the default `eagerCount` 4, the existing `EmptyState`), `generateMetadata` with the title and `alternates('/shop', locale)`; `CategoryChips` "All" → `/${locale}/shop`; `HeaderCategories.tsx`: an "All pieces" link first in `HeaderCategoryLinks` and in `MenuCategories`, `HEADER_CATEGORY_LIMIT` 5 → 4 (and the `Header` "menu on desktop" rule follows the constant); `src/app/sitemap.ts` adds `/shop`. Move the tests that use the home page as the catalog: in `tests/e2e/catalog.spec.ts` the "home lists every published product and sorts…" and the chips tests now start at `/he/shop` (the "All" chip is current there); in `tests/e2e/language.spec.ts` the sort/category navigation tests start at `/he/shop` and expect `/he/shop` where they expected `/he` for the catalog; in `tests/e2e/catalog.spec.ts` also the empty-catalog test (around line 219, "עוד אין כאן יצירות") moves to `/he/shop`, and the "cards show 'from'" test (around line 59) reads cards on `/he/shop`; `tests/e2e/privacy.spec.ts` (around line 275) may keep clicking a home-row card (samples are in `featured`); in `tests/e2e/admin-products.spec.ts` every check that a new or changed product's `product-card` appears on (or leaves) `/he` or `/en` now uses `/he/shop` or `/en/shop` (lines around 138, 223, 301, 320, 343, 390 and the header comment near line 33), because a new piece is not in the home-row category unless ticked, so it may not be on the home page; any `seo`/`sitemap` test that lists public pages gains `/shop`. The "all pieces" links that today point home now point to `/${locale}/shop`: the `common.allPieces` buttons in `src/app/[locale]/not-found.tsx` and `src/app/[locale]/(shop)/p/[slug]/not-found.tsx`, the category empty state's action in `c/[slug]/page.tsx`, and (FR-038, owner answer) the "continue shopping" links in `src/components/shop/CartView.tsx` the shop links in `src/components/shop/ReturnView.tsx` and the order status page's "back to the shop" link in `src/app/[locale]/(shop)/order/[token]/page.tsx` (update `tests/e2e/privacy.spec.ts` near lines 318 and 325, which follow a link to `/he` on that page, to `/he/shop` without weakening them; update `cart.spec.ts`/`checkout-*.spec.ts` expectations of those `href`s if they assert `/he`). Statistics (FR-002, feature 003): `src/lib/analytics/normalise-path.ts` `parseCountablePath` counts `/{locale}/shop` (a new kind `'shop'`, with its label wherever the stats screen names kinds), with cases in `tests/unit/normalise-path.test.ts` (`/he/shop` and `/en/shop` counted, `/he/shop/x` not). Accessibility and size (SC-003, SC-004): add `/he/shop` and `/en/shop` to the storefront pages in `tests/e2e/a11y.spec.ts` (375 and 1280 px), and a `{ name: 'all pieces', path: () => '/he/shop' }` route to `tests/e2e/bundle-size.spec.ts`. Do not weaken any assertion; say which tests moved.
- [X] T033 [US1] Extend `tests/e2e/storefront-layout.spec.ts`: product-card photo boxes in the home row, on `/he/shop`, `c/sample-ceramics` and `search?q=bowl` are square (`|width − height| ≤ 1`); the banner buttons and every header control on home are ≥ 44×44 in both header states (top and scrolled). the arrow buttons are ≥ 44×44; `/he/shop` and `/en/shop` have no sideways scroll at 320 px. Run `pnpm verify`, then `home.spec.ts` on `chromium-mobile`, `chromium-desktop` and `webkit-mobile`, then `storefront-layout.spec.ts`, `catalog.spec.ts`, `seo.spec.ts` (if present), `a11y.spec.ts` and `bundle-size.spec.ts` (home and `/shop` ≤ 150 KB; report the home route's growth from `RowArrows`) on `chromium-desktop`, `language.spec.ts` on `chromium-desktop` (its canonical and sitemap tests run only there) and `language.spec.ts` and `admin-products.spec.ts` on `chromium-mobile`, and `pnpm vitest run tests/unit/normalise-path.test.ts`, one at a time; fix failures.

**Checkpoint**: quickstart §2 passes; the home page alone delivers the new look (MVP); the "All
pieces" page works as the home catalog did.

---

## Phase 4: User Story 2 - A visitor views and buys a piece (Priority: P1)

**Goal**: product page with square gallery and "You may also like"; cart, checkout, payment
return, order, content, contact, category, search and error pages in the new look, every function
unchanged (FR-002, FR-015, FR-017–FR-022).

**Independent Test**: quickstart §3; the existing cart, checkout, order and language specs pass
unchanged on the phone projects.

### Tests first

- [X] T034 [P] [US2] In `tests/integration/public-queries.test.ts`, replace the existing `listRelatedProducts` case (it imports a function T035 removes) with `listAlsoLike` cases (must fail before T035; research D8), using the existing pglite helpers and the category links: (1) product in category A with 5 other published products in A → the 4 newest of them; (2) product in A and B, 1 other in A and 1 other in B, 3 published elsewhere → the 2 sharing a category first (newest first), then the 2 newest of the rest; (3) every product also linked to the home-row category: sharing only the home category does not count as sharing (a product whose only other link is the home category gets the 4 newest others); (4) product with no category other than the home one → the 4 newest other published products; (5) the only published product → empty list; in every case the product itself, drafts and hidden products never appear and no product appears twice.

### Implementation

- [X] T035 [US2] In `src/server/catalog/public-queries.ts` add `listAlsoLike(productId: string, categoryIds: string[], limit = 4): Promise<PublicProductCard[]>` per research D8 (`categoryIds` = the product's categories without the home-row category; first query: published, not the product, linked to any of `categoryIds` (`EXISTS` on `product_category`), `NEWEST` order, `limit`; if fewer than `limit`, second query: published, not the product, not already chosen, `NEWEST`, the remaining count); remove `listRelatedProducts` (only caller is the product page). T034 passes.
- [X] T036 [US2] Product page `src/app/[locale]/(shop)/p/[slug]/page.tsx` per research D11 and contracts/ui.md "Product page": the details column has no white panel (no `bg-panel`/`rounded-card`/padding box; still sticky at `top-[calc(var(--header-h)+16px)]` from 900 px); grid `lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-10`; h1 30 px (36 px from 900 px), 700; facts list icons `text-forest`, top border `line`; disclosures unchanged; replace the related section with `<section data-testid="also-like" aria-labelledby="also-like-title">`, h2 `shop.product.alsoLike` (28/40 px, 700), `ProductGrid` (label `shop.product.relatedLabel`, `eagerCount={0}`) fed by `listAlsoLike(product.id, <its category ids without the home-row category>, 4)`, omitted when empty. Messages: add `shop.product.alsoLike` ("אולי תאהבו גם" / "You may also like") and remove `shop.product.related` from both files. Everything else on the page (order of items, JSON-LD, metadata) unchanged.
- [X] T037 [US2] Square gallery in `src/components/shop/Gallery.tsx` (research D7): main wells `aspect-square`, no radius, `bg-photo`; the focus overlay without radius; thumbnails 72×72 boxes (`h-[72px] w-[72px]`, image `size-full object-cover`), no radius, with the `<img>` `width`/`height` attributes left as today (the photo's real 4:5 ratio; the square comes from CSS); current thumbnail ring 3 px `forest` (the inner `ink` ring may go: forest on photo is 9.5:1); counter and zoom button pills on `paper/95`. Zoom dialog: `bg-photo`, image `object-contain` (whole photo), controls unchanged. Keyboard, swipe, counter sync and focus return unchanged.
- [X] T038 [US2] Buy box (FR-018, research D11): `src/components/shop/QuantityStepper.tsx` outlined pill, 1 px `ink-2` border, 52 px tall (40 px compact in cart lines, 44 px hit areas kept); `src/components/shop/AddToCart.tsx`/`BuyBox.tsx` add-to-cart `primary` (forest); `OptionSelector.tsx` chips per T012 style with the alert state unchanged; the "Added" confirmation and the "in your cart · go to cart" row unchanged. Behaviour and test ids unchanged.
- [X] T039 [US2] Run `catalog.spec.ts`, `storefront-layout.spec.ts` (`chromium-desktop`), then `cart.spec.ts` and `language.spec.ts` (`chromium-mobile`) one at a time; add to `catalog.spec.ts`: a product page shows `also-like` with cards and never itself; with a single published product the section is absent. Add to `storefront-layout.spec.ts`: gallery main photo box and thumbnails are square. Fix failures.
- [X] T040 [US2] Cart and order lines (research D7): `src/components/shop/CartLine.tsx` thumbnail box 72×72 square, no radius (`<img>` `width`/`height` attributes left as today, square from CSS `object-cover`); line panel `paper` with 1 px `line` outline and `rounded-card`; `src/components/shop/OrderSummary.tsx` thumbnails 48×48 square, panel outline; `src/components/shop/CartView.tsx` summary panel `paper` + `line` outline, page title 32/44 px.
- [X] T041 [US2] Checkout, payment return and order pages (FR-021), restyle only: `src/components/shop/CheckoutForm.tsx`, `CheckoutProblems.tsx`, `src/app/[locale]/(shop)/checkout/page.tsx` (section panels `paper` + `line` outline, h1 32/44 px, submit `primary`), `ReturnView.tsx` (centred panel with outline; buttons per T011), `src/app/[locale]/(shop)/order/[token]/page.tsx` and `OrderProgress.tsx` (check circle `sage`; current step 3 px `forest` ring; done dot `ink`; payment chip "Paid" `sage`, "Awaiting" outlined `field`, "Refunded" `photo`). No field, message, step or test id changes.
- [X] T042 [US2] Other public pages (FR-021), restyle only: `src/app/[locale]/(shop)/c/[slug]/page.tsx` and `search/page.tsx` (h1 32/44 px, count `ink-2`), `pages/[slug]/page.tsx` (h1, `Prose`), `contact/page.tsx` and `ContactForm.tsx` (panels with outline), `StorageTable.tsx` (header row `photo`), `ConsentBanner.tsx` and `ConsentRoot.tsx` (sheet `paper`, `shadow-float`, top radius 12 px; both choices stay `secondary`, equal in size and style), `src/app/[locale]/not-found.tsx`, `p/[slug]/not-found.tsx`, `src/app/[locale]/error.tsx`, `src/app/global-error.tsx` (classes only; it cannot use the layout).
- [X] T043 [US2] Extend `tests/e2e/storefront-layout.spec.ts`: cart line and checkout summary thumbnails are square; the 320/375 px no-sideways-scroll list includes a product page with `also-like`. Run, one at a time: `storefront-layout.spec.ts`, `a11y.spec.ts` (`chromium-desktop`); `checkout-offline.spec.ts`, `checkout-online.spec.ts`, `checkout-terms.spec.ts`, `order-tracking.spec.ts`, `contact.spec.ts` (`chromium-mobile`); `consent.spec.ts` (`consent`); `privacy.spec.ts` (`chromium-desktop`). Fix product code; a test changes only where it contradicts contracts/ui.md (say so).
- [X] T044 [US2] Run `bundle-size.spec.ts` (`chromium-desktop`): every route ≤ 150 KB, checkout ≤ 155 KB, sizes reported; compare each route with the size printed by the latest CI run on a push to `main` or the 006 pull request (`gh run list --branch main` / `gh run list --branch 006-launch-readiness`, then the E2E chromium-desktop log; CI does not run on pushes to `dev`) and report any route that grew by more than 1 KB, with the reason (the only new client code is `RowArrows` on the home page, so other growth means something leaked into the browser).

**Checkpoint**: quickstart §3 passes; SC-002 holds for every storefront spec.

---

## Phase 5: User Story 3 - Aviva adds her social links (Priority: P2)

**Goal**: three optional, strictly checked social addresses in Settings, shown as icon links in
the footer (FR-024–FR-026).

**Independent Test**: quickstart §4; `admin-settings.spec.ts` social test.

### Tests first

- [X] T045 [P] [US3] Write `tests/unit/social-links.test.ts` covering every row of contracts/social-links.md "Normalisation and validation" and its listed cases (must fail before T048): accepted and normalised `instagram.com/aviva` → `https://instagram.com/aviva`, `https://www.instagram.com/aviva`, `https://m.facebook.com/aviva`, `https://www.tiktok.com/@aviva`; empty/whitespace/`null` → `null`; rejected with the right key: `http://instagram.com/x` (`notHttps`), `javascript:alert(1)` (`invalid` or `notHttps`, never accepted), `https://user:pw@instagram.com/x` and `https://instagram.com:444/x` (`invalid`), `https://facebook.com.example.net/x` and `https://notinstagram.com/x` and an Instagram address in the Facebook field (`wrongSite`), `https://instagram.com/` and `https://instagram.com` (`noPage`), a 301-character address (`tooLong`).
- [X] T046 [P] [US3] Extend `tests/integration/settings.test.ts` (must fail before T048): saving `socialInstagramUrl: 'instagram.com/aviva'` stores `https://instagram.com/aviva` and writes one `settings.updated` activity row whose details do not contain the address; saving `null` clears it; `socialFacebookUrl: 'https://example.com/a'` returns a field error for `socialFacebookUrl` with key `admin.settings.errors.social.wrongSite.facebook` and writes nothing. Extend `tests/integration/schema.test.ts`: an `UPDATE shop_settings` (single row) setting each social column to `'http://x'` or to a 301-character `https://` value violates its check.

### Implementation

- [X] T047 [US3] Schema and migration per data-model.md §1: in `src/server/db/schema/commerce.ts` add `socialFacebookUrl: text('social_facebook_url')`, `socialInstagramUrl: text('social_instagram_url')`, `socialTiktokUrl: text('social_tiktok_url')` (nullable, no default) and the checks `shop_settings_social_facebook_url`: "`social_facebook_url IS NULL OR (social_facebook_url LIKE 'https://%' AND char_length(social_facebook_url) <= 300)`", and the same for `social_instagram_url` and `social_tiktok_url`. Generate the migration with `pnpm db:generate --name social_links` so drizzle names it `src/server/db/migrations/0005_social_links.sql` and keeps its journal consistent. Run `pnpm db:migrate` locally and `pnpm test:pg` when `DATABASE_URL_TEST` is set.
- [X] T048 [US3] Validation per contracts/social-links.md: in `src/lib/validation/settings.ts` add `socialUrl(platform: 'facebook' | 'instagram' | 'tiktok')` and the three optional fields `socialFacebookUrl`, `socialInstagramUrl`, `socialTiktokUrl` to `settingsInputSchema`, error messages as keys `admin.settings.errors.social.invalid`, `.notHttps`, `.wrongSite.<platform>`, `.noPage.<platform>`, `.tooLong` (complete strings, no placeholders, because `useSaver` translates with `t(key)` only; contracts/social-links.md). No change to `updateSettings` logic beyond what the types need. T045 and T046 pass.
- [X] T049 [US3] Messages (he and en, exactly the texts in contracts/social-links.md): `admin.settings.social.{title,hint,instagram,facebook,tiktok}` and `admin.settings.social.example.{instagram,facebook,tiktok}` (one complete hint per field) and `admin.settings.errors.social.*`; `common.footer.social.{label,instagram,facebook,tiktok}` ("הרשתות החברתיות שלי"/"My social pages", "האינסטגרם שלי"/"My Instagram", "הפייסבוק שלי"/"My Facebook", "הטיקטוק שלי"/"My TikTok").
- [X] T050 [US3] Admin form per contracts/social-links.md "Admin form": `src/app/admin/(protected)/settings/page.tsx` passes the three fields into `SettingsData`; `src/components/admin/SettingsManager.tsx` gets `SocialSection` after `BusinessSection` (same `Section`, `FormField`, `useSaver`, `FormAlert` pattern; fields `dir="ltr"`, `inputMode="url"`, `autoComplete="url"`, `maxLength={300}`, hint per platform; test ids `settings-social`, `settings-socialInstagramUrl`, `settings-socialFacebookUrl`, `settings-socialTiktokUrl`); after a successful save each field shows the stored normalised value: render `SocialSection` with a `key` built from the three stored values (as `ZoneCard` is keyed), so the `router.refresh()` that `useSaver` already does remounts it with the new props (`useState` ignores changed props otherwise). No other section changes.
- [X] T051 [P] [US3] Add icons `instagram`, `facebook`, `tiktok` to `src/components/ui/Icon.tsx` (authored outline SVGs in the set's style: 24×24 viewBox, `stroke="currentColor"`, width 1.7, round caps; simple shapes drawn for this shop, not copied brand files), extending `IconName`.
- [X] T052 [US3] Footer social links per contracts/social-links.md "Footer output": new `src/components/shop/SocialLinks.tsx` (server; props: the three stored addresses and the translated names; returns `null` when all are empty; `<ul data-testid="footer-social" aria-label>` with items in the order Instagram, Facebook, TikTok, each `<a href data-testid="footer-social-<platform>" aria-label>` 44×44 `rounded-pill` with a 1.5 px `ink` border, hover `bg-sage`, icon `aria-hidden`; no `target`); render it in `src/components/shop/Footer.tsx` after the phone line, from `settings`.
- [X] T053 [US3] E2E: in `tests/e2e/admin-settings.spec.ts` add "social links" (chromium-mobile, as the file's other tests): save `instagram.com/aviva` in Settings → toast, field shows `https://instagram.com/aviva`; `/he` footer has exactly one `footer-social-*` link, `footer-social-instagram`, `href` = that address, accessible name "האינסטגרם שלי"; `/en` name "My Instagram"; type `https://example.com/a` in the Facebook field and save → the Hebrew `wrongSite.facebook` message under the field and the footer still shows only Instagram; then empty both the Facebook and the Instagram fields and save (the section saves its three fields together) → `footer-social` is absent. Leave the settings as they were at the end (`afterAll`). In `tests/e2e/privacy.spec.ts` footer test: `footer-social` is absent by default. In `tests/e2e/a11y.spec.ts`: one storefront page with all three links saved (set them by SQL in the test and restore after), and `/admin/settings` with the new section.
- [X] T054 [US3] Run `pnpm verify`, then `admin-settings.spec.ts` (`chromium-mobile`), `privacy.spec.ts` and `a11y.spec.ts` (`chromium-desktop`) one at a time; fix failures.

**Checkpoint**: quickstart §4 passes; SC-008 can be timed by the owner.

---

## Phase 5b: User Story 5 - Aviva chooses the pieces for the home page row (Priority: P2)

**Goal**: the home-row category choice in Settings, and end-to-end checks of the category
checkboxes built in T029 (FR-032, FR-034; contracts/home-row.md "Admin").

**Independent Test**: quickstart §6; the new tests in `admin-products.spec.ts` and
`admin-settings.spec.ts`.

### Tests first

- [X] T055 [P] [US5] Extend `tests/integration/settings.test.ts` (must fail before T057): `homeCategoryId` set to an existing category, cleared with `null`, an unknown uuid → field error `admin.settings.errors.home_category_not_found` and nothing saved; the `settings.updated` activity row is written.
- [X] T056 [P] [US5] E2E (phone projects only, as the file's other tests): in `tests/e2e/admin-products.spec.ts` "categories": open a published sample piece, its own category and "מומלצות" are ticked; untick "מומלצות", save → `/he` home row no longer shows it and `/he/c/<its category>` still does; tick a second category, save → it shows on both category pages; untick everything and try to publish a draft → the existing missing-category message. In `tests/e2e/admin-settings.spec.ts` "home row": choose "ללא" → `/he` has no `home-row`; choose "מומלצות" → the row is back. Restore the data in `afterAll`.

### Implementation

- [X] T057 [US5] Server: `src/lib/validation/settings.ts` gains `homeCategoryId: z.uuid().nullable().optional()`; the settings save checks that the id exists (else the field error `admin.settings.errors.home_category_not_found`). T055 passes.
- [X] T058 [US5] Admin UI: `src/app/admin/(protected)/settings/page.tsx` passes `homeCategoryId` and the category list; `src/components/admin/SettingsManager.tsx` gets a "דף הבית" section (same `Section`, `FormField`, `useSaver`, `FormAlert` pattern; a select with "ללא (השורה לא תוצג)" and every category; test id `settings-homeCategoryId`). Messages (he and en): `admin.settings.home.{title,hint,label,none}` and `admin.settings.errors.home_category_not_found`, in plain Hebrew (constitution II).
- [X] T059 [US5] Run `pnpm verify`, then `admin-products.spec.ts` and `admin-settings.spec.ts` (`chromium-mobile`) one at a time; fix failures.

**Checkpoint**: quickstart §6 passes; SC-009 can be timed by the owner.

---

## Phase 6: User Story 4 - Aviva's admin area matches the new look (Priority: P3)

**Goal**: admin in Assistant and the new colours, same layout, texts and steps (FR-027).

**Independent Test**: quickstart §5; admin specs pass unchanged; axe clean.

- [X] T060 [US4] Admin colour details per research D10 (classes only): `src/components/admin/order-badge-looks.ts` and `OrderStatusBadge.tsx` — "New" and payment "Paid" `bg-sage text-ink`, "In preparation" and "Refunded" `bg-photo`, the rest as today with new tokens (update `tests/unit/order-status-badge.test.ts` only where it asserts old class names); `src/components/admin/StatsChart.tsx` — bars `fill-forest`, today's bar `fill-sage` with a 1.5 px `stroke-forest` outline; admin nav pills hover `sage`; admin page background: add `bg-photo` to the `<body>` in `src/app/admin/layout.tsx` (the cream came from the global `body` rule, not a class; this also covers `/admin/sign-in`), white cards keep their `line` outline. Check with `git diff dev -- src/app/admin src/components/admin` that, apart from `SettingsManager.tsx`'s social and home sections, the settings and product page props, `ProductEditor.tsx`'s category checkboxes and the products list's category names, only class names changed; report anything else.
- [X] T061 [US4] Extend the admin test in `tests/e2e/a11y.spec.ts` with `/admin`, `/admin/products`, `/admin/categories`, `/admin/stats`, `/admin/products/<id>` (the category checkboxes) and `/admin/content`, `/admin/content/terms/versions` and one `/admin/content/terms/versions/<n>` (SC-003: every admin screen), then run `a11y.spec.ts` (`chromium-desktop`), `admin-home.spec.ts`, `admin-orders.spec.ts`, `admin-products.spec.ts`, `admin-content.spec.ts`, `admin-stats.spec.ts` (`chromium-mobile`), one at a time; fix failures in product code.
- [X] T062 [US4] Run the remaining admin specs once each on their project (`admin-access`, `admin-auth`, `admin-order-workflow`, `admin-privacy`); fix failures.

**Checkpoint**: every admin spec passes; axe reports no violations on admin screens.

---

## Phase 7: Remaining documents and design review (FR-028–FR-030)

- [X] T063 [P] `docs/owner-guide-he.md`: a short section "הוספת קישורים לרשתות החברתיות" in plain Hebrew (where in Settings, copy the address from the browser, empty field = no link, what the errors mean) and a section "השורה בדף הבית" (a piece can be in several categories; tick "מומלצות" to show it on the home page; Settings › "דף הבית" chooses the row's category or none). `docs/launch-checklist.md`: before releasing 007, take a backup (the migration changes how pieces are linked to categories), and after release check that the home row shows the pieces. `docs/security/threat-model.md`: one row for owner-controlled outbound links (only `https` on the three platform domains, validated on the server and constrained in the database; plain links, no embeds; OWASP A05). `CLAUDE.md` "Where things are": add `assets/home-photos/` (home photo originals) and `pnpm photos:home` (makes the served variants; see storefront.md §6).
- [X] T064 Extend `tests/e2e/design-review.spec.ts` (still `DESIGN_REVIEW=1`, `chromium-desktop`): home page full page at 375, 768 and 1280 in he and en (with the row), `/he/shop` and `/en/shop` at 375 and 1280, the header after scrolling past the hero, a product page with "You may also like", the footer with three social links (set by SQL, restored after), `/admin/settings` and a piece's edit screen with the category checkboxes; the file's header comment names the home example and storefront.md as the references.
- [X] T065 Update `docs/roadmap.md` item 007's status line to "Done (awaiting owner test)" and its goal line if needed (FR-030).

---

## Phase 8: Final checks

- [X] T066 Run `pnpm verify` and `pnpm photos:home` (identical `shasum public/site-photos/* src/lib/home-photos/manifest.json` before and after) and `git status` to list every changed and new file for the report; confirm `grep -rn "heebo\|Heebo" src` and the removed-token scan are empty.
- [X] T067 Run, one file at a time with a timeout: `home.spec.ts` on `chromium-mobile`, `chromium-desktop`, `webkit-mobile`; `admin-products.spec.ts` on `chromium-mobile`; `storefront-layout.spec.ts`, `a11y.spec.ts`, `bundle-size.spec.ts`, `headers.spec.ts`, `catalog.spec.ts` on `chromium-desktop`; `language.spec.ts` on `chromium-mobile` and `chromium-desktop`. Report sizes from `bundle-size.spec.ts`. Leave the full E2E run to CI.
- [X] T068 Run `DESIGN_REVIEW=1 pnpm exec playwright test tests/e2e/design-review.spec.ts --project=chromium-desktop` once; report the number of screenshots and any screen it could not reach. The coordinator reviews them against `docs/design/home-example.src.html` and storefront.md.
- [X] T069 (coordinator) Show the owner the finished home page and ask for the final wording of the home texts and alt texts (contracts/ui.md, FR-012) and their view of the darker strip behind the header (research D16 Q5). Record the answers in a note for T070.
- [X] T070 (superseded: the owner's T069 answers changed the header and the hero, so they are planned as Phase 9, T072–T083; the home texts and alt texts are final as they are) Apply the owner's answers from T069 (implementer), if any: text or alt-text changes in `src/i18n/messages/{he,en}.json`, a lighter or darker `--scrim-text` (never below 0.54, the AA minimum for the header text; the token test checks it), and any other answer that changes code; update storefront.md §8.1 and §14 to match; re-run `home.spec.ts` (`chromium-mobile`) and `i18n-parity.test.ts`.

---

## Phase 9: Header redesign from the Phase D gate (owner answers 2026-11-16)

**Purpose**: the owner's T069 answers and the plan-review answers (spec "Owner answers at the
Phase D gate", FR-008, FR-010, FR-039–FR-043; research D20; data-model.md §6; contracts/ui.md
"Page frame"). Replaces the header layout of T013/T032 (the CSS-only see-through switch of T023
stays). Same rules as every batch. Runs before the walk-through T071.

**Batches** (one at a time, a review after each): **B9a** documents T072, T081 · **B9b** tests
first T073, T074 (they must fail) · **B9c** data and validation T075, T076 · **B9d** UI T077,
T078, T079 · **B9e** existing tests and checks T080, T082. T083 and T071 are the coordinator's.

- [X] T072 Update `docs/design/storefront.md` to D20 before any code: §3.3 (the blended strip
  replaces the top text band; `--scrim-text` stays the minimum behind the header), §4 (header states
  and the `nav` breakpoint 1024 px; the header's 16 px gutter against `<main>`'s 24 px), §7.17
  (strip with the language switch at the inline end, `paper` focus ring on `forest`, always shown,
  switch only when there is no text, at least 44 px tall instead of "Hidden when neither applies"),
  §7.18 (rewrite: below 1024 px menu | brand | cart, and the menu sheet's order including
  "Contact" and the full-word language link; from 1024 px one row in the owner's order, gaps
  12/16 px, brand ≤ 160 px, category names in an inner span ≤ 95 px with an ellipsis and the focus
  ring on the link, `shrink-0` items, `common.nav.*` labels; remove the clipping text and
  `HEADER_CATEGORY_LIMIT`), §7.19 (switch in the strip; footer and menu sheet keep the full-word
  link), new §7.33 `HeaderSearch` (44 px, explicit `ink`/`ink-2` colours, inset `forest` focus
  ring, `maxLength` 80, distinct `aria-label`s, test ids), §7.28 `HomeHero` (no tagline; the top band is the blended strip only),
  §8.1 (hero without the tagline), §11 (verification: the 1024 px header checks and screenshots),
  §12.10 (the two header category selects), new §12.12 "Categories `/admin/categories`"
  (12-character names, `maxLength`, each error under its own field), §13 (deviation: the example's centred-logo header → the owner's order), §14
  (the Phase D gate and plan-review answers).
- [X] T073 [P] Unit and integration tests first (must fail before T075, T076, T078):
  `tests/unit/header-categories.test.ts` (new): `pickHeaderCategories(settings, categories)` order
  [h1, h2, home], drops nulls, ids not in the published list and repeats (first wins), omits the
  home category when `homeCategoryId` is null, at most 3; `tests/integration/settings.test.ts`:
  `headerCategory1Id`/`headerCategory2Id` set, read back by `getSettings()`, cleared with `null`,
  unknown id → field error `admin.settings.errors.header_category_not_found`, nothing saved;
  `tests/integration/catalog-products.test.ts` (new `describe` block for the category actions;
  today the file only uses `createCategory` as a helper): a 13-character Hebrew or English name is
  refused by `createCategory` and by `updateCategory` with the field error
  `admin.categories.errors.nameTooLong` on `nameHe`/`nameEn` (not `invalid`); both too long →
  both fields carry it; a 12-character name is accepted, also an English one with a trailing space
  (trimmed first); an empty Hebrew name still gives `invalid`;
  `tests/integration/schema.test.ts`: deleting a category chosen as a header category sets the
  setting to null; `tests/unit/design-tokens.test.ts`: the `.scrim-band-top` gradient's first stop
  is ≥ `--scrim-text`, the stop at `var(--header-h)` is `--scrim-text`, and it ends at 0;
  `tests/unit/i18n-parity.test.ts` stays green (new keys in both files).
- [X] T074 [P] E2E tests first (must fail before T077–T079), in `tests/e2e/storefront-layout.spec.ts`
  (chromium-desktop; the phone widths by viewport), `tests/e2e/home.spec.ts` and
  `tests/e2e/admin-settings.spec.ts` (chromium-mobile). Test data sets the two header categories by
  SQL to two categories with pieces, restored after. At 1024 and 1280 px on `/he`, `/en`,
  `/he/shop`: the header `<nav>` links are exactly, in order, "כל היצירות"/"All pieces", header 1,
  header 2, the home-row category, "אודות"/"About", "משלוחים והחזרות"/"Shipping & returns", then
  the brand, `header-search`, `cart-link`, in reading order (x positions decreasing in Hebrew,
  increasing in English); no menu button visible; no two header controls' boxes intersect, none
  intersects the brand; with a 60-character shop name the brand is ≤ 160 px and truncated; tabbing
  through every header control shows each focused element fully inside the viewport and the
  header (visible box equals its full box). Names at exactly 1024 px, both locales: with the three
  category names set to ordinary 12-character names ("סלסלות קטנות" / "Small hearts") each inner
  name span has `scrollWidth ≤ clientWidth` (shown in full); with "WWWWWWWWWWWW" / "שששששששששששש" the row
  stays inside the viewport with no overlap and each span's computed `overflow` is `hidden` and
  `text-overflow` is `ellipsis`. At 320, 375, 900 and 1023 px: only menu button, brand and cart are
  visible in the header, no overlap, no sideways scroll; the menu sheet holds `menu-search`, "All
  pieces", every category with pieces, "אודות", "משלוחים והחזרות", "יצירת קשר" and the full-word
  language link (English labels on `/en`). Search: typing "bowl" in `header-search-input` and pressing Enter opens
  `/he/search?q=bowl` (and from `menu-search-input` on a phone); it works with JavaScript disabled;
  the field is ≥ 44 px tall and its text colour is `ink` over the photo at scroll 0; focusing the
  field at scroll 0 on `/he` gives it a visible outline whose colour is not `ink` (the inset
  `forest` ring). Language switch: inside `announcement-bar` on every width, none in the header
  bar, same accessible name and target; with the free-shipping amount emptied and pickup off by
  SQL (restored after), the strip still shows, holding only the switch. Focusing the strip's
  switch at scroll 0 (1024 px and 375 px): its outline box lies inside the viewport and above the
  header's top edge. At 320 px in both locales the strip's text box does not intersect the switch
  and there is no sideways scroll. The desktop `<nav>`'s
  name is "תפריט האתר" / "Site menu"; with no published piece (all set to draft by SQL, restored
  after) "All pieces", "About" and "Shipping & returns" still show in the desktop `<nav>`, and at
  375 px the menu sheet still holds them plus "Contact" and the language link. Home at scroll 0: no `<p>` in `home-hero`, the h1 still the shop
  name; the header bottom ≤ the strip's `--header-h` stop. Header categories cleared by SQL → only
  "All pieces", the home-row category, "About", "Shipping & returns"; home row set to none → the
  home-row link is gone too. Admin (`admin-settings.spec.ts`): choose two categories in
  `settings-headerCategory1Id`/`settings-headerCategory2Id` and save → they show in the header at
  1280 px in that order; "ללא" → gone; the categories screen's Hebrew and English name inputs
  carry `maxlength="12"` (the server error itself is covered by T073).
- [X] T075 Data (FR-039): `shop_settings.header_category_1_id`, `header_category_2_id` (FK, on
  delete set null) in `src/server/db/schema/commerce.ts`; `pnpm db:generate --name
  header_categories` (→ `0006_header_categories.sql`); `pnpm db:migrate` locally;
  `getSettings()` returns `headerCategory1Id`/`headerCategory2Id`; `src/lib/validation/settings.ts`
  and the settings save (existence check, field error, the existing `settings.updated` row);
  messages he/en `admin.settings.errors.header_category_not_found` (plain Hebrew, like
  `home_category_not_found`);
  new `src/server/catalog/header-categories.ts` with the pure `pickHeaderCategories` per
  data-model.md §6 (no new query). T073's data tests pass; `pnpm test:pg` with
  `DATABASE_URL_TEST`.
- [X] T076 Category names max 12 (FR-040): `src/lib/validation/category.ts` `nameHe` and the
  optional `nameEn` `max(12)` (create and update alike, no legacy handling; in `optionalName` the
  length check runs after trimming); in `src/server/catalog/categories.ts` `createCategory` and
  `updateCategory` map every `too_big` issue on `nameHe`/`nameEn` to the field error
  `admin.categories.errors.nameTooLong` (both fields when both are too long), other issues keep
  `invalid`; messages he/en: new `admin.categories.errors.nameTooLong` (he plain Hebrew, feminine
  singular), and `invalid`'s text changes from 80 to 12; the categories screen
  (`CategoriesManager.tsx`) shows each field error under its own input (Hebrew and English) and
  sets `maxLength={12}` on both. Check the seed, sample data, migration 0004's
  "Featured"/"מומלצות", the test helpers that take any name (`catalog-products.test.ts` `createCategory`
  helper, `public-queries.test.ts`) and the E2E fixtures for names over 12 and report them (the E2E fixtures that rename categories to 20 characters change in T080).
  T073's category tests pass.
- [X] T077 Settings UI (FR-039): `src/app/admin/(protected)/settings/page.tsx` and
  `SettingsManager.tsx` "דף הבית" section: two selects "קטגוריה בתפריט 1"/"2" (each "ללא" + every
  category; test ids `settings-headerCategory1Id`, `settings-headerCategory2Id`) next to the
  home-row select, same `useSaver`/`FormAlert`/`ErrorSummary` pattern; messages he/en
  (`admin.settings.home.header1`, `header2`, `headerHint`). T074's admin-settings tests pass.
- [X] T078 Header (FR-008, FR-041, FR-043, D20): `--breakpoint-nav: 64rem` in `globals.css`;
  rewrite `src/components/shop/Header.tsx` and `HeaderCategories.tsx` (remove
  `HEADER_CATEGORY_LIMIT` and the "menu on desktop" rule; category names in an inner truncating
  span ≤ 95 px, focus ring on the link; labels from `common.nav.*`; the desktop `<nav>` named by
  `common.menuNav`; "All pieces", "About", "Shipping & Returns" (and in the sheet "Contact" and the
  language link) always render, only the category entries depend on the data, so the layout's
  `categories.length === 0` condition no longer drops them); new
  `src/components/shop/HeaderSearch.tsx` (header and menu variants, distinct `aria-label`s,
  `maxLength={MAX_QUERY_LENGTH}`, 44 px, explicit `ink`/`ink-2` colours; the form carries
  `data-header-search` and the inset `forest` ring comes from the unlayered rule of D20 placed after
  `#site-header :focus-visible` in `globals.css`, not from a utility class, which would lose); the search page's own
  form in `src/app/[locale]/(shop)/search/page.tsx` gets its `aria-label`; move the compact
  `LanguageSwitch` into `AnnouncementBar.tsx` (white on `forest`, inline end, 44 × 44, `paper`
  focus ring with a 1 px offset; the strip always renders, `data-testid="announcement-bar"`, at
  least 44 px, switch only when there is no text; the menu sheet's "All pieces", "About",
  "Shipping & Returns", "Contact" and language link render even with no categories, and its
  "קטגוריות" heading only when there are categories); the menu sheet keeps "Contact" and the full-word switch; `src/app/[locale]/layout.tsx`
  passes `pickHeaderCategories(settings, categories)` from the data it already loads; messages
  he/en for the search labels. Keep every existing test id and accessible name. T074's header
  tests pass.
- [X] T079 Hero (FR-010, FR-042): `src/components/shop/HomeHero.tsx` drops the tagline `<p>`
  (check `src/app/[locale]/(shop)/page.tsx` passes nothing it no longer needs); `.scrim-band-top`
  in `globals.css` becomes the blended strip of D20: the element's block size
  `calc(var(--header-h) + 140px)` with no padding or inner text container, the base 0.42
  background replaced by the gradient, the `.scrim-band-top::after` feather removed (no text
  inside; no hard edge); keep the bottom band for the h1. T073's token test and T074's hero checks pass.
- [X] T080 Update the existing tests the new header changes, without weakening them (say which):
  `tests/e2e/language.spec.ts` (switch now in the strip: `SWITCH_HREF` at line 45 moves from
  `header a[…]` to the `announcement-bar` hook; header-order tests follow contracts/ui.md;
  "the menu and the footer carry the full-word switch" at lines 183–200 stays valid as it is and
  must keep passing on the phone projects), `home.spec.ts` (the 900 px five-category test, the
  menu-button and menu-sheet tests, the 20-character category renames → 12-character names),
  `storefront-layout.spec.ts` (the old 320–1280 header test), `privacy.spec.ts`, `a11y.spec.ts`
  (add 1024 px), `design-review.spec.ts` (shots at 1024 px), `bundle-size.spec.ts` (the new form
  adds no client JS), `catalog.spec.ts`/`cart.spec.ts`/`search` specs where they click the header
  search icon or a header category link.
- [X] T081 `docs/owner-guide-he.md`: the two header categories in Settings › "דף הבית", the
  12-character name limit and why (a rare name of wide letters may end with "…" in the menu); the
  language switch's new place in the green strip.
- [X] T082 Run `pnpm verify` (with `DATABASE_URL_TEST`), then one file at a time after `pnpm build`:
  `home.spec.ts` (chromium-mobile, chromium-desktop, webkit-mobile), `storefront-layout.spec.ts`,
  `a11y.spec.ts`, `bundle-size.spec.ts`, `catalog.spec.ts`, `privacy.spec.ts` (chromium-desktop),
  `language.spec.ts` (chromium-mobile, chromium-desktop), `admin-settings.spec.ts`,
  `admin-products.spec.ts`, `cart.spec.ts` (chromium-mobile); then
  `DESIGN_REVIEW=1 … design-review.spec.ts` once. Report sizes and screenshot count.
- [X] T083 (coordinator) Show the owner the new header and hero (1024, 1280, 375 px, he and en)
  and re-walk quickstart §2 for the header (the header part of T071).

## Phase 10: Owner visual fixes (2026-11-17)

Spec "Owner visual fixes after testing (2026-11-17)". One batch (B10), docs and tests first.

- [X] T084 Docs: `docs/design/storefront.md` (§3.3 photo bands, §7.18 header incl. the
  header-states text near line 372, §7.28 hero, §7.29 banner, §13/§14 change log) and
  `specs/007-storefront-redesign/contracts/ui.md` (page frame, header states table, banner) say:
  brand centred with `margin-inline: auto` from 1024 px; hero h1 centred; the home header fades
  over the first `--header-h` of scroll (background and border linear, text and icon colour switch
  at the half way point so text is never white on a near-white bar); the white bar is
  `color-mix(paper 85%, transparent)` with `backdrop-filter: blur(12px) saturate(1.4)` under
  `@supports`, solid `paper` otherwise; banners carry no dark layer (owner's accepted contrast
  exception), only the text shadow.
- [X] T085 Tests first: `tests/e2e/storefront-layout.spec.ts` brand centred between the nav and
  the search form at 1024 and 1280 px (±2 px, he and en) and still centred in the bar at 375 px;
  `tests/e2e/home.spec.ts` hero h1 `text-align: center` and its box centred in the hero at 375 and
  1280 px; the white bar's computed `backdrop-filter` contains `blur` on a non-home page and on the
  home page scrolled past `--header-h`; at scroll 0 the home header is transparent, and part way
  (≈ half of `--header-h`) its background alpha is strictly between 0 and the end value; the
  "text over photos sits inside scrim bands" test covers the hero only, and the banners are
  checked for no dark background on their copy box (no `scrim-band` class, transparent
  background) while the 1280 px reading-start-half check stays.
- [X] T086 Code: `Header.tsx` brand `nav:mx-auto`, search wrapper loses `nav:ms-auto`;
  `HomeHero.tsx` h1 `text-center` (and the text-balance stays); `globals.css`: the white bar
  (`#site-header` base and the `header-solid` end keyframe) uses the frosted paper under
  `@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))`, solid `paper`
  otherwise; the header animation becomes two animations on `scroll(root)` over
  `0 var(--header-h)`: a linear fade of background and border, and a `steps(1)` text/icon colour
  switch at 50 %; the forced-colors look is unchanged; `PhotoBanner.tsx` copy box drops
  `scrim-band scrim-band-banner` (rename to a plain layout class such as `banner-copy`, keeping
  the phone-bottom / 640 px reading-start-half layout and the `[data-on-photo]` text shadow), and
  the now unused `.scrim-band-banner` rules are removed. T085's tests pass.
- [X] T087 Run `pnpm verify`, then after `pnpm build`, one file at a time: `home.spec.ts`
  (chromium-desktop, chromium-mobile, webkit-mobile), `storefront-layout.spec.ts`
  (chromium-desktop), `a11y.spec.ts` (chromium-desktop), `bundle-size.spec.ts`
  (chromium-desktop). Report the measured contrast of the banner heading and line against the
  photo (sampled behind the text) at 375 and 1280 px.

### Phase 10 fix round (review of B10 + owner clarification)

- [X] T088 Header fade in time, not scroll-linked (spec "Header fades", owner clarification): the
  home header is see-through only at scroll 0 and becomes the frosted bar from 1 px, with a
  ~250 ms CSS `transition` of background, border, text colour and `backdrop-filter`. CSS cannot
  start a time transition from scroll position in Safari, so a tiny client island (e.g.
  `HeaderScrollState`, passive `scroll` listener or an IntersectionObserver on a 1 px sentinel at
  the top) sets a data attribute (e.g. `data-at-top`) on `#site-header`; CSS keys the see-through
  look off `body:has([data-hero]) #site-header[data-at-top]`. Remove the scroll-driven
  `header-fade`/`header-ink` animations. Server render: the home header starts see-through
  (attribute present) so a page loaded at the top shows no flash; without JavaScript,
  `@media (scripting: none)` keeps the frosted bar at every scroll position (review fix; noted in
  research D5 as an amendment). Keep the island in the root shop layout or Header so it costs only a few hundred
  bytes (bundle-size limits still pass). Forced colours: no transparency, no blur, no transition
  (`@media (forced-colors: active)`), fixing review W2. Update storefront.md §4/§7.18, contracts/ui.md
  header states, research D5, and the header-states test in home.spec.ts (scroll 0 see-through;
  after scrolling 1–2 px and waiting for the transition, frosted with ink text and blur; back to 0
  see-through; reduced motion gives the same end states; WebKit checked the same way now that it
  no longer depends on scroll timelines).
- [X] T089 Review warnings: storefront.md line ~162 (`on-photo` token row), line ~263 (banner
  headings and lines no longer under `--scrim-large`) and §11's `home.spec.ts` row; the hero h1
  centring test measures the text itself (a Range over the h1 text, midpoint vs the hero's
  midpoint) so it fails without `text-center`; fix the stale `bannerReport` comment in
  home.spec.ts; re-wrap storefront.md line ~251.
- [X] T090 Run `pnpm verify`, then after `pnpm build`, one file at a time: `home.spec.ts`
  (chromium-desktop, chromium-mobile, webkit-mobile), `bundle-size.spec.ts` (chromium-desktop),
  `a11y.spec.ts` (chromium-desktop).

## Phase 11: Menu and cart drawers (owner answers 2026-11-17)

Spec "Owner answers: menu and cart drawers", FR-044–FR-048, research D21. Batches in order:
B11a docs and tests first (T091–T093), B11b controller and cart drawer shell (T095), B11c menu
drawer (T094), B11d cart drawer body and links (T096–T097),
B11e verify (T098).

- [X] T091 Docs: `docs/design/storefront.md` (§4 motion, §7.18 header and menu drawer with the
  hamburger-to-X, a new section for the cart drawer, §7 cart page section marked removed, §11
  verification rows, §14 change log), `contracts/home-row.md` (line ~115, the cart links) and
  `contracts/ui.md` (page frame: menu drawer; a "Cart
  drawer" section replacing every cart-page reference; FR-002 note); `docs/owner-guide-he.md`
  (the cart now opens at the side; there is no cart page).
- [X] T092 Tests first, menu drawer: `tests/e2e/home.spec.ts` / `storefront-layout.spec.ts` (phone
  projects): the drawer's top edge equals the header's top edge on screen (under the strip at
  scroll 0; 0 after scrolling 300 px) and it reaches the viewport bottom, on the reading-start side
  (right in he, left in en); the strip is not covered; the close button (`menu-close`) is within
  1 px of the menu button's box at scroll 0 and after scrolling, and has focus after opening;
  the drawer is a `role="dialog"` with `aria-modal` and a name wrapping the `<nav>`, and the
  header, `<main>` and footer are `inert` while it is open (Tab through every control never focuses
  anything outside the drawer); focus returns to the menu button after `Esc`, the X and a tap
  outside; widening to 1024 px with the menu open closes it and leaves no inert or scroll lock; clicking a link in
  the drawer navigates and leaves no open drawer or scroll lock; its lines
  form an X (computed transforms of the line spans rotate ±45°) and the menu button's form three
  lines; `Esc`, the close button and a tap on the dimmed page close it and focus returns to the
  menu button; the page does not scroll while open; with reduced motion the end states are the
  same; the existing menu-content tests keep passing, except
  `storefront-layout.spec.ts:1007-1013`, which now expects the search form first after the close
  button; menu-button locators target `#site-header [popovertarget="site-menu"]`.
- [X] T093 Tests first, cart drawer: rewrite `tests/e2e/cart.spec.ts` for the drawer (open from
  `cart-link`; drawer on the reading-end side from the header's top edge; modal (`role="dialog"`,
  named by its heading, page `inert`); lines, quantity, remove, flags, free-shipping note,
  subtotal, empty state; "continue shopping" (`cart-keep-shopping`) closes; "to checkout"
  (`cart-continue`, as today) goes to checkout and no drawer or scroll lock is left open there;
  `Esc` and `cart-close` close and focus returns to `cart-link`; removing the last piece on
  `/checkout` shows the empty state and goes to `/{locale}/shop` only after closing; with a flagged
  line, `cart-continue` keeps the drawer open and focuses the error summary, whose links move
  focus to the line inside the drawer; after "add to cart" focus is on `cart-close`; the empty
  state's button goes to `/{locale}/shop`; reduced motion gives the same end states; add to cart on a product page
  opens the drawer with the new line; `/he/cart` and `/en/cart` answer 404; every spec that
  visited `/cart` (`a11y`, `design-review`, `checkout-terms`, `checkout-offline`, `contact`,
  `language`, `storefront-layout`, `bundle-size`) opens the drawer instead: replace
  `goto('/{locale}/cart')` with going to the page the test is about (or the product page) and
  clicking `cart-link`, then `cart-continue` where it went on to checkout; `design-review`'s
  cart shots become drawer shots and its menu locator targets the header button; the payment
  return page (`ReturnView`, both cart links incl. the "expired" panel) opens the drawer; `bundle-size.spec.ts` measures every page with the drawer closed and
  the drawer body loaded on open; checkout's "back to cart" and the empty-cart redirect (to
  `/{locale}/shop`).
- [X] T094 Menu drawer (FR-044, FR-045, D21): `Header.tsx` menu `<nav id="site-menu">` restyled
  as the drawer (a `<div role="dialog">` popover wrapping the `<nav>`; delete the old sheet's
  `@supports (anchor-name)` block in `globals.css` (lines ~181-196) and the sheet classes in
  `Header.tsx` (`inset-auto start-3 top-(--header-h) rounded-card w-[min(22rem,…)]`)); a new
  `MenuBurger` (three line spans) used by the header's menu button and by the
  drawer's close button (`menu-close`, `popovertargetaction="hide"`, `autofocus`, name
  `common.menuClose`); the counter-translate and the line transitions in `globals.css` (logical,
  `:dir(rtl)` for the sign, `@starting-style`, `allow-discrete`); backdrop, scroll lock; messages
  he/en. T092's tests pass.
- [X] T095 Cart drawer shell and controller (FR-044, FR-046, D21): `DrawerController` in
  `src/components/shop/DrawerController.tsx` (`--drawer-top`; modal: on `beforetoggle` open every top-level child of `<body>` other
  than the open drawer gets `inert` (generic, covers the skip links and the consent banner), removed on `beforetoggle` closed; focus back to the remembered opener on `toggle`
  closed; close on pathname change (backstop) and on bubbling clicks on a drawer's `a[href]`
  (not `#…`, new-tab or modified clicks, or events marked with `keepDrawerOpen(event)`); close the menu at the `nav` breakpoint; load the cart body with `next/dynamic` on
  first open or if already open on mount); the zone lookup shared with `AnnouncementBar` through
  `React.cache`; `scrollbar-gutter: stable`; `#cart-drawer` popover in
  `src/app/[locale]/layout.tsx` (`role="dialog"`, `aria-modal`, named by its heading; heading
  `cart.drawer.title`, close X `cart-close` at the cart button's place, the same motion on the
  reading-end side); `CartLink` becomes a `popovertarget` button (name, badge and test id kept);
  the layout's client messages gain `cart`; the layout reads the default zone and passes
  `freeShippingOverMinor` to the drawer; `openCartDrawer()` in `src/lib/cart/drawer.ts`; messages
  he/en `cart.drawer.title`, `cart.drawer.close` ("סגירת הסל" / "Close cart"),
  `cart.drawer.keepShopping`, `common.menuClose` ("סגירת התפריט" / "Close menu").
- [X] T096 Cart drawer body: rework `CartView` into `CartDrawerBody` (one column, the same pricing
  and flag logic, "to checkout" keeps `cart-continue`, "continue shopping" `cart-keep-shopping`), loaded with `next/dynamic`
  on first open or add; move `priceCart` to `src/lib/cart/actions.ts`; delete
  `src/app/[locale]/(shop)/cart/page.tsx` (and the folder's other files once unused).
- [X] T097 Links and redirects (FR-047): `AddToCart` opens the drawer after a successful add and
  its "in your cart" link becomes a button (`go-to-cart`); `CheckoutForm` and
  `CheckoutProblems.tsx` (its `cartLink: {label, href}` prop becomes an open-drawer control)
  "back to cart" becomes a button (`data-testid="checkout-back-to-cart"`); the empty-cart redirect goes to `/{locale}/shop`, waiting while
  the cart drawer is open; `ReturnView`'s cart links open the
  drawer (the `lines_unavailable` control has `data-testid="return-cart"`, the expired panel's has `return-cart` too); `fake-pay/actions.ts` falls back to `/{locale}/shop`. T093's tests pass.
- [X] T098 Run `pnpm verify`, then after `pnpm build`, one file at a time: `cart.spec.ts`,
  `home.spec.ts` (chromium-mobile, webkit-mobile), `storefront-layout.spec.ts`, `a11y.spec.ts`,
  `bundle-size.spec.ts` (chromium-desktop), `checkout-offline.spec.ts`, `checkout-terms.spec.ts`,
  `language.spec.ts`, `contact.spec.ts` (chromium-mobile). Report sizes.

## Walk-through (after Phase 9)

- [X] T071 (coordinator; moved after Phase 9 — done before the Phase D gate except the header, which T083 re-walks) Walk through quickstart.md §1–§6 on the dev server at 375 and 1280 px in he and en, record SC-004 ("usable within 3 s on 4G") with a throttled phone profile on the production build, as 006 did, and time one order from a product link to the confirmation on a phone-sized screen (SC-007, under 3 minutes); SC-001, SC-008 and SC-009 are the owner's own checks.

---

## Dependencies & Execution Order

- **Phase 1 (T001)** before T002 (the reference page links the originals) and T020 (the script
  needs them).
- **Phase 2 (T002–T016)** blocks every story: the documents are binding for the code, and
  removing the old colour names breaks any page not yet swapped. Inside it: T002 and T003 in
  parallel, then T004 → T005 → T006; then T007 → T008 → T009 → T010 → T011 → T012; T013, T014,
  T015 after T010 (they edit swapped files); T016 last.
- **US1 (T017–T033)**: T017 and T018 (tests first) → T019 → T020 → (T021, T022 in parallel) →
  T023 → T024 → T025 → T026; then T027 → T028 → T029 → T030 → T031 → T032 →
  T033 (T018's spec passes from T032 on).
- **US2 (T034–T044)**: needs Phase 2; independent of US1 except that both edit
  `ProductCard.tsx`/`ProductGrid.tsx` (T026 first, then T036 uses `eagerCount`), so run US1 first.
  T034 → T035 → T036; T037, T038 after T036 (same page); T039; T040 → T041 → T042 → T043 → T044.
- **US3 (T045–T054)**: needs Phase 2 (footer frame T015) and runs after T028 (its migration must be generated after `0004_product_categories` to get the number `0005`); otherwise independent of US1/US2. T045, T046 →
  T047 → T048 → T049 → T050; T051 in parallel with T047–T050; T052 after T049 and T051; T053 →
  T054.
- **US5 (T055–T059)**: needs US1's category links (T028, T029) and US3's
  settings changes (T048, T050: both edit `settings.ts` and `SettingsManager.tsx`), so it runs
  after US3. T055, T056 → T057 → T058 → T059.
- **US4 (T060–T062)**: needs Phase 2 (T010), T050 and T058 (the new admin parts exist).
- **Remaining documents and design review (T063–T065)**: after the stories they describe.
- **Final checks (T066–T068)**, then the owner's answers (T069 → T070).
- **Phase 10 (T084–T090)** after Phase 9 (owner visual fixes). **Phase 11 (T091–T098)** after
  Phase 10: B11a (T091–T093) first, then T095, then T094, then T096 → T097, then T098.
- **Phase 9 (T072–T083)** after T070: T072 and T081 (documents) first; T073 and T074 (tests first)
  next; then T075 → T076 (both touch messages; T075's migration is `0006`, after `0005`);
  T077 after T075 (needs the settings fields); T078 after T075 and T076 (needs
  `pickHeaderCategories`); T079 after T078 (both edit `globals.css`); T080 after T078–T079; T082
  last; T083 after T082.
- **Walk-through (T071)** after Phase 9: the header part is re-walked in T083; the rest of T071 is
  already recorded.

## Parallel Opportunities

- Phase 2: T002 and T003 together; T007 alongside T004–T006.
- US1: T017 and T018 together; T021 and T022 together; T027 alongside T019–T026.
- US2: T034 alongside the end of US1.
- US3: T045, T046 and T051 together. The coordinator still runs batches one at a time
  (`he.json`/`en.json` are shared by most batches).
- Phase 7: T063 and T064 together.

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + US1. The home page alone shows the owner the new look (spec US1
  "why this priority").
- Then US2 (the buying path in the new look), US3 (social links), US5 (home-row setting), US4
  (admin look), documents, final checks. Each phase ends with its checkpoint and is reviewable on its own.
