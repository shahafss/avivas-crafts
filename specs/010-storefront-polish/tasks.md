# Tasks: Storefront polish

**Input**: Design documents from `specs/010-storefront-polish/`

**Prerequisites**:
- plan.md
- spec.md
- research.md (D1–D9)
- data-model.md
- contracts/product-address.md, contracts/navigation-links.md, contracts/sitemap-and-credit.md
- quickstart.md

**Tests**: included. The constitution (VI) covers admin product edit and language switching, and
each contract lists its tests.

**Organization**: grouped by user story in priority order (US1 P1, US2 P2, US3 and US4 P3).

**Rules for every task** (constitution, project `CLAUDE.md`):
- No `style` attributes (CSP). Logical CSS only (`pnpm check:css`).
- Every visible string comes from both `src/i18n/messages/he.json` and `en.json`.
- Run commands with timeouts; no watch mode or dev servers that do not exit.
- E2E locally: one spec file and one project at a time; the full run is left to CI.
- No git commits.

**Tests first**: inside each batch, write the story's test tasks first (US1: T001–T003; US2: the
unit part of T015 and T020; US3: T022; US4: T025), check they fail for the right reason, then do
the code tasks. The IDs keep the files grouped; the order of work is tests first.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md

---

## Phase 1: Setup

None: no new dependency or configuration.

---

## Phase 2: Foundational

None: the four stories are independent of each other.

---

## Phase 3: User Story 1 — Clear product addresses chosen by the owner (P1) 🎯 MVP

**Goal**: product pages at `/product/`, category pages at `/category/`, old paths 404; the 15 live
products renamed to the owner's addresses; new products get an owner-typed address that is required
to publish and locked after (FR-001–FR-007; research D1–D5; contracts/product-address.md).

**Independent test**:
1. After `pnpm db:migrate` on a database with the old slugs, products open at
   `/he/product/{new}`, categories at `/he/category/{slug}`, and `/he/p/…` / `/he/c/…` answer 404.
2. In the admin, a new product cannot be published until an address is typed, and the address is
   read-only after publishing.

### Tests first

- [X] T001 [P] [US1] In `tests/integration/catalog-products.test.ts`, replace the case "keeps the
  slug editable while draft and frozen after the first publish" with the cases listed in
  contracts/product-address.md › Tests › Integration:
  - a new product's slug is `null`
  - a draft sets, changes and clears (`''` → `null`) its address
  - `Blue Bunny`, ` baby` (leading space), `-a`, `a--b`, `p-abcdefgh` and a 61-character value →
    `slug_invalid`
  - another product's address → `slug_taken`
  - a published product and a hidden product → `slug_frozen`
  - after `setProductState(..., 'draft')`, the same change is saved
  - an English-name save leaves the slug unchanged
  - publishing from draft with a null or random (`p-xxxxxxxx`) slug → `missingFields` includes
    `'slug'`
  - publishing with a typed slug works and keeps it
  - a hidden product with a random slug (set directly in the database) can be unhidden, and a
    published one with a random slug can be saved (no random-code check outside publish-from-draft)

  Update any other case in that file that relied on automatic English-name or random slugs.
  **Test helpers that publish products**: `seedCatalog` in `tests/helpers/checkout.ts` (lines
  ~138–164) and the publishing setup in `tests/integration/public-images.test.ts`,
  `public-queries.test.ts`, `settings.test.ts` and `sitemap.test.ts` must pass a `slug` (in their
  `updateProduct` call, unique per product) before `setProductState(..., 'publish')`, and must
  assert the publish result is `ok` (today it is ignored, so a failed publish would silently leave
  drafts and break the checkout, order and payment suites). In
  `tests/integration/schema.test.ts`, if it checks constraints, add: a `published` product with a
  null slug is refused.
- [X] T002 [P] [US1] Create `tests/integration/migration-0010-product-addresses.test.ts`, following
  `tests/integration/migration-0008-refresh-terms-privacy.test.ts`. It:
  1. seeds products with slugs `p-35xmobci`, `p-suzy3jpe`, `teddy-bear-in-a-dress` and one
     unrelated slug
  2. runs the migration SQL
  3. expects `baby-rattle`, `boy-doll-2`, `teddy-girl` and the unrelated slug unchanged
  4. checks a second run changes nothing and doesn't fail
  5. checks that, with both `p-hic726te` and a different product already at `kitten`, the SQL
     skips only that rename (both keep their slugs) and still renames the others

  The test's base journal is trimmed to the migrations through 0009 (not through 0007 as in the
  0008 test it copies).
