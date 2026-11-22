---

description: "Task list for feature 009: new header logo"
---

# Tasks: New header logo

**Input**: Design documents from `specs/009-header-logo-wordmark/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D9), data-model.md, contracts/brand-assets.md,
contracts/ui.md, quickstart.md

**Tests**: included. The constitution (VI) and SC-006 require the existing suites to keep passing,
and the contracts define the new checks (brand unit test, header geometry, backing).

**Organization**: grouped by user story. One script writes every brand file (logos, icons,
preview) in one run, so the whole asset step is in Phase 2; User Story 3 holds the icon and preview
checks.

**Rules for every task** (constitution, project `CLAUDE.md`): no `style` attributes (CSP); logical
CSS properties only (`pnpm check:css`); no hard-coded visible text (none is added); E2E locally one
spec file at a time, never the full run; run commands with timeouts and never start watch-mode or
dev-server commands that do not exit; no git commits, pushes or branches.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1, US2, US3 from spec.md

---

## Phase 1: Setup

No setup tasks: no new dependency, tool, folder or setting. The new original
`assets/logo/logo-wordmark-original.jpg` is already in the working tree (uncommitted; leave it
there, and leave the unrelated uncommitted Render files alone).

---

## Phase 2: Foundational (brand asset step, blocks all stories)

**Purpose**: `pnpm brand:assets` builds every brand file from the new original (research D1–D3,
D7–D9; contracts/brand-assets.md).

- [X] T001 Update `src/lib/brand/config.ts` per data-model.md "Brand configuration": `BRAND_SOURCES.logo = 'assets/logo/logo-wordmark-original.jpg'`; add `CUTOUT = { spreadFrom: 6, spreadTo: 16, lumFrom: 194, lumTo: 186, holeMeanLum: 198 }`, `EXPECTED_BOX = { x0: 260, y0: 416, x1: 1794, y1: 1259 }`, `BOX_TOLERANCE_PX = 40`, `LOGO_MARGIN_PX = 16`, `LOGO_WIDTHS = [186, 214, 279, 321] as const`, `YARN_SEED = { x: 930, y: 660 }`, `EXPECTED_YARN_BOX = { x0: 730, y0: 415, x1: 1404, y1: 951 }`, `ICON_ART_SHARE = 0.84`; change `OG` to `{ width: 1200, height: 630, quality: 85, card: { width: 760, height: 460, radius: 32, opacity: 0.92 }, logoWidth: 680 }`; keep `CREAM`, `CREAM_RGB`, `FAVICON_SIZES`, `APPLE_TOUCH_SIZE`, `ANDROID_ICON_SIZES`, `BUDGETS`, `WEB_MANIFEST`; remove `EXPECTED_DISC`, `DISC_TOLERANCE`, `MASK_INSET_PX`, `YARN_CROP`, `LOGO_SIZES`, `ANDROID_ICON_PADDING`; rewrite the header comment (measured on the wordmark original, research D1–D3, D7, D8)
- [X] T002 [P] Create `scripts/brand-cutout.ts` with three pure functions over a raw 3-channel RGB buffer (contracts/brand-assets.md "Pure functions", research D1, D2, D7): `cutOut(rgb, w, h, cutout)` → `Uint8Array` alpha where luminance = 0.299 R + 0.587 G + 0.114 B, spread = max − min of R, G, B, `alpha = max(ramp(spread, spreadFrom→spreadTo), ramp(lumFrom − lum, 0→lumFrom − lumTo))`, then every 4-connected region of pixels with alpha < 255 that does not touch the image border and has mean luminance < `holeMeanLum` is set to 255 (iterative stack fill, no recursion); `contentBox(alpha, w, h)` → inclusive `{ x0, y0, x1, y1 }` of rows/columns with ≥ 5 pixels of alpha ≥ 128, throwing when none; `regionFrom(alpha, w, h, seed)` → `{ mask, box }` of the 8-connected alpha ≥ 128 region holding `seed`, throwing when the seed pixel is below 128. No file access, deterministic
- [X] T003 Rewrite `scripts/build-brand-assets.ts` to contracts/brand-assets.md "Behaviour" steps 1–9 using T001 and T002: drop the disc detection, circle-cut badge and the squareness check; check the logo is at least 1000 × 1000 and the hero at least 1200 × 630; compare the detected box and the yarn box with `EXPECTED_BOX` / `EXPECTED_YARN_BOX` (any edge more than `BOX_TOLERANCE_PX` off → `BuildError` naming both boxes); trim to box ± `LOGO_MARGIN_PX`; header logos `logo-<width>` at `LOGO_WIDTHS` (height `Math.round(width × trimmedH / trimmedW)`, WebP q90 effort 6 alphaQuality 100, ≤ `BUDGETS.logo`); yarn art = original RGB with alpha = region mask × cut-out alpha, cropped to the region box; icons: art `contain`-fitted into `Math.round(size × ICON_ART_SHARE)` and centred on `CREAM_RGB`, then circle-masked for `FAVICON_SIZES` and `icon-32`, opaque squares for `apple-touch-icon` (180) and `icon-192`/`icon-512`; preview: 008's hero cover crop + centred SVG rounded rect (`OG.card`, white at `opacity`) + trimmed logo resized to `OG.logoWidth` wide, centred, flattened, JPEG q85, ≤ `BUDGETS.og`; manifest per data-model.md (keys sorted; `box` and `yarnBox` replace `disc`); unchanged: hashing, `site.webmanifest`, write-only-after-all-built, empty `public/brand/` first; rewrite the file's header comment
- [X] T004 [P] Update `src/lib/brand/index.ts`: `logoSrc(width)` doc lists 186, 214, 279, 321; add `logoSize(): { width: number; height: number }` returning the largest logo entry's size; doc comments of `icon32` and `appleTouchIcon` say "yarn balls on cream" (data-model.md "Accessors")
- [X] T005 Run `pnpm brand:assets` (timeout 300 s): it must exit 0 and print boxes within 40 px of the expected ones; check every file is within budget; run it a second time and confirm `git status --porcelain public/brand public/favicon.ico public/site.webmanifest src/lib/brand/manifest.json` shows the same file list and `shasum` of each file is unchanged (determinism, D9); confirm no `logo-176/224/264/336` file remains. Look at `logo-321`, `icon-512`, `apple-touch-icon` and `og` (Read the images, and a copy of `logo-321` composited on a dark colour in the scratchpad): no checkerboard squares, no grey fringe, pastel fills and thin lines whole, letter counters see-through, icons show only the yarn balls, needles and tail. Report anything off instead of tuning thresholds silently
- [X] T006 Rewrite `tests/unit/brand-assets.test.ts` for the wordmark (contracts/brand-assets.md "Tests"): keep the manifest/files, budgets, ICO, `site.webmanifest`, preview-size and no-metadata cases; replace the disc and circle cases with: logo widths `[186, 214, 279, 321]`, each height/width equal to the trimmed ratio within rounding (± 1 px), each WebP with alpha; `box` and `yarnBox` within `BOX_TOLERANCE_PX` of `EXPECTED_BOX` / `EXPECTED_YARN_BOX`; on `logo-321`: alpha ≤ 8 on the whole first and last row and column, alpha ≤ 8 at the "A" counter (source (320, 1145)), alpha 255 at the yarn ball (source (930, 660)) and the grey-blue yarn (source (1000, 646)) — map source to output with `(s − (box.x0 − LOGO_MARGIN_PX)) × 321 / trimmedW` (same for y), clamping to the image; fewer than 0.5 % of pixels with alpha ≥ 128 are light neutral (spread ≤ 6 and luminance ≥ 200); and a synthetic `cutOut`/`contentBox`/`regionFrom` case (an 80 × 40 checker of 8 px squares, 206 and 253 grey, with a brown (88, 55, 38) 3 px ring around a neutral (190, 190, 190) fill and a second brown ring around checker squares): checker → 0, brown → 255, the enclosed 190 fill → 255 (its own alpha is about half, so this proves the hole rule), enclosed checker → 0; `contentBox` spans both rings and `regionFrom` from a point on the first ring returns only that ring and its fill. Run `pnpm vitest run --project unit tests/unit/brand-assets.test.ts`

**Checkpoint**: brand files rebuilt, unit test green. The header still uses 008 classes until US1.

---

## Phase 3: User Story 1 — The new logo inside the header (P1) 🎯 MVP

**Goal**: the new logo sits in the header's centre, wholly inside the bar on every page; 008's room
for the hanging badge is gone (FR-001–FR-006, FR-008, FR-009).

**Independent test**: home, a category, a product, contact and checkout pages at 375 and 1280 px:
logo centred and inside the bar, leads home, content starts right under the bar
(contracts/ui.md "Geometry", "Page offsets").

- [X] T007 [US1] In `src/app/globals.css` (research D4): delete `--logo-size` and `--logo-overhang` from `:root` and from the `56.25rem` block; add `--logo-h: 52px; --logo-w: 93px` to `:root` and `--logo-h: 60px; --logo-w: 107px` in the `56.25rem` block (fixed width, so the drawn width never depends on which file the browser picks, review W1); set `html` `scroll-padding-top: var(--header-h)`; delete both 008 rules targeting `[data-testid="header-brand"]:focus-visible img` (the dark `box-shadow` halo and its `scripting: none` reset) and their comments; add an unlayered rule `#site-header [data-testid="header-brand"]:focus-visible { outline: 2px solid var(--color-ink); outline-offset: 0; }` after `#site-header :focus-visible` (research D6)
- [X] T008 [P] [US1] In `src/app/[locale]/layout.tsx` remove `pt-[calc(var(--logo-overhang)+8px)]` and `has-[>[data-full-bleed]]:pt-0` from `<main>`'s classes (back to the pre-008 class list, research D4)
- [X] T009 [P] [US1] In `src/app/[locale]/(shop)/p/[slug]/page.tsx` change `lg:top-[calc(var(--header-h)+var(--logo-overhang)+16px)]` to `lg:top-[calc(var(--header-h)+16px)]`
- [X] T010 [P] [US1] In `src/components/shop/CheckoutForm.tsx` change `lg:top-[calc(var(--header-h)+var(--logo-overhang)+16px)]` to `lg:top-[calc(var(--header-h)+16px)]`
- [X] T011 [US1] In `src/components/shop/Header.tsx` (contracts/ui.md "Header logo"): brand link classes `inline-flex min-h-11 items-center rounded-card px-2 py-0.5 nav:mx-auto` (no `group`, `relative`, `block`, `h-full`, `w-(--logo-size)`, `self-stretch`, `focus-visible:outline-none`); image `src={logoSrc(186)}`, `srcSet={logoSrcSet()}`, `sizes="(min-width: 900px) 107px, 93px"`, `width`/`height` from `logoSize()`, `alt={brand.text}`, `lang={brand.lang}`, `decoding="async"`, classes `block h-(--logo-h) w-(--logo-w) max-w-none object-contain`; keep `data-testid`s and the `sr-only` `common.homeLinkSuffix` span; update the component doc comment (logo inside the bar, research D3). Then `grep -rn "logo-overhang\|logo-size" src` must return nothing
- [X] T012 [US1] Update `tests/e2e/storefront-layout.spec.ts` (contracts/ui.md): rename the section comment to "009: logo in the header" and keep the `logo:` prefix rule in `beforeEach`; replace `expectHalfOut` with `expectInsideCentred` (`logo.top ≥ header.top + 4`, `logo.bottom ≤ header.bottom − 4`, centres within 1 px); rewrite "logo: on a content page it hangs half below…" as "logo: on a content page it is inside the bar and centred, at scroll 0 and scrolled, and the content starts right under the bar" (also asserts `<main>` computed `padding-top` is `0px` and `html` `scroll-padding-top` equals the header height) at 320, 375, 640 (= 1280 px at 200 % zoom, spec edge case), 1024 and 1280 px (the test sets each viewport itself; it runs in both `chromium-desktop` and `chromium-mobile` through the `logo:` prefix); rewrite the home-page geometry test the same way; add "logo: from 1024 px the buy panel and the checkout summary stick at header height + 16 px" (computed `top` of the product page's sticky panel and the checkout `aside` = `88px` at 1280 px), desktop project only; keep the overlap, alt/name and drawers tests; in the checkout error-link test measure against the header's bottom instead of the logo's (`activeTop ≥ headerBottom − 0.5` and `activeTop − headerBottom < 40`); change the brand width limits (around lines 501 and 860) to `width >= 900 ? 123.5 : 109.5` and `123.5`, comment "009: the logo link is 93/107 px plus 8 px padding each side"
- [X] T013 [US1] Run `pnpm build` (timeout 600 s), then `pnpm exec playwright test tests/e2e/storefront-layout.spec.ts --project=chromium-desktop` and the same with `--project=chromium-mobile` (timeout 600 s each), and `pnpm exec playwright test tests/e2e/home.spec.ts --project=chromium-desktop` (the brand-box tests near lines 795 and 847 must still pass); fix failures caused by this feature only

**Checkpoint**: US1 works on its own (logo inside the bar, on the white bar, no backing yet).

---

## Phase 4: User Story 2 — Readable logo over the home photo (P1)

**Goal**: soft white backing only in the home page's see-through header (FR-007, FR-009; research
D5, D6).

