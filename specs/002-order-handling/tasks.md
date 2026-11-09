---
description: "Tasks for feature 002: Order Handling"
---

# Tasks: Order Handling

**Input**: design documents in `specs/002-order-handling/` — [spec.md](spec.md), [plan.md](plan.md),
[research.md](research.md) (R1–R16), [data-model.md](data-model.md),
[contracts/](contracts/) (`server-actions.md`, `routes.md`, `emails.md`), [quickstart.md](quickstart.md).

**Tests**: required. Constitution VI makes access control on every admin route and the order
critical path mandatory tests, and plan.md › Constitution Check commits to unit, integration,
real-PostgreSQL and E2E tests. Test tasks that say "write the test first" deliver the failing test
before the code.

**Organization**: by user story (spec.md US1–US7). Old spec 001 tasks T088–T094 were the starting
material; plan.md › "Old spec 001 tasks" says what carried over and what was dropped (no
`order-shipped` / `order-ready-for-pickup` emails).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US7 from spec.md (user-story phases only)
- Paths are relative to the repository root

## Conventions for every task

- Read the contract / data-model / research section a task names before starting; constraints
  quoted in a task are binding.
- **Design system**: `docs/design/storefront.md` is binding. `§` references in tasks point into
  that file (as updated by T001). Use only the `@theme` tokens and the primitives in
  `src/components/ui/` (`Button`, `LinkButton`, `IconButton`, `ChipLink`, `ChipRow`, `Notice`,
  `Price`, `Disclosure`, `EmptyState`, `TextField`, `TextArea`, `FormField`, `ErrorSummary`,
  `ConfirmDialog`, `Toast`, `Icon`). No `style` attribute or `style` prop (nonce CSP); logical
  properties only (`ms-`, `pe-`, `start-`, `text-start`…); prices, order numbers, phones, emails
  and tracking numbers in `<bdi>` (phone/email/tracking also `dir="ltr"`); 44×44 px targets;
  `tabular-nums` (`tnum`) on numbers. Buttons are never disabled except `aria-busy` while running.
- **Strings**: every user-facing string goes into `src/i18n/messages/he.json` **and**
  `src/i18n/messages/en.json` (admin strings: Hebrew plus real English, as the existing `en.json`
  admin entries are; customer strings: real English). Tasks say which namespace. Because the two message files are shared,
  tasks that add strings are **not** [P] relative to each other.
- **Admin access**: every admin `page.tsx` and every Server Action calls `requireAdmin()` as its
  first statement (before parsing any input). Admin GET pages never change state (the
  order-number box only redirects). Data-layer writes take an `Actor` (`actorOf(context)`) and
  write `order_event` + `logActivity()` in the same transaction as the change (data-model.md).
- **No personal data** in `order_event.data`, `admin_activity.details`, logger fields, URLs or
  email subjects: never names, phones, emails, addresses, notes, tracking numbers or pickup notes
  (FR-018, SC-007).
- **Emails (FR-002, contracts/emails.md)**: only two order changes queue a customer email —
  cancel (`order-cancelled`) and mark refunded (`order-refunded`) — through the helpers in
  `src/server/orders/order-emails.ts`, inside the change's transaction, then `kickOutbox()` after
  commit; every other change queues nothing. Subjects hold only the shop name and the order
  number. Customer email strings are real Hebrew and English; owner email strings are sent in Hebrew, with a real English entry in `en.json` like the existing
  `emails.newOrder.*` keys.
- Tests that call data-layer writes insert an `admin_user` row for the `Actor` first
  (`order_event.admin_id` and `admin_activity.admin_id` reference it), e.g. with `makeActor()`
  from `tests/helpers/catalog.ts`.