- [X] T003 [P] [US1] Update `tests/unit/normalise-path.test.ts` and
  `tests/integration/analytics.test.ts` so `/he/product/x` counts as a product and `/he/category/x` as a category, while
  `/he/p/x` and `/he/c/x` are not counted. In `tests/integration/sitemap.test.ts`, expect
  `/product/…` and `/category/…` paths.

### Schema and migrations

- [X] T004 [US1] In `src/server/db/schema/catalog.ts`, make `product.slug` nullable (keep
  `.unique()`). Change the check `product_slug_format` to
  `${t.slug} IS NULL OR ${t.slug} ~ '^[a-z0-9-]{1,60}$'`, and add the check
  `product_slug_when_public`: `${t.state} = 'draft' OR ${t.slug} IS NOT NULL`. Then run
  `pnpm db:generate --name product_slug_nullable` (creates
  `src/server/db/migrations/0009_product_slug_nullable.sql`, its snapshot and the journal entry).
- [X] T005 [US1] Run `pnpm db:generate --custom --name product_addresses` and write
  `src/server/db/migrations/0010_product_addresses.sql` per data-model.md:
  - One `UPDATE product SET slug = '<new>', updated_at = now() WHERE slug = '<old>' AND NOT EXISTS
    (SELECT 1 FROM product WHERE slug = '<new>');` per row of the table (a clash skips only that
    rename; no exception), exactly:
     - `p-35xmobci`→`baby-rattle`, `p-7ow5r4uj`→`stylish-bunny`, `p-d6gehfh3`→`kofiko-monkey`
     - `p-dcqsjfs2`→`little-elephant`, `p-gif5m2wz`→`little-bunny`, `p-hic726te`→`kitten`
     - `p-ioidqaly`→`hug-bunny`, `p-k2xzyog3`→`teddy-bear`, `p-kqjqza24`→`boy-doll`
     - `p-kxltwwpj`→`giraffe`, `p-suzy3jpe`→`boy-doll-2`, `p-vjvwbxzx`→`sheep`
     - `p-wuxbxcnn`→`stylist-bunny`, `p-zykmhn5l`→`little-teddy`
     - `teddy-bear-in-a-dress`→`teddy-girl`

  Add a header comment citing spec decision 5. Apply with `pnpm db:migrate`; make T002 pass.

### Server rules

