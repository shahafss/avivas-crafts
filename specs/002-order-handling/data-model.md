# Data model: Order Handling (002)

What feature 002 adds or changes. The source of truth for the whole data model is the Drizzle
schema in `src/server/db/schema/` (here: `commerce.ts`, `system.ts`, `admin.ts`). Spec 001's
`data-model.md` is background only.

**Schema changes: none.** No migration, no new table, column, enum value or index. Every column
this feature uses already exists (`orders.status`, `payment_state`, `paid_at`, `refunded_at`,
`tracking_number`, `pickup_note`, `public_token_expires_at`, `anonymized_at`; `order_event`;
`admin_activity`; `email_outbox`). **No new personal data** is collected or stored (spec Key
Entities). What changes is how existing columns are written and read.

## orders: changed rules

| Column | Before (001) | From 002 |
|---|---|---|
| `status` | always `new` (no admin screen) | changed only by `setOrderStatus` / `stepBackOrderStatus` under the transition rules below |
| `payment_state`, `paid_at`, `refunded_at` | online confirmation only | also `markOrderPaid` (offline, `awaiting_payment` → `paid`, sets `paid_at = now`) and `markOrderRefunded` (`paid` → `refunded`, sets `refunded_at = now`); allowed in any status, including Cancelled |
| `tracking_number` | unused | set when entering `shipped` and editable while `shipped` (`updateFulfilmentDetails`, research R16) (trimmed; empty → NULL; ≤ 100 chars, already a CHECK); kept when the order steps back, so re-entering Shipped pre-fills it (FR-010) |
| `pickup_note` | unused | set when entering `ready_for_pickup` and editable while `ready_for_pickup` (trimmed; empty → NULL; ≤ 500 chars, CHECK); kept on step back |
| `public_token_expires_at` | created + 30 days; link dead after it | still written as created + 30 days at creation (code unchanged), but **consulted only once the order is closed**. Entering `completed` or `cancelled` sets it to `now + 30 days` in the same UPDATE. Link valid ⇔ status is open **or** `public_token_expires_at > now` (research R4, FR-015) |
| `customer_name`, `customer_phone`, `customer_email`, `address_city`, `address_line1`, `address_line2`, `address_postal_code` | written at checkout only | may be corrected by `updateOrderCustomer` with the checkout rules (research R10). `address_country`, `delivery_method`, lines and amounts never change. Refused when `anonymized_at` is set |

