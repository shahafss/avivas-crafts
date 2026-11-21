# Quickstart: validating 008 (post-launch fixes)

Prerequisites: local Postgres from `compose.yaml`, `pnpm install`, `pnpm db:migrate`, `pnpm db:seed`.
Dev server on 3001 (`pnpm dev`). E2E: run single spec files locally (CLAUDE.md), the full run in CI.

## 0. Assets

```bash
pnpm brand:assets
```

Expect: exit 0, `public/brand/` with the files of contracts/brand-assets.md, `public/favicon.ico`,
`public/site.webmanifest`, `src/lib/brand/manifest.json`. Running it twice gives no git diff.

## 1. Orders open with sample details (Story 1)

```bash
pnpm vitest run --project integration tests/integration/place-order.test.ts
```

Expect: the old "shop not ready" case now asserts that a production-mode order with seed
placeholders **succeeds**. (Production mode cannot run locally: `src/server/env.ts` requires R2, an https OIDC issuer and more.) After deploy: place a real offline order on the live shop; confirmation page, no "shop is not open" message. Admin home still lists the
sample details.

## 2. Business number (Story 2)

- Admin → Settings: clear "מספר עוסק", save → saved. Footer, contact, checkout, product page: no
  "עוסק מורשה", no "ע.מ.", no "000000000", no "כולל מע״מ".
- Place an order: the dev outbox (`pnpm dev:outbox`) email has no business-number line. Enter
  `123456789`, save, order again: the email shows "מספר עוסק: 123456789"; the website still shows
  nothing.
- `pnpm vitest run --project integration tests/integration/order-emails.test.ts tests/integration/settings.test.ts`

## 3. Product form (Stories 3, 4)

Admin → Products → new product, type only a Hebrew name, press "פרסום": the page scrolls to the
photos section (first), the photo control has focus, every missing field is red with a message,
the list next to the button is still there. Add a photo: its error clears. E2E:
`pnpm exec playwright test tests/e2e/admin-products.spec.ts --project=chromium-mobile`.

## 4. Contact page (Story 5)

With the seed phone: no WhatsApp block. Set the business phone to `050-1234567`: the block is
first, the button opens `https://wa.me/972501234567` in a new tab. E2E:
`pnpm exec playwright test tests/e2e/contact.spec.ts --project=chromium-desktop`.

## 5. Logo (Story 6)

Phone width (375) and desktop (1280): scroll down any page; the badge is half in the bar, half
below; no grey square; at the top of a content page the title is not covered; menu and cart
drawers cover the logo. E2E:
`pnpm exec playwright test tests/e2e/storefront-layout.spec.ts --project=chromium-desktop`.

## 6. Band, previews, icons (Stories 7–9)

- Home band shows the new sentence in he/en.
- `curl -s localhost:3001/he | grep -E 'og:|twitter:|rel="(icon|apple-touch-icon|manifest)"'`
  shows the tags of contracts/metadata.md with absolute URLs; the og image URL returns 200.
- After deploy: paste the production address into WhatsApp (a chat with yourself) and check the
  card; Facebook's Sharing Debugger can force a re-scrape.

## 7. Everything

```bash
pnpm verify
```