- [X] T006 [US1] Move the pure `slugify` and `isRandomSlug` from `src/server/catalog/slug.ts` to a
  new `src/lib/slug.ts` (no `server-only`), and re-export them from the server module. In
  `src/lib/validation/product.ts`:
  - `slugSchema` becomes `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 1–60 characters, not trimmed, and refuses
    values matching `^p-[a-z2-7]{8}$`; the update also accepts `''` (it means clear → `null`)
  - `PublishFacts` gains `slug: string | null` and `fromDraft: boolean`
  - `missingForPublish` adds `'slug'` when the slug is `null` (always), or when `fromDraft` is true
    and `isRandomSlug(slug, 'p')` (FR-005)
- [X] T007 [US1] In `src/server/catalog/products.ts`:
  - `createProduct` inserts `slug: null` (remove the `uniqueSlug(slugify(nameEn) ??
    randomSlug('p'))` call; FR-006).
  - In `updateProduct`:
    - a schema failure whose issue path starts with `slug` returns
      `fieldFailure('slug', 'admin.products.errors.slug_invalid')`
    - the lock follows the state: `current.state !== 'draft'` → `fieldFailure('slug',
      'admin.products.errors.slug_frozen')` (replacing the `publishedAt` check); keep `slug_taken`
    - `''` sets `null`
    - remove the automatic "English name replaces a random slug" branch
  - In `setProductState`, remove the automatic random→English rename at publish.
  - `publishFacts` passes `slug`, and `fromDraft: true` only from `setProductState` for the
    `publish` action (`false` for `unhide` and for every `updateProduct` call).
  - Remove imports that become unused (`randomSlug` may still be used by categories; leave
    `src/server/catalog/categories.ts` unchanged).

  Make T001 pass.
- [X] T008 [US1] Types for the nullable slug:
  - `src/server/catalog/admin-queries.ts`: both row types get `slug: string | null`. Add
    `publishedAt` and `state` (if missing) to `EditorProduct` and `getEditorData`.
  - `src/components/admin/ProductEditor.tsx` `EditorProductData`: the same fields.
  - `src/app/admin/(protected)/products/[id]/page.tsx`: pass `origin` (`getEnv().APP_ORIGIN`).
  - `src/server/catalog/public-queries.ts`: add `publicSlug(slug: string | null): string` (throws
    on `null`, which the `product_slug_when_public` check makes impossible for published rows).
    Use it so the public interfaces (around lines 45, 75, 96, 154) and the sitemap entries (around
    lines 422–430) keep `slug: string`.
  - `src/server/checkout/pricing.ts`: the line `slug` becomes `string | null` (cart lines can point
    to drafts; `price-cart.ts` already allows `null`). `pricing-data.ts` passes it through.
  - `tests/helpers/checkout.ts` `CheckoutFixture`: the slug type follows.

  Run `pnpm typecheck` until clean.

### Routes and links

- [X] T009 [US1] Move `src/app/[locale]/(shop)/p/[slug]/` to `src/app/[locale]/(shop)/product/[slug]/`
  and `src/app/[locale]/(shop)/c/[slug]/` to `src/app/[locale]/(shop)/category/[slug]/` (all files,
  including `not-found.tsx`; plain `mv`, no git). Update every path template to the new forms:
  - in the moved pages: `alternates(...)`, the Open Graph `url`, the JSON-LD `url`, the breadcrumb
    category `href`, `pageMetadata({ path })`, and the `SortLinks` `basePath`
  - `src/app/sitemap.ts`
  - `src/components/shop/ProductCard.tsx`, `CartLine.tsx` (2 places), `CategoryChips.tsx`,
    `HeaderCategories.tsx` (2 places)
  - the comment in `src/app/api/v/route.ts`

  Then `grep -rnE "/(p|c)/" src` must find no route templates.
- [X] T010 [US1] Analytics: in `src/lib/analytics/normalise-path.ts`, count `product` (kind
  `product`) and `category` (kind `category`) instead of `p` and `c`. In
  `src/server/analytics/stats.ts`, change `PRODUCT_PATH` to `/^\/(?:he|en)\/product\/(.+)$/` and
  the `like` pattern to `'/%/product/%'`. Make T003 pass.

### Admin field

- [X] T011 [US1] Messages in `src/i18n/messages/he.json` and `en.json` under `admin.products`:
  - `fields.slug`: "כתובת המוצר" / "Product address"
  - `fields.slugHint`: "רק אותיות באנגלית קטנות, מספרים ומקפים. הכתובת תהיה: {url}. כשהמוצר
    באתר אי אפשר לשנות אותה." / "Lowercase English letters, digits and dashes only. The address
    will be: {url}. It can't be changed while the product is in the shop."
  - `fields.slugLocked`: "כדי לשנות את הכתובת, צריך קודם להחזיר את המוצר לטיוטה." / "To change the
    address, move the product back to draft first."
  - `errors.slug_invalid`: "הכתובת יכולה להכיל רק אותיות באנגלית קטנות, מספרים ומקפים בודדים (עד
    60 תווים)." / "The address can only have lowercase English letters, digits and single dashes
    (up to 60 characters)."
  - `missing.slug`: "כתובת המוצר" / "Product address" (match the style of the other `missing.*`
    keys)
  - `required.slug`: "צריך להקליד כתובת למוצר." / "Type an address for the product."
    (`ProductEditor.showFailure` shows `required.${field}` under the field)
  - `errors.slug_frozen`, reworded: "כדי לשנות את הכתובת, צריך קודם להחזיר את המוצר לטיוטה." /
    "To change the address, move the product back to draft first."

  Keep `errors.slug_taken`. Remove `editor.address`.
- [X] T012 [US1] In `src/components/admin/ProductEditor.tsx` (research D5,
  contracts/product-address.md › Admin UI):
  - Remove the `editor.address` line.
  - Add the `FormField` after `nameEn`, full width (`sm:col-span-2`):
    - `label={t('fields.slug')}`, `dir="ltr"`, `maxLength={60}`, `autoComplete="off"`,
      `spellCheck={false}`
    - `data-testid="field-slug"`, `data-field="slug"`, `error={errors.slug}`
    - hint `t('fields.slugHint', { url: `${origin}/he/product/${value}` })` while draft
    - `readOnly` with hint `t('fields.slugLocked')` while `product.state` is `published` or
      `hidden` (`origin` and `state` come from T008)
  - State starts from `product.slug ?? ''`, with a `slugDirty` flag: reset the field to
    `product.slug ?? ''` whenever the prop changes and the field is not dirty; clear the flag after
    a successful save.
  - `saveAll()` sends `slug: value` (**untrimmed**; spaces get `slug_invalid`) only when dirty and
    different from `product.slug ?? ''`.
  - Add `slug` to `FIELD` / `FIELD_OF`, so a missing or refused address marks and focuses the field.
  - `src/components/admin/PublishBar.tsx` lists missing items: make sure `slug` shows with
    `missing.slug`.
- [X] T013 [US1] E2E:
  - In `tests/e2e/admin-products.spec.ts` (phone projects, as the spec already selects), add a
    test with **its own** product (the spec runs serially and later tests share one product; do
    not change that one):
    1. create a product and fill the required fields except the address
    2. try to publish: refused, `field-slug` is marked
    3. type an address, save, publish
    4. `field-slug` is read-only
    5. `/he/product/{slug}` opens the product
    6. `/he/p/{slug}` answers 404
    7. move it back to draft, change the address, publish again: `/he/product/{new}` opens it and
       `/he/product/{old}` answers 404
    8. typing `Blue Bunny` on a draft shows `slug_invalid`
  - Update the existing tests that relied on automatic slugs: wherever they publish, type an
    address first.
  - In every other spec under `tests/e2e/` and in `tests/fixtures/`, replace visits to `/p/` and
    `/c/` paths with `/product/` and `/category/` (about 20 files; `grep -rln "/p/\|/c/" tests`).
    Seeds or fixtures that create published products must give them a slug.

**Checkpoint**: US1 works on its own.

---

## Phase 4: User Story 2 — Menu links with a gentle underline (P2)

**Goal**: an underline that grows from the middle on hover and focus, in the header, phone menu
and footer. The header and phone menu mark the current page with `aria-current="page"`
(FR-010–FR-015; research D6, D7; contracts/navigation-links.md).

**Independent test**:
1. Hover the header and footer links.
2. Open About: "About" stays underlined and is the current page.
3. Home and product pages: no header link is underlined.
4. Phone menu on a category page: that category is marked.
5. Reduced motion: the underline appears without growing.

- [X] T014 [P] [US2] In `src/app/globals.css`, add `.nav-line` as in
  contracts/navigation-links.md:
  - `background-image: linear-gradient(currentColor, currentColor)`
  - `background-repeat: no-repeat`
  - `background-position: 50% 100%`
  - `background-size: 0% 1.5px`
  - `padding-block-end: 3px`
  - `transition: background-size 200ms ease-out`

  Add `background-size: 100% 1.5px` for `a:focus-visible > .nav-line`,
  `a[aria-current='page'] > .nav-line` and `button:focus-visible > .nav-line`, and, **inside
  `@media (hover: hover)` only**, for `a:hover > .nav-line` and `button:hover > .nav-line` (so a
  tap on a phone does not leave a footer link underlined on the next page, which would look like
  a current-page mark; FR-014). Add `@media (forced-colors: active) { a[aria-current='page'] >
  .nav-line { text-decoration: underline; } }` so the current page stays visible in high
  contrast mode. Add a comment citing storefront.md §3.5. Rely on the existing
  reduced-motion block for `transition: none`.
- [X] T015 [P] [US2] Create `src/lib/nav/current-path.ts` exporting
  `isCurrentPath(pathname: string, href: string): boolean`. It compares the paths after removing
  the query, the hash and a trailing slash (but not the root `/`). Create
  `tests/unit/current-path.test.ts` covering:
  - an exact match
  - a trailing slash
  - an `href` with a query
  - `/he/p/x` against `/he/shop` (false)
  - `/he` against `/he/shop` (false)
  - `/en/pages/about` against `/he/pages/about` (false)
  - `/he/category/featured` against itself (true)
- [X] T016 [US2] Create `src/components/shop/NavLink.tsx` (`'use client'`):
  - Props: `href`, `markCurrent?: boolean` (default `false`), `children`, and the remaining
    anchor props.
  - It renders `next/link` with `aria-current={markCurrent && isCurrentPath(usePathname(), href)
    ? 'page' : undefined}`.
  - It wraps `children` in `<span className="nav-line">` unless `bareChildren` is passed (for a
    child that carries `nav-line` itself).

  Keep it tiny: no other state.
- [X] T017 [US2] In `src/components/shop/HeaderCategories.tsx`:
  - In `HeaderNavLinks`, replace each `Link` with `NavLink markCurrent`. Remove `hover:underline
    hover:underline-offset-4` from `HEADER_LINK`.
  - For the category link, put `nav-line` on the existing truncating span (`block max-w-[95px]
    truncate`, which then becomes `nav-line block max-w-[95px] truncate`) and pass
    `bareChildren`.
  - In `MenuCategories`, use `NavLink markCurrent` for "All pieces" and every category, keeping
    `fallbackAttrs(name)` on the link.
- [X] T018 [US2] In `src/components/shop/Header.tsx`, use `NavLink markCurrent` for the phone menu
  links About, Shipping & returns and Contact.
- [X] T019 [P] [US2] In `src/components/shop/Footer.tsx`, wrap each Info and Legal link's label in
  `<span className="nav-line">` and remove `hover:underline hover:underline-offset-[3px]` from
  `LINK`. Keep plain `Link`: no current-page marking (FR-014). In
  `src/components/shop/CookieSettingsButton.tsx`, wrap the label in `nav-line` and remove
  `hover:underline`.
- [X] T020 [US2] In `tests/e2e/storefront-layout.spec.ts`, add tests per
  contracts/navigation-links.md › Tests:
  - On `/en/pages/about` at 1280 px (desktop project): exactly one link inside
    `[data-testid="site-header"]` has `aria-current="page"`, the About link (the phone menu
    lives outside the header, so do not count page-wide), and its `.nav-line` computed `background-size` is
    `100% 1.5px`.
  - `/en` and a product page: no header link has `aria-current`.
  - No footer link has `aria-current` on `/en/pages/about`.
  - Hovering a header link ends at `100% 1.5px` and returns to `0% 1.5px` after moving away (poll
    the computed style).
  - With `reducedMotion: 'reduce'`, the `.nav-line` computed `transition-duration` is `0s`.
  - On the phone project: open the menu on `/he/category/{a seeded category}` and check that category's
    link has `aria-current="page"`.
  - The existing header-width checks at 1024 px still pass.

**Checkpoint**: US2 works on its own.

---

## Phase 5: User Story 3 — A sitemap people can read (P3)

**Goal**: the sitemap no longer has language-alternate lines, so Chrome shows it as a tree. Page
heads keep hreflang (FR-016–FR-018; research D8).

**Independent test**: `/sitemap.xml` has no `xhtml:link` or `xmlns:xhtml`, and the same entries and
dates; a product page and a content page still carry hreflang `he` / `en` / `x-default`.

- [X] T021 [P] [US3] In `src/app/sitemap.ts`, remove the `alternates` property from each entry.
  Update the comment to say page heads carry the language pairs (010 research D8).
- [X] T022 [US3] In `tests/integration/sitemap.test.ts`:
  - Rename the case "lists each public page once per locale with both language alternates" and
    change its expectation to `entry.alternates` being `undefined`.
  - Keep the count, `url` and `lastModified` checks.
  - In `tests/e2e/language.spec.ts`, wherever it reads `/sitemap.xml` or page-head hreflang, check
    the XML contains no `xhtml:link`, and that `/en/pages/about` and a product page still have the
    three `link[rel=alternate][hreflang]` (add this if absent).

**Checkpoint**: US3 done.

---

## Phase 6: User Story 4 — Builder credit in the footer (P3)

**Goal**: "Designed & built by Shahaf Shmuel" / "נבנה ועוצב על ידי שחף שמואל" in the footer's
bottom row; the name links to shahafs.com in a new tab (FR-019–FR-021; research D9).

**Independent test**: the footer bottom row on `/he` and `/en` has the credit; the name opens
`https://shahafs.com` in a new tab; no sideways scroll at 320 px.

