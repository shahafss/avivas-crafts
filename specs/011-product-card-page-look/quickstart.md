# Quickstart: checking the new card and product page look

## Prerequisites

- Local database migrated and seeded (`pnpm db:migrate`, `pnpm db:seed`), so the sample pieces
  exist (`sample-soy-candle` has two photos; `sample-clay-mug` one).
- Dev server: `pnpm dev` (port 3001).

## Automated checks

```bash
pnpm verify
```

Then build once (the Playwright server runs the last build) and run the E2E specs this feature
touches, one file at a time (the full E2E run is left to CI):

```bash
pnpm build
```

```bash
pnpm exec playwright test tests/e2e/storefront-layout.spec.ts --project=chromium-desktop
```

```bash
pnpm exec playwright test tests/e2e/home.spec.ts --project=chromium-desktop
```

```bash
pnpm exec playwright test tests/e2e/admin-products.spec.ts --project=chromium-mobile
```


## By hand (what the owner checks at the Phase D gate)

1. Admin: open a published piece, tick "הצגה כ'חדש'", Save. Open "כל היצירות": that piece's card
   shows a green "חדש" label above its category label on the photo's top right corner; other pieces
   show only the category label. Untick and Save: the "חדש" label is gone.
2. Phone width (375 px): cards are white with a thin border, rounded corners and a soft shadow; the
   photo sits inside with its own rounded corners; the name is semi-bold and the price is regular
   weight. Same on the home row, a category page, search and "You may also like".
3. Computer: moving the mouse over a card darkens its border, lifts it slightly and zooms the photo.
   With "reduce motion" on in the system settings, nothing moves.
4. Product page on a phone: one white card; the photo runs across the top edge to edge, its top
   corners follow the card, its bottom corners are rounded; thumbnails under it; then the details.
   On a computer: photos and details side by side inside the card; the details stay in view while
   scrolling.
5. Cart drawer and checkout: the small photos have rounded corners.
6. Switch to English: pills on the top left, gallery on the left; everything else the same.
