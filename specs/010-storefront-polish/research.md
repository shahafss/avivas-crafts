# Research: Storefront polish (010)

D1–D5 were rewritten on 2026-11-22 for the revised address item (spec decision 5): no forwarding,
no history, new routes, a one-time update, and owner-typed addresses.

Decisions taken while planning. Each names what was chosen, why, and what was rejected.

## D1 — Route rename `/p/` → `/product/`, `/c/` → `/category/`

**Decision**: move the folders `src/app/[locale]/(shop)/p/[slug]` → `product/[slug]` and
`c/[slug]` → `category/[slug]` (`git mv` is the owner's; the implementer moves the files with the
shell, keeping content). Update every link builder found by `grep`:
- `sitemap.ts`
- `ProductCard.tsx`, `CartLine.tsx` (2), `CategoryChips.tsx`, `HeaderCategories.tsx` (2)
- the product page itself: alternates, Open Graph `url`, JSON-LD `url`, breadcrumb category link
- the category page: `pageMetadata` path, `SortLinks` base path

Analytics:
- `src/lib/analytics/normalise-path.ts` counts `product` / `category` areas instead of `p` / `c`.
- `src/server/analytics/stats.ts` matches `/(he|en)/product/…` (its `PRODUCT_PATH` regex and its
  `like` pattern).
- Past page-view rows keep their old `/p/` paths and no longer map to products. That is accepted:
  the old slugs don't exist any more, and the launch is early.

Old addresses fall through to `src/app/[locale]/[...rest]/page.tsx` and get the normal 404 (owner
decision 5: no forwarding). No proxy or `next.config` change.

**Why**: the folder name is the route in the App Router; nothing else defines these paths.

**Rejected**: rewrites keeping the folder names, which would be confusing for no gain; a blanket
redirect of `/p/*`, which the owner declined (decision 5, option A).

## D2 — The one-time address update

**Decision**: a custom SQL migration (`pnpm db:generate --custom --name product_addresses`), placed
after the schema migration of D3. It runs one `UPDATE product SET slug = … , updated_at = now()
WHERE slug = '<old>'` per row of the owner's table (spec decision 5). Rows that don't exist change
nothing, so dev, test and fresh databases are unaffected (FR-002). Each update also requires `AND NOT EXISTS (SELECT 1 FROM product WHERE
slug = '<new>')`, so a rename whose new address is already used by a different product is skipped
(the deploy goes on; the owner fixes it through the draft route). A second run is therefore a no-op.
All updates run in the migration's transaction.

It is tested like `0008` (`tests/integration/migration-0008-refresh-terms-privacy.test.ts`): a new
`tests/integration/migration-0010-product-addresses.test.ts` seeds products with three of the old
slugs plus one unrelated product, runs the migration SQL, and checks the three are renamed, the
other is untouched, and a re-run is harmless, and that a clash (both `p-hic726te` and another product at `kitten`) skips
only that rename. The test's base journal is trimmed to the migrations through 0009.

**Why**: migrations run automatically on deploy (Render), so the update reaches production with the
code that uses the new routes, with no manual step. Matching by the current slug needs no product
ids, which differ per database.

**Rejected**: a manual script run on Render (an extra step the owner could forget); matching by
Hebrew name (the two "בובת ילד" share a name).

## D3 — "No address yet" for new products

**Decision**: `product.slug` becomes nullable (migration 0009, generated):
- The check `product_slug_format` becomes `slug IS NULL OR slug ~ '^[a-z0-9-]{1,60}$'`.
- A new check `product_slug_when_public`: `state = 'draft' OR slug IS NOT NULL`.
- The unique constraint stays (Postgres allows many nulls).

Behaviour:
- `createProduct` stops calling `uniqueSlug(slugify(nameEn) ?? randomSlug('p'))` and inserts
  `slug: null` (FR-006).
- In `updateProduct` and `setProductState`, the automatic "English name replaces a random slug"
  code is removed.
- `PublishFacts` gains `slug` and `fromDraft` (true only in `setProductState` for the `publish`
  action). `missingForPublish` (`src/lib/validation/product.ts`) adds `'slug'` when the slug is
  `null` (always), or when `fromDraft` is true and `isRandomSlug(slug, 'p')` (FR-005). Saves of a
  published product, `unhide` and `hide` don't apply the random-code check, so no product already
  in the shop is ever stuck.