- [X] T023 [P] [US4] In `src/i18n/messages/en.json` and `he.json` under `common.footer`, add:
  - `credit`: en `"Designed & built by <name>Shahaf Shmuel</name>"`, he `"נבנה ועוצב על ידי
    <name>שחף שמואל</name>"`
  - `newTab`: en `" (opens in a new tab)"`, he `" (נפתח בלשונית חדשה)"`
- [X] T024 [US4] In `src/components/shop/Footer.tsx`, after the copyright `<p>` in the bottom row,
  add `<p className="text-sm text-ink-2" data-testid="footer-credit">` containing
  `t.rich('credit', { name: … })`. The `name` chunk renders
  `<a href="https://shahafs.com" target="_blank" rel="noopener" className="inline-flex min-h-6
  items-center underline underline-offset-[3px]">{chunks}<span className="sr-only">{t('newTab')}
  </span></a>`, with no `.nav-line` (research D9). The row uses `justify-between`, so wrap the
  copyright `<p>` and the credit `<p>` together in one `div` (`flex flex-wrap gap-x-4 gap-y-1`)
  so the credit sits next to the copyright line (owner decision 1) and the language switch stays
  at the other end. Check it at 320 px.
- [X] T025 [US4] In `tests/e2e/storefront-layout.spec.ts`, add a test on `/he` and `/en`:
  - the `footer-credit` text equals the message (without the sr-only part)
  - the link has `href="https://shahafs.com"`, `target="_blank"`, and a `rel` containing
    `noopener`
  - the accessible name includes the new-tab text
  - no horizontal overflow at 320 px