**Independent test**: home at scroll 0: backing visible; scroll: gone; other pages, no-JS and forced
colours: none (contracts/ui.md "Backing", "Focus").

- [X] T014 [US2] In `src/app/globals.css`, next to the header-state rules (unlayered): `#site-header [data-testid="header-brand"] { transition: background-color 250ms ease-out, box-shadow 250ms ease-out; }`; `body:has([data-hero]) #site-header[data-at-top] [data-testid="header-brand"] { background-color: rgb(255 255 255 / 0.9); box-shadow: 0 0 14px 6px rgb(255 255 255 / 0.55); }` (the ink focus ring from T007 already beats the white `currentColor` there; check it does); inside the existing `@media (scripting: none)` block reset that selector to `background-color: transparent; box-shadow: none;`; inside the existing `@media (forced-colors: active)` block add the brand link with `background-color: transparent; box-shadow: none;`. Comment each rule with its reason (research D5, D6). Reduced motion is covered by the existing global `transition: none !important`
- [X] T015 [US2] Add to `tests/e2e/home.spec.ts` (contracts/ui.md "Backing", "Focus"; like the file's other header tests these run on every project unless noted): "logo backing: white rounded box at the top of the home page, gone once scrolled, never on other pages" (alpha of the link's `background-color` ≥ 0.85 and `box-shadow` ≠ `none` at scroll 0; after scrolling 600 px and the fade, background alpha 0 and `box-shadow` `none`; `/he/c/sample-ceramics` at 0: none); same end states with `emulateMedia({ reducedMotion: 'reduce' })`; extend the existing no-JS test ("without JavaScript the home header…") to assert the link has no backing at scroll 0; "logo backing: none in forced colours" with `emulateMedia({ forcedColors: 'active' })` (`skipUnlessProject(testInfo, ['chromium-desktop', 'chromium-mobile'])`); "logo focus ring: ink, 2 px, inside the header" — focus the link by keyboard (Tab from the skip link onward until it is focused) at scroll 0 on `/he` and on `/he/c/sample-ceramics`, assert computed `outline-style` `solid`, `outline-width` `2px`, `outline-color` equals the ink colour, and the link's box ± 2 px lies within the header's box
- [X] T016 [US2] Run `pnpm exec playwright test tests/e2e/home.spec.ts --project=chromium-desktop` and `--project=chromium-mobile` (timeout 600 s each; build from T013 is reused unless source changed since, then `pnpm build` first)

