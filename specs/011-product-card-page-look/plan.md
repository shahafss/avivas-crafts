# Implementation Plan: New look for the product cards and the product page

**Branch**: `011-product-card-page-look` | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-product-card-page-look/spec.md`

## Summary

A visual change with one small data addition:

1. **Product card** (US1, P1): `ProductCard` becomes a white bordered card with a soft shadow, an
   inset square photo with 8 px corners, a 600-weight name and a regular-weight `ink` price
   (research D4, D5). Hover and keyboard focus lift it and grow the shadow; nothing moves under
   reduced motion. Grid gaps follow the preview. The home row's track gets room so shadows, the
   lift and the focus ring are never clipped (D6).
2. **Product page card** (US2, P1): the gallery-and-details grid becomes one card (16 px corners,
   border, the same shadow). On phones the photo runs edge to edge across the top; from 900 px the
   card has 12 px padding and a 36 px gap. No `overflow: hidden`, so the sticky details keep
   working; the photo draws its own matching corners (D7). Thumbnails get 8 px corners and a
   2 px gap + 2 px `forest` ring (D8). Cart and checkout photos get 8 px / 6 px corners (D9).
3. **Labels** (US3, P2): a new `product.show_as_new` column (default `false`), set by a "Show as
   New" tick box in the piece editor that copies the "not available to order" switch (D1). Every
   card list returns `showAsNew` and the breadcrumb category (`pickMainCategory`, one rule shared
   with the product page) (D2). The card shows a sage "חדש" / "New" pill and a category pill on the
   photo's top start corner.
4. **Design guide and tests** (US4, P3): new tokens `--shadow-card`, `--shadow-card-hover`,
   `--radius-photo`, `--radius-sheet` (D3); `storefront.md` and the owner guide updated; tests that
   asserted the replaced rules updated and new checks added (D10).

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 24.

**Primary Dependencies**: Next.js 16 (App Router), next-intl, Tailwind CSS 4, Drizzle ORM +
drizzle-kit, Zod. No new dependency.

**Storage**: PostgreSQL: `product.show_as_new boolean NOT NULL DEFAULT false` (migration 0011,
generated). See [data-model.md](./data-model.md).

**Testing** (slimmed 2026-11-23, owner request; see tasks.md):
- Existing suites keep passing; tests that assert a replaced rule are updated
- Vitest unit: `design-tokens` (the four new tokens)
- Vitest integration: `catalog-products` (`setProductShowAsNew`), `public-queries` (card fields,
  `pickMainCategory`); the admin action guard test discovers the new action automatically
- Playwright E2E: `storefront-layout` (`chromium-desktop`; the pills' position) and
  `admin-products` (the tick box); `home` re-run after the row change
- Exact sizes and corners: owner check with screenshots at the Phase D gate
- `pnpm verify`; `pnpm build` before Playwright; one spec file at a time locally, the full run in CI

**Target Platform**: Render web service; evergreen browsers (iOS Safari 16+); mobile-first.

**Project Type**: web application (single Next.js project).

**Performance Goals**:
- One extra small query per card list (the categories of the listed pieces), plus the settings
  row where the caller does not already have the home-row category (D2). The product page's "You
  may also like" adds one or two category queries.
- No new photos, fonts or scripts; photo `sizes` unchanged (cards are only a few pixels narrower);
  no layout shift (photo boxes keep their square, `photo`-coloured space). §10 budgets hold.

**Constraints**:
- Strict CSP: no `style` attributes; CSS only in `globals.css` and classes.
- Logical properties only (`pnpm check:css`): logical corner utilities (`rounded-ss/se/es/ee`) for
  the phone gallery corners; `inset-inline-*` for the pills.
- RTL/LTR; WCAG 2.1 AA (pill text ≥ 4.5:1: `ink` on `sage` 13.9:1, `ink` on white ≥ 17:1; the
  current thumbnail's `forest` ring on `paper` 10.8:1).
- Motion 150–200 ms `ease-out` (photo zoom 400 ms), none under reduced motion (§3.5). Hover only on
  devices that can hover (Tailwind 4 default).

**Scale/Scope**: about 19 source files (`globals.css`, `ProductCard`, `ProductGrid`, `HomeRow`,
`Price`, `Gallery`, the product page, `CartLine`, `OrderSummary`, `PublishBar`, `ProductEditor`,
`actions.ts`, `products.ts`, `public-queries.ts`, `admin-queries.ts`, the schema, `he.json`,
`en.json`), 1 generated migration, about 6 test files, docs (`storefront.md` §1, §3.3, §3.5, §6,
§7.14, §7.15, §7.22, §7.23, §8.4, §11, §12.11, §13/§14; `docs/owner-guide-he.md`; roadmap row
already added).

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design: still passes.*

| Principle | How this plan meets it |
|---|---|
| I. Hebrew-first, bilingual | New text (`shop.card.new`, the tick box label and hint) has Hebrew and English entries. Category names use the existing Hebrew/English fields with the Hebrew fallback marked `lang="he"`. Pills sit on the reading-start corner in both directions; all layout uses logical properties. |
| II. Non-technical owner | One tick box, in the same place and saved with the same Save button as the "not available to order" box she already uses, with a plain hint. Nothing new is required to publish. The owner guide gets one sentence about it. |
| III. Guest shopping / mobile-first | Phone-first values throughout; no step added between a product and "order placed"; buy box content and order unchanged; touch targets unchanged; no hover-only information (the hover effect is decoration). |
| IV. Security by design | **A01 access control**: the new Server Action calls `requireAdmin()` first and is added to the admin action guard test. **A03 injection**: Drizzle queries only; the id is validated by the existing `idSchema` and the value by a `boolean` check. **A04/A09**: the change is logged in the activity log like other product edits. **A05**: CSP unchanged (no inline style, no new origin). No new secret, upload, cookie or third party. |
| V. Simplicity and low cost | One boolean column, one action copied from an existing one, one shared helper replacing inline code; CSS-only motion; no new dependency or service. |
| VI. Tested critical paths | Admin product editing (a critical path) gains integration and E2E coverage for the new box; the product page's add-to-cart, zoom and sticky behaviour keep their existing tests; checkout tests keep passing with the rounded summary photos. |
| VII. Privacy and legal | No personal data; the "New" label is the owner's own true statement about her piece, so it meets the honesty rule (`storefront.md` §1, PRODUCT.md principle 5). |
| Product constraints | Product images unchanged (same variants and `sizes`); WCAG AA contrast checked above; pages stay indexable (structured data unchanged; the breadcrumb rule only moves into a helper). |
| Development workflow | `storefront.md` updated in this branch (FR-014); the roadmap row exists; frozen `specs/001` and the 007 spec untouched (007 FR-017 is superseded in the guide); no git actions by tooling. |

No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/011-product-card-page-look/
├── spec.md
├── plan.md              # this file
├── research.md          # D1–D10
├── data-model.md        # product.show_as_new, card read model, pickMainCategory
├── quickstart.md
├── contracts/
│   ├── ui.md            # tokens, card, product page card, gallery, cart/checkout photos, checks
│   └── show-as-new.md   # editor tick box, server action, storefront effect, checks
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source code (repository root)

```text
src/
├── app/
│   ├── globals.css                                  # tokens (D3)
│   ├── [locale]/(shop)/product/[slug]/page.tsx      # product page card (D7)
│   └── admin/(protected)/products/[id]/
│       ├── actions.ts                               # setProductShowAsNew action (D1)
│       └── page.tsx                                 # passes the action to the editor
├── components/
│   ├── ui/Price.tsx                                 # size "card" (D5)
│   ├── shop/
│   │   ├── ProductCard.tsx                          # mounted card + pills (D4)
│   │   ├── ProductGrid.tsx                          # gaps
│   │   ├── HomeRow.tsx                              # track room (D6)
│   │   ├── RowArrows.tsx                            # scroll by content width (D6)
│   │   ├── Gallery.tsx                              # corners, thumbnails (D8)
│   │   ├── CartLine.tsx                             # 8 px photo corners (D9)
│   │   └── OrderSummary.tsx                         # 6 px photo corners (D9)
│   └── admin/
│       ├── PublishBar.tsx                           # "Show as New" box (D1)
│       └── ProductEditor.tsx                        # state + save call (D1)
├── i18n/messages/{he,en}.json                       # shop.card.new, admin.products.bar.showAsNew*
└── server/
    ├── db/schema/catalog.ts                         # show_as_new column
    └── catalog/
        ├── products.ts                              # setProductShowAsNew record function
        ├── admin-queries.ts                         # editor data returns showAsNew
        └── public-queries.ts                        # card fields, pickMainCategory (D2)
src/server/db/migrations/0011_product_show_as_new.sql   # generated (folder from drizzle.config.ts)
tests/
├── unit/design-tokens.test.ts
├── integration/{public-queries,catalog-products}.test.ts
└── e2e/{storefront-layout,admin-products}.spec.ts
docs/
├── design/storefront.md
└── owner-guide-he.md
```

**Structure Decision**: the existing single Next.js project; no new folders.

## Complexity Tracking

None.
