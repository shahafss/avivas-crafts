# Quickstart: checking the new header logo (009)

## Prerequisites

- `pnpm install` done; local PostgreSQL as for other features; `pnpm dev` runs on port 3001.
- The new original is at `assets/logo/logo-wordmark-original.jpg`.

## 1. Build the brand files

```bash
pnpm brand:assets
```

Expected: exit 0; it prints the detected content box (≈ x 260–1794, y 416–1259) and yarn box
(≈ x 730–1404, y 415–951), then each file with its size: four `logo-*.webp` (186–321 px wide, each
under 40 KB), `icon-32`, `apple-touch-icon`, `icon-192`, `icon-512`, `og`, and `favicon.ico`.
Running it a second time changes nothing (`git status` shows no new difference in `public/brand/`).

## 2. Unit tests

```bash
pnpm vitest run --project unit tests/unit/brand-assets.test.ts
```

Expected: all pass (contracts/brand-assets.md "Tests").

## 3. Look at it by hand (dev server, port 3001)

| Where | Check |
|---|---|
| `/he` at the top, 375 px and 1280 px | the logo is in the middle of the bar, wholly inside it, on a soft white rounded box; readable over the photo |
| `/he` scrolled down | the bar is white, the backing is gone |
| `/he/c/<category>`, `/en/contact`, a product page, `/he/checkout` | logo centred in the bar, no backing; the breadcrumbs or heading start right under the bar (no 44–56 px gap) |
| Tab to the logo (home top and another page) | a dark ring around the backing, not cut off |
| 320 px | the logo does not touch the menu or cart button |
| Browser tab | yarn-ball icon on cream |
| `/brand/og.*.jpg` | hero photo with a light card and the full logo |

SC-004 (sharing in WhatsApp) can only be checked after deployment; the owner does it then. The
preview file name carries a content hash, so new shares fetch the new picture.

## 4. Browser tests (one spec file at a time locally)

```bash
pnpm build && pnpm exec playwright test tests/e2e/storefront-layout.spec.ts --project=chromium-desktop
```

```bash
pnpm exec playwright test tests/e2e/storefront-layout.spec.ts --project=chromium-mobile
```

```bash
pnpm exec playwright test tests/e2e/home.spec.ts --project=chromium-desktop
```

```bash
pnpm exec playwright test tests/e2e/seo.spec.ts --project=chromium-desktop
```

Build once (the first command), then run the others without rebuilding. The full E2E run (all projects, WebKit) is left to CI.

## 5. Everything else

```bash
pnpm verify
```

Expected: types, lint, CSS checks (including logical-properties), unit, integration and PostgreSQL
tests pass.
