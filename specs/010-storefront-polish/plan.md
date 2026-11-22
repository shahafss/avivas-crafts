# Implementation Plan: Storefront polish

**Branch**: `010-storefront-polish` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-storefront-polish/spec.md`

## Summary

Four small changes:

1. **Product addresses** (US1, P1, revised):
   - Routes move: `/p/` → `/product/`, `/c/` → `/category/` (folder moves and every link builder;
     old paths answer 404, no forwarding; D1).
   - A custom migration renames the 15 live products to the owner's addresses (D2).
   - `product.slug` becomes nullable, and new products start without an address (D3).
   - The owner types the address in a required editor field, editable whenever the product is a
     draft and locked while it is published or hidden. Publishing from draft is refused without it
     (D4, D5).
   - The automatic English-name and random addresses are removed.
2. **Link underline** (US2, P2): a `.nav-line` span whose centred background line grows from 0 to
   100% in 200 ms (D6). A small `NavLink` client island marks the current page with
   `aria-current="page"` in the header and the phone menu (D7). Footer links get no underline
   at all (owner revision at the Phase D gate, FR-014).
3. **Sitemap** (US3, P3): drop the per-address language alternates from `sitemap.ts`. Page heads
   keep hreflang (D8).
4. **Footer credit** (US4, P3): a rich translation message in the footer's bottom row, linking to
   shahafs.com in a new tab (D9).

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 22.

**Primary Dependencies**: Next.js 16 (App Router), next-intl, Tailwind CSS 4, Drizzle ORM +
drizzle-kit, Zod. No new dependency.

**Storage**: PostgreSQL:
- `product.slug` becomes nullable, plus a check (migration 0009, generated)
- the one-time address update (migration 0010, custom)

See [data-model.md](./data-model.md).

**Testing**:
- Vitest unit: `current-path`
- Vitest unit: `normalise-path`
- Vitest integration: `catalog-products`, `sitemap`, `migration-0010-product-addresses`, `schema`,
  and the stats tests
- Playwright E2E: `admin-products`, `storefront-layout`, `language`, plus every spec that visits a
  `/p/` or `/c/` path (path updates only)
- `pnpm verify`; E2E one spec file at a time locally, the full run in CI

**Target Platform**: Render web service; evergreen browsers; mobile-first.

**Project Type**: web application (single Next.js project).

**Performance Goals**:
- No change to product or category page queries (the route rename only).
- The `NavLink` island adds well under 1 KB gzipped; the §10 budgets hold.
- No layout shift from the underline.

**Constraints**:
- Strict CSP: no `style` attributes; CSS only in `globals.css` and classes.
- Logical properties only (`pnpm check:css`).
- RTL/LTR; WCAG 2.1 AA.
- Motion 150–200 ms, `ease-out`, off under reduced motion (§3.5).

**Scale/Scope**: about 20 source files, 2 migrations, about 25 test files (mostly path updates), docs (`storefront.md` §3.5,
§7.18, §7.20, §8.2, §8.4, §11, §12.11, plus every `/p/` or `/c/` path mention; 005's `contracts/seo.md` is not edited, since this feature's
contract supersedes it).

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design: still passes.*

| Principle | How this plan meets it |
|---|---|
| I. Hebrew-first, bilingual | All new text (Address field, hint, locked note, missing and error messages, credit, new-tab note) comes from `he.json` and `en.json`. The credit has a native Hebrew sentence. The underline is centred, so it reads the same in RTL and LTR. |
| II. Non-technical owner | The Address field sits with the other details and saves with the same Save button. The hint explains the allowed letters and shows the full address. A missing address is reported in the same publish checklist as the other required fields. Errors appear in plain Hebrew next to the field, and the address is never rewritten silently. After publishing, the address is shown read-only with a short note. No destructive action is added. The owner guide explains it in Hebrew. |
| III. Guest shopping / mobile-first | Old `/p/` links break, which the owner accepted for the early testing launch (spec decision 5); the phone menu marks the current page; tap targets unchanged (nav rows ≥ 44 px, credit link ≥ 24 px inside text). |
| IV. Security by design | **A01 access control**: the address is set only through the existing admin-only Server Action and `updateProduct`, and the lock after publishing is enforced on the server (FR-007), not only in the UI. **A03 injection**: Drizzle queries only; the migration SQL has fixed literals; the slug is validated by Zod and DB checks. **A04 insecure design**: the database refuses a public product without an address. **A05 misconfiguration**: CSP unchanged (no inline style). The external link uses `rel="noopener"`. **A09 logging**: product edits keep their existing activity rows. No new secret, upload, redirect or third party. |
| V. Simplicity and low cost | No new table, service or dependency. Old-address handling is removed instead of added (no forwarding). The automatic slug code gets smaller. CSS-only animation. The sitemap gets simpler. |
| VI. Tested critical paths | Admin product create, edit and publish (a critical path) gain integration and E2E coverage for the required address and the lock. The migration has its own test. Language-switch and SEO tests are kept and adapted. All existing suites must pass. |
| VII. Privacy and legal | No personal data (addresses are product names). No cookies, tracking or third parties: shahafs.com is only a link, nothing loads from it. |
| Product constraints | Indexable and shareable: clear addresses, link previews and the sitemap use the new paths, and hreflang stays in page heads (old addresses are new to search engines anyway at this early stage). WCAG AA: `aria-current`, the visible focus ring kept, a visible underline on the in-text credit link. |
| Development workflow | `storefront.md` updated in this branch (FR-022); roadmap row added; frozen `specs/001` untouched; no git actions by tooling. |

No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/010-storefront-polish/
├── spec.md
├── plan.md              # this file
├── research.md          # D1–D9
├── data-model.md        # nullable slug, the address table, rules, error keys
├── quickstart.md
├── contracts/
│   ├── product-address.md     # routes, create/update/publish rules, editor field
│   ├── navigation-links.md    # .nav-line, NavLink, where used
│   └── sitemap-and-credit.md  # sitemap without alternates; footer credit
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source code (repository root)

```text
src/
├── app/
│   ├── globals.css                         # .nav-line (D6)
│   ├── sitemap.ts                          # drop alternates (D8)
│   └── [locale]/(shop)/
│       ├── product/[slug]/page.tsx         # moved from p/[slug] (D1), links updated
│       └── category/[slug]/page.tsx        # moved from c/[slug] (D1), links updated
├── components/
│   ├── admin/ProductEditor.tsx             # required Address field (D5)
│   ├── admin/PublishBar.tsx                # missing "address" item
│   └── shop/
│       ├── NavLink.tsx                     # new client island (D7)
│       ├── HeaderCategories.tsx            # NavLink; /category/ links
│       ├── ProductCard.tsx, CartLine.tsx, CategoryChips.tsx   # /product/, /category/ links
│       ├── Header.tsx                      # menu About / Shipping / Contact use NavLink
│       ├── Footer.tsx                      # no underline on lists (FR-014); credit (D9)
│       └── CookieSettingsButton.tsx        # .nav-line
├── lib/
│   ├── nav/current-path.ts                 # isCurrentPath (new)
│   ├── slug.ts                             # slugify, isRandomSlug moved here (shared)
│   ├── analytics/normalise-path.ts         # product / category areas
│   └── validation/product.ts               # stricter slugSchema; missingForPublish adds slug (D3, D4)
├── i18n/messages/{he,en}.json              # new/changed keys
└── server/
    ├── catalog/products.ts                 # null slug on create; no automatic slugs; lock (D3, D4)
    ├── catalog/admin-queries.ts            # slug: string | null
    ├── analytics/stats.ts                  # /product/ paths
    └── db/
        ├── schema/catalog.ts               # nullable slug + checks
        └── migrations/0009_product_slug_nullable.sql, 0010_product_addresses.sql

