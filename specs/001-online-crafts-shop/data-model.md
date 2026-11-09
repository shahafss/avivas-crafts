# Data Model: Aviva's Crafts Online Shop

**Feature**: `001-online-crafts-shop` | **Date**: 2026-11-07 | **Plan**: [plan.md](./plan.md)

PostgreSQL 17, defined in `src/server/db/schema/` (`catalog.ts`, `commerce.ts`, `admin.ts`, `system.ts`; Drizzle). Conventions:

- Primary keys are `uuid` with default `gen_random_uuid()` (v4) unless noted.
- Money is stored as **integer minor units** (agorot for ILS, cents for USD) in `bigint`
  columns ending in `_minor`. Currency codes are ISO 4217 (`ILS`, `USD`).
- Bilingual text uses `_he` (required) and `_en` (nullable) column pairs. Display rule
  (FR-045): show `_en` in English when non-empty, otherwise `_he`.
- `created_at` / `updated_at` are `timestamptz` with defaults, omitted from tables below.
- Every column that holds **personal data** lists its purpose and retention in the
  *Personal data register* at the end (constitution VII).

---

## Catalog

### category

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| slug | text unique | lowercase ASCII `[a-z0-9-]`, 1–60 chars; generated from the English name when given, otherwise `c-<8 random lowercase base32 chars>` (no Hebrew transliteration); editable |
| name_he | text | required, 1–80 chars |
| name_en | text null | ≤ 80 chars |
| sort_order | integer | display order 0..n−1; `UNIQUE (sort_order) DEFERRABLE INITIALLY DEFERRED`, so a reorder can rewrite every row in one transaction; re-sequenced on reorder and after a delete |

Rules: cannot be deleted while any product (any state) references it (FR-005) — enforced by
`ON DELETE RESTRICT` and a friendly pre-check.

### product

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| slug | text unique | as category slug, fallback `p-<8 random lowercase base32 chars>`; editable while draft, frozen after first publish |
| category_id | uuid FK → category | required to publish |
| name_he / name_en | text / text null | name_he 1–120 chars required to publish |
| description_he / description_en | text / text null | plain text with line breaks, ≤ 5,000 chars; description_he required to publish |
| price_ils_minor | bigint null | > 0 required to publish (₪ incl. VAT) |
| price_usd_minor | bigint null | > 0 when present; required to publish while any USD zone is enabled |
| prep_time_he / prep_time_en | text / text null | free text e.g. "כשבועיים"; prep_time_he required to publish |
| state | enum `draft` \| `published` \| `hidden` | default `draft` |
| orderable | boolean | default true; false = "not available to order right now" (FR-007) |
| published_at | timestamptz null | set on first publish; used for "newest" sort |
| search_text | text | generated: lower-cased concatenation of name/description he+en (for ILIKE search, FR-010) |

State transitions (FR-001, FR-006):

```text
draft ──publish (all required fields + ≥1 photo)──▶ published
published ──hide──▶ hidden ──unhide──▶ published
published/hidden ──move to draft──▶ draft
any ──delete (confirmed)──▶ (row deleted; order snapshots keep data)
```

Publishing is blocked with a message naming each missing field (edge case). Saving a draft
never requires fields beyond `name_he`.

Public visibility: only `published` products appear in catalog/search/sitemap; a direct link to
a `hidden`, `draft` or deleted product returns a "not available" page with HTTP 404/410.

### product_image

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| product_id | uuid FK → product ON DELETE CASCADE | |
| storage_key | text | random base key, e.g. `p/<random>`; variants are `<key>-400.webp`, `-800`, `-1600` |
| width / height | integer | of the 1600 variant |
| alt_he / alt_en | text null | optional alt text; falls back to product name |
| position | integer null | 0 = main photo (FR-003); non-deleted images are numbered 0..n−1 with no gaps; set to null when the image is soft-deleted (the remaining images are re-sequenced in the same transaction, so removing the main photo makes the next one main); `UNIQUE (product_id, position) DEFERRABLE INITIALLY DEFERRED` (nulls never clash) |
| deleted_at | timestamptz null | soft delete of an individual photo; variants purged from storage 30 days later. Deleting the product deletes all its variant files immediately (the rows cascade) |