- Database access uses the Drizzle query builder only (incl. `.for('update')` and
  `.returning()`); no `db.execute()`, no `sql.raw`. Data-layer functions that the
  `integration-pg` tests call on a chosen connection accept `{ database }` as their last option
  (default: the app's `db`), like `drainOutbox({ database })`.
- No data cache: no `'use cache'`, `unstable_cache`, `revalidateTag`; after a successful action
  the client island calls `router.refresh()`.
- `tests/e2e/fixtures.ts` is not edited by these tasks: specs use its helpers (`test`, `expect`,
  `resetDb`, `signInAsAdmin`, `sql`, `readOutbox`) and keep spec-specific helpers in the spec
  file. Every spec calls `resetDb()` in `test.beforeAll`. Admin E2E specs run on the phone
  projects only: `test.skip(testInfo.project.name !== 'chromium-mobile', …)` as in
  `tests/e2e/admin-products.spec.ts`.
- Shell: start every command with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`; use the test
  runner's own timeouts; never start watch mode or a dev server that does not exit. On this
  machine run **single** E2E spec files only (project CLAUDE.md); CI runs the full suite.

---

## Phase 1: Setup (design first)

**Purpose**: write the binding design for the new screens before any screen is built
(constitution › Development Workflow; plan.md › Design system updates).

- [X] T001 Update `docs/design/storefront.md` as plan.md › "Design system updates" specifies:
  (a) the header note and §1 › Scope: the document now also designs the admin order screens;
  remove "It does not design the admin area"; (b) rewrite **§8.8** as the order status page
  (h1 rule with `justPlaced`, number, payment chip with the three states, `OrderProgress` four
  steps with done / current / todo looks and `aria-current="step"`, vertical below 640 px and
  horizontal from 640 px, step 3 label by delivery method, the status-specific `Notice`s for
  Shipped / Ready for pickup / Cancelled, offline payment Notice only while awaiting payment and neither Cancelled nor Completed, the `made` Notice text per status, expired-link text without "30 days", the new
  test ids of contracts/routes.md); (c) update the **§9** "Order" row; (d) expand **§12** into
  §12.1 Frame (badge colours for the six statuses and three payment states with text labels,
  Toast, Israel time), §12.2 Orders list, §12.3 Order page, §12.4 Admin home, with the exact
  Hebrew labels listed in plan.md, every state (empty, not found, stale, error, anonymised,
  email failed (order received, cancellation, refund), refund reminder, tracking / pickup-note edit) and its acceptance checks; (e) in §7 (the `ConfirmDialog` line of §12's primitive list, or a short new §7.26) describe the
  optional secondary action of `ConfirmDialog` (button order Cancel · secondary · confirm, focus
  on Cancel); (f) add a §13 row only if a sample deviation arises (none expected). The §8.8 `made` Notice uses the status × payment table in
  plan.md word for word. Keep every existing section number stable. New text qualifies requirement ids as "002 FR-xxx" /
  "002 SC-xxx" (the file's header says unqualified ids mean spec 001).

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the rules module, shared formatting and labels every story uses.

**⚠️ No user-story work starts before this phase is done.**

- [X] T002 [P] Write `tests/unit/order-status.test.ts` first (research R1, R2; data-model.md ›
  Status transitions, Payment transitions) for `src/server/orders/status.ts`: every forward
  transition allowed exactly as data-model.md (`new → in_preparation`; `new|in_preparation →
  shipped` only when `delivery_method = shipping`; `new|in_preparation → ready_for_pickup` only
  when `pickup`; `shipped|ready_for_pickup → completed`; `new|in_preparation|shipped|
  ready_for_pickup → cancelled`) and every other pair refused (incl. anything out of
  `completed` / `cancelled`, `new → completed`, `shipped → in_preparation` as a *forward* move,
  `shipped` on a pickup order); `forwardTargets(status, deliveryMethod)` lists exactly the allowed
  status steps in display order (in_preparation, shipped|ready_for_pickup, completed) and
  **never** `cancelled`; `canCancel(status)` is true for the four open statuses only;
  `stepBackTarget('in_preparation', any) = 'new'`, `stepBackTarget('shipped'|'ready_for_pickup',
  enteredFrom)` = `enteredFrom` when it is `new` or `in_preparation`, else `new` (incl. `null`),
  and `null` for `new`, `completed`, `cancelled`; `isOpen` true for the four open statuses only;
  `needsConfirmation` true for `completed` and `cancelled` only; `canMarkPaid` only for
  `offline` + `awaiting_payment` (online never, FR-012); `canMarkRefunded` only for `paid`; `canEditFulfilment(status)` = `'trackingNumber'` for
  `shipped`, `'pickupNote'` for `ready_for_pickup`, else `null` (research R16).
- [X] T003 Implement `src/server/orders/status.ts` (pure, no `server-only` import, no database):
  exported types `OrderStatus`, `PaymentState`, `DeliveryMethod`, `PaymentMethod` (from the
  schema enums), `OPEN_STATUSES`, `forwardTargets` (never includes `cancelled`), `canCancel`, `canMoveForward`, `stepBackTarget`, `isOpen`,
  `needsConfirmation`, `canMarkPaid`, `canMarkRefunded`, `canEditFulfilment`, so T002 passes. Take the enum types
  with `import type` only (a value import from `@/server/db/schema` would pull Drizzle into a
  client bundle once an island imports this module).
- [X] T004 [P] Create `src/lib/format-date.ts` (`formatDateTime(date, locale)` and
  `formatDate(date, locale)` with `Intl.DateTimeFormat`, `timeZone: 'Asia/Jerusalem'`, he →
  `he-IL`, en → `en-GB`, 24-hour clock; research R14) with `tests/unit/format-date.test.ts`
  written first (a UTC instant on both sides of Israel's DST change renders the right local
  date and time in both locales).
- [X] T005 Add the shared admin order labels to `admin.orders` in `he.json` / `en.json`
  (`status.{new,in_preparation,shipped,ready_for_pickup,completed,cancelled}` = "חדשה", "בהכנה",
  "נשלחה", "מוכנה לאיסוף", "הושלמה", "בוטלה"; `payment.{awaiting_payment,paid,refunded}` =
  "ממתין לתשלום", "שולם", "הוחזר"; `paymentMethod.{online,offline}`;
  `delivery.{shipping,pickup}`) and create `src/components/admin/OrderStatusBadge.tsx` (Server
  Component: `<OrderStatusBadge status>` and `<PaymentStateBadge state>`, badge looks from
  storefront.md §12.1, text label always present).

**Checkpoint**: rules, dates and badges ready.

---

## Phase 3: User Story 1 — Aviva sees and opens her orders (Priority: P1) 🎯 MVP

**Goal**: orders list with filters, paging and the number box; a read-only order page with
everything needed to make and send the piece; the owner email link works through sign-in.

**Independent Test**: spec.md US1 › Independent Test; quickstart.md steps 1–2 and 11.

### Tests for User Story 1 (write first, must fail)

- [X] T006 [P] [US1] Write `tests/integration/admin-orders.test.ts` (PGlite; mocks of
  `@/server/db/client`, `@/server/env` and storage as in `tests/integration/place-order.test.ts`
  and `tests/helpers/checkout.ts`; create orders through `insertOrder()` from
  `src/server/orders/create-order.ts` so lines, events and outbox rows are real) for
  `src/server/orders/admin-orders.ts` (contracts/server-actions.md › Data loaders):
  `listOrders` returns newest first (`created_at DESC, order_number DESC`), 25 per page with
  `page`, `pageCount`, `total`; filters by `status`, by `payment`, by both, and `open: true`
  excludes `cancelled`; a page beyond the last returns the last page; `findOrderIdByNumber`
  returns `{id}` for `"1023"` and `" #1023 "`, `{invalid: true}` for `"abc"`, `""`, `"#"` and 10+
  digits, and `{notFound: 99999}` for an unknown number; `getOrderDetail` returns lines in `ORDER BY id` order with `imageUrl =
  "/api/admin/media/" + image_key` (or null), the snapshot name/options/price unchanged after the
  product is deleted (US1 #8), history newest first with actor kinds `system` (created /
  payment_confirmed), `admin` (display name) and `removed_admin` (admin row deleted),
  `confirmationEmailFailed` true only when the order has an `order_event` `email_failed` with
  `emailKind 'order-confirmation'`, `failedCustomerEmails` listing the `email_failed` events for
  `order-cancelled` / `order-refunded` (research R5), and those events in the history as system
  entries, and `allowed` computed from
  `status.ts` (`allowed.forward` never contains `cancelled`; `allowed.cancel` is separate;
  `allowed.editFulfilment` from `canEditFulfilment`); an unknown or malformed id returns null.
- [X] T007 [P] [US1] Write `tests/e2e/admin-orders.spec.ts` (phone projects only; contracts/routes.md;
  storefront.md §12.2, §12.3): place one offline order through the storefront checkout (so its line has a
  real snapshot photo) and seed the rest with the spec's own SQL helper (offline orders in
  different statuses and payment states, one online paid order, distinct `created_at`; SQL lines
  have no photo); sign in;
  `/admin/orders` lists them newest first with number, date, name, total, payment and status;
  the status chip and the payment chip filter, both together, "ניקוי הסינון" clears; with 26+
  orders paging keeps the filter; the number box opens an order for `1002` and `#1002`, and for
  `99999` shows the not-found Notice and stays on the list; the storefront-placed order's page shows its item photo (an SQL-seeded line shows the empty
  `photo` well); the order page shows items with options, quantity, unit price, line total, preparation time, totals, `tel:` and
  `mailto:` links, address or "איסוף עצמי", note, payment method and state, history; an order
  whose `order-confirmation` outbox row is `failed` shows the call-the-customer alert; a filter
  with no match shows "אין הזמנות שמתאימות לסינון" with a clear link;
  `/admin/orders/<random uuid>` and `/admin/orders/not-a-uuid` show the admin not-found page; a
  link page served with `page.route` at `http://127.0.0.1:4999/mail.html` (a different site,
  standing in for webmail) links to `/admin/orders/<id>`: clicking it while signed in opens the
  order, and in a signed-out context leads to `/admin/sign-in?next=…` and, after
  `signInAsAdmin(page, {fromCurrentPage: true})`, to that same order (FR-001, US1 #7); axe
  (`@axe-core/playwright`, WCAG 2.1 A/AA) reports no violations on the list and the order page.

- [X] T008 [P] [US1] Write the order-email failure tests first (002 FR-007, SC-009;
  research R5; contracts/emails.md › `order-confirmation` give-up rule, `order-email-failed`):
  extend `tests/integration/outbox.test.ts` — setup: add `APP_ORIGIN` to its `@/server/env` mock,
  seed settings with `runSeed()` and create a real order with `insertOrder()` (or a raw insert
  into the seeded zone as `tests/e2e/admin-access.spec.ts` does) so the row has a valid
  `order_id`; keep the existing `base` row (no `order_id`) untouched. With a driver that always
  fails, that order's `order-confirmation` row: stays `pending` after attempt 1 (+0) and attempt 2
  (+1.9 min), and becomes `failed` at attempt 3 (+4.9 min, jittered ticks); a row whose first
  attempt only happens at +3 min is still `pending` after that single failure (attempt-count
  rule); when it gives up, one `order-email-failed` row per notification address is queued
  (Hebrew, `order_id` set, dedupe key `order-email-failed:<orderId>` for the first address) and
  an `order_event` `email_failed {emailKind: 'order-confirmation'}` with `admin_id` NULL is
  written, and the `onOwnerAlertQueued` hook passed as a `vi.fn()` in `DrainOptions` is called
  once (never let the real `kickOutbox` run in this test) — running the drain again queues no
  second owner email and no second event, and nothing is queued or recorded when the guarded
  failure update did not change the row (another sender's claim); an `order-cancelled` row with
  an `order_id` that fails until 24 hours records one `email_failed {emailKind:
  'order-cancelled'}` event and queues no owner email;
  the existing "retries at 1, 2, 5, 10, 30, 60 minutes" case (row without `order_id`) still
  passes unchanged; other kinds (e.g. `new-order`, `order-cancelled`) still stay `pending` until
  24 hours; a due `order-email-failed` row is claimed before other due rows. Create
  `tests/integration/order-emails.test.ts` (PGlite; mocks as in
  `tests/integration/place-order.test.ts`) with the `order-email-failed` template cases: Hebrew,
  `dir="rtl"`, contains the order number and the `/admin/orders/<id>` link, and neither subject
  nor body contains the customer's name, phone, email or address (sentinel values).

### Implementation for User Story 1

- [X] T009 [US1] Implement `src/server/orders/admin-orders.ts` (`import 'server-only'`):
  `listOrders`, `findOrderIdByNumber`, `getOrderDetail` and the types `AdminOrderListRow`,
  `AdminOrderDetail` exactly as data-model.md › Derived read models and contracts/server-actions.md
  › Data loaders (page size 25; filters validated by the caller; `getOrderDetail` joins
  `admin_user` for display names, reads the order's `email_failed` events for the three customer email kinds, and computes `allowed` with `src/server/orders/status.ts`), so T006 passes.
- [X] T010 [US1] Implement the order-email failure path (research R5; contracts/emails.md):
  `src/server/email/templates/order-email-failed.ts` (strings `emails.orderEmailFailed.*` in `he.json` and `en.json`), `enqueueOrderEmailFailed(tx, orderId)` in
  `src/server/orders/order-emails.ts` (through `enqueueToOwners`, base key
  `order-email-failed:<orderId>`), and in `src/server/email/sender.ts`: the give-up rule of contracts/emails.md (an `order-confirmation` row with an `order_id` gives
  up at the first failed attempt that is the third or later and ≥ 2 minutes after `created_at`;
  everything else keeps 24 hours); for a give-up of an `order-confirmation`, `order-cancelled` or `order-refunded` row with an
  `order_id`, run the guarded failure `UPDATE … WHERE <claim still held> RETURNING id` and, only
  if it returned the row, in the **same** transaction on `database` insert the `order_event`
  `email_failed {emailKind}` (`admin_id` NULL, `createdAt: sql\`clock_timestamp()\``) and, for
  `order-confirmation` only, `enqueueOrderEmailFailed`; add the `DrainOptions` hook
  `onOwnerAlertQueued?: () => void` (default `kickOutbox`) and call it after the send loop if any
  owner email was queued in this pass; add `order-email-failed` to `PRIORITY_KINDS`. Existing `tests/integration/outbox.test.ts` and
  `tests/integration-pg/outbox-concurrency.test.ts` cases keep passing; T008 passes.

- [X] T011 [US1] Create `src/app/admin/(protected)/orders/page.tsx` (contracts/routes.md ›
  `GET /admin/orders`; research R7; storefront.md §12.2): `requireAdmin()` first; parse `status`, `payment`, `open`, `page`, `number` with Zod (invalid → ignored; an empty
  `number` after trimming counts as absent); `number` present →
  `findOrderIdByNumber` → `redirect('/admin/orders/<id>')`, or an `info` Notice "לא מצאתי הזמנה
  מספר {number}", or for non-numeric input "מספר הזמנה הוא רק ספרות, למשל 1023", filters kept; number-box `GET` form (label "מעבר להזמנה לפי מספר",
  `inputmode="numeric"`, `enterkeyhint="go"`); status and payment `ChipRow`s of `ChipLink`s with
  "הכול" and `aria-current`; the removable "בלי הזמנות שבוטלו" chip while `open=1`; "ניקוי
  הסינון"; cards (one link each) with `#number`, date via `formatDateTime`, customer name, total
  via `Price`, `OrderStatusBadge` + `PaymentStateBadge`; paging links keeping the filters with
  directional chevrons; empty state "אין הזמנות שמתאימות לסינון". Zero client JS. Strings in
  `admin.orders.list.*`.
- [X] T012 [US1] Create `src/app/admin/(protected)/orders/[id]/page.tsx` (contracts/routes.md ›
  `GET /admin/orders/[id]`; storefront.md §12.3) — read-only part: `requireAdmin()` first; id
  not a UUID or `getOrderDetail` null → `notFound()`; header (number, date, badges); alerts: the
  FR-007 `alert` Notice when `confirmationEmailFailed` ("הלקוח לא קיבל את מייל ההזמנה. כדאי
  להתקשר" + `tel:` link), an `alert` line "מייל הביטול לא נשלח ללקוח" / "מייל ההחזר לא נשלח ללקוח" for each entry of
  `failedCustomerEmails`, the `info` Notice "לא ניתן ליצור קשר עם הלקוח" when `anonymizedAt` is
  set; items (`<img src={imageUrl}>` in a 72×90 `photo` well, or the empty well when `imageUrl` is
  null, `alt=""`, `width`/`height`,
  `loading="lazy"`, `decoding="async"`, never `next/image`; name via `pick('he', …)`, options
  "{group}: {value}", quantity × unit price, line total, "זמן הכנה: {prepTime}"), subtotal,
  delivery fee, total; customer name, phone (`tel:`) and email (`mailto:`) as 44 px
  `LinkButton`s with `phone` / `mail` icons in `<bdi dir="ltr">`; delivery method with the
  address lines or "איסוף עצמי"; note (`whitespace-pre-line`, `dir="auto"`); payment method,
  state, "שולם ב־{date}" / "הוחזר ב־{date}"; tracking number / pickup note when set; history
  `<ol>` "{date} · {what} · {who}" (`admin.orders.history.*` for each event kind incl. `back` and
  `fulfilment_edited`, `admin.orders.history.emailFailed.{order-confirmation,order-cancelled,order-refunded}` for the
  `email_failed` events, and actor labels "המערכת" / "מנהלת
  שהוסרה"). Leave a clearly marked slot for the actions panel
  (T018) and the correction form (T041). Strings in `admin.orders.detail.*`. T006 and the US1
  part of T007 pass.

**Checkpoint**: Aviva can find and read any order on her phone; the email link works.

---

## Phase 4: User Story 2 — Aviva moves an order forward (Priority: P1)

**Goal**: status forward (with the New → Shipped / Ready shortcut), tracking number / pickup
note, Completed with confirmation, one step back; safe under double taps and two admins.

**Independent Test**: spec.md US2 › Independent Test; quickstart.md step 3.

### Tests for User Story 2 (write first, must fail)

- [X] T013 [P] [US2] Write `tests/integration/order-changes.test.ts` (PGlite; mocks and order
  creation as in `tests/integration/place-order.test.ts`) — status part, for
  `setOrderStatus` / `stepBackOrderStatus` in `src/server/orders/order-changes.ts`
  (contracts/server-actions.md): each allowed forward move updates `status`, writes one
  `order_event` `status_changed {from, to}` with the admin's id and one `admin_activity`
  `order.status_changed {from, to, orderNumber}` with `target_type 'order'` and `target_id` =
  order number; `shipped` stores `trackingNumber` (trimmed, `''` → null, "≤ 100 chars", 101 →
  field error `admin.orders.errors.tracking_too_long`), `ready_for_pickup` stores `pickupNote`
  ("≤ 500 chars", 501 → `admin.orders.errors.pickup_note_too_long`); `ready_for_pickup` on a
  shipping order and `shipped` on a pickup order → `admin.orders.errors.not_allowed`; `completed`
  without `confirm: true` in its input (signatures: contracts/server-actions.md › Data-layer
  functions) → `admin.confirm_required`, with it → Completed and
  `public_token_expires_at` ≈ now + 30 days (research R4); anything out of Completed → `not_allowed`; `completed` with `alsoMarkPaid: true` on an offline
  order awaiting payment → Completed **and** paid with `paid_at`, two events (`status_changed`,
  `payment_marked_paid`) and two activity rows, no email; `alsoMarkPaid` on an online or already
  paid order, or with another target → `not_allowed` and nothing changes; step back: in_preparation → new; new → shipped → back → new; new →
  in_preparation → shipped → back → in_preparation (event `back: true`); tracking number kept
  after step back; re-entering Shipped stores exactly the submitted `trackingNumber` (the form
  pre-fills the old value; an empty submission clears it to null); repeating the same request → `{changed: false}` and no new event or activity (US2 #9); a
  Shipped order receiving `to: 'shipped'` with a *different* tracking number (a second admin's
  stale page, `expectedStatus 'in_preparation'`) → `stale` and the stored number unchanged; `expectedStatus` that no longer matches (and current ≠ target) →
  `admin.orders.errors.stale` and nothing written; unknown id → `admin.orders.errors.not_found`;
  `email_outbox` row count unchanged after every call except a cancel (whose email US5 adds;
  FR-002, SC-002); `updateFulfilmentDetails` (research R16): on a Shipped order a new tracking
  number is stored, status unchanged, event `fulfilment_edited {field: 'trackingNumber'}` and
  activity `order.details_updated {orderNumber, field}`, the same value again → `{changed:
  false}`, 101 chars → `tracking_too_long`, `pickupNote` on a Shipped order → `not_allowed`, an
  order that is no longer Shipped (`expectedStatus` mismatch) → `stale`; the same for the pickup
  note on a Ready for pickup order; no email queued; no tracking number or
  pickup note text appears in any `order_event.data` or `admin_activity.details` (sentinel
  values, FR-018).
- [X] T014 [P] [US2] Write `tests/integration-pg/order-concurrency.test.ts` (real PostgreSQL, two
  connections, pattern of `tests/integration-pg/payment-concurrency.test.ts`): two simultaneous
  `setOrderStatus(new → in_preparation)` calls on connections A and B → exactly one
  `status_changed` event and one activity row, both calls `ok`; simultaneous `new →
  in_preparation` (A) and `new → shipped` (B) both with `expectedStatus 'new'` → exactly one call
  returns `{ok: true, changed: true}` and the other `admin.orders.errors.stale`; the final status
  is the winner's target and exactly one `status_changed` event exists.

### Implementation for User Story 2

- [X] T015 [US2] Implement `setOrderStatus`, `stepBackOrderStatus` and `updateFulfilmentDetails` in
  `src/server/orders/order-changes.ts` (`import 'server-only'`; research R2, R3, R4, R6;
  contracts/server-actions.md): refuse `completed` / `cancelled` without
  `confirm: true` (`admin.confirm_required`) before touching the database; one transaction;
  `select … from orders where id = $1 for update`; then the checks in the contract's order
  (not found → idempotent → stale → rules → field lengths, returning
  `admin.orders.errors.tracking_too_long` / `pickup_note_too_long` as field errors); step-back target from the
  latest `status_changed` event whose `data.to` is the current status (read inside the same
  transaction); the UPDATE sets `status`, `updated_at`, `tracking_number` (shipped only),
  `pickup_note` (ready only), `public_token_expires_at = now + 30 days` (completed / cancelled
  only); insert `order_event` with `createdAt: sql\`clock_timestamp()\`` (research R3; not `new Date()`,
  whose millisecond precision can tie) and
  `logActivity()`; return `{changed, status, refundReminder}`
  (`refundReminder` true when the target is `cancelled` and `payment_state = 'paid'`; with
  `alsoMarkPaid` the same transaction also sets `payment_state = 'paid'`, `paid_at`, and writes
  the payment event and activity, after checking `canMarkPaid`); accept
  `{ database }` as the last option. `updateFulfilmentDetails` follows the same lock /
  `expectedStatus` / idempotency pattern with `canEditFulfilment` (research R16). No email yet
  (cancel's email is T035). T013 and T014 pass.
- [X] T016 [US2] Create `src/app/admin/(protected)/orders/[id]/actions.ts` with
  `setOrderStatus(input)`, `stepBackOrderStatus(input)` and `updateFulfilmentDetails(input)`
  (`'use server'`; `requireAdmin()`
  first; Zod: `orderId` uuid, `expectedStatus` / `to` enums, `trackingNumber` / `pickupNote`
  optional strings (the length limits "≤ 100 chars" / "≤ 500 chars" are checked by the data layer
  so they come back as field errors), `confirm` optional `true`, `alsoMarkPaid` optional `true`; a missing `confirm` for
  `completed` / `cancelled` → `admin.confirm_required`; malformed → `admin.orders.errors.invalid`
  or `not_found`); then call the data layer with
  `actorOf(context)`. Add the error strings to `admin.orders.errors.*` ("ההזמנה השתנתה הרגע.
  הדף מציג עכשיו את המצב העדכני.", "אי אפשר לעשות את זה בהזמנה הזאת.", "לא מצאתי את ההזמנה.",
  "אפשר עד 100 תווים", "אפשר עד 500 תווים"). `tests/integration/admin-actions-guard.test.ts`
  picks the file up without edits and passes.
- [X] T017 [US2] Write the status part of `tests/e2e/admin-order-workflow.spec.ts` first (phone
  projects only; storefront.md §12.3). The file runs its tests in order on shared state
  (`test.describe.configure({ mode: 'serial' })`) and uses one order per flow, placed through the
  storefront offline checkout in `test.beforeAll` (spec-local helper, as
  `tests/e2e/checkout-offline.spec.ts` does): **A** shipping (forward / back / complete and pay),
  **B** pickup (Ready with a note, then complete without payment), **C** shipping (Shipped with a
  tracking number, then the tracking edit), **D** shipping (payments, US3), **E** and **F**
  (cancel, US5), **G** (customer details, US6). This task covers A–C: on New order A the status
  steps offered are only "בהכנה" and "נשלחה" (never "מוכנה לאיסוף"; the cancel button arrives
  with US5, T036); two quick taps on "בהכנה" create one history entry; → "נשלחה" with tracking
  number `RR123456789IL` → shown on the page → "חזרה שלב אחד" → back to "בהכנה" → "נשלחה" again
  shows the number pre-filled → "הושלמה" opens the dialog, Cancel changes nothing, and because A
  is offline and unpaid the dialog offers "סימון כשולם והשלמה" and "השלמה בלי תשלום"; "סימון
  כשולם והשלמה" makes A "הושלמה" and "שולם" (two history entries) with no status button left;
  pickup order B → "מוכנה לאיסוף" with a note (never "נשלחה") → "עריכה" next to the note, a
  corrected note is saved, status unchanged → "הושלמה" → "השלמה בלי תשלום": completed, payment
  still "ממתין לתשלום"; order C → "נשלחה" with a number → "עריכה" → corrected number saved and
  shown, status stays "נשלחה", history says the tracking number changed (without the number);
  every change is in the history; `readOutbox('order-confirmation')` has exactly one row per
  order and no other customer-addressed rows exist.
- [X] T018 [US2] Create `src/components/admin/OrderActions.tsx` (client island; storefront.md
  §12.3 actions panel) — status part — and mount it in
  `src/app/admin/(protected)/orders/[id]/page.tsx`: props are the order id, `status`,
  `deliveryMethod`, stored `trackingNumber` / `pickupNote`, `paymentState` and the `allowed`
  object (no other personal data); the main next step as the primary button
  (New → "בהכנה"; In preparation → "נשלחה" or "מוכנה לאיסוף"; Shipped / Ready → "הושלמה"), other forward
  steps as secondary buttons, "חזרה שלב אחד" as a quiet button when `stepBackTo` is set; choosing
  "נשלחה" / "מוכנה לאיסוף" reveals `TextField` "מספר משלוח (לא חובה)" (max 100, `dir="ltr"`) or
  `TextArea` "הערה לאיסוף (לא חובה)" (max 500) pre-filled with the stored value and a "שמירה"
  button; "הושלמה" opens `ConfirmDialog` (for an offline order awaiting payment it has the two choices
  "סימון כשולם והשלמה" → `alsoMarkPaid: true`, and "השלמה בלי תשלום"): add optional
  `secondaryLabel` / `onSecondary` props to `src/components/ui/ConfirmDialog.tsx` (a secondary
  button between Cancel and the confirm button, same busy handling; focus still starts on
  Cancel; existing callers unchanged), as storefront.md §7 describes after T001; every call sends `expectedStatus`; busy state via
  `aria-busy`; success → `Toast` + `router.refresh()`; `stale` and `not_allowed` → `Notice` + `router.refresh()` (so a stale page corrects
  itself);
  field errors under the field; when `allowed.editFulfilment` is set, the stored tracking number /
  pickup note shows with a quiet "עריכה" button that opens the same field with "שמירה" and calls
  `updateFulfilmentDetails`. Strings in `admin.orders.actions.*`. T017 passes.

**Checkpoint**: US1 + US2 = Aviva can run her daily fulfilment from the admin area.

---

## Phase 5: User Story 3 — Aviva records payments (Priority: P1)

**Goal**: mark offline orders paid and paid orders refunded, each with confirmation.

**Independent Test**: spec.md US3 › Independent Test; quickstart.md step 4.

### Tests for User Story 3 (write first, must fail)

- [X] T019 [US3] Extend `tests/integration/order-changes.test.ts` first with the payment part
  (contracts/server-actions.md › `markOrderPaid`, `markOrderRefunded`): offline
  `awaiting_payment` → paid with `paid_at` set, event `payment_marked_paid`, activity
  `order.marked_paid {orderNumber}`; works on a Cancelled order and leaves the status Cancelled
  (edge case "late payment"); online order (created paid) → `not_allowed`, checked before idempotency; an offline order
  already paid → `{changed: false}`;
  `refunded` → `not_allowed` for mark paid; paid (online or offline) → refunded with
  `refunded_at`, event `refunded`, activity `order.refunded`; `awaiting_payment` → refund
  `not_allowed`; already refunded → `{changed: false}`; both without `confirm: true` →
  `admin.confirm_required` and nothing changes (`confirm` is part of the input, contracts/
  server-actions.md › Data-layer functions); mark paid queues no email; mark refunded queues
  exactly one `order-refunded` row (to `customer_email`, `order.locale`), a repeated refund
  queues none, and an order with `customer_email` null (anonymised) queues none.
- [X] T020 [P] [US3] Extend `tests/integration/order-emails.test.ts` first with
  `order-refunded` (contracts/emails.md): Hebrew and English orders → `lang`/`dir` match
  `order.locale`, the body has the order number, the refunded amount via `formatMoney` in the
  order's currency, the online or offline method sentence, the seller block; the subject holds
  only the shop name and the order number (sentinel name, email, phone, address absent).
- [X] T021 [US3] Extend `tests/e2e/admin-order-workflow.spec.ts` first (after T017, same file):
  on order D mark paid (dialog: Cancel changes nothing, Confirm) → "שולם" with date and time;
  mark it refunded → "הוחזר" with date; an online paid order never shows "סימון כשולם"; an
  awaiting-payment order never shows "סימון כהוחזר"; after the refund
  `readOutbox('order-refunded')` has one row for the order in its language, and the refund dialog
  says the customer will get an email.

### Implementation for User Story 3

- [X] T022 [US3] Extract the seller block (business name, registration line, address, phone,
  email) from `src/server/email/templates/order-confirmation.ts` into `sellerParts(settings,
  locale)` in `src/server/email/templates/order-parts.ts` (confirmation output unchanged; the
  existing `place-order.test.ts` body checks still pass); create
  `src/server/email/templates/order-refunded.ts` using it (strings
  `emails.refunded.*` in Hebrew and English) and `enqueueOrderRefundedEmail(tx, orderId)` in
  `src/server/orders/order-emails.ts` (customer address and `order.locale`, dedupe key
  `order-refunded:<orderId>`, skipped when `customer_email` is null), so T020 passes.
- [X] T023 [US3] Implement `markOrderPaid` and `markOrderRefunded` in
  `src/server/orders/order-changes.ts` (same transaction pattern as T015, `confirm: true`
  required first, rules from `canMarkPaid` / `canMarkRefunded`, `{ database }` option) and the
  two wrappers in `src/app/admin/(protected)/orders/[id]/actions.ts` (`requireAdmin()` first;
  `orderId` uuid, `confirm` optional `true`, missing → `admin.confirm_required`);
  `markOrderRefunded` calls `enqueueOrderRefundedEmail` inside its transaction and the action
  calls `kickOutbox()` after a successful change, so T019 passes.
- [X] T024 [US3] Add the payment part to `src/components/admin/OrderActions.tsx`: "סימון כשולם"
  only when `allowed.markPaid`, "סימון כהוחזר" only when `allowed.markRefunded`, each through
  `ConfirmDialog` (texts: "לסמן שהתשלום התקבל? אי אפשר לבטל את זה." / "לסמן שהכסף הוחזר ללקוח?
  הלקוח יקבל על כך מייל. אי אפשר לבטל את זה."), Toast + refresh; strings in `admin.orders.actions.*`. T021 passes.

**Checkpoint**: P1 stories for Aviva complete.

---

## Phase 6: User Story 4 — The customer follows their order (Priority: P1)

**Goal**: the existing order page becomes a status tracker; its link lives while the order is
open plus 30 days after it closes; the one email says so.

**Independent Test**: spec.md US4 › Independent Test; quickstart.md steps 8–10.

### Tests for User Story 4 (write first, must fail)

- [X] T025 [P] [US4] Write `tests/integration/public-order.test.ts` (PGlite; mocks and order
  creation as in `tests/integration/place-order.test.ts`) for `getOrderByToken` in
  `src/server/orders/public-order.ts` (data-model.md › orders, `public_token_expires_at`;
  research R4): an open order whose `public_token_expires_at` is in the past still resolves
  (edge case "old order links"); a Completed / Cancelled order resolves while
  `public_token_expires_at > now` and returns null after it; an unknown token and a token not
  matching `TOKEN_PATTERN` return null; `justPlaced` unchanged (true within 1 hour of
  `created_at`).
- [X] T026 [P] [US4] Write `tests/e2e/order-tracking.spec.ts` (storefront.md §8.8;
  contracts/routes.md). Add `order-tracking` to `STOREFRONT_SPECS` in `playwright.config.ts` so
  the spec runs on the storefront phone projects including `webkit-mobile` (no CI matrix
  change), and skip the desktop project with `test.skip(testInfo.project.name ===
  'chromium-desktop', 'customer order page: phone projects')`. Place an offline shipping order in
  Hebrew and an offline pickup order in English through the storefront; read each order link from
  its `order-confirmation` outbox row (the link text is the new "למעקב אחרי ההזמנה" / "Follow
  your order"); move each order with the spec's own SQL (status, payment, `tracking_number`,
  `pickup_note`, and an `order_event` row for each move) and reload: `order-progress` shows the
  current step with `aria-current="step"` (Received → Being made → Shipped / Ready for pickup →
  Completed, in the order's language), `order-payment-state` changes from awaiting to paid and
  the `offline-instructions` disappear once paid and on a Completed order that is still unpaid, `order-tracking-number` when Shipped,
  `order-pickup-note` (or the settings' pickup instructions when the note is null, or — with
  neither — the "כתבו לי כדי לתאם איסוף" fallback, all inside `order-pickup-note`) when Ready
  for pickup, `order-cancelled` with the seller's phone and email links and the Contact link
  ("the money will be returned" while still paid, "refunded" once refunded), no progress and no "ממתין לתשלום" chip when
  Cancelled, the `made` Notice follows the table in storefront.md §8.8 (incl.
  hidden when Cancelled), a stepped-back order shows its current status; the page HTML never
  contains the customer's name, phone, email, city or street (SC-007); a Completed order whose
  `public_token_expires_at` is set to yesterday shows "הקישור כבר לא פעיל" with a Contact link;
  an open order with `created_at` and `public_token_expires_at` 40 days in the past still opens;
  a New unpaid order shows "קיבלתי את ההזמנה ואתחיל לעבוד עליה בקרוב." / "I got your order and
  will start on it soon."; an In preparation order that still awaits payment shows the "being
  made" text (not "I'll start
  once payment arrives"); `dir`/`lang` are `rtl`/`he` and `ltr`/`en`; no horizontal overflow at 375 px; axe reports no
  violations; existing test ids (`order-number`, `order-line`, `order-prep-time`,
  `order-summary`) still present.
- [X] T027 [P] [US4] Extend the `order-confirmation` body assertions in
  `tests/integration/place-order.test.ts` first (around the existing `toContain('/he/order/')`
  checks; the file only creates a Hebrew order today, so also place an English (`locale: 'en'`)
  order): the body contains the `emails.order.followIntro` sentence
  and the link text "למעקב אחרי ההזמנה" / "Follow your order" (contracts/emails.md).

### Implementation for User Story 4

- [X] T028 [US4] Change `getOrderByToken` in `src/server/orders/public-order.ts`: valid ⇔
  `isOpen(order.status)` (from `src/server/orders/status.ts`) **or**
  `order.publicTokenExpiresAt > now`; update its doc comment and the `ORDER_TOKEN_TTL_MS` comment
  in `src/server/orders/create-order.ts` (value unchanged) to describe the FR-015 rule; T025
  passes.
- [X] T029 [US4] Create `src/components/shop/OrderProgress.tsx` (Server Component; storefront.md
  §8.8; research R11): `<ol data-testid="order-progress" aria-label=…>` of four `<li
  data-testid="order-step" data-state="done|current|todo">`, `aria-current="step"` on the
  current one, step 3 labelled by delivery method; `check` icon on done steps; all labels passed
  in as props (no strings inside); classes only, no `style`.
- [X] T030 [US4] Rewrite the content of `src/app/[locale]/(shop)/order/[token]/page.tsx` per
  storefront.md §8.8 (keep `OrderCleanup`, `OrderSummary`, `generateMetadata` `noindex` and the
  existing test ids): check circle, h1 by `justPlaced` ("heading" / "headingLater"), number,
  `emailSent` line (kept at all times); payment chip for three states (the `refunded` label
  already exists in `order.paymentState`); `OrderProgress` for open and Completed orders; Shipped
  → `info` Notice with `<bdi dir="ltr" data-testid="order-tracking-number">` or "המשלוח בדרך"
  when there is none; Ready for pickup → `info` Notice `data-testid="order-pickup-note"` with the
  note (`dir="auto"`, `whitespace-pre-line`), else the settings pickup instructions via `pick()`
  with `lang`/`dir` fallback attributes, else "כתבו לי כדי לתאם איסוף" with the seller's phone and email links + Contact link, all
  inside `order-pickup-note`; pickup orders that are New or In preparation keep today's
  pickup-instructions Notice (not shown once Completed or Cancelled); Cancelled → `info` Notice
  `data-testid="order-cancelled"` (+ "הכסף הוחזר" when refunded, or "הכסף יוחזר אליכם" while
  still paid) with the seller's phone (`tel:`) and
  email (`mailto:`) from settings and the Contact link, no progress, no check circle, and no
  payment chip while still `awaiting_payment` (paid / refunded chips stay); the offline
  payment Notice only when `offline` + `awaiting_payment` + neither Cancelled nor Completed; the `made` Notice
  exactly per the status × payment table in storefront.md §8.8; expired text without "30 days".
  Strings in `order.*` (Hebrew in Aviva's voice, real English: `headingLater`, `steps.*`,
  `tracking.*`, `pickupReady.*`, `cancelled.*`, `madeInPreparation`, `expired.text`, and the changed `madeAwaiting` text). No new
  client JS. T026 passes together with T031.
- [X] T031 [US4] Change `src/server/email/templates/order-confirmation.ts` (contracts/emails.md):
  add the `emails.order.followIntro` sentence before the order link in the HTML and text bodies
  and change `emails.order.viewOrder` to "למעקב אחרי ההזמנה" / "Follow your order" in `he.json` /
  `en.json`; the subject and all other content unchanged. T027 passes.

**Checkpoint**: all P1 stories complete — the shop can go live with order handling.

---

## Phase 7: User Story 5 — Aviva cancels an order (Priority: P2)

**Goal**: cancel with confirmation; a paid order's cancellation can never happen without the
refund reminder (SC-008).

**Independent Test**: spec.md US5 › Independent Test; quickstart.md step 5.

### Tests for User Story 5 (write first, must fail)

- [X] T032 [US5] Extend `tests/integration/order-changes.test.ts` first: cancel from each of
  `new`, `in_preparation`, `shipped`, `ready_for_pickup` with `confirm: true` → Cancelled,
  event + activity, `public_token_expires_at` ≈ now + 30 days; without `confirm` →
  `admin.confirm_required` and nothing changes; from Completed → `not_allowed`; a repeat cancel
  of a Cancelled order (`expectedStatus 'cancelled'`) is a true repeat → `{changed: false}`,
  nothing written and no email (contracts/server-actions.md check order, research R3); a
  paid order → `refundReminder: true`, an unpaid one → `false`; each cancel queues exactly one
  `order-cancelled` row (to `customer_email`, `order.locale`), a repeated cancel queues none, and
  an anonymised order queues none; `getOrderDetail` of a Cancelled
  + paid order has `allowed.markRefunded` true and `allowed.cancel` false.
- [X] T033 [P] [US5] Extend `tests/integration/order-emails.test.ts` first with
  `order-cancelled` (contracts/emails.md): Hebrew and English → `lang`/`dir` match
  `order.locale`; the body has the order number, items and total; a paid online order gets the "returned to your card" sentence, a paid offline order "the same
  way you paid", an already refunded order "your money has already been returned", an unpaid
  order "no payment was taken"; the seller block; the subject holds only the shop name and the
  order number (sentinels absent).
- [X] T034 [US5] Extend `tests/e2e/admin-order-workflow.spec.ts` first (same file, after T021):
  a New order offers "ביטול ההזמנה" next to its status steps (US2 #1); cancel unpaid order E
  (dialog, Cancel changes nothing, Confirm → "בוטלה", no Cancel button any more); mark order F paid, then cancel it → the dialog shows the refund reminder → after confirming the reminder Notice stays →
  "סימון כהוחזר" → "הוחזר" and the Notice is gone; `readOutbox('order-cancelled')` has one row
  per cancelled order in the order's language.

### Implementation for User Story 5

- [X] T035 [US5] Create `src/server/email/templates/order-cancelled.ts` (with `sellerParts`
  from T022; strings
  `emails.cancelled.*` in Hebrew and English) and `enqueueOrderCancelledEmail(tx, orderId)` in
  `src/server/orders/order-emails.ts` (dedupe key `order-cancelled:<orderId>`, skipped when
  `customer_email` is null); call it from `setOrderStatus` in `src/server/orders/order-changes.ts`
  when the target is `cancelled` (inside the transaction, after the update), and have the
  `setOrderStatus` action call `kickOutbox()` after a successful change. T033 and T032
  pass.
- [X] T036 [US5] Add cancellation to `src/components/admin/OrderActions.tsx` and the order page
  `src/app/admin/(protected)/orders/[id]/page.tsx` (research R9; storefront.md §12.3):
  "ביטול ההזמנה" (secondary button) when `allowed.cancel`; `ConfirmDialog` "לבטל את ההזמנה?" (body: "הלקוח יקבל מייל שההזמנה בוטלה.") whose body, when the order is paid, also shows the refund reminder ("ההזמנה שולמה. אחרי
  הביטול צריך להחזיר את הכסף: בתשלום באתר — דרך האתר של חברת הסליקה; בתשלום ישיר — באותה דרך
  שבה שולם.", the sentence by `payment_method`); after the cancel the page shows a persistent
  `attention` Notice "צריך להחזיר את הכסף" with the same method text and the "סימון כהוחזר"
  button while `status = cancelled` and `payment_state = paid`. Strings in
  `admin.orders.cancel.*`. T034 passes.

**Checkpoint**: cancellations are safe.

---

## Phase 8: User Story 6 — Aviva corrects a customer's details (Priority: P3)

**Goal**: correct name, phone, email and (shipping) address with the checkout rules.

**Independent Test**: spec.md US6 › Independent Test; quickstart.md step 6.

- [X] T037 [US6] Refactor without behaviour change (research R10): in
  `src/lib/validation/checkout.ts` export reusable pieces that take an error-key map —
  `contactFields(errors)` (the `fullName`, `phone`, `email` Zod fields exactly as today),
  `addressFields(errors)` (today's `addressSchema` fields with their `max()` checks taking the
  keys from `errors`; `addressSchema` becomes `addressFields(CHECKOUT_ERRORS)`) and
  `refineShippingAddress(address, country, ctx, errors)` (city and line1 required, `city` ≤ 100,
  `line1` ≤ 200, `line2` ≤ 200, postal code "IL exactly 7 digits, other countries free-form ≤ 12
  chars") — and make `checkoutFormSchema` use them with `CHECKOUT_ERRORS`; in
  `src/server/checkout/validate.ts` export `normalisePhone(phone, country)` (E.164 via
  libphonenumber, IL when no country) and `lowerDomain(email)`, used by `checkoutServerSchema`.
  `tests/unit/checkout-validation.test.ts` and `tests/integration/place-order.test.ts` pass
  unchanged.

### Tests for User Story 6 (write first, must fail)

- [X] T038 [US6] Write `tests/integration/order-customer.test.ts` first for `updateOrderCustomer`
  (contracts/server-actions.md; mocks and order creation as in
  `tests/integration/place-order.test.ts`): a shipping order's name / phone / email / city /
  line1 / line2 / postal code are saved with the phone normalised to E.164 (`050-123-4567` →
  `+972501234567`) and the email domain lower-cased; `customer_name` "2–100 chars", email "≤ 254
  chars" and `EMAIL_SHAPE`, invalid phone, missing city or street on a shipping order, IL postal
  code not 7 digits → field errors with the `admin.orders.customer.errors.*` keys
  (contracts/server-actions.md) at paths `fullName`, `phone`, `email`, `address.city`,
  `address.line1`, `address.postalCode`, and nothing saved; `address_country`,
  `delivery_method`, amounts and lines never change; a shipping order submitted without `address` → field errors on `address.city` and
  `address.line1`, nothing saved; a pickup order ignores `address`; identical
  values → `{changed: false}`, no event; event `customer_edited {fields: [...]}` and activity
  `customer.updated {orderNumber, field: 'phone,address'}` contain none of the old or new values
  (sentinel strings); an order with `anonymized_at` set → `admin.orders.errors.anonymized`,
  while `setOrderStatus` on it still works (spec edge case); outbox unchanged.
- [X] T039 [US6] Extend `tests/e2e/admin-order-workflow.spec.ts` first (same file, after T034):
  on order G open "תיקון פרטי הלקוח", change the phone and city → new values shown, history shows "פרטי
  הלקוח עודכנו" without values; `not-an-email` → the Hebrew message next to the email field and
  nothing saved.

### Implementation for User Story 6

- [X] T040 [US6] Create `src/lib/validation/order-customer.ts` (light shared schema built from
  T037's pieces with `ORDER_CUSTOMER_ERRORS` = `admin.orders.customer.errors.{fullName, phone,
  email, city, line1, line2, postalCodeIl, postalCode}`; no `libphonenumber-js` import) and
  implement `updateOrderCustomer` in `src/server/orders/order-changes.ts` (server refinement with
  `isValidPhone` for the order's `address_country` or IL, normalisation, row lock, compare with
  stored values, update, event, activity, `{ database }` option; map Zod issues to field errors
  with `checkoutFieldErrors` from `src/lib/validation/checkout.ts`, which keeps nested paths such
  as `address.city` — not `zodFailure`, which keeps only the first path segment) plus the wrapper in
  `src/app/admin/(protected)/orders/[id]/actions.ts` (`requireAdmin()` first). Add the Hebrew
  messages written for Aviva to `admin.orders.customer.errors.*` (e.g. "מספר הטלפון לא נראה
  תקין", "צריך לכתוב עיר") and `admin.orders.errors.anonymized` ("את פרטי הלקוח בהזמנה הזאת
  כבר מחקנו, אי אפשר לערוך אותם."). T038 passes.
- [X] T041 [US6] Create `src/components/admin/CustomerDetailsForm.tsx` (client island inside a
  `Disclosure` "תיקון פרטי הלקוח" on the order page; storefront.md §12.3, §7.10): `FormField` /
  `TextField` for name (`autocomplete="off"`), phone (`type="tel"`, `dir="ltr"`), email
  (`type="email"`, `dir="ltr"`), and for shipping orders city, street and number, apartment,
  postal code (`inputmode="numeric"`, `dir="ltr"`), with the country shown read-only; field
  errors under each field translated from the returned `admin.orders.customer.errors.*` keys
  (the `admin` namespace the admin layout already provides to client components),
  `ErrorSummary` focused on a failed save, Toast "הפרטים נשמרו" + refresh on success; hidden
  (with the anonymised Notice instead) when `anonymizedAt` is set. Strings in
  `admin.orders.customer.*`. T039 passes.

**Checkpoint**: correction right on a single order (search/export/anonymise stay in 003).

---

## Phase 9: User Story 7 — Aviva sees what needs her attention (Priority: P3)

**Goal**: counts of new and unpaid orders on the admin home, and the settings notice.

**Independent Test**: spec.md US7 › Independent Test; quickstart.md step 7.

### Tests for User Story 7 (write first, must fail)

- [X] T042 [US7] Extend `tests/integration/admin-orders.test.ts` first: `getOrderCounts()` with
  2 New orders and 3 awaiting-payment orders of which 1 is Cancelled → `{newOrders: 2,
  awaitingPayment: 2}` (awaiting excludes `cancelled`); and `listOrders({payment:
  'awaiting_payment', open: true})` returns exactly the counted orders. In
  `tests/integration/settings.test.ts` add `settingsNeedingAttention()` cases: the seed
  placeholders are listed (same as `placeholderFields()`); `pickupInstructionsHe` is listed when
  an enabled zone has `pickup_enabled` and `pickup_instructions_he` is null or blank, and not
  listed when pickup is disabled or the instructions are filled.
- [X] T043 [P] [US7] Write `tests/e2e/admin-home.spec.ts` first (phone projects): seed 2 New and
  3 awaiting-payment orders (1 Cancelled) → counts 2 and 2, each card opens the matching
  filtered list (the second shows the "בלי הזמנות שבוטלו" chip, and tapping it clears the flag);
  with no orders the plain sentence shows; the seeded placeholder settings appear in the notice
  with a link to the settings page; axe reports no violations.

### Implementation for User Story 7

- [X] T044 [US7] Implement `getOrderCounts()` in `src/server/orders/admin-orders.ts` and
  `settingsNeedingAttention()` in `src/server/settings/settings.ts` (research R13), so T042
  passes.
- [X] T045 [US7] Rewrite `src/app/admin/(protected)/page.tsx` (storefront.md §12.4; FR-017):
  `requireAdmin()` first; h1 and welcome as today; two count cards (whole card a link):
  "הזמנות חדשות" → `/admin/orders?status=new`, "ממתינות לתשלום" →
  `/admin/orders?payment=awaiting_payment&open=1`, numbers `tnum`; when both are 0 the sentence
  "אין כרגע הזמנות שמחכות לך" instead of the zeros; while `settingsNeedingAttention()` is
  non-empty an `attention` Notice "כדאי להשלים בהגדרות:" listing Hebrew labels from
  `admin.dashboard.settingsFields.*` (one per field name it can return) and a link "להגדרות"
  to `/admin/settings`. Strings in `admin.dashboard.*` (replace `intro`). T043 passes.

**Checkpoint**: all user stories complete.

---

## Phase 10: Polish & cross-cutting

- [X] T046 Make the access tests reach a real order and check their coverage (SC-006, FR-019):
  in `tests/e2e/admin-access.spec.ts`, have the sentinel order insert return its id (`RETURNING
  id`) and build each page URL with a per-page fill — `pageUrl(page.path, (segment) =>
  page.path.includes('/orders/') && segment === '[id]' ? orderId : fill(segment))` (`fill` only
  receives the segment, `tests/helpers/admin-files.ts`) — so `/admin/orders/[id]` is requested
  with the real order; then run `pnpm vitest run --project integration
  tests/integration/admin-actions-guard.test.ts` and `pnpm test:e2e
  tests/e2e/admin-access.spec.ts` and check that all six new actions and `/admin/orders`,
  `/admin/orders/[id]` appear; if a page or action is missing, fix the cause in the page or
  action.
- [X] T047 [P] Grep-check the email and no-personal-data rules: `grep -rn
  "enqueueEmail\|templates/" src/server/orders/order-changes.ts src/server/orders/admin-orders.ts
  "src/app/admin/(protected)/orders"` finds nothing (emails go only through the
  `order-emails.ts` helpers); `grep -n "enqueueOrder" src/server/orders/order-changes.ts` shows
  only `enqueueOrderCancelledEmail` (in the cancel branch) and `enqueueOrderRefundedEmail` (in
  `markOrderRefunded`); `grep -rn "log\.\(info\|warn\|error\)"
  src/server/orders/order-changes.ts` logs no customer fields. Fix any hit.
- [X] T048 Run `pnpm verify` (types, lint, CSS logical-properties check, unit + integration, audit,
  and `test:pg` when `DATABASE_URL_TEST` is set), then `pnpm build` once and the E2E spec files
  one at a time with `pnpm exec playwright test <spec> --project=chromium-mobile` (`pnpm test:e2e`
  rebuilds first; `pnpm exec playwright` serves the last build): `admin-orders`,
  `admin-order-workflow`, `order-tracking` (also `--project=webkit-mobile`), `admin-home`, plus the existing `checkout-offline` and `checkout-online` because the order page changed, and
  `pnpm exec playwright test tests/e2e/bundle-size.spec.ts --project=chromium-desktop` (the
  order page's JS budget); all pass.
- [X] T049 Walk through quickstart.md › Manual walkthrough at 375 px and 1280 px against
  storefront.md §8.8 and §12, timing SC-001 on a phone-sized viewport (owner email link → order
  marked Shipped with a tracking number in under 1 minute; an offline payment recorded in under
  30 seconds) and noting the times in the batch report; fix any deviation in code or, if the design was wrong, in
  storefront.md (same branch).
- [X] T050 Update `docs/roadmap.md` in this branch: item 002's status becomes "Done (dev)" (the
  roadmap's rule: true once this branch is squash-merged to `dev`; project CLAUDE.md asks for the
  update in the feature branch); rewrite item 002's **Goal** so it no longer says the customer
  gets a matching email per change (one "order received" email, then the order page); note what
  stays for 003/004 (customer search, export, anonymise; activity log view).

---

## Dependencies & execution order

- **Phase 1 (T001)** → before any UI task (T011, T012, T018, T024, T029, T030, T036, T041, T045).
- **Phase 2 (T002–T005)** → before all stories. T002 → T003. T004, T005 independent.
- **US1 (T006–T012)**: T006 → T009; T008 → T010; T009 → T011, T012. T007 can be written any
  time after T001. T010 changes the outbox sender (shared with spec 001's emails): run the
  existing outbox tests with it.
- **US2 (T013–T018)**: needs T003, T009, T012. T013, T014 → T015 → T016 → T018; T017 before T018.
- **US3 (T019–T024)**: needs US2's `order-changes.ts`, `actions.ts`, `OrderActions.tsx`,
  `admin-order-workflow.spec.ts` (same files) → after T018. T020 → T022; T019, T021, T022 → T023
  → T024.
- **US4 (T025–T031)**: needs only Phase 2 (`isOpen`) and T001 — can run alongside US1–US3; its
  E2E sets state with SQL. T025 → T028; T027 → T031; T026 passes only after T028, T029, T030
  and T031 are all done.
- **US5 (T032–T036)**: after US3 (same files; uses "סימון כהוחזר"). T033 → T035; T032, T034,
  T035 → T036.
- **US6 (T037–T041)**: T037 → T038, T039 → T040 → T041; after US5 for the shared files
  (`order-changes.ts`, `actions.ts`, `admin-order-workflow.spec.ts`).
- **US7 (T042–T045)**: needs T009 (`admin-orders.ts`, `listOrders` with `open`); independent of
  US2–US6 otherwise. T042, T043 → T044 → T045.
- **Polish (T046–T050)** last.

Because `he.json` / `en.json` are shared, string-adding tasks are not run at the same time.
`tests/integration/order-emails.test.ts` is created by T008 and extended by T020 and T033 (one
at a time).

## Parallel opportunities

- Phase 2: T002 ∥ T004.
- US1: T006 ∥ T007 ∥ T008.
- US2: T013 ∥ T014.
- US3: T019 ∥ T020 (different test files).
- US4 as a whole alongside US1–US3 (different files except the message files: coordinate string
  additions); within US4, T025 ∥ T026 ∥ T027.
- US5: T032 ∥ T033.
- US7: T042 ∥ T043.
- Polish: T046 ∥ T047.

Per the coordinator workflow, batches still run one at a time; [P] marks only what would be safe.

## Implementation strategy

1. **MVP = Phase 1 + 2 + US1 + US2** (Aviva can see and move orders, and hears when an order
   email fails). Then US3 (payments) and US4 (customer page) complete the P1 set — the shop can
   launch order handling after Phase 6.
2. US5 (P2), then US6 and US7 (P3).
3. Suggested implementer batches: B1 = T001; B2 = T002–T005; B3 = T006–T012; B4 = T013–T018;
   B5 = T019–T024; B6 = T025–T031; B7 = T032–T036; B8 = T037–T041; B9 = T042–T045; B10 =
   T046–T050. Each batch is reviewed before the next.
