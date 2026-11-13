# Data Model: English Version and Language Switch

**No schema change and no migration.** Everything 005 needs is already stored.

| What | Where | Used by 005 |
|---|---|---|
| Order language | `order.locale` (`locale` enum `he`/`en`), set at checkout | Customer email language and link locale (FR-014), tests only |
| Email language | `email_outbox.locale` | Tests read it to confirm English emails |
| Owner text in two languages | `product.name_he/_en`, `description_he/_en`, `prep_time_he/_en`; `category.name_*`; `option_group.name_*`; option values; `product_image.alt_*`; content pages; `shop_settings.*_he/_en` | Hebrew fallback (FR-016, existing `pick()`); admin marker (FR-017) |
| Product state | `product.state` (`draft`/`published`/`hidden`) | Sitemap lists `published` only (FR-019) |

## Derived values (not stored)

- **`missingEnglish`** (admin product list row): `true` when `product.name_en` is null or
  only whitespace, or when `product.description_he` is non-empty and `product.description_en` is
  null or only whitespace (no Hebrew description → no English one needed; owner decision
  2026-11-12). Computed by `listAdminProducts()`.
- **Sitemap entry**: `{ url, lastModified?, alternates.languages {he, en} }` for home, categories,
  published products (`lastModified` = `product.updated_at`), the six content pages and contact.

## Device storage

| Name | Kind | Category | Set when | Lifetime | Already declared |
|---|---|---|---|---|---|
| `NEXT_LOCALE` | cookie, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` on https | strictly necessary | only by `GET /api/locale` on a same-site click | 1 year | yes: `src/lib/consent/registry.ts`, cookie policy (003), spec 001 `contracts/device-storage.md` |

The cart (`localStorage` `ac_cart_v1`) is shared by both languages and is not touched by switching.
