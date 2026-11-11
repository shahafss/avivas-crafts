# Data Model: what 003 adds or changes

The Drizzle schema in `src/server/db/schema/` is the source of truth for the whole model; spec
001's `data-model.md` is background (its *Personal data register* and the anonymisation rule under
*order* are reused as written). This file covers only 003's changes.

## Summary

| Change | Where | Migration |
|---|---|---|
| New table `content_page_version` (FR-011) | `src/server/db/schema/commerce.ts` | `0002_content_page_version.sql` (generated + hand-written back-fill) |
| New writers/readers on existing tables (`content_page`, `consent_record`, `analytics_daily_*`, `orders`, `pending_checkout`, `email_outbox`, `admin_activity`, `order_event`) | data layer | none |
| New `admin_activity.action` values and `ACTIVITY_DETAIL_KEYS` unchanged | `src/server/activity/log.ts` | none |
| Device-storage registry (not in the database) | `src/lib/consent/registry.ts` | — |

No other column, enum or index changes.

## New table: `content_page_version`

Append-only copy of every version of the Terms and the Privacy Policy that became current
(Clarifications 2026-11-09, research R3a).

| Column | Type | Rules |
|---|---|---|
| slug | text, PK part | CHECK `slug IN ('terms','privacy')`; FK → `content_page.slug` (ON DELETE RESTRICT; content pages are never deleted) |
| version | integer, PK part | CHECK `version >= 1`; equals `content_page.version` at the moment it became current |
| title_he | text not null | as `content_page.title_he` |
| title_en | text null | |
| body_he | text not null | CHECK `char_length <= 50000` |
| body_en | text null | CHECK `char_length <= 50000` |
| created_at | timestamptz not null default now() | when this version became current |

- Primary key `(slug, version)`; that is exactly what `orders.terms_version` /
  `orders.privacy_version` refer to (no FK from orders: an order stores the number only, and the
  pair is always present because of the back-fill and the writers below).
- **Writers** (insert only, in the same transaction as the change to `content_page`):
  `updateContentPage` for `terms`/`privacy`, and the seed when it inserts or replaces a
  non-edited `terms`/`privacy` draft. **No code updates or deletes rows**; no retention task
  touches the table.
- **Back-fill** (in the migration, after `CREATE TABLE`):
  `INSERT INTO content_page_version (slug, version, title_he, title_en, body_he, body_en, created_at)
  SELECT slug, version, title_he, title_en, body_he, body_en, updated_at FROM content_page
  WHERE slug IN ('terms','privacy') ON CONFLICT DO NOTHING;`
  Fresh databases (tests, E2E) have no `content_page` rows when migrations run, so the seed's
  writer covers them.
- **Personal data**: none (public texts). **Retention**: kept without limit (orders refer to a
  version for up to 7 years; the texts are public).

## Existing tables: how 003 uses them

### `content_page` (exists)

- `version` increments on every saved change of any page (admin save, or seed replacing a
  non-edited draft); unchanged text never bumps it.
- `owner_edited` becomes `true` on the first admin save and is never reset by code; the seed never
  touches such a row.
- Validation (data layer and admin form): `title_he` 1–120 chars, `body_he` 1–50,000;
  `title_en` ≤ 120, `body_en` ≤ 50,000, empty strings stored as NULL (FR-002 fallback).
- The `cookies` page `version` is the consent policy version (`consent_record.policy_version`,
  `ac_consent` cookie).

### `orders` (exists; no column change)

Customer tools read `customer_email` (matched with `lower()`), `customer_phone` (E.164), and the
privacy columns. Changes they make:

| Operation | Columns written |
|---|---|
| Marketing withdrawal | `marketing_opt_in = false`, `marketing_withdrawn_at = now()` on orders with `marketing_opt_in = true`; `marketing_opt_in_at` kept |
| Anonymisation (request or 7-year task) | exactly 001 data-model › order: `customer_name = 'נמחק'`; NULL `customer_phone`, `customer_email`, `address_city`, `address_line1`, `address_line2`, `address_postal_code`, `note`, `tracking_number`, `pickup_note`, `marketing_opt_in_at`, `marketing_withdrawn_at`; `marketing_opt_in = false`; `anonymized_at = now()`. Kept: amounts, lines, dates, status, payment fields, `address_country`, `terms_*`, `privacy_version`, `locale`, `public_token_hash` |

The existing CHECK `orders_contact_present` allows NULL email/phone only once `anonymized_at` is
set, so the update sets all of them in one statement.

### `order_event` (exists)

`anonymized` events (kind already listed in 001): `admin_id` = the acting admin and `data = {}`;
for the 7-year task `admin_id` NULL and `data = {system: true}` (the history shows "המערכת" only
for that marker, so an event whose admin was later removed is not mistaken for the system).

### `pending_checkout` (exists)