**Checkpoint**: US1 + US2 complete; the header part of the feature is done.

---

## Phase 5: User Story 3 — Icons and link previews (P2)

**Goal**: tab, home-screen and app icons show the yarn balls on cream; the site preview shows the
full logo on a light card over the hero (FR-010–FR-012). Files are built in Phase 2.

**Independent test**: the icons and `og` file look right and are wired in the page head
(contracts/brand-assets.md "Tests", quickstart.md §3).

- [X] T017 [US3] Add icon and preview cases to `tests/unit/brand-assets.test.ts`: the corner pixel of `apple-touch-icon` and `icon-512` is cream `#faf8e9` (each channel ± 2) and opaque; `icon-32` corner alpha 0 and centre alpha 255; each `favicon.ico` PNG entry has alpha 0 at a corner; in the preview a card point (250, 100) has luminance ≥ 200 and the centre (logo outline) < 100 and the image is not flat (sharp `stats()`: the standard deviation of at least one channel > 20, i.e. the hero photo is there). Run `pnpm vitest run --project unit tests/unit/brand-assets.test.ts`
- [X] T018 [US3] Check the head wiring is unchanged and still correct: `src/app/[locale]/layout.tsx` and `src/app/admin/layout.tsx` icons metadata use `icon32()` and `appleTouchIcon()` (FR-010, admin too), `public/site.webmanifest` lists the new `icon-192`/`icon-512`, `src/server/seo.ts` uses `ogImage()` for the default preview and product pages keep their own image; then run `pnpm exec playwright test tests/e2e/seo.spec.ts --project=chromium-desktop` (timeout 600 s). Change `tests/e2e/seo.spec.ts` only if a pattern no longer matches

