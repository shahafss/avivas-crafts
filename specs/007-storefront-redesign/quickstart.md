# Quickstart: checking the storefront redesign (007)

How to see and check each story locally. Details live in the [contracts](contracts/) and
[data-model.md](data-model.md); this page only says what to run and what you should see.

## Prerequisites

- Node 24 and pnpm, Docker for the local database (`compose.yaml`), as for every feature.
- Local ports: dev server 3001, E2E 3100/3101, mock sign-in 4011 (dev) and 4012 (E2E).

```bash
pnpm install
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

## 1. Photos (D3)

```bash
pnpm photos:home
```

Expect one line per file (18 files) with sizes; the hero's `p565` at most 190 KB. Running it a
second time changes nothing (`git status` shows no change in `public/site-photos/`).

```bash
pnpm vitest run tests/unit/home-photos.test.ts
```

## 2. Home page (US1)

```bash
pnpm dev
```

Open http://localhost:3001/he at 375 px wide (browser device mode):

- The green free-shipping strip with the language switch ("EN") at its left end, then the header
  over the photo: menu button, shop name, cart in white, on a dark strip that fades smoothly into
  the photo with no visible edge; the shop name large on the photo and no other line under it.
- Open the menu: a search field, "כל היצירות", the categories with pieces, "אודות", "משלוחים
  והחזרות", "יצירת קשר" and the "English" link. Type "סל" in the search field and press Enter:
  the search page opens with that word.
- Scroll down even a little: the header becomes the plain white bar; back at the very top it is
  see-through again (in Chrome or Safari 26+; in Firefox it is the white bar all the time).
- Then the row "מומלצות" (every sample piece) with square cards: about two and a bit
  on a phone, swiped sideways; four on a computer with arrow buttons ("הבאות" moves left in
  Hebrew); "לכל היצירות" with an arrow. No category or sort buttons on the home page. Then the
  child banner; the peach band with its sentence and the
  "לקנייה" link with an arrow; the shelf banner; the mint footer.
- A banner's "לכל היצירות" button, the band's "לקנייה" and the row's "לכל היצירות" all open
  http://localhost:3001/he/shop: "כל היצירות" with the category and sort buttons and every piece.
- With the device's reduced-motion setting on (browser rendering settings: emulate
  `prefers-reduced-motion: reduce`), the row's arrows jump without sliding; the header behaves the
  same as without it.
- In the browser's network panel, the hero file is a `-p400` or `-p565` file under 200 KB.

At 1024 px and at 1280 px: one header row, from the right in Hebrew: "כל היצירות", the two
header categories chosen in Settings (none at release), "מומלצות", "אודות", "משלוחים והחזרות",
the shop name, a search field, the cart. No menu button. Nothing overlaps; Tab through the header
and every focused link shows its full focus ring. Type a word in the header search field and press
Enter: the search page opens. Choose two categories in Settings › "דף הבית" › "קטגוריה בתפריט 1"/"2"
and reload: they appear after "כל היצירות", in that order.

Repeat at http://localhost:3001/en: everything reads left to right (menu and links on the left,
cart on the right, banner text on the left, the language switch "עב" at the strip's right end).
Repeat at 320 px (no sideways scroll; the strip text may wrap to two lines).

## 3. Product, cart, checkout (US2)

Open a product: square photos; details beside the gallery (right in Hebrew, left in English)
from 900 px; outlined quantity box and dark green add-to-cart; made-to-order note in peach;
"אולי תאהבו גם" with up to 4 cards. Add to cart and finish an offline order: every step as
before, new look.

## 4. Social links (US3)

Sign in to the admin (mock sign-in in dev), open Settings, section "הרשתות החברתיות שלי":

- Type `instagram.com/aviva` and save → the field shows `https://instagram.com/aviva`; the
  footer shows one Instagram icon named "האינסטגרם שלי".
- Type `https://example.com/aviva` in the Facebook field and save → the Hebrew error "זו לא כתובת
  של פייסבוק…" and nothing saved.
- Empty the Instagram field and save → the icon disappears and no empty space is left.

## 5. Admin look (US4)

Open each admin screen: same layout and texts, Assistant font, new colours.

## 6. Categories and the home row (US5)

In the admin, open a sample piece: "קטגוריות" shows checkboxes, with "מומלצות" and its own
category ticked. Untick "מומלצות" and save: the piece leaves the home row and is still on its
category page. Tick a second category: the piece shows on both category pages. In Settings,
"דף הבית", choose "ללא": the row disappears; choose "מומלצות" again afterwards.

To check the release step on a copy of real data: restore a backup into the local database
(`ops/backup/README.md`), run `pnpm db:migrate`, and see every piece in "מומלצות" and still in
its old category.

## 7. Automated checks

```bash
pnpm verify
```

Single E2E specs (the full run is left to CI on this machine). Each needs a production build
first:

```bash
pnpm build
```

```bash
pnpm exec playwright test tests/e2e/home.spec.ts --project=chromium-mobile
```

```bash
pnpm exec playwright test tests/e2e/storefront-layout.spec.ts --project=chromium-desktop
```

```bash
pnpm exec playwright test tests/e2e/a11y.spec.ts --project=chromium-desktop
```

```bash
pnpm exec playwright test tests/e2e/admin-settings.spec.ts --project=chromium-mobile
```

```bash
pnpm exec playwright test tests/e2e/admin-products.spec.ts --project=chromium-mobile
```

Visual review screenshots (looked at by the coordinator, not committed):

```bash
DESIGN_REVIEW=1 pnpm exec playwright test tests/e2e/design-review.spec.ts --project=chromium-desktop
```

Expected: every check passes; the screenshots in `test-results/design-review/` match the approved
home example and `docs/design/storefront.md`.