**Checkpoint**: all four stories done.

---

## Phase 7: Polish and cross-cutting

- [X] T026 [P] Update `docs/design/storefront.md`:
  - §3.5: the nav underline, 200 ms `ease-out` from the middle, instant under reduced motion
  - §7.18: header and menu links use `NavLink`; current page marked; `nav-line`
  - §7.20: footer lists animate without marking; the credit row
  - §8.2, §8.4, §8.12 and every other `/p/` or `/c/` mention: the new paths `/product/` and
    `/category/`; old paths show "page not found"
  - §11: verification rows for the new tests
  - §10: `NavLink` added to the list of client islands (and the §2 JS-budget row if it lists
    islands)
  - §12.11 (product editor): the required Address field (editable while draft, read-only after
    publishing), and `slug` added to its list of `data-field` controls (FR-022)

  Also set the 010 row in `docs/roadmap.md` to "Done (awaiting owner test)", and update any
  `/p/` or `/c/` path in `docs/owner-guide-he.md`, `docs/launch-checklist.md` and `PRODUCT.md`.
- [X] T027 [P] In `docs/owner-guide-he.md` §2 "פרסום", add a short plain-Hebrew note: every new product
  needs an address typed in the "כתובת המוצר" box (lowercase English letters, digits, dashes; for
  example `baby-rattle`); it can be changed while the product is a draft; publishing is refused
  without it; while the product is in the shop it is locked, and to change it she moves the product
  back to draft, changes it, and publishes again (the old link then stops working).