**Checkpoint**: all three stories done.

---

## Phase 6: Polish and cross-cutting

- [X] T019 [P] Update `docs/design/storefront.md`: add an "Amended 2026-11-21 by `009-header-logo-wordmark`" note to the header block; §3.6 (the logo sits inside the header, no hanging part); §4 page-frame diagram ("logo (centred, inside the bar)", `<main>` with no top padding) and the "The logo" bullet (wordmark, 52/60 px tall via `--logo-h`, inside the bar, `scroll-padding-top: var(--header-h)`, white rounded box only at the home page top); §6 "Brand assets" (new original, cut-out rule, box, widths 186–321, yarn-region icons on cream, preview card, "never place the logo on a dark or photo background without the light backing", 008 badge original kept and unused); §7.18 brand bullet (link box classes, image attributes, name unchanged, focus = 2 px ink outline on the backing, backing rule, width budget: brand 123 px of the 160 px cap); §10 if it lists logo sizes; §14 a new numbered entry "New wordmark logo (2026-11-21, feature 009)" with the changed sections. Cite research D-numbers
- [X] T020 [P] Update `PRODUCT.md`: line ~54, the logo is now the owner's wordmark ("Aviva's Crafts" with yarn balls) supplied 2026-11-21, shown inside the header; the round badge is retired (kept in `assets/logo/`); line ~62, drop "a wordmark" from the "does not exist" list (the owner's wordmark logo is the only brand mark; never redraw or edit it)
- [X] T021 [P] Add a short section "16. הלוגו" to `docs/owner-guide-he.md` in plain Hebrew: where the logo appears (header centre, on a soft white background at the top of the home page, the browser-tab and home-screen icons with the yarn balls, the picture shown when sharing a link), that WhatsApp and Facebook may keep showing an old preview for a while, and that replacing the logo is a developer task (send the new picture file); no technical terms
- [X] T022 [P] Update `docs/roadmap.md`: add the row `| 009 | New header logo (wordmark) | yes | Done (awaiting owner test) | [specs/009-header-logo-wordmark](../specs/009-header-logo-wordmark/) |` and an "### 009 — New header logo" item (goal and source: owner decisions 2026-11-21); in "Later", change "Final shop name, logo and wordmark." to "Final shop name."
- [X] T023 Run `pnpm verify` (timeout 600 s): types, lint, `check:css` (logical properties), unit, integration, audit and PostgreSQL tests pass; then `grep -rn "logo-overhang\|logo-size\|EXPECTED_DISC\|YARN_CROP\|logo-original.jpg" src scripts tests` returns nothing (the badge original is referenced only in docs)
- [ ] T024 (skipped 2026-11-21 at the owner's request: no browser runs, the owner tests by hand) Walk through `specs/009-header-logo-wordmark/quickstart.md` §1–§2 and the §3 table with screenshots from Playwright (no dev server left running) at 320, 375 and 1280 px on `/he`, `/en/contact` and a product page, top and scrolled; report what was seen

---

## Dependencies and execution order

- **Phase 2** (T001–T006) blocks everything: the header needs `logoSize()` and the new files.
  T001 first; T002 and T004 in parallel with each other after T001; T003 after T001 and T002; T005
  after T003 and T004; T006 after T005.
- **US1** (T007–T013) after Phase 2. T007 and T011 both shape the brand link; T008–T010 are
  independent one-line changes. T012 after T007–T011; T013 last.
- **US2** (T014–T016) after US1 (it styles the link US1 creates; T014 edits `globals.css` after T007).
- **US3** (T017–T018) needs only Phase 2; it can run before or after US1/US2 but shares
  `tests/unit/brand-assets.test.ts` with T006, so not at the same time as T006.
- **Polish** (T019–T024) after all stories; T019–T022 are separate files and can run in parallel.

## Suggested batches for the implementer (one at a time)

1. **Batch A — asset step**: T001–T006 (+ T017, same test file, so the brand test is written once).
2. **Batch B — header inside the bar**: T007–T013.
3. **Batch C — backing and focus over the photo, preview wiring**: T014–T016, T018.
4. **Batch D — docs and final checks**: T019–T024.

## Parallel examples

- Phase 2: T002 (`scripts/brand-cutout.ts`) and T004 (`src/lib/brand/index.ts`).
- US1: T008, T009, T010 (three different files).
- Polish: T019, T020, T021, T022.

## Implementation strategy

MVP = Phase 2 + US1: the new logo inside the header on every page. US2 makes it readable over the
home photo (same priority, small); US3's files already exist after Phase 2, so it only adds checks.
Each checkpoint leaves the site working.

---

## Phase 7: Owner feedback 2026-11-22 (soft white glow instead of the rounded box)

The owner tested by hand: the white rounded box over the home photo looks bad. From rendered
examples the owner chose C, a soft white glow following the drawing (research D5, D6 amended;
contracts/ui.md "Backing", "Focus" amended). No browser runs: the owner tests by hand; E2E files are
edited and type-checked only, CI runs them.

- [X] T025 [US2] In `src/app/globals.css` replace the 2026-11-21 backing rules (research D5 amended): remove the brand link's `background-color`/`box-shadow` rule and its transition; add on `#site-header [data-testid="header-logo"]` a `transition: filter 250ms ease-out`; add `body:has([data-hero]) #site-header[data-at-top] [data-testid="header-logo"] { filter: drop-shadow(0 0 2px #fff) drop-shadow(0 0 2px #fff) drop-shadow(0 0 6px rgb(255 255 255 / 0.7)); }`; reset it to `filter: none` in the existing `@media (scripting: none)` and `@media (forced-colors: active)` blocks (replace the link resets there); focus (D6 amended): keep the ink ring rule but at the top of the home page (`body:has([data-hero]) #site-header[data-at-top] [data-testid="header-brand"]:focus-visible`) set `outline-color: currentColor` (white on the photo); reset that in `scripting: none` if needed so the no-JS frosted bar keeps ink. Comment each rule with its reason
- [X] T026 [US2] Update `tests/e2e/home.spec.ts` to contracts/ui.md "Backing" and "Focus" (amended 2026-11-22): the backing tests assert the logo image's computed `filter` (contains `drop-shadow` at the home top; `none` scrolled, on `/he/c/sample-ceramics`, with no JS, in forced colours; reduced-motion end states the same) and that the link's background stays transparent with `box-shadow` `none`; the focus test expects white (`--color-on-photo`) at the home top and ink on `/he/c/sample-ceramics`, still 2 px solid, offset `0px`, inside the header. Do not run Playwright; run `pnpm exec tsc --noEmit` and `pnpm lint`
- [X] T027 Update `docs/design/storefront.md` (§4 "The logo" bullet, §6 brand-assets light-backing sentence, §7.18 brand bullet, §14 entry 15) and `docs/owner-guide-he.md` §16 (the soft white "rounded rectangle" becomes a soft white glow around the logo) to the amended D5/D6; then run `pnpm verify` (timeout 600 s) and `pnpm check:css`
- [X] T028 [US2] Owner feedback 2026-11-22 (C's glow is too big, use example B): in `src/app/globals.css` change the home-top logo `filter` to `drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff) drop-shadow(0 0 3px rgb(255 255 255 / 0.8))` (research D5) and update its comment; if `docs/design/storefront.md` names the glow sizes, update them (it may say "soft white outline" instead of "glow"). Run `pnpm check:css` and `pnpm exec tsc --noEmit`; no browser runs
