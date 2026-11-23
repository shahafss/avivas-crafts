# Data model: New look for the product cards and the product page

The source of truth for the whole model is the Drizzle schema in `src/server/db/schema/`. This file
covers only what this feature adds or changes.

## `product` (table, `src/server/db/schema/catalog.ts`)

| Column | Type | Rule |
|---|---|---|
| `show_as_new` (new; Drizzle `showAsNew`) | `boolean NOT NULL DEFAULT false` | The owner's "Show as New" tick box (spec FR-012). `false` for every existing row after the migration. Changed only through `setProductShowAsNew` (admin only). Allowed in every product state; only published pieces are ever shown. |

- Migration `0011_product_show_as_new` (generated with `pnpm db:generate`): one
  `ALTER TABLE "product" ADD COLUMN "show_as_new" boolean DEFAULT false NOT NULL;`. No data change,
  no index (the column is only read together with the rest of a card row).
- Activity log: each change writes `product.updated` with `{ "field": "showAsNew", "to": <boolean> }`
  (same shape as the `orderable` switch).

## Read models (`src/server/catalog/public-queries.ts`)

### `PublicProductCard` (changed)

| Field | Type | Meaning |
|---|---|---|
| `showAsNew` (new) | `boolean` | The piece's `show_as_new`; the card shows the "חדש" / "New" pill when `true`. |
| `mainCategory` (new) | `PublicCategory \| null` | The piece's breadcrumb category, chosen by `pickMainCategory` (same as the product page). The "other category" pill candidate when it is not the home-row category. |
| `featuredCategory` (new, owner feedback 2026-11-23) | `PublicCategory \| null` | The home-row category when the piece is in it, else `null`. The "featured" pill candidate. |

All other fields are unchanged. Every list that returns cards (`listPublishedProducts`,
`listNewestProducts`, `listAlsoLike`, `listAlsoLikeFor`, `getHomeRow`) fills the new fields through
`toCards`.

### `pickMainCategory(categories, homeCategoryId)` (new, exported)

- Input: the piece's categories in the shop's category order (`category.sort_order` ascending), and
  the home-row category id from settings (or `null`).
- Output: the first category whose id is not `homeCategoryId`; else the home-row category if the
  piece is in it; else `null` (007 FR-037).
- Used by `getPublishedProductBySlug` (breadcrumb and structured data) and by `toCards` (card
  pill), so the two always agree.

### `cardPills(card, { inHomeRow })` (new, owner feedback 2026-11-23; `src/lib/card-pills.ts`)

- Pure function, no I/O. Input: `showAsNew`, `mainCategory`, `featuredCategory`, and whether the
  card is in the home page's row.
- Candidates in priority order: `new` (when `showAsNew`); `category` = `mainCategory` when it is
  not null and its id differs from `featuredCategory?.id`; `featured` = `featuredCategory` when not
  null and not `inHomeRow`.
- Output: the first two candidates, returned in display order `new`, `featured`, `category`
  (spec FR-013 "pill rule"). Each item carries its kind and, for the two category kinds, the
  `PublicCategory`.

### `PublicProduct` (unchanged)

`mainCategory` is now computed by `pickMainCategory`; the value is the same as before.

## Admin read model

`getEditorData` (`src/server/catalog/admin-queries.ts`, its `EditorProduct` shape next to
`orderable`) returns `showAsNew`, so the editor shows the saved state of the tick box.