- [X] T028 Run `pnpm verify` (with `DATABASE_URL_TEST` set if available, for `test:pg`) and fix
  failures. Then run single E2E files, one project each:
  - `admin-products.spec.ts` (chromium-mobile)
  - one product-page spec and one category-page spec after the path change (for example
    `tests/e2e/product.spec.ts` / `category.spec.ts` or whichever exist; chromium-mobile)
  - `storefront-layout.spec.ts` (chromium-desktop)
  - `language.spec.ts` (chromium-desktop)
  - `bundle-size.spec.ts` (chromium-desktop): the `NavLink` island keeps every route within §10

  Leave the full E2E matrix to CI. Report anything not run.

---

## Dependencies and execution order

- **US1**: tests T001–T003 (parallel) → T004 → T005 → T006 → T007 → T008. T009 and T010 can
  follow in either order. Then T011 → T012 → T013.
- **US2**: T014 and T015 first (parallel) → T016 → T017, T018 → T019 (parallel with T017/T018,
  except that T019 and T024 share `Footer.tsx`, so do them in order) → T020.
- **US3**: T021 → T022.
- **US4**: T023 → T024 → T025. T024 touches `Footer.tsx` after T019.
- **Polish**: after all stories.

The stories don't depend on each other's code. `Footer.tsx` (T019, T024),
`storefront-layout.spec.ts` (T020, T025) and the message files (T011, T023) are shared, so batches
run one at a time.

## Suggested batches for the implementer (one at a time)

