# Tasks: New look for the product cards and the product page

**Input**: Design documents from `specs/011-product-card-page-look/`

**Prerequisites**:
- plan.md
- spec.md
- research.md (D1–D10)
- data-model.md
- contracts/ui.md, contracts/show-as-new.md
- quickstart.md

**Slimmed on 2026-11-23 (owner request)**: this is mostly a styling change, so the plan keeps
code tasks small and adds only a few tests: the existing suites must keep passing (square photos,
no sideways scroll, no `style` attributes, 44 px targets, add to cart, checkout, the sticky buy
panel), tests that assert a replaced rule are updated, and new tests cover only the tick box and
the labels. Exact sizes and corners are checked by the owner with screenshots at the Phase D gate,
not by pixel-measuring tests.

**Rules for every task** (constitution, project `CLAUDE.md`):
- No `style` attributes (CSP). Logical CSS only (`pnpm check:css`): `ms-/me-/ps-/pe-`, `start-/end-`,
  `rounded-ss/se/es/ee`, never left/right.
- Every visible string comes from both `src/i18n/messages/he.json` and `en.json`.
- Exact values are in `contracts/ui.md`; do not round or "improve" them.
- Tailwind 4: `-translate-y-*` sets the CSS `translate` property and `scale-*` the `scale`
  property, not `transform`; transition lists and any assertion must use those names.
- Run commands with timeouts; no watch mode or dev servers that do not exit.
- E2E: run `pnpm build` after code changes and before Playwright (the test server runs the last
  build); then one spec file and one project at a time; the full run is left to CI.
  `tests/e2e/storefront-layout.spec.ts` runs only on `chromium-desktop` (its `beforeEach`); do not
  change that or `playwright.config.ts`. Test data changed by SQL is restored in `finally`.
- No git commits.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md

---

## Batch A: the look (US1, US2, US4) — styling only

**Goal**: the mounted cards everywhere, the product page as one card, rounded thumbnails and cart
and checkout photos, the design guide updated (FR-001–FR-003, FR-005–FR-011, FR-014, FR-016,
FR-017; research D3–D10; contracts/ui.md).

- [X] T001 Add to the `@theme` block of `src/app/globals.css`, next to `--shadow-float`, exactly:
  `--shadow-card: 0 1px 2px rgb(6 20 6 / 0.06), 0 4px 14px rgb(6 20 6 / 0.07);`,
  `--shadow-card-hover: 0 2px 4px rgb(6 20 6 / 0.07), 0 10px 26px rgb(6 20 6 / 0.12);`, and next to
  `--radius-card`: `--radius-photo: 8px;`, `--radius-sheet: 16px;`, each with a one-line comment
  saying where it is used. Add the four tokens and their values to the token checks in
  `tests/unit/design-tokens.test.ts`.
- [X] T002 [US1] Restyle `src/components/shop/ProductCard.tsx` and `src/components/ui/Price.tsx`
  (contracts/ui.md "Product card", research D4, D5):
  - The `Link` (keeps `data-testid="product-card"`): `group relative flex h-full min-w-0 flex-col
    rounded-card border border-line bg-paper p-2 shadow-card
    transition-[border-color,box-shadow,translate] duration-200 ease-out lg:p-2.5
    hover:border-field hover:shadow-card-hover focus-visible:border-field
    focus-visible:shadow-card-hover motion-safe:hover:-translate-y-0.5
    motion-safe:focus-visible:-translate-y-0.5`.
  - Photo box: `relative isolate block aspect-square overflow-hidden rounded-photo bg-photo`; the
    image's 1.03 zoom on `group-hover` and `group-focus-visible`, inside `motion-safe:` (400 ms as
    today). Keep `CARD_SIZES`, `alt=""`, `loading`, `fetchPriority`, `width`/`height`.
  - Text block `px-1 pt-2.5 pb-1.5 lg:px-1.5 lg:pt-3`; name `line-clamp-2 text-base
    leading-[1.25] font-semibold lg:text-lg`; price 3 px under it with a new `Price size="card"`
    (amount `text-[15px] lg:text-base font-normal text-ink tnum`; the "from" prefix keeps the small
    `ink-2` style); the not-available line unchanged. Remove `Price`'s `sm` size if nothing else
    uses it.