Rows whose `customer_email` (lower-cased) or `customer_phone` equals the **searched** value are
listed in the export; marketing withdrawal sets their `marketing_opt_in = false` and
`marketing_opt_in_at = NULL`; anonymisation **never deletes them**: every row that still holds
personal data is open (`awaiting_provider`, `failed`) or `mismatch` and may still turn into a real
payment, so it is left to expire (48 h, or 30 days for `mismatch`) and counted in the result (user
decisions 2026-11-09).

### `email_outbox` (exists)

- New kind `contact-message` (owner email, Hebrew, `reply_to` = visitor email, no `order_id`).
  After a successful send the sender already blanks `html`, `text_body` and `reply_to`
  (FR-015); `to_address` (the owner's address) stays.
- Anonymisation deletes, whatever their status, every row whose `order_id` is one of the
  anonymised orders, every row whose lower-cased `to_address` / `reply_to` equals the searched
  email (email searches only). `payment-mismatch` owner emails (`order_id` NULL) stay with their
  kept `mismatch` checkout. Rows reachable only through another
  email or phone of the person are not touched (user decision Q5).
- `delete-old-outbox` deletes `sent` rows with `sent_at` older than 30 days and `failed` rows whose
  `next_attempt_at` is older than 30 days; the sender sets `next_attempt_at = now` when it marks a
  row `failed`, so for failed rows that column is the time of the final failure (research R11). `pending`/`sending` rows are never deleted.

### `consent_record` (exists)

Inserted only by `saveConsent` and only when consent is required. `choices` = JSON object
`{<category id>: boolean}` for the enabled categories; `policy_version` = `cookies` page version;
no IP, user agent or other identifier. Deleted 2 years after `decided_at`.

### `analytics_daily_page`, `analytics_daily_referrer` (exist)

`path` holds only normalised known route paths (no query string, no tokens);
`referrer_host` holds a lower-case host or `(direct)`; `day` is the calendar date in
`Asia/Jerusalem`. Only paths of existing published products, existing categories and served
pages are counted. No personal data; kept without limit.

### `admin_activity` (exists)

New `action` values (details only from the existing allow-list `ACTIVITY_DETAIL_KEYS`; never
personal data):

| Action | target_type / target_id | details |
|---|---|---|
| `content.updated` | `content_page` / slug | `{slug, to: newVersion}` |
| `customer.searched` | — | `{field: 'email' or 'phone', count}` |
| `customer.exported` | — | `{count}` (orders in the file) |
| `customer.marketing_withdrawn` | — | `{count}` |
| `customer.anonymized` | — | `{count}` |

The 7-year task writes one `actorKind: 'system'` row `customer.anonymized` `{count}` per run that
anonymised anything. Retention: rows older than 2 years are deleted (`delete-old-activity`).

## Device-storage registry (code, not database)

`src/lib/consent/registry.ts` — contract: [contracts/consent.md](contracts/consent.md). Items:

| Name | Kind | Category | Scope | Exists when |
|---|---|---|---|---|
| `ac_cart_v1` | localStorage | necessary | public | always |
| `NEXT_LOCALE` | cookie | necessary | public | after a language switch (item 005) |
| `ac_checkout` | sessionStorage | necessary | public | during checkout |
| `__Host-ac_admin` | cookie | necessary | admin | admin signed in |
| `__Host-ac_oauth` | cookie | necessary | admin | during Google sign-in |
| `ac_consent` | cookie | necessary | public | only when consent is required |
| `ac_test_optional` | cookie | analytics (test) | public | only with `CONSENT_TEST_CATEGORY=analytics`, after acceptance |

## Personal data register: changes from 003

Additions to 001 data-model.md › Personal data register (the Privacy Policy draft and
`docs/privacy/database-definition.{he,en}.md` use the combined register):

| Data | Where | Purpose | Retention |
|---|---|---|---|
| Contact message: visitor name, email, message | `email_outbox` (`contact-message` body and `reply_to`) | deliver the message to the owner so she can reply | blanked as soon as sent; a row that finally failed is deleted 30 days after the final failure; deleted with the person on anonymisation |
| Customer export file | produced on demand, never stored by the shop | answer an access request | on Aviva's device only until she sends it (security procedure: delete afterwards) |
| Cookie choice (no identifier) | `consent_record`, `ac_consent` cookie | prove and remember the visitor's choice | 2 years (record), 12 months (cookie); only when consent is required |
| Terms / Privacy versions | `content_page_version` | prove what a customer accepted | no personal data; kept without limit |

Changed: "Customer name, phone, email" row — anonymisation on request also deletes the related
outbox rows (as 001 planned). Unlike 001's plan it leaves unfinished checkouts to their own 48 h /
30-day expiry, because each may still become a real payment (user decision 2026-11-09);
unchanged retention.