Purposes and retention of these personal fields are unchanged from spec 001 (fulfilment and the
legal record; kept for the tax period, then anonymised by feature 003's tools).

### Status transitions (FR-009, replaces 001 data-model › orders)

```text
forward
  new            → in_preparation
  new            → shipped            (delivery_method = shipping)
  new            → ready_for_pickup   (delivery_method = pickup)
  in_preparation → shipped            (shipping)
  in_preparation → ready_for_pickup   (pickup)
  shipped        → completed          (confirm)
  ready_for_pickup → completed        (confirm)
  new | in_preparation | shipped | ready_for_pickup → cancelled   (confirm)

one step back (stepBackOrderStatus)
  in_preparation → new
  shipped | ready_for_pickup → the `from` of the latest status_changed event into the current
                               status (new or in_preparation); new when there is none (R2)

final: completed, cancelled (no transition out)
```

Open statuses: `new`, `in_preparation`, `shipped`, `ready_for_pickup`. Closed: `completed`,
`cancelled`.

### Payment transitions (FR-012, FR-013)

```text
awaiting_payment ──markOrderPaid (offline orders only, confirm)──▶ paid      (paid_at)
(online confirmation, unchanged) ─────────────────────────────────▶ paid
paid ──markOrderRefunded (confirm)─────────────────────────────────▶ refunded  (refunded_at)
```

`refunded` is final. Payment marks do not change the status (a Cancelled order paid late stays Cancelled); the one
combined change is "mark paid and complete" (`setOrderStatus` with `alsoMarkPaid`, research R9),
which writes both changes and both events in one transaction. Customer emails (FR-002): entering `cancelled` queues `order-cancelled`, entering
`refunded` queues `order-refunded`, each in the same transaction and at most once per order
(dedupe key); no other status or payment change queues an email.

## order_event: kinds written from 002

| kind | Written by | `admin_id` | `data` (non-personal only) |
|---|---|---|---|
| `status_changed` | `setOrderStatus`, `stepBackOrderStatus` | acting admin | `{from, to}`; step back adds `back: true` |
| `payment_marked_paid` | `markOrderPaid` | acting admin | `{}` |
| `refunded` | `markOrderRefunded` | acting admin | `{}` |
| `customer_edited` | `updateOrderCustomer` | acting admin | `{fields: string[]}` — names only, from `name`, `phone`, `email`, `address` |
| `fulfilment_edited` | `updateFulfilmentDetails` | acting admin | `{field: 'trackingNumber' \| 'pickupNote'}` — never the text |
| `email_failed` | the outbox sender, when an `order-confirmation`, `order-cancelled` or `order-refunded` row with this `order_id` gives up | NULL (system) | `{emailKind}` — never the address |

Existing kinds `created` and `payment_confirmed` (written at order creation, `admin_id` NULL) are
shown as "system". From 002, `created_at` is written as `clock_timestamp()` after the row lock (research R3). Never in `data`: tracking numbers, pickup notes, old or new customer values
(FR-018, SC-007). `email_failed` events drive the FR-007 warnings and appear in the history as system entries
(R5); they outlive the outbox rows, which spec 001's retention deletes 30 days after failure.

## admin_activity: actions written from 002

`order.status_changed` (`details: {from, to, orderNumber}`), `order.marked_paid`
(`{orderNumber}`), `order.refunded` (`{orderNumber}`), `customer.updated`
(`{orderNumber, field: 'phone,address'}`), and the new `order.details_updated`
(`{orderNumber, field: 'trackingNumber' | 'pickupNote'}`). `target_type = 'order'`, `target_id` = the order
number as text. The first four already appear in 001's action list; the detail keys are already in
`ACTIVITY_DETAIL_KEYS`, so `src/server/activity/log.ts` is unchanged.

## email_outbox: new rows and one sender rule

- **New kinds** (queued with `enqueueEmail` inside the change's transaction; contracts/emails.md):

  | kind | To | Locale | `dedupe_key` | Queued by |
  |---|---|---|---|---|
  | `order-cancelled` | `orders.customer_email` | `orders.locale` | `order-cancelled:<orderId>` | `setOrderStatus` → `cancelled` |
  | `order-refunded` | `orders.customer_email` | `orders.locale` | `order-refunded:<orderId>` | `markOrderRefunded` |
  | `order-email-failed` | each notification address | `he` | `order-email-failed:<orderId>` (+ address hash after the first, as `enqueueToOwners`) | the sender, when an `order-confirmation` row gives up |

  All carry `order_id`. Not queued when `customer_email` is null (anonymised order). Subjects hold
  only the shop name and order number (they stay after the bodies are erased).
- **Give-up rule** (changed in `src/server/email/sender.ts`): an `order-confirmation` row **with an `order_id`** becomes `failed` at the first failed attempt
  that is the third attempt or later and made ≥ 2 minutes after `created_at` (other kinds and rows
  without `order_id`: 24 hours, unchanged); the owner email is queued only when the guarded
  failure update really updated the row, and is kicked at once; `order-email-failed` joins the priority kinds (`new-order`, `security-alert`).
- **Give-up side effects**: in the guarded give-up transaction for a row with an `order_id` of
  kind `order-confirmation`, `order-cancelled` or `order-refunded`, the sender inserts the
  `order_event` `email_failed`; for `order-confirmation` it also queues `order-email-failed`. The
  admin page reads the events, not the outbox.

## shop_settings: read only

`pickup_instructions_he/_en` (fallback on the customer page when Ready for pickup has no note),
`offline_instructions_*` (customer page while awaiting payment), and the fields checked by
`placeholderFields()` / `settingsNeedingAttention()` for the admin home.

## Derived read models (no storage)

- **AdminOrderListRow**: `id, orderNumber, createdAt, customerName, totalMinor, currency,
  paymentState, status` (contracts/server-actions.md › Data loaders).
- **AdminOrderDetail**: the order row + lines (with `imageUrl` = `/api/admin/media/<image_key>`
  or null) + history entries `{at, kind, data, actor: {kind: 'admin'|'removed_admin'|'system',
  name?}}`  + `confirmationEmailFailed: boolean` + `failedCustomerEmails: ('order-cancelled' |
  'order-refunded')[]` (both from `email_failed` events) + `allowed: {forward: Status[] (never
  'cancelled'), stepBackTo: Status | null, cancel, markPaid, markRefunded, editFulfilment:
  'trackingNumber' | 'pickupNote' | null, editCustomer}` (computed with
  `src/server/orders/status.ts`).
- **PublicOrderView** (customer page): status, payment state, payment method, delivery method,
  tracking number (only when `shipped`), pickup note (only when `ready_for_pickup`), number,
  currency, amounts, lines. The page never renders name, phone, email or address.
