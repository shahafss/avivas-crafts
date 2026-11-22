# Contract: product addresses and routes (US1)

## Routes

| Request | Response |
|---|---|
| `GET /{locale}/product/{slug}`, a published product | 200, the product page (as `/p/` was before) |
| `GET /{locale}/category/{slug}`, a category with published products | 200, the category page (as `/c/` was before) |
| `GET /{locale}/p/{anything}`, `GET /{locale}/c/{anything}` | 404, the normal "page not found" (catch-all), no redirect |

Every link the shop builds uses the new forms:
- product cards, cart lines, category chips, header and menu categories
- product breadcrumbs (category link)
- `alternates` / canonical, Open Graph `url`, JSON-LD `url`
- the sitemap
- category `SortLinks`

No source file may contain a path template with `/p/` or `/c/` after this feature (checked by
`grep` in review).

## Admin: `createProduct` / `updateProduct` / `setProductState` — `src/server/catalog/products.ts`

| Call | Result |
|---|---|
| `createProduct({ nameHe, nameEn? })` | Inserts `slug: null`. No address is generated. |
| `updateProduct(id, { slug: 'baby-rattle' })` on a draft | Saved if valid and free. |
| `updateProduct(id, { slug: '' })` on a draft | `slug` set to `null`. |
| `updateProduct(id, { slug })` that fails the rule, has spaces, or looks like a random code `p-xxxxxxxx` | `fieldErrors: { slug: 'admin.products.errors.slug_invalid' }`; nothing saved. |
| `updateProduct(id, { slug })` used by another product | `fieldErrors: { slug: 'admin.products.errors.slug_taken' }`; nothing saved. |
| `updateProduct(id, { slug })` on a `published` or `hidden` product | `fieldErrors: { slug: 'admin.products.errors.slug_frozen' }`; nothing saved. |
| `updateProduct(id, { slug })` on a product moved back to `draft` | Saved if valid and free (the lock follows the state). |
| `updateProduct(id, {...})` on a published product with a random slug, no `slug` sent | Saved as today (no random-code check on saves). |
| `updateProduct(id, { nameEn })` on a draft with a random or empty slug | The slug is **not** changed (the automatic English-name address is removed). |
| `setProductState(id, publish)` (from draft) with `slug` null or a random code | `publishFailure` with `missingFields` containing `'slug'`; the state is unchanged. |
| `setProductState(id, unhide)` or `hide` with a random slug | Works as today (no random-code check). |
| `setProductState(id, publish)` with an owner-typed slug | Published as today; the slug is unchanged (no automatic rename). |

## Admin UI — `src/components/admin/ProductEditor.tsx`

- A field in Details after `nameEn`, full width:
  - test id `field-slug`, `data-field="slug"`
  - label `fields.slug`
  - hint `fields.slugHint` with `url = {origin}/he/product/{value}`
  - `dir="ltr"`, `maxLength=60`
- Draft: editable; the hint gives the rule, the full address, and says it is fixed while the
  product is in the shop. Published or hidden: `readOnly`, with `fields.slugLocked` ("move the
  product to draft to change it").
- The value is sent untrimmed (spaces → `slug_invalid`).
- The field follows `product.slug` after a refresh while not edited (`slugDirty`). `saveAll()`
  sends `slug` only when dirty and different.
- `slug` is in `FIELD` / `FIELD_OF`. A publish attempt without it marks and focuses the field.
- The `editor.address` line is removed.

## Tests

- **Integration** (`tests/integration/catalog-products.test.ts`):
  - a new product has `slug === null`
  - a draft accepts, changes and clears an address
  - an invalid format (`Blue Bunny`, ` baby`, `-a`, `a--b`, `p-abcdefgh`, 61 characters) →
    `slug_invalid`
  - another product's address → `slug_taken`
  - a published or hidden product → `slug_frozen`; after moving it to draft, the change is saved
  - a hidden product with a random slug can be unhidden; a published one can be saved
  - saving an English name doesn't change the slug
  - publishing with no slug, or a random one → `missingFields` includes `slug`
  - publishing with a typed slug works and keeps it
  
  The database refuses a non-draft product with a null slug (`tests/integration/schema.test.ts`,
  if it checks constraints).
- **Migration** (`tests/integration/migration-0010-product-addresses.test.ts`, base journal
  trimmed through 0009): renames the table's products that exist, leaves others untouched, is
  harmless on a second run, and with both `p-hic726te` and a different product at `kitten`, skips
  only that rename.
- **Sitemap** (`tests/integration/sitemap.test.ts`): paths are `/product/…` and `/category/…`.
- **Analytics** (`tests/unit/normalise-path.test.ts`, `tests/integration/analytics.test.ts`):
  `product` / `category` areas are counted, and `p` / `c` are not.
- **E2E**:
  - `tests/e2e/admin-products.spec.ts`: create a product (its own), try to publish without an
    address and see the field marked, type one, publish, and check the field is read-only and the
    product opens at `/he/product/{slug}`
  - `/he/p/{slug}` and `/he/c/{slug}` answer 404
  - every existing spec that visits `/p/` or `/c/` is updated to the new paths