The two deferrable unique constraints (`category.sort_order`, `product_image.position`) cannot be
declared in Drizzle's schema builder; they are added in a custom drizzle-kit migration
(`drizzle-kit generate --custom`), which is committed SQL, not runtime raw SQL.

Limits: up to 12 images per product (≥ 8 required by FR-003).

### option_group

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| product_id | uuid FK → product ON DELETE CASCADE | |
| name_he / name_en | text / text null | 1–60 chars |
| position | integer | |

### option_value

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| group_id | uuid FK → option_group ON DELETE CASCADE | |
| label_he / label_en | text / text null | 1–60 chars |
| delta_ils_minor | bigint | default 0; may be negative; base + delta MUST stay > 0 |
| delta_usd_minor | bigint null | required when the product has a USD price and delta_ils ≠ 0 |
| swatch | text null | optional colour dot on the storefront chip; CHECK one of `white, cream, beige, brown, grey, black, red, pink, orange, yellow, green, blue` (design/storefront.md §7.13a) |
| position | integer | |

Rules: a group needs ≥ 2 values to publish (FR-008). Removing a value used by a cart item
causes that cart item to be flagged at checkout (edge case); orders keep snapshots.

---

## Delivery and settings

### shipping_zone

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| code | text unique | e.g. `IL`, `WORLD` |
| name_he / name_en | text / text null | |
| currency | enum `ILS` \| `USD` | `IL` zone is ILS; other zones USD (FR-015) |
| enabled | boolean | only `IL` true at launch |
| shipping_enabled | boolean | FR-022 |
| pickup_enabled | boolean | pickup offered only in the `IL` zone |
| shipping_fee_minor | bigint | ≥ 0, in zone currency |
| free_shipping_threshold_minor | bigint null | null = never free |

### shipping_zone_country

| Column | Type | Rules |
|---|---|---|
| zone_id | uuid FK → shipping_zone | |
| country_code | char(2) PK | ISO 3166-1 alpha-2; a country belongs to at most one zone |

Seeded: zone `IL` with country `IL`.

### shop_settings (single row, `id = 1`)

| Column | Type | Rules |
|---|---|---|
| online_payment_enabled | boolean | FR-017 |
| offline_payment_enabled | boolean | at least one payment method must stay enabled |
| offline_instructions_he / _en | text / text null | Markdown subset; Bit/PayBox number, bank details, cash on pickup |
| pickup_instructions_he / _en | text / text null | location and hours (FR-023) |
| shop_name_he / shop_name_en | text / text null | the shop's public name, 1–60 chars: header wordmark, home h1, page `<title>`, © line and email sender display name (Clarifications 2026-11-08); English falls back to Hebrew; not the legal name |
| business_name_he / _en | text / text null | legal business name for the seller details (FR-047): footer, contact page, checkout seller line, Terms, order emails |
| business_reg_number | text | ע.מ. number of the VAT-registered business (FR-047) |
| business_email | text | public contact email |
| business_phone | text | public contact phone (E.164) |
| business_address_he / _en | text / text null | required in Hebrew (FR-047, distance-selling disclosure); shown in footer, Terms and order emails |
| notification_emails | text[] | 1–3 addresses that receive order/security notifications (FR-026); seeded as `{notify@example.invalid}` (a reserved domain that never delivers), which `pnpm admin:add` replaces with the first admin's Google email; never empty: removing an admin takes their Google email off the list and, if the list would become empty, puts the remaining admin's Google email in its place (contracts/server-actions.md › `removeAdmin`) |

### content_page