tests/
├── unit/current-path.test.ts               # new
├── unit/normalise-path.test.ts             # product / category areas
├── integration/catalog-products.test.ts    # address cases
├── integration/migration-0010-product-addresses.test.ts   # new
├── integration/sitemap.test.ts             # no alternates; new paths
├── integration/schema.test.ts              # nullable slug, the new check
└── e2e/*.spec.ts                           # admin-products, storefront-layout, language + path updates
```

**Structure Decision**: the existing single Next.js project; files as above.

## Order of work

1. **US1, the server part**: schema + migrations, the create, update and publish rules, the route
   moves and every link and analytics path, with unit, integration and migration tests.
2. **US1, the admin field**: `ProductEditor`, `PublishBar` and messages, with the E2E test and the
   path updates in the other E2E specs.
3. **US2**: CSS, `isCurrentPath` + unit test, `NavLink`, then header, menu and footer, with the E2E
   checks.
4. **US3 + US4**: the sitemap and the credit, with their tests.
5. **Docs**: `storefront.md` (§3.5 motion: the underline; §7.18 header + menu: `NavLink`, current
   page; §7.20 footer: animated lists, credit; §8.2 / §8.4 / §8.12: new paths and old paths 404; §11 verification rows;
   §12.11 product editor: the required Address field; §10 client islands: `NavLink`), the roadmap status, and the
   Hebrew owner guide §2 (typing the address for a new product; it is fixed after publishing).

## Complexity Tracking

None.
