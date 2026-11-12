# Quickstart: validating Order Handling (002)

How to prove the feature works. Contracts and rules are in [contracts/](contracts/) and
[data-model.md](data-model.md); this guide only says what to run and what to expect.

## Prerequisites

- Docker running. `pnpm dev` is the one command: it creates `.env.local` if missing, starts the
  database, applies the migrations and the seed (there is **no new migration** in 002), creates
  the first admin when there is none (printing its one-time setup link; open it to set up a
  passkey), starts the mock OIDC on **4011**, and serves the app on port **3001**.
  Since 004: no setup link or passkey; see specs/004-simpler-admin-access/quickstart.md.
- E2E uses ports 3100/3101. On this machine run **single spec files** only; leave the full E2E
  run to CI (project CLAUDE.md).

## Automated checks

```bash
pnpm test:unit tests/unit/order-status.test.ts
```

```bash
pnpm vitest run --project integration tests/integration/admin-orders.test.ts tests/integration/order-changes.test.ts tests/integration/order-emails.test.ts tests/integration/outbox.test.ts tests/integration/public-order.test.ts tests/integration/order-customer.test.ts
```

```bash
pnpm test:pg
```

`pnpm exec playwright` serves the last build, so build once after changing code:

```bash
pnpm build
```

```bash
pnpm exec playwright test tests/e2e/admin-orders.spec.ts --project=chromium-mobile
```

```bash
pnpm exec playwright test tests/e2e/admin-order-workflow.spec.ts --project=chromium-mobile
```

```bash
pnpm exec playwright test tests/e2e/admin-home.spec.ts --project=chromium-mobile
```

```bash
pnpm exec playwright test tests/e2e/order-tracking.spec.ts --project=chromium-mobile
```

```bash
pnpm exec playwright test tests/e2e/order-tracking.spec.ts --project=webkit-mobile
```

```bash
pnpm test:e2e tests/e2e/admin-access.spec.ts
```

```bash
pnpm verify
```

Expected: all pass. `tests/integration/admin-actions-guard.test.ts` lists the six new actions
without being edited (it walks the file tree); `admin-access.spec.ts` lists `/admin/orders` and
`/admin/orders/[id]` and, after T046's small change, requests the order page with a real order
id.

## Manual walkthrough (phone width, Hebrew)

Place two offline orders from the storefront: one **shipping**, one **pickup** (switch the
storefront to English for the pickup one). Then, signed in as admin:

1. **Notification and list (US1)**: run `pnpm dev:outbox`; open the `new-order` HTML and tap its
   link → the order page opens. Sign out, tap it again → sign-in, then the same order page.
   `/admin/orders`: newest first with number, date (Israel time), name, total, payment and
   status. Tap the "ממתין לתשלום" chip, then "חדשה"; clear. Type `#<number>` in the number box →
   the order opens; type `99999` → "לא מצאתי הזמנה…" and the list stays.
2. **Order page (US1 #6, #8)**: items with photo, options, quantity, prices, preparation time;
   `tel:` and `mailto:` links; address or self-pickup; note; payment method and state; history.
   Delete the product in the admin, reload the order: the snapshot is unchanged.
3. **Forward and back (US2)**: shipping order → "בהכנה" → "נשלחה" with a tracking number →
   step back → "נשלחה" again (the tracking number is pre-filled) → "הושלמה": the order is still
   unpaid, so the dialog offers "סימון כשולם והשלמה" — choose it → Completed and paid, two history
   entries, and the customer page no longer shows the payment instructions. Pickup
   order → "מוכנה לאיסוף" with a note. Check that "מוכנה לאיסוף" never appears on the shipping
   order and "נשלחה" never on the pickup order, and that each change is in the history. Mark the
   shipping order Shipped again, tap "עריכה" next to the tracking number, fix it, save → the new
   number shows, the status stays Shipped, the history says the tracking number changed.
4. **Payments (US3)**: on the shipping order "סימון כשולם" (confirm) → paid with date; then
   "סימון כהוחזר" (confirm) → refunded with date, and `pnpm dev:outbox` shows one
   `order-refunded` email in the order's language. An online order (fake provider) never offers
   "סימון כשולם".
5. **Cancel (US5)**: mark the pickup order paid, then cancel → the dialog shows the refund
   reminder; after confirming, the page keeps the reminder and offers "סימון כהוחזר"; the outbox
   has one `order-cancelled` email (English, saying the money will be returned).
6. **Customer details (US6)**: correct the phone and city; save → new values shown, history says
   "פרטי הלקוח עודכנו" without values. Enter `not-an-email` → message next to the field, nothing
   saved.
7. **Admin home (US7)**: counts of new and unpaid (not cancelled) orders, each opening the
   matching list; with a seed placeholder still in settings, the notice lists it.
8. **Customer page (US4)**: open each order's link from its `order-confirmation` email in the
   outbox (`pnpm dev:outbox`) after each step above: the progress, payment state, tracking
   number / pickup note, payment instructions only while unpaid, cancelled notice — in Hebrew for
   the first order and English for the second. No name, address, phone or email anywhere.
9. **Link lifetime (FR-015)**: in `psql`, set an open order's `created_at` and
   `public_token_expires_at` 40 days back → its link still works. Set a Completed order's
   `public_token_expires_at` to yesterday → "הקישור כבר לא פעיל" with a Contact link.
10. **Customer emails (SC-002)**: after all of the above, each order has exactly one
    `order-confirmation` row, at most one `order-cancelled` and at most one `order-refunded`, and
    no other customer-addressed row.
11. **Order email failure (FR-007, SC-009)**: in `.env.local` set `EMAIL_DRIVER=resend` with an
    invalid `RESEND_API_KEY` (or point a test at a driver that always fails), place an order and
    keep the dev server running: about 3 minutes later the `order-confirmation` row is `failed`,
    an `order-email-failed` row for Aviva is queued (and claimed first), and the admin order page
    shows the call-the-customer warning. Restore the settings afterwards.

## Design check

Compare the admin screens with `docs/design/storefront.md` §12 and the customer page with §8.8 at
375 px and 1280 px (Hebrew, and English for the customer page).
