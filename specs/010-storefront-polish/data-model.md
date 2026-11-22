# Data model: Storefront polish (010)

Only the address item (US1) touches data. The Drizzle schema in `src/server/db/schema/` is the
source of truth; this file describes what 010 changes. See research D2–D4.

## `product.slug` (`src/server/db/schema/catalog.ts`)

| Before | After |
|---|---|
| `text NOT NULL UNIQUE` | `text UNIQUE`, nullable: `NULL` = "no address yet" (drafts only) |
| check `product_slug_format`: `slug ~ '^[a-z0-9-]{1,60}$'` | `slug IS NULL OR slug ~ '^[a-z0-9-]{1,60}$'` |
| — | new check `product_slug_when_public`: `state = 'draft' OR slug IS NOT NULL` |

Migration `0009_product_slug_nullable.sql` is generated with
`pnpm db:generate --name product_slug_nullable`.

## One-time address update (custom migration `0010_product_addresses.sql`)

Created with `pnpm db:generate --custom --name product_addresses`. It does two things:
1. One `UPDATE product SET slug = '<new>', updated_at = now() WHERE slug = '<old>' AND NOT EXISTS
   (SELECT 1 FROM product WHERE slug = '<new>')` per row (a clash skips only that rename):

| Old | New |
|---|---|
| `p-35xmobci` | `baby-rattle` |
| `p-7ow5r4uj` | `stylish-bunny` |
| `p-d6gehfh3` | `kofiko-monkey` |
| `p-dcqsjfs2` | `little-elephant` |
| `p-gif5m2wz` | `little-bunny` |
| `p-hic726te` | `kitten` |
| `p-ioidqaly` | `hug-bunny` |
| `p-k2xzyog3` | `teddy-bear` |
| `p-kqjqza24` | `boy-doll` |
| `p-kxltwwpj` | `giraffe` |
| `p-suzy3jpe` | `boy-doll-2` |
| `p-vjvwbxzx` | `sheep` |
| `p-wuxbxcnn` | `stylist-bunny` |
| `p-zykmhn5l` | `little-teddy` |
| `teddy-bear-in-a-dress` | `teddy-girl` |

2. A missing row changes nothing, and a second run changes nothing (the journal also prevents
   one; the test checks the SQL itself is harmless twice).

## Rules (enforced in `src/server/catalog/products.ts` and `src/lib/validation/product.ts`)

- New products start with `slug = NULL` (no English-name or random addresses; FR-006).
- While `state = 'draft'` (including a product moved back to draft), the owner may set, change or
  clear (empty → `NULL`) the slug. Owner input must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 1–60
  characters, and must not look like a random code `^p-[a-z2-7]{8}$` (`slug_invalid`; not
  trimmed). It must not be another product's slug (`slug_taken`).
- While `state` is `published` or `hidden`, any slug change is refused (`slug_frozen`; FR-007).
- Publishing **from draft** is refused with `missingFields` containing `slug` while the slug is
  `NULL` or a random code (FR-005). A `NULL` slug is always reported (the database refuses it for
  public states anyway). Saves, `hide` and `unhide` of a product already in the shop don't check
  for random codes.

**Personal data**: none.

## Category routes

`category.slug` is unchanged; only the page path (`/c/` → `/category/`) changes.

## Analytics

`analytics_daily_page.path` rows written before 010 keep `/p/…` and `/c/…`. New rows use
`/product/…` and `/category/…`. Old rows are not migrated (research D1).

## Error and message keys (`admin.products.*`, both languages)

| Key | Status |
|---|---|
| `fields.slug`, `fields.slugHint` (with `{url}`), `fields.slugLocked` | new |
| `errors.slug_invalid` | new |
| `missing.slug` | new: the publish checklist text |
| `required.slug` | new: the error under the field when publishing without it |
| `errors.slug_taken` | kept |
| `errors.slug_frozen` | reworded: "move the product to draft to change its address" |
| `editor.address` | removed |