1. **Batch A, US1**: T001–T013 (the largest batch; it can be split into A1 = T001–T010 and
   A2 = T011–T013 if it runs long).
2. **Batch B, US2**: T014–T020.
3. **Batch C, US3 + US4 + polish**: T021–T028.

## Parallel examples

- In US1: T001, T002 and T003 (three test files); T009 (routes) beside T010 (analytics).
- In US2: T014 (`globals.css`) beside T015 (`current-path.ts`).

## Implementation strategy

MVP = US1 (the only data change, and it touches every product link). Then US2, then US3 and US4
together (both small). After each batch, a review; after all, converge.

---

## Phase 8: Convergence

- [X] T029 In `docs/design/storefront.md` §12.11, add `slug` to the list of `data-field` controls (after `nameHe`, matching the editor's order) and to the `admin.products.required.*` key list, and reword the "Product address" paragraph's last sentence to point at its real place in that list per FR-022 (partial)
- [X] T030 In `docs/design/storefront.md` §7.18, note that the header and phone menu now also use the `NavLink` client island (010), keeping the heading anchor `#718-shopheader-server-shell--two-islands` working (add a sentence in the section rather than renaming the heading, or rename it and update every link to it) per FR-022 (partial)
- [X] T031 In `tests/e2e/storefront-layout.spec.ts`, in the test for the Hebrew header category with a cut-off label, also assert that the label span's `scrollWidth` is greater than its `clientWidth`, so the test proves the label is actually cut off per FR-015 (partial)

---

## Phase 9: Owner fix (Phase D feedback, 2026-11-22)

- [X] T032 Fix the old failing E2E test `tests/e2e/home.spec.ts` "logo backing: none in forced colours" (it has failed in CI on `main` since 009): in forced-colours mode Chromium reports the brand link's background as `rgba(255, 255, 255, 0)`, which is just as transparent as the expected `rgba(0, 0, 0, 0)`. Make `expectNoBox` check that the background's alpha is 0 (any colour), instead of comparing the exact string. Leave the other `TRANSPARENT` checks and the site code unchanged.

---

## Phase 10: Owner change (Phase D feedback, 2026-11-22): no underline in the footer

The owner revised decision 2: the animated underline is for the header and phone menu only. Footer
links get no underline at all (spec FR-010, FR-014 and US2 scenario 6, revised;
contracts/navigation-links.md).

- [X] T033 [US2] Remove every underline from the footer links per FR-014 (revised):
  - In `src/components/shop/Footer.tsx`, the Info and Legal links lose their `.nav-line` span and
    get no `hover:underline` (keep everything else: tap size, focus ring, layout). The credit link
    keeps its plain underline (FR-020, research D9), and the email/phone links inside text keep
    theirs.
  - In `src/components/shop/CookieSettingsButton.tsx`, remove the `.nav-line` span (no underline
    on hover or focus).
  - In `src/app/globals.css`, drop the `button:hover > .nav-line` and `button:focus-visible >
    .nav-line` selectors (no button uses `.nav-line` any more; check with grep first).
  - Tests in `tests/e2e/storefront-layout.spec.ts`: replace any footer hover/tap `.nav-line`
    checks (including the phone `nav-menu:` tap test from Batch C) with checks that footer links
    and the Cookie settings button contain no `.nav-line` and that their computed
    `text-decoration-line` is `none` on hover and on keyboard focus; keep the check that no footer
    link has `aria-current`.
  - `docs/design/storefront.md` §3.5, §7.20 (and §11 rows): footer links have no underline; the
    animated underline is for the header and phone menu only.

## Phase 11: Owner change (Phase D feedback, 2026-11-22): credit under the copyright line

- [X] T034 [US4] In `src/components/shop/Footer.tsx`, stack the credit `<p>` directly under the
  copyright `<p>` instead of beside it (owner decision 1, revised): the wrapping group becomes a
  vertical stack (e.g. `flex flex-col gap-y-1`) aligned to the start, the language switch stays at
  the other end of the bottom row, and nothing scrolls sideways at 320 px. In
  `tests/e2e/storefront-layout.spec.ts`, extend the credit test on `/he` and `/en` at 1280 px and
  320 px: the credit's top is below the copyright's bottom, and both start at the same inline
  edge. Update `docs/design/storefront.md` §7.20 (the credit row) to match.
