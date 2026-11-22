# Quickstart: checking feature 010

## Automated

```bash
pnpm db:migrate        # applies 0009 (nullable slug) and 0010 (the address update)
pnpm verify            # types, lint, CSS rules, unit + integration tests, audit (+ test:pg if set)
```

E2E: run single spec files locally, and leave the full run to CI.

```bash
pnpm build && pnpm exec playwright test tests/e2e/admin-products.spec.ts --project=chromium-mobile
```
```bash
pnpm exec playwright test tests/e2e/storefront-layout.spec.ts --project=chromium-desktop
```

## By hand (dev server on 3001)

1. **Product addresses** (contracts/product-address.md):
   1. After `pnpm db:migrate`, products open at `/he/product/{address}` and categories at
      `/he/category/{address}`; `/he/p/…` and `/he/c/…` show "page not found".
   2. In `/admin/products`, press "New product". The "Product address" box is empty. Fill in
      everything else and try to publish: it is refused, and the address box is marked.
   3. Type `test-bunny`, save, and publish. The box becomes read-only, and the product opens at
      `/he/product/test-bunny`.
   4. On another draft, try `Blue Bunny`: a format error. Try `test-bunny`: "already used".
2. **Underline** (contracts/navigation-links.md):
   1. Hover the header links: the line grows from the middle and shrinks back. Hover the footer
      links: no underline.
   2. Open About: "About" stays underlined. Open a product page and the home page: nothing is
      underlined.
   3. On a phone width, open the menu on a category page: that category is underlined.
   4. With "reduce motion" on in the OS, the line appears without growing.
3. **Sitemap** (contracts/sitemap-and-credit.md): open `/sitemap.xml` in Chrome. It shows as a
   tree, has no `xhtml:link` lines, and lists `/product/` and `/category/` addresses.
4. **Credit**: at the bottom of `/he` and `/en`, check the wording. The name opens shahafs.com in a
   new tab.
