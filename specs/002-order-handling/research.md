# Research: Order Handling (002)

All decisions below build on code that already exists (spec 001, frozen). Spec 001's
`research.md` (R18: status shortcut, order link), `data-model.md` and `contracts/` are background
only; where this file and spec 001 differ, this file wins for feature 002. There were no open
"NEEDS CLARIFICATION" items in the Technical Context: the spec's Clarifications (2026-11-09)
settled the product questions. What follows are the technical choices.

## R1. One status-rules module, pure and shared

- **Decision**: `src/server/orders/status.ts` holds the transition rules as plain data and pure
  functions (no database): `forwardTargets(status, deliveryMethod)`, `canMoveForward(from, to,
  deliveryMethod)`, `stepBackTarget(status, enteredFrom)`, `isOpen(status)`,
  `needsConfirmation(target)`, and the payment rules `canMarkPaid(paymentMethod, paymentState)`, `canMarkRefunded(paymentState)`,
  `canEditFulfilment(status)` (tracking number while `shipped`, pickup note while
  `ready_for_pickup`, R16). The order page uses the same functions to decide which buttons
  to show, and the server actions use them to refuse anything else (FR-008, FR-009, SC-005).
- **Rationale**: one source of truth for the page and the server, unit-testable without a
  database (old 001 task T088 is the starting point, minus the email side effects).
