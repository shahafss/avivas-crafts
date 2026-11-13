# Quickstart: Validate the English Version and Language Switch

## Prerequisites

`pnpm install`, the database running (`docker compose up -d db`), `pnpm db:migrate`, `pnpm db:seed`
(the samples include English products and `sample-clay-mug`, which has no English text), then
`pnpm dev` on port 3001.

## Automated

```bash
pnpm test:unit locale-path seo
```

```bash
pnpm test:integration locale-redirect sitemap catalog-products place-order
```

```bash
pnpm exec playwright test tests/e2e/language.spec.ts
```

```bash
pnpm verify
```

Leave the full E2E run to CI (CLAUDE.md).

## Manual walk-through (owner, Phase D)

1. In a private window open `http://localhost:3001/` → lands on `/he`, right to left. DevTools →
   Application → Cookies: no `NEXT_LOCALE` (US2-1, US2-3).
2. Add a product to the cart. Open a category, sort by price, open a product, press **EN** in the
   header → same product under `/en/p/...`, left to right, cart count unchanged; the cookie now
   exists (US1-2, US2-2).
3. Press **עב** → back to the Hebrew product. Open the menu and the footer: both show the switch in
   full words (US1-4).
4. Search for a word, switch: the query is kept (US1-3).
5. Close the window's tab, open `http://localhost:3001/` again in the same window → `/en` (US2-2).
6. In another private window open an `/en/p/...` link → English, no cookie (US2-4).
7. Check out in English with offline payment → every screen English; read the queued emails with
   `pnpm dev:outbox`: the confirmation is English, the price reads `₪…`, the
   links go to `/en/...` (US3).
8. Open `/en/p/sample-clay-mug` (no English text) → Hebrew name and description, aligned correctly,
   rest of the page English (US4-1).
9. `/admin/products` → that product shows "אין אנגלית"; add English name and description → the
   badge disappears (US4-3, US4-4). The admin has no language switch (US1-5).
10. View source on `/en` and `/he/p/...`: canonical + three `hreflang` links. Open `/sitemap.xml`
    and `/robots.txt` (US5).
11. Try `http://localhost:3001/api/locale?to=en&path=//evil.example` → 400 (FR-010).
12. Read `specs/005-english-language-switch/copy-review.md` and approve the English wording (US6).