- `isRandomSlug` moves to `src/lib/slug.ts`, so the shared validation code can use it.
  `src/server/catalog/slug.ts` re-exports it.
- Every place that types `slug` as `string` gets `string | null` where it can hold a draft:
  `admin-queries.ts`, the editor props, the admin products list (which shows "—" for no address).
  Public queries keep `string` for published products, through one small helper in
  `public-queries.ts`, `publicSlug(slug: string | null): string`. It throws on `null`, which the
  `product_slug_when_public` check makes impossible for published rows. It is used in the
  interfaces at lines ~45, 75, 96 and 154 and in the sitemap entries. In checkout, `pricing.ts`'s
  line `slug` becomes `string | null` (cart lines can point to drafts; `price-cart.ts` already
  allows `null`), and `pricing-data.ts` passes it through.

**Why**: an honest "no address yet" is simpler than a placeholder code that must be hidden
everywhere, and the database itself guarantees no public product lacks an address.

**Rejected**: keeping a random placeholder for new products. It breaks FR-006 and keeps the
random-code logic alive.

## D4 — Address rule and locking

**Decision**:
- `slugSchema` (`src/lib/validation/product.ts`) becomes `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 1–60
  characters (FR-004). In `updateProduct`, a schema failure whose issue path starts with `slug`
  returns `fieldFailure('slug', 'admin.products.errors.slug_invalid')`; other failures keep
  `zodFailure(..., 'admin.products.errors.invalid')`.
- The lock is keyed on the state (owner answer 2026-11-22): `current.state !== 'draft'` →
  `fieldFailure('slug', 'admin.products.errors.slug_frozen')` (FR-007). A product moved back to
  draft can change its address again. `slug_frozen` is reworded to "Move the product to draft to
  change its address."
- An address that looks like a random code (`^p-[a-z2-7]{8}$`) is refused on save with
  `slug_invalid`, so a typed address can never count as "missing".
- `slugTaken` → `slug_taken` as today.
- Sending an empty string clears a draft's address back to `null`. The value is not trimmed:
  spaces get `slug_invalid` (spec edge case: nothing is rewritten silently).

The database checks stay looser (`^[a-z0-9-]{1,60}$`), because every existing slug fits the new
rule and the stricter rule is about owner input.

## D5 — Admin field

**Decision**: a "Product address" field in the editor's Details section
(`src/components/admin/ProductEditor.tsx`), full width, after the English name. It replaces the
read-only "Product address: …" line under the title.
- Draft: an editable input, `dir="ltr"`, `maxLength=60`, `autoComplete="off"`,
  `spellCheck=false`, `data-testid="field-slug"`, `data-field="slug"`. Its hint gives the rule and
  previews `{origin}/he/product/{value}`.
- Published or hidden: the same box shown read-only (`readOnly`, with the value) and a short note:
  move the product to draft to change it.
- The state starts from `product.slug ?? ''` and resets whenever `product.slug` changes (after
  `router.refresh()`) while the owner has not edited it (a `slugDirty` flag). `saveAll()` sends
  `slug` (untrimmed) only when it is dirty and differs from the stored value. This way a stale field can never
  send an old value back.
- `slug` is added to the editor's `FIELD` / `FIELD_OF` maps, so a missing or refused address focuses
  the field, through the existing `missingFields` / `fieldErrors` path (FR-005).
- The publish checklist (`PublishBar`, which lists missing items) gains `admin.products.missing.slug`,
  and the field error under the box uses `admin.products.required.slug`
  (`ProductEditor.showFailure` reads `required.${field}`).

No suggestion button (the owner types the address; spec assumption).

**Why**: it saves with the existing Save button and publish flow, so the owner learns nothing new
(constitution II). The read-only display still shows the address after publishing.

## D6 — How the underline grows from the middle

**Decision**: the underline is a background, not a text decoration. The link text sits in an inner
`<span class="nav-line">` that has `background-image: linear-gradient(currentColor, currentColor)`,
`background-repeat: no-repeat`, `background-position: 50% 100%` and `background-size: 0% 1.5px`.
- On link `:focus-visible`, when `aria-current="page"`, and on `:hover` only inside
  `@media (hover: hover)` (a tap on a phone must not leave a sticky underline that looks like a
  current-page mark), the size becomes `100% 1.5px`. In forced-colours mode the current page falls
  back to `text-decoration: underline`.
- `transition: background-size 200ms ease-out`, inside §3.5's 150–200 ms range (SC-005).
- `padding-block-end: 3px`, so the line sits about where today's underline offset puts it.
- The rule goes in `globals.css`. The existing reduced-motion rule (`transition: none !important`
  on everything) makes it appear instantly with no extra code (FR-011).

**Why**:
- A centred background grows from the middle the same way in RTL and LTR (FR-015).
- It stays inside a truncated category span, because it paints inside the box, so it is not cut
  by `overflow: hidden`.
- It changes no box size, so nothing moves (SC-005).
- It follows `currentColor`, so it works on the see-through header over the photo and on the white
  bar.
- It needs no inline style (strict CSP), and the focus ring is untouched.

**Rejected**:
- A `::after` with `transform: scaleX()`: it is clipped by the truncated span's
  `overflow: hidden`.
- `text-decoration` with `text-underline-offset`: it can't animate its length.

## D7 — Marking the current page

**Decision**: a small client island, `src/components/shop/NavLink.tsx` (`'use client'`). It wraps
`next/link`, reads `usePathname()`, and sets `aria-current="page"` when the pathname, with any
trailing slash removed, equals the link's `href` path. The header row (`HeaderNavLinks`) and the
phone menu (`MenuCategories` and the About / Shipping & returns / Contact list in `Header.tsx`)
use it with `markCurrent`. The footer uses plain `Link` with no `.nav-line` and no hover underline
(FR-014, revised at the Phase D gate), so it never shows an underline or marks the current page.

The match is exact on the path, so:
- `/shop?sort=…&page=…` still marks "All pieces" (the query is not part of the pathname).
- Product pages (`/product/…`), the home page (`/{locale}`), search, checkout and order pages match no
  link (FR-013, SC-004).
- A category that is not among the header categories marks nothing in the header, but is marked
  in the phone menu, which lists every category (spec edge case).

**Why**: the header is rendered in the `[locale]` layout, which Next does not render again on
client-side navigation. A server-computed "current" state would go stale after the first click;
`usePathname()` updates on every navigation. The island is a few hundred bytes, well within §10's
budget.

**Rejected**: a `x-pathname` header set in `proxy.ts` and read in the layout. It goes stale on
client navigation and would force the layout to render dynamically.

## D8 — Sitemap

**Decision**: `src/app/sitemap.ts` stops emitting `alternates.languages`. Everything else stays:
one entry per page per language, and `lastModified` for products.

Verified on production 2026-11-22: every page's `<head>` already carries `canonical` plus
`alternate` `hreflang` `he` / `en` / `x-default` (`src/server/seo.ts` › `alternates()`). That is
Google's documented page-level method. Without the `xhtml` namespace, Chrome's XML viewer shows
the file as a tree again.

**Rejected**: an XSLT display style (the owner's first choice). Chrome removed XSLT, including the
`<?xml-stylesheet?>` processing instruction, from Stable in version 155 (November 17, 2026), so it
would not show in Chrome. The owner chose this option instead (spec decision 4, revised).

## D9 — Footer credit

**Decision**: a new message `common.footer.credit` with a rich `<name>` tag:
- English: `"Designed & built by <name>Shahaf Shmuel</name>"`
- Hebrew: `"נבנה ועוצב על ידי <name>שחף שמואל</name>"`

It is rendered with `t.rich` in the footer's bottom row as its own `<p>` directly under the copyright line (stacked, revised at the Phase D gate),
in the same 14 px `ink-2` style, so the existing `flex-wrap` handles 320 px (FR-021).

The name is an `<a href="https://shahafs.com" target="_blank" rel="noopener">`. It has a visible
underline (offset 3 px), because a link inside a sentence must not rely on colour alone (WCAG
1.4.1). It contains `<span class="sr-only">` with `common.footer.newTab`. It is at least 24 px tall
(WCAG 2.5.8; the shop's 44 px rule applies to controls and nav rows, not links inside a sentence).
It keeps that plain underline (no `.nav-line` animation), like the footer's email and phone
links: links inside text stay underlined at all times, while the animation is for nav rows.

`rel="noopener"` without `noreferrer`, so the builder's site can see visits came from the shop.
The credit is fixed text in the translation files, not a shop setting: the owner has no reason to
edit it.