- [X] T003 [P] [US1] Grid and home row spacing (research D6):
  - `src/components/shop/ProductGrid.tsx`: gaps `gap-x-3 gap-y-6 lg:gap-x-5 lg:gap-y-9`.
  - `src/components/shop/HomeRow.tsx`: on the track replace `-mx-2 -my-2 px-2 py-2 scroll-px-2`
    with `-mx-4 px-4 scroll-px-4 -mt-4 pt-4 -mb-10 pb-10` (room for the shadow, the 2 px lift and
    the focus ring; still four whole cards from 900 px); keep every other class.
  - `src/components/shop/RowArrows.tsx`: scroll by `clientWidth` minus the track's computed
    `padding-inline-start` (one page of cards), not `clientWidth`.
  - Update the three doc comments.
- [X] T004 [US2] Product page card and gallery (contracts/ui.md "Product page card", "Gallery";
  research D7, D8):
  - `src/app/[locale]/(shop)/product/[slug]/page.tsx`: the gallery-and-details grid gets
    `rounded-sheet border border-line bg-paper shadow-card lg:p-3`, `lg:gap-9` instead of
    `lg:gap-10`, no gap between gallery and details below 900 px, and **no** `overflow-hidden` or
    `overflow-clip` (it would break the sticky details). The details column gets
    `px-4 pt-[18px] pb-4 lg:ps-0 lg:pe-5 lg:pt-5 lg:pb-4` and keeps its `lg:sticky` classes.
  - `src/components/shop/Gallery.tsx` main box: `rounded-ss-[15px] rounded-se-[15px]
    rounded-es-[12px] rounded-ee-[12px] lg:rounded-photo` (comment: 15 px = the card's 16 px minus
    its 1 px border), keep `overflow-hidden bg-photo`, add `isolate`; the focus-ring overlay gets
    `rounded-[inherit]`.
  - Thumbnails: each button `rounded-photo`; the current one `ring-2 ring-forest ring-offset-2
    ring-offset-paper` instead of `ring-[3px] ring-forest`; the `ul` gets exactly
    `mt-1 -mb-1 flex gap-2 overflow-x-auto p-1 px-2 lg:mt-2 lg:-mx-1 lg:px-1` (8 px under the photo
    and 8 px from the card's edge on phones, 12 px under the photo and in line with it from 900 px;
    the 4 px ring room overlaps the details' padding).
- [X] T005 [P] [US2] Cart and checkout photos: `rounded-photo` on the 72 × 72 photo span in
  `src/components/shop/CartLine.tsx`; `rounded-[6px]` on the 48 × 48 photo span in
  `src/components/shop/OrderSummary.tsx`.
- [X] T006 [US4] Update `docs/design/storefront.md` with the values of contracts/ui.md: §1
  "Selected direction" and its "Structure" bullet (rounded photos, soft card shadow, the product
  page is one card); §3.3 (radius and shadow lists, new tokens); §3.5 (card hover motion); §6
  "Square display" (square and rounded, not `rounded-none`); §7.5 (card price size); §7.14; §7.15;
  §7.22; §7.23; §7.32 (track room; arrows scroll one page); §8.4 ("one card" replaces "No panel
  (007 FR-017)"); §8.12 (the not-found grid uses the new cards); §13/§14 (owner decisions
  2026-11-22 and 2026-11-23).
- [X] T007 [US4] Run `pnpm verify` and fix what fails. Then `pnpm build` and run
  `tests/e2e/storefront-layout.spec.ts` (`chromium-desktop`) and `tests/e2e/home.spec.ts`
  (`chromium-desktop`). Where a test asserts a rule this feature replaced (sharp corners, a 3 px
  thumbnail ring, the old card's markup or sizes), update it to the new rule without weakening the
  rest; every other failure is a bug to fix in the code.

**Checkpoint**: `pnpm verify` passes; the two E2E files pass.

---

## Batch B: the labels and the tick box (US3)

**Goal**: a "Show as New" tick box in the piece editor (stored in `product.show_as_new`); each card
shows a "חדש" / "New" pill when ticked and a category pill chosen by the breadcrumb rule (FR-004,
FR-007, FR-012, FR-013; research D1, D2; data-model.md; contracts/show-as-new.md).

- [X] T008 [US3] Database: in `src/server/db/schema/catalog.ts` add to `product`
  `showAsNew: boolean('show_as_new').notNull().default(false)` (comment: the owner's "Show as New"
  tick box, spec 011 FR-012); run `pnpm db:generate --name product_show_as_new` and check that
  `src/server/db/migrations/0011_product_show_as_new.sql` contains only
  `ALTER TABLE "product" ADD COLUMN "show_as_new" boolean DEFAULT false NOT NULL;` (plus the
  `meta/` updates); run `pnpm db:migrate`.
- [X] T009 [US3] Card data in `src/server/catalog/public-queries.ts` (research D2):
  - Export `pickMainCategory(categories, homeCategoryId)` (first category that is not the home-row
    one, else the home-row one, else `null`) and use it in `getPublishedProductBySlug` instead of
    the inline code.
  - `PublicProductCard` gains `showAsNew: boolean` and `mainCategory: PublicCategory | null`;
    `CARD_COLUMNS` / `CardRow` gain `showAsNew`.
  - `toCards` takes an optional `homeCategoryId` (read with `getSettings()` only when not given;
    `listAlsoLikeFor` and `getHomeRow` pass it) and runs one batched query of `product_category`
    joined to `category` for the listed ids, sorted by `category.sort_order` then `category.id`.
    Use the same sort in the breadcrumb query so card label and breadcrumb always agree.
- [X] T010 [US3] Saving the tick box (contracts/show-as-new.md), each copying the
  `setProductOrderable` pattern:
  - `src/server/catalog/products.ts`: `setProductShowAsNew(actor, id, value)` (transaction,
    `SELECT … FOR UPDATE`, not found → `admin.products.errors.not_found`, no write when unchanged,
    activity `product.updated` with `{ field: 'showAsNew', to: value }`).
  - `src/app/admin/(protected)/products/[id]/actions.ts`: the Server Action
    `setProductShowAsNew(productId, value)` (`requireAdmin()` first, `idSchema`, boolean check);
    pass it to the editor in `src/app/admin/(protected)/products/[id]/page.tsx` next to
    `setProductOrderable`.
  - `src/server/catalog/admin-queries.ts`: `getEditorData` returns `showAsNew`.
- [X] T011 [US3] Editor UI and texts:
  - `src/i18n/messages/he.json` / `en.json`: `shop.card.new` ("חדש" / "New"),
    `admin.products.bar.showAsNew` ("הצגה כ'חדש'" / "Show as New"),
    `admin.products.bar.showAsNewHint` ("מציג תווית 'חדש' על כרטיס היצירה בחנות. אפשר להסיר את
    הסימון בכל עת." / "Shows a 'New' label on the piece's card in the shop. You can untick it at
    any time.").
  - `src/components/admin/PublishBar.tsx`: a second checkbox right under the orderable one, built
    the same way, `data-testid="show-as-new-toggle"`, props `showAsNew` / `onShowAsNewChange`.
  - `src/components/admin/ProductEditor.tsx`: `showAsNew: boolean` in `EditorProductData`,
    `setProductShowAsNew` in the `actions` type, state initialised from the saved value, passed to
    `PublishBar`; in `saveAll`, after the orderable step, call the action when the value changed
    (failures through `showFailure`).
  - `docs/owner-guide-he.md`: one sentence next to the "לא זמין להזמנה כרגע" paragraph about
    ticking "הצגה כ'חדש'" and unticking it when the piece is no longer new.
- [X] T012 [US3] Pills in `src/components/shop/ProductCard.tsx` (contracts/ui.md "Product card"),
  placed after the text block in the DOM so the link's name starts with the product name: a
  `span` positioned over the photo (`top` and `inset-inline-start` / `inset-inline-end` 16 px on
  phones, 18 px from 900 px), `flex flex-col items-start gap-1 pointer-events-none`; the "New" pill
  (`data-testid="card-pill-new"`, only when `showAsNew`, `bg-sage text-ink text-xs font-bold
  rounded-pill px-2.5 py-px leading-[1.6] whitespace-nowrap`); the category pill
  (`data-testid="card-pill-category"`, only when `mainCategory` is set, `bg-paper/94 text-ink
  text-xs font-semibold rounded-pill px-2.5 py-px leading-[1.6]` with an inset 1 px `line` ring,
  `min-w-0 max-w-full truncate whitespace-nowrap`, name from `pick(locale, …)` with
  `fallbackAttrs`). Update `storefront.md` §7.15 and §12.11 for the pills and the tick box.
- [X] T013 [P] [US3] Integration tests:
  - `tests/integration/catalog-products.test.ts`: `setProductShowAsNew` stores `true` and logs
    the activity row; the same value again writes nothing; a missing id fails; new products start
    `false`.
  - `tests/integration/public-queries.test.ts`: cards carry `showAsNew` and `mainCategory`; a piece
    in the home-row category and another gets the other one; only the home-row category → that
    one; no category → `null`; equal to the product page's `mainCategory`.
- [X] T014 [US3] E2E tests:
  - `tests/e2e/storefront-layout.spec.ts` (`chromium-desktop`, 375 and 1280 px, he and en): with
    `show_as_new` set on `sample-soy-candle` by SQL (restored in `finally`), its card on
    `/{locale}/shop` shows "חדש" / "New" above the category pill, both on the photo's reading-start
    side (right in he, left in en); a card without the flag has only the category pill.
  - `tests/e2e/admin-products.spec.ts`: tick `show-as-new-toggle` on a published sample piece, Save,
    reload: still ticked, and its card on `/he/shop` shows "חדש"; untick, Save: gone (restore in
    `finally`).
- [X] T015 Final checks: `pnpm verify`; `pnpm build`; then `storefront-layout` (`chromium-desktop`)
  and `admin-products` (`chromium-mobile`). Take screenshots for the owner at 375 and 1280 px, he
  and en, of `/he/shop`, the home row and `/he/product/sample-soy-candle` (one piece marked new),
  in `test-results/011-screenshots/` (ignored by git). Set row 011 in `docs/roadmap.md` to
  "Done (awaiting owner test)".

**Checkpoint**: `pnpm verify` and the listed E2E files pass; screenshots are ready.

---

## Order and batches

- Batch A (T001–T007), then its review; then Batch B (T008–T015), then its review.
- In Batch A, T003 and T005 touch their own files and can run beside T002/T004.
- In Batch B, T008 comes first; T013 can be written beside T010–T012.
- The full E2E run (all projects, including `webkit-mobile`) happens in CI on the pull request.

---

## Phase 3: Convergence

- [X] T016 In `docs/design/storefront.md` §14 item 16, record the 2026-11-23 owner decisions on the "Show as New" tick box (manual, off by default, no expiry) and the category pill (breadcrumb rule on every page), add §11 and §12.11 to its change log, and cite research D1–D10 instead of D3–D10 per FR-014 (partial)
- [X] T017 Add a 011 row to `docs/design/storefront.md` §11 "Verification" in the style of the 010 rows: the four tokens (`tests/unit/design-tokens.test.ts`), card data `showAsNew` / `mainCategory` (`tests/integration/public-queries.test.ts`), the pills' order and side (`storefront-layout.spec.ts`), and the tick box (`admin-products.spec.ts` 4b, `catalog-products.test.ts`) per plan: storefront.md touch-points §11 (partial)

---

## Phase 4: Owner feedback after the Phase D gate (2026-11-23)

**Goal**: the four changes the owner asked for after looking at the result (spec "Owner feedback
after the Phase D gate", FR-004, FR-005, FR-006, FR-011, FR-013; data-model.md `cardPills`;
contracts/ui.md). Same rules as above. One batch, in order.

- [X] T018 [US1] Card hover without the darker border: in `src/components/shop/ProductCard.tsx`
  remove `hover:border-field` and `focus-visible:border-field` and drop `border-color` from the
  transition list (keep `box-shadow,translate`). Keyboard focus keeps the global focus ring.
  Update `docs/design/storefront.md` §3.5 and §7.15 (hover: shadow and lift only, border stays
  `line`). If a test asserts the `field` border on hover/focus, update it to the new rule.
- [X] T019 [US2] Thumbnail focus ring not clipped: in `src/components/shop/Gallery.tsx` give the
  thumbnail `ul` 6 px of room on every side of the buttons (the global ring is 3 px at a 3 px
  offset), adjusting its margins so the visible spacing of contracts/ui.md stays the same: phones
  8 px under the photo and button edges 8 px from the card's edge, the bottom room overlapping the
  details' padding as today; from 900 px 12 px under the photo and button edges in line with the
  photo. Update `storefront.md` §7.14 (gallery thumbnails).
- [X] T020 [US3] Card data: `PublicProductCard` gains `featuredCategory: PublicCategory | null`
  (the home-row category when the piece is in it, else `null`), filled in `toCards` in
  `src/server/catalog/public-queries.ts` from the same batched category query (no extra query).
  `mainCategory` stays as it is. Extend `tests/integration/public-queries.test.ts`: in the
  home-row category and another → `featuredCategory` is the home-row category and `mainCategory`
  the other; only in the home-row category → both are the home-row category; not in it →
  `featuredCategory` is `null`.
- [X] T021 [US3] The pill rule (data-model.md `cardPills`): test first, `tests/unit/card-pills.test.ts`
  covering every allowed set (Featured; New; Category; New + Featured; New + Category; Featured +
  Category), the all-three case (→ New + Category), only-home-row with and without New, no
  category, the home-row exception (`inHomeRow`: featured never returned, the other category
  still is), and never more than two. Then `src/lib/card-pills.ts`. `ProductCard` gets an
  `inHomeRow` prop (default `false`; `HomeRow` passes `true`) and renders the pills from
  `cardPills` in display order, the featured pill styled like the category pill with
  `data-testid="card-pill-featured"`. Update `storefront.md` §7.15 (pill rule), §7.32 (no featured
  pill in the home row) and §14 item 16 (the owner feedback, dated 2026-11-23).
- [X] T022 [US3] E2E in `tests/e2e/storefront-layout.spec.ts` (`chromium-desktop`): no card in the
  home row track shows `card-pill-featured`; no card anywhere shows more than two pills; on
  `/he/shop` a piece in the home-row category and another category, not marked new, shows the
  featured pill above the category pill (set up and restore the data by SQL in `finally` if the
  seed has no such piece). The existing pill test keeps passing.
- [X] T023 Final checks: `pnpm verify` (with `.env.local` exported so `test:pg` runs); `pnpm build`;
  then `storefront-layout.spec.ts` and `home.spec.ts` (`chromium-desktop`). Replace the screenshots
  in `test-results/011-screenshots/` (same 12 names, `sample-soy-candle` marked new), and add
  `he-1280-product-thumb-focus.png` (a thumbnail with keyboard focus) and
  `he-1280-card-hover.png` (a card under the mouse pointer).

---

## Phase 5: Convergence

- [X] T024 Update the 011 row of `docs/design/storefront.md` §11 "Verification" for the pill rule: add `tests/unit/card-pills.test.ts` to its file list, and mention `featuredCategory`, the featured pill above the category pill, no featured pill in the home row, and never more than two pills, per FR-014 (partial)
- [X] T025 In `tests/integration/public-queries.test.ts` ("every card list fills the labels…", around line 396) also assert `featuredCategory` on every card list (the piece is in `[home, a]`, so `featuredCategory?.id` is the home-row id) per contracts/ui.md "Checks" and data-model.md `featuredCategory` (partial)

---

## Phase 6: Owner feedback, second round (2026-11-23): header logo in the exact centre

- [X] T026 Header (FR-018): in `src/components/shop/Header.tsx` make the bar a grid from 1024 px too:
  `nav:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] nav:gap-4` instead of `nav:flex nav:gap-4`
  (the phone grid `1fr minmax(0,auto) 1fr` stays). Column 1: the menu button below 1024 px, the
  `<nav>` from 1024 px (`min-w-0`). Column 2: the brand, without `nav:mx-auto`. Column 3: one
  wrapper (`flex items-center justify-end gap-4`, `min-w-0`) holding the search field (hidden below
  1024 px) and the cart, so DOM and reading order stay links, brand, search, cart. In
  `HeaderCategories.tsx` the fixed links ("All pieces", "About", "Shipping & Returns") stay
  `shrink-0`; the category `<li>` and its link may shrink (`min-w-0`, `shrink`), down to the
  44 px link target, the inner span keeping `max-w-[95px] truncate` so the name ends in "…" and the
  focus ring stays on the `<a>`. Update the header doc comments.
- [X] T027 Tests (FR-018) in `tests/e2e/storefront-layout.spec.ts` (`chromium-desktop`): replace the
  test "the brand is centred between the nav and the search form from 1024 px…" with one that
  checks the brand's centre equals the header's centre within 1 px at 375, 1024 and 1280 px, `he`
  and `en`, on `/` and `/shop`, both with the seed's header categories and with three header
  categories (`setHeaderCategories('sample-candles', 'sample-ceramics')`, restored in `finally`).
  The existing one-row order, no-overlap, no-sideways-scroll and 60-character-name tests keep
  passing (update only what asserts the old "centred in the free space" rule). Check whether
  `home.spec.ts` asserts the old rule (around its `header-brand` boxes) and update it if so.
- [X] T028 Docs: `docs/design/storefront.md` §7.18 (the "From 1024 px" brand sentence, "Nothing
  overlaps, by construction" and the width budget at 1024 px: the brand is no longer the item that
  absorbs a narrow width, the category names are), the 011 row of §11, and a §14 item for the owner
  decision (2026-11-23). Then final checks: `pnpm verify`, `pnpm build`, `storefront-layout.spec.ts`
  and `home.spec.ts` on `chromium-desktop`. Add `he-1024-header.png`, `en-1024-header.png` and
  `he-1280-header.png` (the top 120 px of `/he/shop` and `/en/shop`) to
  `test-results/011-screenshots/` without deleting the 14 there (copy them out of `test-results`
  before any Playwright run and back afterwards).

---

## Phase 7: Convergence

- [X] T029 In `tests/e2e/storefront-layout.spec.ts`, in the 12-character category names test, also assert the brand's centre equals the header's centre within 1 px in every layout, and, for ordinary names with three header categories at 1024 px, that the names really are cut (`span.fits` is `false`), per FR-018 and the 2026-11-24 owner answer (partial)
- [X] T030 In `docs/design/storefront.md`, fix §7.18: drop the stale "160 px brand cap" in "Nothing overlaps, by construction" and in the Brand paragraph (the brand is the fixed 109.5 / 123.5 px logo link in the middle column), drop "`shrink-0`" for the brand, and note the classic-scrollbar case (a 1024 px window leaves about 1007 px; English with three categories then sits at the 44 px link minimum, no overlap). Add 7.18 and 12.12 to the amended-sections list of §14 item 16, per FR-014 (partial)
- [X] T031 Re-wrap the 161-character doc comment line in `src/components/shop/HeaderCategories.tsx` (`HeaderNavLinks` comment) to the file's width, per Constitution code style (partial)