| Column | Type | Rules |
|---|---|---|
| slug | text PK | fixed set: `about`, `contact`, `privacy`, `terms`, `cookies`, `shipping-returns`, `accessibility` |
| title_he / title_en | text / text null | |
| body_he / body_en | text / text null | Markdown subset (R16), ≤ 50,000 chars |
| version | integer | incremented on each save **and** whenever the seed replaces the body; terms/privacy version is recorded on orders |
| owner_edited | boolean | default false; set true by the first owner save. The seed replaces the body only while it is false (and only when its text differs), so owner edits are never overwritten |

Seeded with legal drafts (FR-046). The `cookies` page also renders the device-storage table
generated from the storage registry ([contracts/device-storage.md](./contracts/device-storage.md)).

---

## Checkout and orders

### pending_checkout

Holds a checkout that is waiting for the online payment result. **It is not an order**: it does
not appear in the admin order list and triggers no notification (FR-019, US2 #5).

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | also the payment provider reference |
| resume_token_hash | bytea | SHA-256 of the token in the return/resume link |
| locale | enum `he` \| `en` | |
| zone_id | uuid FK | |
| currency | enum | |
| customer_* | (same customer columns as `orders`, all nullable) | personal data, see register; **cleared (set null) when the row becomes `confirmed` or `switched_offline`** |
| delivery_method | enum `shipping` \| `pickup` | |
| address_* | (same as `orders`, nullable) | cleared as above |
| note | text null | cleared as above |
| terms_accepted_at | timestamptz | when the visitor accepted (copied to the order) |
| marketing_opt_in_at | timestamptz null | when ticked (copied to the order) |
| marketing_opt_in | boolean | |
| terms_version / privacy_version | integer | content_page versions accepted |
| lines | jsonb null | priced line snapshots (same shape as `order_line`, incl. `prep_time_he/_en`, plus `sourceImageKey` = the product's main image `storage_key` at order time, from which the order photo is copied after confirmation); cleared on confirmation |
| subtotal_minor / delivery_fee_minor / total_minor | bigint | fixed at creation (FR-016); changed (together with `lines`) only when the visitor accepts a re-priced total on retry (contracts/server-actions.md) |
| provider | text | e.g. `payplus` |
| provider_page_id | text null | provider's payment page request id |
| state | enum `awaiting_provider` \| `confirmed` \| `failed` \| `switched_offline` \| `mismatch` | |
| last_status_check_at | timestamptz null | throttles provider status queries (≥ 5 s apart) |
| retained_until | timestamptz null | for `mismatch` rows: created + 30 days |
| order_id | uuid null FK → order | set on confirmation, or to the offline order created by a switch to offline payment (so a late online payment can be reported against that order) |
| expires_at | timestamptz | created + 48 h; then the row is deleted by the `expire-pending-checkouts` task, which runs every 5 minutes (any state except `mismatch`, which is deleted at `retained_until`) |

Transitions:

```text
awaiting_provider ──verified paid, amount+currency match──▶ confirmed (creates order, clears personal columns)
awaiting_provider ──verified paid, amount/currency differ──▶ mismatch (no order; owner emailed with contact details; kept 30 days)
awaiting_provider ──provider reports failure for the current page──▶ failed
(a visitor returning with r=failure is simply offered retry / offline payment; retry and switch accept awaiting_provider, so no state change is needed)
failed|awaiting_provider ──visitor retries──▶ awaiting_provider (re-priced first: a changed total needs the visitor's acceptance and then replaces lines/totals; old page disabled; provider_page_id = new page; last_status_check_at = null; same row)
any ──non-paid status for a page other than provider_page_id──▶ unchanged (stale)
awaiting_provider|failed ──paid status for an old page──▶ confirmed (money was taken; normal confirmation)
awaiting_provider|failed ──visitor switches to offline──▶ switched_offline (old page disabled, offline order created and stored in order_id, personal columns cleared)
confirmed ──same transaction id again──▶ confirmed (no-op, FR-019)
confirmed|switched_offline|mismatch ──visitor retries or switches──▶ unchanged (`checkout.already_completed`)
confirmed ──paid with a different transaction id──▶ confirmed (no order; owner alerted: possible double payment)
switched_offline ──late paid status──▶ switched_offline (no order; owner alerted, naming the offline order: keep the online payment for it, or refund it)
awaiting_provider|failed ──48 h──▶ final status query: paid → confirmed (as above); otherwise provider page disabled, then deleted
   (query failing → kept and retried; unverified 24 h after expires_at → owner alerted, deleted)
confirmed|switched_offline ──48 h──▶ deleted
```

Switching to offline payment from a `failed` / `awaiting_provider` checkout creates an offline
order from the stored details and marks the pending checkout `switched_offline` (no re-entry,
US2 #5).

### orders (the Order entity; table named `orders` to avoid the reserved word)

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| order_number | integer unique | from sequence `order_number_seq` starting at 1001, assigned only at confirmation (abandoned payments never consume a number; a rolled-back transaction may still skip one, which is harmless); shown as `#1001` |
| public_token_hash | bytea unique | SHA-256 of the confirmation-page link token (offline: random 32 bytes; online: `HMAC(SECRET_HMAC_KEY, 'order:' + hex(pending_checkout.resume_token_hash))`; both tokens are 32 bytes encoded base64url without padding, 43 characters) |
| public_token_expires_at | timestamptz | created + 30 days |
| locale | enum `he` \| `en` | language used while ordering (FR-029) |
| zone_id | uuid FK | |
| currency | enum `ILS` \| `USD` | one currency for all amounts (FR-015) |
| customer_name | text | 2–100 chars |
| customer_phone | text | E.164, validated with libphonenumber rules (IL at launch) |
| customer_email | text | RFC 5322 practical subset, ≤ 254 chars, lower-cased domain |
| delivery_method | enum `shipping` \| `pickup` | |
| address_country | char(2) null | required for shipping; must belong to an enabled zone (IL at launch); the checkout's "Other country" choice is UI-only and never stored |
| address_city | text null | required for shipping |
| address_line1 | text null | street and number; required for shipping |
| address_line2 | text null | apartment / floor |
| address_postal_code | text null | optional; when given: IL exactly 7 digits, other countries free-form ≤ 12 chars |
| note | text null | ≤ 1,000 chars |
| payment_method | enum `online` \| `offline` | |
| payment_state | enum `awaiting_payment` \| `paid` \| `refunded` | |
| paid_at / refunded_at | timestamptz null | |
| provider / provider_transaction_id | text null | **unique** (provider, provider_transaction_id) — idempotency |
| status | enum `new` \| `in_preparation` \| `shipped` \| `ready_for_pickup` \| `completed` \| `cancelled` | |
| tracking_number | text null | ≤ 100 chars |
| pickup_note | text null | ≤ 500 chars |
| subtotal_minor / delivery_fee_minor / total_minor | bigint | snapshot (FR-016) |
| terms_accepted_at | timestamptz | required; for online orders copied from the pending checkout |
| terms_version / privacy_version | integer | |
| marketing_opt_in | boolean | default false |
| marketing_opt_in_at | timestamptz null | set when true (FR-038); kept after a withdrawal as proof of the original consent |
| marketing_withdrawn_at | timestamptz null | set when the owner records the customer's withdrawal (`withdrawMarketingConsent`); `marketing_opt_in` is then false |
| anonymized_at | timestamptz null | set by anonymisation (FR-039/FR-040) |

Status transitions (FR-028):

```text
new → in_preparation → shipped (delivery_method=shipping) → completed
                     → ready_for_pickup (delivery_method=pickup) → completed
new → shipped | ready_for_pickup        (shortcut without in_preparation; research.md › R18)
new | in_preparation | shipped | ready_for_pickup → cancelled (confirmation required)
```

Payment transitions (FR-021):

```text
awaiting_payment ──owner marks paid──▶ paid (paid_at)
(online confirmation) ─────────────────▶ paid
paid ──owner marks refunded──▶ refunded (refunded_at)
```

Side effects: entering `shipped` or `ready_for_pickup` enqueues the customer email in
`order.locale` (FR-029). Cancelling a `paid` order shows the refund reminder (FR-030).

Anonymisation sets `customer_name = 'נמחק'`, nulls `customer_phone`, `customer_email`,
`address_city`, `address_line1`, `address_line2`, `address_postal_code`, `note`,
`tracking_number`, `pickup_note`, sets `marketing_opt_in = false`, `marketing_opt_in_at = null` and `marketing_withdrawn_at = null`, keeps amounts, lines,
dates, status and `address_country`. Columns `customer_phone` and `customer_email` are
therefore nullable at the database level, with a CHECK that they are non-null when
`anonymized_at` is null.

### order_line

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | valid v4 UUID whose first 8 hex digits encode the line's position in the order, so `ORDER BY id` lists lines in the order they were placed (there is no position column) |
| order_id | uuid FK → order ON DELETE CASCADE | |
| product_id | uuid null FK → product ON DELETE SET NULL | |
| product_name_he / product_name_en | text / text null | snapshot |
| image_key | text null | snapshot copy in private bucket `orders/<order-id>/<line-id>-400.webp` |
| options | jsonb | `[{group_he, group_en, value_he, value_en}]` snapshot |
| prep_time_he / prep_time_en | text / text null | snapshot of the product's preparation time at order time; shown per item on the order page and in the confirmation email (Clarifications 2026-11-08) |
| unit_price_minor | bigint | base + option deltas at order time, in order currency |
| quantity | integer | 1–20 |
| line_total_minor | bigint | unit × quantity |

### order_event

Order history shown on the order page (who changed status/payment and when).

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK ON DELETE CASCADE | |
| admin_id | uuid null FK → admin_user ON DELETE SET NULL | null = system/provider or a removed admin |
| kind | text | `created`, `status_changed`, `payment_marked_paid`, `payment_confirmed`, `refunded`, `customer_edited`, `anonymized`, `email_sent`, `email_failed` |
| data | jsonb | non-personal details only (e.g., from/to status) |

---

## Admin and security

### admin_user

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| display_name | text | 1–60 chars |
| google_email | text unique | lower-cased; the approved-list entry (FR-034). Removing an admin deletes the row (passkeys, recovery codes, sessions cascade); the last remaining admin cannot be removed |
| google_sub | text unique null | bound on first successful Google sign-in |
| setup_token_hash | bytea null | one-time setup link for first passkey (R6) |
| setup_token_expires_at | timestamptz null | 24 h |
| passkey_fail_count / passkey_blocked_until | integer / timestamptz null | FR-032 throttling |

### admin_passkey

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| admin_id | uuid FK ON DELETE CASCADE | |
| credential_id | bytea unique | |
| public_key | bytea | |
| counter | bigint | signature counter |
| transports | text[] | |
| backed_up | boolean | synced passkey flag (synced passkeys: accepted residual risk, research.md › R6) |
| device_label | text | e.g. "הטלפון של אביבה", 1–60 chars |
| last_used_at | timestamptz null | |
| status | enum `active` \| `pending_approval` | `pending_approval` passkeys cannot sign in; deleted after 7 days if not approved |
| registered_via | enum `setup` \| `normal` \| `recovery` | `recovery` passkeys are always created `pending_approval` (research.md › R6) |
| approved_by / approved_at | uuid null FK → admin_user ON DELETE SET NULL / timestamptz null | set when another admin approves a `pending_approval` passkey |

### admin_recovery_code

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| admin_id | uuid FK ON DELETE CASCADE | |
| code_hash | text | `scrypt$N$r$p$salt$hash` — cannot be read back (FR-033) |
| used_at | timestamptz null | |

Regenerating codes deletes the old set.

### admin_session

| Column | Type | Rules |
|---|---|---|
| token_hash | bytea PK | SHA-256 of the cookie token |
| admin_id | uuid FK ON DELETE CASCADE | |
| stage | enum `pending_passkey` \| `full` | `pending_passkey` grants access only to the passkey/recovery/enrolment endpoints |
| created_at | timestamptz | |
| last_seen_at | timestamptz | idle timeout 30 min (pending: 5 min) |
| expires_at | timestamptz | absolute 12 h |
| user_agent_summary | text | e.g. "iPhone · Safari" (shown in "my sessions"; no full UA string) |
| ended_at | timestamptz null | set when a `pending_passkey` session expires or is replaced (rows are not deleted, so the abandoned-sessions task can count them) |
| abandon_processed_at | timestamptz null | set by the abandoned-sessions task, or at once when a recovery registration (passkey left `pending_approval`) or a `no_other_admin` refusal ends the pending session, so those are never counted as abandoned sign-ins; the daily cleanup deletes pending rows only after this is set |
| purpose | text null | `sign_in` \| `recovery` \| `setup` for pending sessions |
| webauthn_challenge | text null | current WebAuthn challenge, valid 5 minutes |
| recovery_verified_at | timestamptz null | set when a recovery code was accepted; allows passkey registration for 5 minutes |
| next_path | text null | pending sessions only: validated same-origin admin path to open after the passkey step (copied from `oauth_flow.next_path`; null = `/admin`) |
| reauth_at | timestamptz null | last passkey assertion on this session (set when the `full` session is created by a passkey sign-in, and by each passkey re-check); security changes need it to be < 5 minutes old (research.md › R6) |

### oauth_flow

Short-lived Google sign-in state (alternatively an encrypted cookie; table chosen so no
server-side secret encryption code is needed).

| Column | Type | Rules |
|---|---|---|
| state_hash | bytea PK | |
| code_verifier | text | PKCE |
| nonce | text | |
| purpose | enum `sign_in` \| `recovery` \| `setup` | |
| setup_token_hash | bytea null | carried through for first-passkey setup |
| next_path | text null | admin path to return to after sign-in; only a value `safeAdminNext()` accepts (starts with `/admin`, not `/admin/sign-in*` or `/admin/setup`, no `//`, no backslash or scheme, ≤ 512 chars) |
| expires_at | timestamptz | 10 minutes; deleted on use |

### admin_activity (FR-035)

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| at | timestamptz | |
| admin_id | uuid null FK ON DELETE SET NULL | null for failed/unknown sign-ins |
| actor_kind | text | `admin` \| `unapproved_account` \| `system` (translated when displayed) |
| actor_label | text null | admin display name at the time (kept after the admin is removed); null for other kinds — **never** an unapproved account's email |
| action | text | e.g. `signin.success`, `signin.google_rejected`, `signin.passkey_failed`, `signin.blocked`, `signin.passkey_abandoned`, `signin.block_cleared`, `signin.reauth_failed`, `passkey.added`, `passkey.pending_approval`, `passkey.approved`, `passkey.rejected`, `passkey.removed`, `recovery.used`, `recovery.refused`, `admin.added`, `admin.removed`, `admin.reset`, `admin.setup_link`, `recovery.regenerated`, `session.revoked`, `category.created`, `category.updated`, `category.reordered`, `category.deleted`, `customer.updated`, `product.created`, `product.updated`, `product.price_changed`, `product.deleted`, `order.status_changed`, `order.marked_paid`, `order.refunded`, `customer.exported`, `customer.marketing_withdrawn`, `customer.anonymized`, `settings.updated`, `content.updated`, `zone.updated` |
| target_type / target_id | text null / text null | e.g. `product` / id, `order` / order number |
| details | jsonb | non-personal facts only (e.g., old/new price) |

Retention: 2 years, then deleted by the daily job.

### rate_limit_bucket

| Column | Type | Rules |
|---|---|---|
| key | text PK | `<scope>:<hmac(ip or admin id)>:<window start>` |
| count | integer | |
| expires_at | timestamptz | deleted daily after expiry |

### notification_throttle

| Column | Type | Rules |
|---|---|---|
| kind | text PK | e.g. `security.google_rejected` |
| last_sent_at | timestamptz | at most one email per kind per 15 minutes |

---

## Privacy, email, analytics, jobs

### consent_record (used only when an optional cookie category is enabled, FR-037a)

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | random consent id, also kept in the `ac_consent` cookie |
| choices | jsonb | `{analytics?: bool, marketing?: bool}` for enabled categories |
| policy_version | integer | `cookies` content_page version |
| decided_at | timestamptz | |

No IP or user agent stored. Retention: 2 years after `decided_at`.

### email_outbox

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| kind | text | see [contracts/emails.md](./contracts/emails.md) |
| to_address | text | personal data |
| locale | enum | |
| subject | text | **never contains personal data** (contracts/emails.md): a fixed text per kind, the shop name and at most the order number; kept until the row is deleted |
| reply_to | text null | contact messages only: the visitor's email, used as the `Reply-To` header; personal data; erased (set null) together with the body once sent |
| html / text_body | text | erased (set to empty) once sent; kept on `failed` rows until the row is deleted |
| order_id | uuid null FK ON DELETE SET NULL | also how a customer's data request finds owner notifications about their orders |
| dedupe_key | text unique | e.g. `order-confirmation:<order-id>` — prevents duplicates (FR-019) |
| status | enum `pending` \| `sending` \| `sent` \| `failed` | `sending` = claimed by a sender until `locked_until` |
| locked_until | timestamptz null | claim lease; an expired lease makes the row claimable again |
| attempts | integer | retry with backoff (1, 2, 5, 10, 30 min…), give up after 24 h → `failed`, visible on the order |
| next_attempt_at | timestamptz | the sender claims owner `new-order` and `security-alert` rows before other kinds with the same due time (Resend's free plan allows 100 emails/day) |
| sent_at | timestamptz null | |

Rows are deleted 30 days after `sent_at`/failure.

### analytics_daily_page / analytics_daily_referrer (FR-037)

| Table | Columns |
|---|---|
| analytics_daily_page | `day date`, `path text` (normalised, no query string), `views integer`, PK (day, path) |
| analytics_daily_referrer | `day date`, `referrer_host text` (`(direct)` when empty), `visits integer`, PK (day, referrer_host) |

No personal data. Kept indefinitely (aggregates).

### job_run

| Column | Type | Rules |
|---|---|---|
| job | text PK | one row per registered task (e.g. `outbox`, `abandoned-passkey-sessions`, `payment-recovery-sweep`, `expire-pending-checkouts`, `anonymize-old-orders`, …), inserted at loop start |
| last_started_at / last_finished_at | timestamptz | |
| last_result | text | short non-personal summary |
| locked_until | timestamptz null | run lease that prevents double runs across instances |

---

## Cart (client-side only)

Stored in `localStorage` key `ac_cart_v1` (strictly necessary, see
[contracts/device-storage.md](./contracts/device-storage.md)):

```json
{ "v": 1, "updatedAt": "2026-11-07T10:00:00Z",
  "items": [ { "productId": "uuid", "optionValueIds": ["uuid"], "quantity": 1, "addedAt": "2026-11-07T10:00:00Z" } ] }
```

Never trusted: every display and checkout calls `priceCart` on the server, which returns current
prices in the zone currency and flags lines that are unavailable (hidden/deleted/not orderable,
option value removed, missing USD price for a USD zone). Items whose `addedAt` (falling back to `updatedAt` for entries
without it) is older than 90 days are dropped; entries with non-UUID ids are dropped on read.

---

## Personal data register (constitution VII)

| Data | Where | Purpose | Retention |
|---|---|---|---|
| Customer name, phone, email | order, pending_checkout | fulfil and contact about the order; legal record of sale | order: anonymised 7 years after order date (FR-040) or on request (FR-039); pending checkout: deleted after 48 h (at most 24 h later if the provider cannot be reached for the final status check) |
| Delivery address | order, pending_checkout | deliver the order | as above |
| Note to seller | order, pending_checkout | fulfil special requests | as above |
| Marketing opt-in + date, withdrawal date | order (`marketing_opt_in`, `marketing_opt_in_at`, `marketing_withdrawn_at`), pending_checkout | proof of consent and of its withdrawal (anti-spam law) | order: with the order, cleared on anonymisation; pending checkout: deleted after 48 h |
| Terms acceptance time, terms and privacy versions | order, pending_checkout | proof of acceptance (consumer law) | order: with the order; pending checkout: deleted after 48 h |
| Order language | order | send emails in the customer's language | with the order |
| Email address and message body (outbox) | email_outbox (`to_address`, `html`, `text_body`; `subject` never holds personal data) | deliver transactional emails and contact messages | body erased on send; a `failed` row keeps its body until the row is deleted; rows deleted 30 days after sending or failure |
| Contact-form visitor email | email_outbox.reply_to | let the owner reply to a contact message | erased on send (with the body); on a `failed` row kept until the row is deleted (30 days) |
| Admin name, Google email, Google sub | admin_user | admin access control | until the admin is removed (row deleted); the display name stays in `admin_activity.actor_label` for the 2-year audit period |
| Admin passkey public keys, device labels | admin_passkey | second sign-in factor | until removed |
| Admin session summary | admin_session | session management, "my sessions" | until expiry (≤ 12 h) |
| Admin activity | admin_activity | security audit (FR-035) | 2 years |
| IP address | not stored; only a daily-rotating keyed HMAC in rate_limit_bucket | abuse protection | ≤ 24 h |
| Consent choice (random id) | consent_record, cookie | prove the cookie choice (only if optional cookies enabled) | 2 years |
| Cart, language choice | visitor device only | strictly necessary functions | cart 90 days; language 1 year |
| Checkout form inputs (name, phone, email, address, note) in `ac_checkout` | visitor device only (`sessionStorage`) | keep the form filled across the payment page round trip | the browser tab session; cleared when an order is placed or confirmed |
| All of the above (except device data) | encrypted backups in `ac-backups` | disaster recovery (constitution IV) | 30 daily copies (`db/daily/`, 30-day lifecycle) + 12 monthly copies (`db/monthly/`, 365-day lifecycle), so up to 12 months; anonymisation and deletion reach backups only as old copies expire — stated in the Privacy Policy |
| Notification email addresses (likely the admins' own) | shop_settings.notification_emails | deliver order and security notifications | until removed in settings (removing an admin also removes their address from this list; if it was the only one, the remaining admin's Google email replaces it) |
| Business details (may be Aviva's personal phone, email, address) | shop_settings | legally required seller identification (FR-047), shown publicly | while the shop operates; editable by the owner |
| Tracking number, pickup note | order (`tracking_number`, `pickup_note`) | tell the customer how to receive the order | with the order; cleared on anonymisation |
| Unresolved payment mismatch contact details | pending_checkout (`mismatch`) | let the owner contact a customer whose payment amount did not match | 30 days |
| Visitor IP addresses and request paths (incl. the order-page and payment-return tokens in URLs; setup-link tokens are in the URL fragment and never reach the server log) | Render platform request logs (not the app's own logs, which never contain them) | hosting operations and abuse diagnosis, by the hosting provider | Render's log retention for the plan (short; stated in the Privacy Policy as "a limited period") |
