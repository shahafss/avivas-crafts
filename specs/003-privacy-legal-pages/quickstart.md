# Quickstart: validating 003

How to prove the feature works, story by story. Shapes and rules are in
[contracts/](contracts/) and [data-model.md](data-model.md); this guide does not repeat them.

## Prerequisites

```bash
pnpm install
pnpm dev            # database, migrations, seed (loads docs/legal-drafts), mock sign-in, app on http://localhost:3001
```

Sign in to `/admin` with the mock Google account and the dev passkey as in 001's quickstart.
Automated checks:

```bash
pnpm verify                                   # types, lint, CSS, unit + integration, audit (+ test:pg with DATABASE_URL_TEST)
pnpm build && pnpm exec playwright test tests/e2e/privacy.spec.ts --project=chromium-mobile
pnpm exec playwright test tests/e2e/consent.spec.ts --project=consent
```

Run single E2E spec files locally (long runs hang on this machine); CI runs them all.

## US1 — Pages and footer

1. Open `/he` and `/en`. The footer shows shop name, legal name, address, "עוסק מורשה" + number,
   email (`mailto:`), phone (`tel:`), the Info and Legal links, the © line. No "cookie settings".
2. Follow each footer link in both languages; legal pages start with the draft notice.
3. `/he/pages/cookies`: the table lists `ac_cart_v1`, `NEXT_LOCALE`, `ac_checkout` (public) and
   the two admin cookies.
4. `/en/checkout` on a phone width: tap the centre of the Terms box → ticked, no new tab. Tap
   "terms of sale" → Terms opens in a new tab, box unchanged. Repeat on `/he/checkout`.
5. Header "About", "Shipping & returns", product page shipping link, checkout links, order-page
   contact link: none is a 404.
   *Automated*: `privacy.spec.ts`, `checkout-terms.spec.ts`.

## US2 — Contact

1. `/he/contact`: intro text, business details, form. Send a valid message (wait 3 s after
   loading: the form token's minimum age).
2. `pnpm dev:outbox` (or the dev outbox viewer) shows one `contact-message` per notification
   address, Reply-To = the visitor's email, subject without name or email.
3. Send 5 more valid messages in the same clock hour → the rate-limit Notice says how many
   minutes to wait; invalid submissions do not count.
   *Automated*: `tests/integration/contact.test.ts`, `contact.spec.ts`.

## US3 — Customer data request

1. Place two offline orders with the same email (different case) and phones `050-1234567` and
   `+972 50 123 4567`.
2. `/admin/customers`: search the email in capitals → both orders; search `0501234567` → both,
   with any other emails or phones on them listed for a new search. The address bar stays
   `/admin/customers`.
3. "הורדת הנתונים" → `customer-YYYY-MM-DD.json` with both orders, pending checkouts and emails.
4. Record a marketing withdrawal (if an order had consent) → the order page shows it withdrawn.
5. Anonymise (confirm) → the orders show "נמחק" and no email, phone or address; a new search finds
   nothing; `email_outbox` has no row for them.
   *Automated*: `tests/integration/privacy-customers.test.ts`, `admin-privacy.spec.ts`.

## US4 — Editing pages

1. `/admin/content`: seven pages marked "טיוטה שסופקה עם האתר".
2. Edit About (Hebrew and English), preview, save → `/he/pages/about`, `/en/pages/about` show it.
3. Edit Terms and save; place an order; open the order in the admin → its Terms link opens the
   version it recorded; `/admin/content/terms/versions` lists both versions.
4. Re-run `pnpm db:seed`: About (edited) is untouched.
   *Automated*: `tests/integration/content-pages.test.ts`, `tests/integration/seed.test.ts`,
   `admin-content.spec.ts`.

## US5 — Statistics

1. Fresh private window: browse home → product → checkout. DevTools: no cookies at all (at
   most `NEXT_LOCALE`, set by the language switch of item 005), `localStorage` `ac_cart_v1` after adding to
   cart, requests only to the app and the image origin; `/api/v` beacons answer 204.
2. `/admin/stats`: today's visit, the product among most viewed, `(direct)` as referrer.
   *Automated*: `tests/integration/analytics.test.ts`, `privacy.spec.ts`, `admin-stats.spec.ts`.

## US6 — Consent (test category)

```bash
pnpm build && pnpm exec playwright test --project=consent
```

Manually: `CONSENT_TEST_CATEGORY=analytics pnpm dev` → banner with equal buttons; no
`ac_test_optional` until "Accept all"; footer "Cookie settings" reopens the dialog; rejecting
removes the cookie.

## US7 — Retention

`tests/integration/retention.test.ts` (boundaries at 7 years / 2 years / 30 days, second run
changes nothing).

## US8 — Data Security Regulations drafts

Read `docs/privacy/*.{he,en}.md`: five documents in Hebrew and English (ten files), each with the
draft notice, matching data-model.md's register and the services in the Privacy Policy draft.