- **Alternatives**: a database CHECK or trigger on transitions (rejected: the "step back to where
  it came from" rule needs history, and errors from triggers are hard to turn into plain Hebrew);
  rules inline in each action (rejected: the page and the server would drift).

## R2. "Step back" target comes from the order's history

- **Decision**: In preparation → New always. Shipped / Ready for pickup → the `from` of the most
  recent `order_event` of kind `status_changed` whose `to` is the current status (New or In
  preparation). If no such event exists (data written outside the app), the target is New. Step
  back is its own action (`stepBackOrderStatus`), not a free choice of target, so the owner can
  never jump two steps back.
- **Rationale**: no schema change; the history already records every change with `{from, to}`
  (R6), and the lookup runs inside the same locked transaction as the change (R3).
- **Alternatives**: a new `previous_status` column (rejected: a migration and a second copy of
  what the history already says); allowing any earlier status (rejected by the Clarifications:
  one step back only).

## R3. Concurrency and double submission: row lock + expected state

- **Decision**: every order write (`setOrderStatus`, `stepBackOrderStatus`, `markOrderPaid`,
  `markOrderRefunded`, `updateOrderCustomer`) runs in one transaction that first reads the order
  with `SELECT … FOR UPDATE`. Status actions carry the status the page showed (`expectedStatus`).
  Then:
    - a true repeat — current status = the requested target **and** the submitted tracking number /
    pickup note (when the target takes one) equals the stored value (or, for a payment mark, the
    payment state is already the target and the method allows the mark) → `{ok: true, data:
    {changed: false}}`: nothing is written, no event, no activity (a double tap or the second of
    two identical submissions takes effect once, US2 #9); current = target but with a different
    tracking number / pickup note (a second admin's stale page) → `stale`, so the other value is
    never silently dropped;
  - current status ≠ `expectedStatus` (someone else changed it) → `formError:
    'admin.orders.errors.stale'` ("ההזמנה השתנתה הרגע. הדף מציג עכשיו את המצב העדכני."), the page
    refreshes;
  - the rules (R1) refuse the change → `formError: 'admin.orders.errors.not_allowed'`.
- **Rationale**: PostgreSQL serialises the two writers on the row lock; the second sees the
  first's result. `expectedStatus` stops a stale page from silently stepping an order back or
  forward from a status Aviva never saw (edge case "two admins at once").
- **Alternatives**: optimistic `UPDATE … WHERE status = $expected` without a lock (works for the
  status but not for the step-back history read in R2, which must see a consistent row);
  `updated_at` version tokens (more moving parts for the same result).
- **Corrections**: re-submitting Shipped / Ready for pickup on an order already in that status
  is a no-op (`changed: false`); changing the tracking number or pickup note goes through its own
  action (R16), so a typo never needs a step back.
- **Event time**: `order_event.created_at` defaults to `now()`, which in PostgreSQL is the
  transaction's start time; two transactions that wait on the lock could then record times out
  of lock order. The data layer writes `createdAt: sql\`clock_timestamp()\`` (the database clock at
  the moment of the insert, microsecond precision, after the lock is held), so history order and
  the step-back lookup (R2, which takes the latest event by `created_at`) follow the order in
  which changes really happened, even for two changes within the same millisecond.

## R4. Order-page link validity (FR-015) without a migration

- **Decision**: the loader treats a token as valid when the order is **open** (any status except
  Completed and Cancelled), or when it is closed and `public_token_expires_at > now`. The status
  action that moves an order to Completed or Cancelled sets `public_token_expires_at = now + 30
  days` in the same `UPDATE`. Order creation keeps writing `created + 30 days` (unchanged code);
  the value is simply not consulted while the order is open. Completed and Cancelled are final, so
  the expiry is never reset.
- **Rationale**: no schema change and no backfill: old orders that are still open work again
  automatically (edge case "old order links"), and no order is Completed or Cancelled before this
  feature ships (there was no way to do it).
- **Alternatives**: making the column nullable with NULL = "open" (a migration and a type change
  for no behavioural gain); a separate `closed_at` column (same).

## R5. "Order received" email failure: give up after 2 minutes, tell Aviva (FR-007, SC-009)

- **Decision**: the outbox sender (`src/server/email/sender.ts`) gets a per-kind give-up window:
  `order-confirmation` rows **that have an `order_id`** (every real confirmation; rows without one,
  such as the existing outbox tests' fixture, keep the old rule) give up at the first failed
  attempt that is both the **third attempt or later** and made **2 minutes or more** after the
  row was queued; every other kind keeps 24 hours. The attempt count stops a single late failure
  (lost kick, restart right after an order, rows pending at deploy) from giving up at once. With
  the existing retry steps (1, 2, 5 … minutes) and the one-minute job loop, attempt 2 lands in
  [1, 2) minutes and attempt 3 in [3, 5) minutes. In the **same transaction** that marks such a
  row `failed` — and only when that guarded `UPDATE … WHERE <claim still held>` really updated
  the row (checked with `.returning()`) — the sender calls `enqueueOrderEmailFailed(tx, orderId)` (new, in
  `src/server/orders/order-emails.ts`), which queues the Hebrew owner email `order-email-failed`
  to the notification addresses (dedupe key `order-email-failed:<orderId>` per recipient as in
  `enqueueToOwners`, so it goes out once; added to the sender's `PRIORITY_KINDS`). After the loop, if this pass queued any
  `order-email-failed` rows, `drainOutbox` calls `kickOutbox()` so they are sent right away
  instead of at the next tick (through a `DrainOptions` hook `onOwnerAlertQueued`, default
  `kickOutbox`, so tests pass a `vi.fn()` like the existing `driver` / `database` hooks). The
  owner email holds the order number and the admin order link, no customer details; its subject
  carries the shop name and number only.
- **Recorded as an order event**: whenever an `order-confirmation`, `order-cancelled` or
  `order-refunded` row with an `order_id` gives up (2-minute rule for the first, 24 hours for the
  others), the same guarded transaction also inserts an `order_event` of kind `email_failed`
  (already defined in spec 001's data model) with `data: {emailKind}`, `admin_id` NULL and
  `created_at = clock_timestamp()`. The admin order page reads these events, not the outbox rows,
  because spec 001 commits to deleting outbox rows 30 days after sending or failure: an
  `email_failed` event for `order-confirmation` shows the FR-007 `alert` Notice (call the
  customer, `tel:` link); one for `order-cancelled` / `order-refunded` shows a smaller `alert`
  line "מייל הביטול / ההחזר לא נשלח ללקוח" (FR-007, last sentence); the history lists them as
  system entries with their real failure time.
- **Timing (SC-009)**: queued at order time → `failed` at the third attempt, in [3, 5) minutes
  → owner email sent in the same pass → within 5 minutes. Limit: the owner email goes through
  the same email provider; if the provider itself is down, it is retried like any owner email
  (24 hours) and only the admin page warning is timely (plan.md › Risks).
- **Rationale**: the sender is the one place that knows the moment of failure; one extra branch
  there gives Aviva a quick heads-up and a durable history entry without a new table or
  service. A bounce after Resend accepted the email is not
  visible to the shop (no webhook), as the spec now says.
- **Alternatives**: a Resend bounce webhook (rejected by the spec: out of scope; a new public
  endpoint and secret); giving up on the first failure (rejected: a single network blip would
  page Aviva); polling for failed rows in a separate job (the sender already knows the moment).

## R6. History and activity records (FR-018)

- **Decision**: every change writes one `order_event` and one `admin_activity` row in the same
  transaction as the change (cancel and refund also queue their customer email there, R12):

  | Change | `order_event.kind` / `data` | `admin_activity.action` / `details` |
  |---|---|---|
  | status forward / back | `status_changed` / `{from, to, back?: true}` | `order.status_changed` / `{from, to, orderNumber}` |
  | mark paid | `payment_marked_paid` / `{}` | `order.marked_paid` / `{orderNumber}` |
  | mark refunded | `refunded` / `{}` | `order.refunded` / `{orderNumber}` |
  | customer details | `customer_edited` / `{fields: ['phone', 'address']}` | `customer.updated` / `{orderNumber, field: 'phone,address'}` |
| tracking number / pickup note edited | `fulfilment_edited` / `{field: 'trackingNumber' \| 'pickupNote'}` | `order.details_updated` / `{orderNumber, field}` |

  `target_type = 'order'`, `target_id = String(order_number)` (001 data-model). Tracking numbers,
  pickup notes and the old or new customer values are never written to either record. The
  history shows the admin's current display name (join on `admin_user`); an event with an
  `admin_id` that was set to NULL because the admin was removed shows "מנהלת שהוסרה"; `created`
  and `payment_confirmed` events show "המערכת".
- **Rationale**: `logActivity` already filters `details` to allow-listed scalar keys (`from`,
  `to`, `field`, `orderNumber`), so no change to the activity module is needed.

## R7. Orders list: filters, paging and the order-number box

- **Decision**: `/admin/orders` is a Server Component driven by query parameters: `status`
  (one of the six statuses), `payment` (one of the three payment states), `open=1` (not
  Cancelled; set only by the admin home's link, R13), `page` (1-based),
  validated with Zod; an invalid value is ignored (treated as absent). 25 rows per page with
  `LIMIT/OFFSET` and a `count(*)` for "page X of Y"; order `created_at DESC, order_number DESC`.
  Filters are `ChipLink` rows (storefront.md §7.3), paging is previous/next links that keep the
  filters. The order-number box is a plain `GET` form (`number` parameter) handled by the same
  page: the value is trimmed, a leading `#` removed, it must be 1–9 digits; a match redirects to
  `/admin/orders/<id>`, otherwise the list shows an `info` Notice "לא מצאתי הזמנה מספר {n}" with
  the current filters kept; input that is not a number shows "מספר הזמנה הוא רק ספרות, למשל
  1023". No client JavaScript on the list.
- **Rationale**: zero-JS, back-button friendly, works with the existing `ChipLink` primitives;
  at a few hundred orders a month the existing `orders_status_idx` and `orders_created_at_idx`
  are enough (no new index). An order number in a URL is not personal data.
- **Alternatives**: client-side filtering (more JS, no gain); keyset pagination (unneeded at
  this scale).

## R8. Admin order page: server page + two small islands

- **Decision**: `/admin/orders/[id]/page.tsx` renders everything on the server (items with the
  private snapshot photo at `/api/admin/media/<order_line.image_key>`, contact links, delivery,
  note, payment, history). Two client islands handle writes: `OrderActions` (status buttons, tracking / pickup note fields and their later edit, step back, payment marks, all confirmation dialogs) and
  `CustomerDetailsForm` (inside a `Disclosure` "תיקון פרטי הלקוח"). After a successful action
  the island calls `router.refresh()` and shows a `Toast`; errors show in a `Notice` (form errors)
  or under fields (field errors). The order id in the path is validated as a UUID; an unknown or
  malformed id renders the admin `not-found` page.
- **Rationale**: matches the product and settings screens (server page + island + Server
  Actions + `ActionResult`); keeps personal data out of client props except what the forms edit.
- **Alternatives**: one big client page (rejected: more data shipped to the browser).

## R9. Confirmations (FR-011, constitution II, SC-008)

- **Decision**: Completed, Cancel, mark paid and mark refunded open `ConfirmDialog` and send
  `confirm: true`; the data layer refuses exactly those four without `confirm: true` (the action schema takes
  `confirm` as an optional `true` and passes it on), so a crafted request without it fails with
  `admin.confirm_required` (contracts/server-actions.md). The cancel dialog of a **paid**
  order includes the refund reminder text before Aviva confirms; after the cancel, while the order
  is Cancelled and still `paid`, the page shows a persistent `attention` Notice "צריך להחזיר את
  הכסף" with the method (online: through the payment company's dashboard; offline: the way the
  customer paid) and the "mark refunded" button. The action also returns `refundReminder: true`.
  **Completing an unpaid offline order**: when the target is `completed`, the order is `offline`
  and `awaiting_payment`, the dialog offers "סימון כשולם והשלמה" (sends `alsoMarkPaid: true`)
  and "השלמה בלי תשלום"; with `alsoMarkPaid` the server marks it paid and completes it in one
  transaction (two events, two activity rows), refusing `alsoMarkPaid` on any other order with
  `not_allowed` (Clarifications 2026-11-09). In preparation, Shipped, Ready for pickup and step
  back need no confirmation (they can be undone
  by one step).
- **Rationale**: SC-008 holds even if the response is lost: the reminder is shown before the
  confirm and stays on the page afterwards.

## R10. Correcting customer details (FR-016)

- **Decision**: a new shared schema module `src/lib/validation/order-customer.ts` reuses the
  checkout field rules. To avoid duplicating them, the name / phone / email / address field
  definitions and the address refinement in `src/lib/validation/checkout.ts` are exported as
  reusable pieces (`contactFields`, `refineShippingAddress`) that `checkoutFormSchema` keeps using
  unchanged; the server side adds the libphonenumber check (`isValidPhone`) and the same
  normalisation as checkout (E.164 phone, lower-cased email domain), extracted from
  `src/server/checkout/validate.ts` into exported helpers. The address **country is not editable**
  (it chose the shipping zone and fee; FR-016 forbids changing amounts); city, street, apartment
  and postal code are. Pickup orders have no address fields. The shared field rules take an
  error-key map, so the correction returns its own keys `admin.orders.customer.errors.*`
  (wording aimed at Aviva, e.g. "מספר הטלפון לא נראה תקין"), which the admin client components
  can translate: the admin layout gives islands only the `admin` and `common` namespaces, so
  `checkout.errors.*` would not resolve there. An anonymised order
  (`anonymized_at` set, feature 003) refuses the edit with `admin.orders.errors.anonymized`, and
  its page says the customer can no longer be contacted.
- **Rationale**: "the same checks as at checkout" (US6) without a second copy of the rules;
  checkout behaviour is unchanged and stays covered by `tests/unit/checkout-validation.test.ts`.

## R11. Customer order page becomes a status tracker (FR-014, US4)

- **Decision**: extend the existing page (`src/app/[locale]/(shop)/order/[token]/page.tsx`) and
  loader; no new route and no new client JavaScript (still only `OrderCleanup`). A new Server
  Component `src/components/shop/OrderProgress.tsx` renders an ordered list of four steps
  (Received → Being made → Shipped *or* Ready for pickup, by delivery method → Completed) with
  `aria-current="step"` on the current one and `data-state="done|current|todo"` for styling
  (no `style` attribute, storefront.md §2). Status mapping: `new` → 1, `in_preparation` → 2,
  `shipped` / `ready_for_pickup` → 3, `completed` → 4; `cancelled` replaces the progress with an
  `info` Notice "ההזמנה בוטלה" (+ "הכסף הוחזר" when refunded) and a Contact link.
  Shipped shows the tracking number (`<bdi dir="ltr">`); Ready for pickup shows the pickup note,
  else the shop's pickup instructions, else "כתבו לי כדי לתאם איסוף" with a Contact link. Payment
  instructions show only while `offline` + `awaiting_payment` + neither Cancelled nor Completed. Exact layout in
  storefront.md §8.8 (updated in this branch, plan › Design system updates).
- **"Made" note**: In preparation always reads "being made" (also when an offline order is
  still awaiting payment, e.g. cash at pickup — Clarifications 2026-11-09); the full table is in
  plan.md › Design system updates and storefront.md §8.8.
- **Language**: the page renders in the URL's locale, and the only way to reach it is the
  email's link, which is built with `order.locale` — so it opens in the order's language
  (FR-014). The language switch stays available; it is the visitor's explicit choice
  (constitution I).
- **Freshness**: the page already renders per request (the root layout reads headers for the
  CSP nonce) and `/:locale/order/:path*` is sent with `no-store` (next.config.ts), so it shows the
  current state each time (FR-014, SC-003). No caching is added.
- **Privacy**: the loader keeps selecting the whole row server-side, but the page passes no
  address, phone or email into the markup (as today); a test asserts their absence (SC-007).

## R12. Customer emails: order received, cancelled, refunded (FR-002, SC-002)

- **Decision**: two new customer templates, both in `order.locale`, transactional, built like
  `order-confirmation.ts` with `order-parts.ts` helpers and strings in `emails.*`:
  - `order-cancelled` (`src/server/email/templates/order-cancelled.ts`): order number, "the order
    was cancelled", the items and total, and — when the order was `paid` at cancellation — that the money will be returned (online: to the card through the
    payment company; offline: the same way it was paid); when it was already `refunded`, that the
    money has already been returned; when it was never paid, that no payment was taken; the seller's details (business name, phone, email, as in the
    confirmation email). Dedupe key `order-cancelled:<orderId>`.
  - `order-refunded` (`src/server/email/templates/order-refunded.ts`): order number, "the refund
    was made", the refunded amount (the order total; refunds are always full) and the method
    sentence; the seller's details. Dedupe key `order-refunded:<orderId>`.
  Both subjects hold only the shop name and the order number (sentinel-tested, as 001). Neither
  contains the order-page link: only its hash is stored, so later emails cannot rebuild it. They
  are queued by `setOrderStatus` (target `cancelled`) and `markOrderRefunded` **inside the same
  transaction** as the change, through new helpers `enqueueOrderCancelledEmail(tx, orderId)` and
  `enqueueOrderRefundedEmail(tx, orderId)` in `src/server/orders/order-emails.ts`; skipped when
  `customer_email` is null (anonymised order). The dedupe keys make each at most once per order
  (SC-002) even if a change is repeated. The Server Action calls `kickOutbox()` after a
  successful change that queued an email. The `order-confirmation` link text changes as before
  (`emails.order.viewOrder` → "למעקב אחרי ההזמנה" / "Follow your order", plus
  `emails.order.followIntro`). No other action queues a customer email; tests assert it.
- **Rationale**: same outbox path and guarantees as 001's emails (queued with the change,
  retried, bodies erased after sending).
- **Alternatives**: sending from the client after the action (rejected: lost on failure, not
  atomic); including the order-page link (rejected: would need storing the token or a new one).

## R13. Admin home (FR-017, US7)

- **Decision**: `/admin` shows two count cards: "הזמנות חדשות" (status `new`) linking to
  `/admin/orders?status=new`, and "ממתינות לתשלום" (payment `awaiting_payment`, status not
  `cancelled`) linking to `/admin/orders?payment=awaiting_payment&open=1`. The list accepts the
  extra flag `open=1` ("not Cancelled"); it has no chip of its own, but while it is set the list
  shows it as a removable chip "בלי הזמנות שבוטלו" (one tap clears it), so the filter is visible
  and the list matches the count. With both counts at zero the page shows "אין כרגע הזמנות
  שמחכות לך" instead of zeros only (US7 #2). The settings notice lists `placeholderFields()` plus
  `pickupInstructionsHe` when pickup is enabled in any enabled zone and the Hebrew pickup
  instructions are empty (spec edge case "Ready for pickup with no pickup note and no pickup
  instructions", which relies on this notice); field names map to Hebrew labels in
  `admin.dashboard.settingsFields.*`, and the notice links to `/admin/settings`. Logic lives in
  `src/server/orders/admin-orders.ts` (`getOrderCounts()`) and `src/server/settings/settings.ts`
  (`settingsNeedingAttention()`).
- **Rationale**: the count and the list it opens must agree (US7 #1: "each linking to the orders
  list filtered accordingly"); a Cancelled order awaiting payment needs no chasing.
- **Alternatives**: silently excluding Cancelled orders from every `awaiting_payment` filter
  (rejected: a hidden rule that contradicts US1 #3, "only matching orders are shown"); an
  "open" chip on the status row (one more chip Aviva does not need day to day).

## R14. Strings and translations

- **Decision**: admin strings go in `admin.orders.*` and `admin.dashboard.*`; the customer page in `order.*`; the email link text in `emails.order.*`, the new emails in `emails.cancelled.*`, `emails.refunded.*` and (owner, Hebrew) `emails.orderEmailFailed.*`. Every key exists in both `he.json` and
  `en.json` (the i18n parity unit test enforces it; admin screens render Hebrew). Dates and times
  in the admin show Israel time (`Asia/Jerusalem`) with a small shared formatter
  `src/lib/format-date.ts` (`formatDateTime(date, locale)`), replacing nothing existing (the
  security-alert template keeps its own call).

## R15. Testing approach (constitution VI)

- **Unit** (`tests/unit/order-status.test.ts`): every allowed and refused transition, step-back
  targets, payment rules, confirmation set, `isOpen`, `canEditFulfilment`.
- **Integration on PGlite** (`tests/integration/admin-orders.test.ts` for the read side:
  list ordering, filters, paging, number lookup, detail loader (snapshot after the product is
  deleted, failed-email flag), counts; `tests/integration/order-changes.test.ts` for the writes):
  every action's effect + `order_event` + `admin_activity` (no personal data), refusals,
  idempotent repeat, stale `expectedStatus`, confirm required, refund reminder, tracking /
  pickup-note edits, exactly one `order-cancelled` / `order-refunded` row and no other outbox
  rows, link expiry set on close; `tests/integration/order-emails.test.ts`: the two new customer
  templates and the owner `order-email-failed` template (language, content, subjects without
  personal data); `tests/integration/outbox.test.ts` (extended): an `order-confirmation` row gives
  up after 2 minutes and queues `order-email-failed` once, other kinds still after 24 hours; `tests/integration/public-order.test.ts`: link validity rules (open
  order older than 30 days works, closed + 30 days does not, unknown token).
  `tests/integration/order-customer.test.ts`: correction validation and normalisation.
- **Real PostgreSQL** (`tests/integration-pg/order-concurrency.test.ts`): two connections submit
  the same status change and two different changes at once; exactly one takes effect.
- **Access control**: `tests/integration/admin-actions-guard.test.ts` and
  `tests/e2e/admin-access.spec.ts` already walk the file tree, so the new pages and actions are
  covered automatically. One small change: `admin-access.spec.ts` fills every `[id]` with a
  product id, so it learns to fill `orders/[id]` with its sentinel order's id, making the
  signed-out check hit a real order.
- **E2E** (phone projects only, as the other admin specs): `tests/e2e/admin-orders.spec.ts`
  (list, filter, number box, order page, email link through sign-in),
  `tests/e2e/admin-order-workflow.spec.ts` (forward with tracking, step back, mark paid, cancel
  paid → reminder → mark refunded, tracking-number edit, correction, exactly the cancellation and
  refund emails queued),
  `tests/e2e/admin-home.spec.ts` (counts, settings notice) and
  `tests/e2e/order-tracking.spec.ts` (added to `STOREFRONT_SPECS`, so it also runs on
  `webkit-mobile`) (the customer page after each change in Hebrew and
  English). Locally only single spec files are run (CLAUDE.md); CI runs everything.

## R16. Editing the tracking number or pickup note (FR-010, US2 #11)

- **Decision**: a separate action `updateFulfilmentDetails({orderId, expectedStatus, trackingNumber
  | pickupNote})`: allowed only while the status is `shipped` (tracking number) or
  `ready_for_pickup` (pickup note), with the same limits ("≤ 100 chars" / "≤ 500 chars", trimmed,
  `''` → null); same lock / `expectedStatus` / idempotency pattern as R3; event
  `fulfilment_edited {field}`, activity `order.details_updated {orderNumber, field}`, never the
  text; no email, no confirmation (it can be edited again). On the order page the stored value
  shows with a quiet "עריכה" button that opens the same field and a "שמירה" button.
- **Rationale**: a typo fix should not step the order back and forth (which would also add two
  misleading status entries to the history and briefly change the customer's page).
- **Alternatives**: allowing `setOrderStatus` to the current status with new fields (rejected:
  mixes "change status" and "edit details", and breaks R3's idempotency rule).

