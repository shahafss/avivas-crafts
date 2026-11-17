# Contract: categories per piece, the home row and the "All pieces" page (US1, US5, FR-031–FR-038)

Owner answers 2026-11-16 (spec decision 12): the home row shows one category ("Featured"); a
piece can be in several categories. Decisions behind it:
[research D17–D19](../research.md#d17-several-categories-per-piece-and-the-home-row-category-owner-answers-fr-031fr-032-fr-034fr-037).

## Data

- New join table `product_category` replaces `product.category_id` (one row per piece and
  category). Details and the release step: [data-model.md §5](../data-model.md#5-several-categories-per-piece-and-the-home-row-category).
- `shop_settings.home_category_id`: the category the home row shows; `null` = no row.
- Release step (in the migration): category "מומלצות" / "Featured" (`featured`) created or reused,
  last in order; every existing piece added to it, keeping its current category; chosen for the
  home row.

## Admin

### Piece edit screen

- The single "קטגוריה" dropdown becomes a fieldset "קטגוריות" of checkboxes (existing `Checkbox`
  component), `data-testid="field-categories"` on the fieldset, each checkbox found by its label
  (the category's Hebrew name), one per category in the shop's order, with the hint "אפשר לסמן יותר מאחת. היצירות
  שב'מומלצות' מוצגות בדף הבית." where "מומלצות" is the current home-row category's name (omitted
  when none is chosen). Saved as `categoryIds: string[]` (0–50 unique ids). An unknown id gives the
  field error `admin.products.errors.category_not_found` (existing key).
- Publishing still needs at least one category: the existing "missing category" message, now
  attached to the fieldset (`missingForPublish` checks `categoryIds.length === 0`).
- Saving replaces the piece's category set in the same transaction as the rest of the save; the
  existing `product.updated` activity row covers it.

### Products list `/admin/products`

- The category filter shows pieces that have the chosen category among theirs.
- Where a row shows the category, it shows all its names, comma-separated, in category order.

### Categories screen `/admin/categories`

- Unchanged screens and texts. The piece count counts pieces linked to the category; deleting a
  category that has pieces stays blocked with today's message.

### Settings screen

- A "דף הבית" section with one select, "השורה בדף הבית מציגה את הקטגוריה:", options "ללא (השורה
  לא תוצג)" plus every category. Saved by `updateSettings` (`homeCategoryId`, an existing
  category's id or `null`; unknown → `admin.settings.errors.home_category_not_found`).

## Queries

- `listPublishedProducts({ categoryId, limit })`: `categoryId` now matches through
  `product_category` (an `EXISTS`), so a piece appears once; `limit` is new.
- `getHomeRow(locale)`: reads `home_category_id`; when set, `{ name, slug, cards }` with up to 12
  published pieces of that category, newest first; `null` when unset or empty.
- `listCategoriesWithProducts()`, the sitemap's category list and the admin piece counts go
  through `product_category`.
- Product page: `getPublishedProduct` returns `categories` (in category order) and `mainCategory`
  per FR-037 (first non-home category, else the home category, else `null`), used by the
  breadcrumb and structured data.
- `listAlsoLike(productId, categoryIds, limit = 4)`: first pieces sharing any of `categoryIds`
  (the piece's categories without the home-row category), newest first; then the newest of the
  rest; never the piece itself, never twice.

## Home row (public)

`<section data-testid="home-row" aria-labelledby="home-row-title">`, inside the 1240 px container,
padding 48/64 px (72/88 px from 900 px), placed right after the hero:

```text
[h2 category name]                             [view all →]   [‹] [›]  (arrows from 900 px)
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──      ← one row, scrolls sideways, snaps to cards
│ card │ │ card │ │ card │ │ card │ │ peek
└──────┘ └──────┘ └──────┘ └──────┘ └──
```

- Heading: h2, `id="home-row-title"`, the category name (`lang="he"` when it falls back on `/en`).
- "View all" link: `shop.home.row.viewAll` ("לכל היצירות" / "View all") with the directional
  `arrow` icon, to `/{locale}/shop`, `data-testid="home-row-view-all"`, at least 44 px tall.
- Track: `<ul data-testid="home-row-track" aria-label={category name}>` of `ProductCard`s (the
  same card as the grid, square photos, all `lazy`). CSS only: `display: grid; grid-auto-flow:
  column; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain;
  scrollbar-width: none`; each item `scroll-snap-align: start`. Card width: `calc((100% − 1 gap) /
  2.15)` below 900 px (2 cards and a peek of the third), `calc((100% − 3 gaps) / 4)` from 900 px.
  Gap 12 px (16 px from 900 px). The track's writing direction follows the page, so in Hebrew the
  first card is at the right and the row scrolls toward the left.
- No sideways scroll of the page: the track is the only element that scrolls.
- Arrows: a small client component `RowArrows` (`src/components/shop/RowArrows.tsx`), two
  `<button type="button">`s with `aria-controls` = the track id and accessible names
  `shop.home.row.previous` / `shop.home.row.next` ("הקודמות" / "הבאות", "Previous" / "Next").
  Shown from 900 px; hidden when the track does not overflow; each disabled at its end. A press
  scrolls by the track's visible width toward the reading end (next) or start (previous), using
  `scrollBy` with `behavior: 'smooth'`, or `'auto'` when `prefers-reduced-motion: reduce` matches
  (FR-036). RTL: "next" moves toward negative `scrollLeft`. The icons are the directional
  `chevron` (flips in RTL). Updates its disabled state on the track's `scroll` event
  (passive listener) and on resize. No autoplay, no timers.
- Keyboard: Tab moves through the card links; the browser scrolls the focused card into view
  (snap keeps it whole). The arrow buttons are in the tab order after the "view all" link.
- Without JavaScript: the row still swipes and scrolls; the arrows are not rendered until hydration
  (they render `null` on the server and until the first measurement).
- Omitted entirely when `getHomeRow` returns `null`.

## "All pieces" page `/{locale}/shop` (FR-033)

- Route `src/app/[locale]/(shop)/shop/page.tsx`: the current home page's catalog content moves
  here: h1 `shop.allPieces.title` ("כל היצירות" / "All pieces"), the intro line
  (`shop.catalog.intro`), `CategoryChips currentSlug={null}`, `SortLinks basePath="/{locale}/shop"`,
  `ProductGrid` (first 4 eager), the existing empty state.
- Metadata: title `shop.allPieces.title` with the shop name (as category pages), canonical and
  language versions via `alternates('/shop', locale)`. Added to `src/app/sitemap.ts`.
- `CategoryChips`: the "All" chip now points to `/{locale}/shop` (on category and search pages
  too).
- Header: the desktop links and the phone menu list start with "כל היצירות" / "All pieces"
  (`common.nav.allPieces`) linking to `/{locale}/shop`. `HEADER_CATEGORY_LIMIT` drops from 5 to 4,
  so the desktop header still shows at most five links; the menu button shows from 900 px when
  there are more than 4 categories.
- The language switch keeps `/shop` and the `sort` value (existing behaviour for any path).
- "Continue shopping" (FR-038, amended 2026-11-17 by FR-046): in the cart drawer "המשך בקניות"
  (`cart-keep-shopping`) closes the drawer, and the empty cart's action button (`CartDrawerBody.tsx`)
  links to `/{locale}/shop`; the shop links in `ReturnView.tsx` and the order status page's "back to the shop" link
  (`order/[token]/page.tsx`) point to `/{locale}/shop`; so do the `common.allPieces`
  buttons on the not-found pages and the category empty state's action.
