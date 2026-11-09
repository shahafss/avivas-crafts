# Implementation Plan: Order Handling

**Branch**: `002-order-handling` | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-order-handling/spec.md` (approved 2026-11-09)

## Summary

Aviva gets the admin side of orders: an orders list with status / payment filters, paging and an
order-number box; an order page with everything needed to make and send the piece; status changes
forward (with the New → Shipped / Ready shortcut), one step back, Completed and Cancel with
confirmation, and direct edits of the tracking number / pickup note; payment marks (paid for offline orders, refunded for paid ones) with confirmation;
correction of the customer's contact details; and an admin home with "new" and "unpaid" counts
and a settings notice. The customer's existing order page becomes a status tracker in the order's
language and its link stays alive while the order is open plus 30 days after it closes. Customer emails: "order received" (only its link wording changes), plus a cancellation email and
a refund email; no other change emails the customer. When "order received" cannot be sent, the
shop stops retrying (at the third or later failed attempt, ≥ 2 minutes after the order; normally
3–5 minutes) and emails Aviva, and the order page warns her.

Technical approach: no schema change (every column exists from 001). One pure rules module
(`src/server/orders/status.ts`) decides what is allowed, for both the page and the server. Writes
go through Server Actions → a data layer that locks the order row, checks the page's
`expectedStatus`, applies the change and writes `order_event` + `admin_activity` (and, for cancel and refund, the
customer email) in one transaction. The outbox sender gives up on an `order-confirmation` at the first failed attempt that is the third or later
and ≥ 2 minutes after queueing, and queues an owner email in the same step. Admin pages are Server Components with two small client islands. The customer page
stays server-rendered with no new client JavaScript. Details: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 6.0 (strict) on Node.js 24 LTS (unchanged from 001)

**Primary Dependencies**: next 16, react 19, next-intl, drizzle-orm + postgres.js, zod,
libphonenumber-js (server only), tailwindcss 4 — all already installed. **No new dependency.**

**Storage**: PostgreSQL 17 (existing tables `orders`, `order_line`, `order_event`,
`admin_activity`, `email_outbox`, `shop_settings`, `shipping_zone`); private R2 bucket for order
snapshot photos (read through the existing `/api/admin/media` route). **No migration.**

**Testing**: Vitest (unit; integration on PGlite; `integration-pg` on real PostgreSQL for
concurrency), Playwright (phone projects for admin specs and the customer page), existing
file-tree access tests.

**Target Platform**: Linux container on Render; admin used mainly on a phone (iOS Safari, Chrome
Android); storefront browsers as 001.

**Project Type**: Web application (single full-stack Next.js project).

**Performance Goals**: SC-001 (email → Shipped in < 1 min on a phone; offline payment recorded
in < 30 s) means one tap per step with no extra page loads beyond the refresh after an action;
the list query stays on existing indexes. Storefront first-load JS budget unchanged (the order
page adds no island).

**Constraints**: strict nonce CSP (no `style` attribute), logical CSS properties only, Hebrew
RTL admin, WCAG 2.1 AA, 44 px targets; every string from `he.json`/`en.json`; no personal data in
`order_event`, `admin_activity`, logs or email subjects.

**Scale/Scope**: a few hundred orders a month at most; 2 admins; 2 new admin pages, 1 changed
admin page, 1 changed storefront page, 6 new Server Actions, 3 new email templates, 1 sender rule.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design: still passes.*

| Principle | Status | How this plan meets it |
|---|---|---|
| I. Hebrew-first, bilingual | ✅ | Admin screens in Hebrew RTL; every string in `admin.orders.*`, `admin.dashboard.*`, `order.*`, `emails.order.*`, `emails.cancelled.*`, `emails.refunded.*`, `emails.orderEmailFailed.*` with both he and en entries (parity test). Customer page in both languages with correct LTR in English (R11, R14). Owner-written pickup note shown with `dir="auto"`; Hebrew fallback text gets `lang="he"` (storefront.md §4). |
| II. Built for a non-technical owner | ✅ | Plain Hebrew labels, one big button per next step, only allowed actions shown (FR-008), toasts and field messages; confirmation for Completed, Cancel, mark paid, mark refunded (R9); one-step back for mistakes; mobile-first layouts (storefront.md §12). |
| III. Frictionless guest shopping | ✅ | Unchanged checkout; the customer follows the order through the existing link, no account (US4). |
| IV. Security by design (ASVS L2) | ✅ | See *Security* below. No payment data touched; online orders can never be marked paid by hand (FR-012). |
| V. Simplicity and low cost | ✅ | No dependency, service, table or migration; zero-JS list and customer page; offset paging at this scale (R7); the email-failure warning reuses the outbox rows and one sender branch, no bounce webhook (R5); the new emails reuse the outbox (R12). Complexity Tracking: none. |
| VI. Tested critical paths | ✅ | Unit rules, integration for every action, real-PostgreSQL concurrency, access control on every new admin route and action (automatic file-tree tests), E2E for the admin flow and the customer page (R15). Placing an order and payment confirmation stay covered by 001's tests, re-run in CI. |
| VII. Privacy and legal | ✅ | No new personal data. History and activity rows hold no personal data (FR-018, R6). The customer page never shows name, address, phone or email (SC-007). Correction right on a single order (FR-016; search/export/anonymise stay in 003). Order emails stay transactional only (order received, cancelled, refunded; no marketing), with
the seller's details and no personal data in subjects; the cancellation and refund emails give
the customer a written record (Consumer Protection Law). Purposes and retention of every personal field are unchanged (data-model.md). |

### Security (ASVS 5.0 L2 areas this feature touches)

- **Access control (V8)**: every new page and action calls `requireAdmin()` first (`full`
  session = both sign-in steps, checked on each request); file-tree tests prove it for pages
  (signed-out redirect, no data) and actions (redirect before any DB access or input parsing).
  The media route already requires an admin session for order photos.
- **Business logic (V2)**: transitions and payment marks are enforced server-side from
  `status.ts`, whatever the page offered (SC-005); row lock + `expectedStatus` prevent races and
  double effects (R3); `confirm: true` is required server-side for the four irreversible actions.
- **Input validation (V1/V2)**: Zod on every action input (UUIDs, enums, lengths), checkout
  rules + libphonenumber for corrections; Drizzle parameterised queries only; list query params
  validated, invalid values ignored.
- **CSRF (V3)**: Server Actions only accept same-origin POSTs (`serverActions.allowedOrigins`),
  and the admin session cookie is `SameSite=Strict`, `HttpOnly`, `Secure` (unchanged).
- **Output encoding (V1)**: React escaping; owner/customer free text (note, pickup note,
  tracking number) rendered as text, never HTML; the existing nonce CSP applies.
- **Logging (V16)**: `admin_activity` records which admin did what, with allow-listed
  non-personal details; nothing personal in `order_event.data` or the structured logger.
- **Data protection (V14)**: admin and order pages are `no-store` + `noindex` (existing
  headers); order numbers in URLs are not personal data; personal data never enters URLs (the
  number box carries only the number).

## Project Structure

### Documentation (this feature)

```text
specs/002-order-handling/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R16
├── data-model.md        # what 002 changes (no schema change)
├── quickstart.md        # validation guide
├── contracts/
│   ├── server-actions.md   # 6 admin actions, data-layer signatures, loaders
│   ├── routes.md           # /admin, /admin/orders, /admin/orders/[id], /{locale}/order/{token}
│   └── emails.md           # order received (link wording), cancelled, refunded, owner order-email-failed
├── checklists/
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── admin/(protected)/
│   │   ├── page.tsx                         # CHANGED: counts + settings notice (US7)
│   │   └── orders/
│   │       ├── page.tsx                     # NEW: list, filters, paging, number box (US1)
│   │       └── [id]/
│   │           ├── page.tsx                 # NEW: order page (US1–US6)
│   │           └── actions.ts               # NEW: 6 Server Actions
│   └── [locale]/(shop)/order/[token]/page.tsx   # CHANGED: status tracker (US4)
├── components/
│   ├── admin/
│   │   ├── OrderActions.tsx                 # NEW island: status/payment buttons, fields, dialogs
│   │   ├── CustomerDetailsForm.tsx          # NEW island: correction form (US6)
│   │   └── OrderStatusBadge.tsx             # NEW server: status / payment badges (list + page)
│   ├── ui/ConfirmDialog.tsx                 # CHANGED: optional secondary action (complete unpaid order)
│   └── shop/
│       └── OrderProgress.tsx                # NEW server: 4-step progress (§8.8)
├── lib/
│   ├── format-date.ts                       # NEW: Israel-time date/time formatting
│   └── validation/
│       ├── checkout.ts                      # CHANGED: export reusable field rules (behaviour unchanged)
│       └── order-customer.ts                # NEW: correction schema (light, shared)
├── server/
│   ├── checkout/validate.ts                 # CHANGED: export phone/email normalisers (behaviour unchanged)
│   ├── orders/
│   │   ├── status.ts                        # NEW: pure transition + payment rules (R1, R2)
│   │   ├── admin-orders.ts                  # NEW: listOrders, findOrderIdByNumber, getOrderDetail, getOrderCounts
│   │   ├── order-changes.ts                 # NEW: setOrderStatus, stepBackOrderStatus, markOrderPaid, markOrderRefunded, updateOrderCustomer
│   │   ├── public-order.ts                  # CHANGED: FR-015 validity rule
│   │   └── create-order.ts                  # UNCHANGED (TTL comment updated only)
│   ├── email/templates/order-confirmation.ts    # CHANGED: follow-the-order sentence
│   ├── email/templates/order-parts.ts           # CHANGED: sellerParts() shared by the customer emails
│   ├── email/templates/order-cancelled.ts       # NEW: customer cancellation email
│   ├── email/templates/order-refunded.ts        # NEW: customer refund email
│   ├── email/templates/order-email-failed.ts    # NEW: owner email, "order received" not sent
│   ├── email/sender.ts                          # CHANGED: 2-minute give-up for order-confirmation + owner email
│   ├── orders/order-emails.ts                   # CHANGED: enqueueOrderCancelledEmail / RefundedEmail / OrderEmailFailed
│   └── settings/settings.ts                 # CHANGED: settingsNeedingAttention()
└── i18n/messages/{he,en}.json               # CHANGED: admin.orders, admin.dashboard, order, emails.order

tests/
├── unit/order-status.test.ts                # NEW (rules)
├── unit/format-date.test.ts                 # NEW
├── integration/admin-orders.test.ts         # NEW (reads, counts)
├── integration/order-changes.test.ts        # NEW (status, payment, cancel writes)
├── integration/order-customer.test.ts       # NEW (corrections)
├── integration/public-order.test.ts         # NEW (link validity)
├── integration/settings.test.ts             # CHANGED (settingsNeedingAttention)
├── integration/place-order.test.ts          # CHANGED (email link wording)
├── integration/order-emails.test.ts         # NEW (the three new templates)
├── integration/outbox.test.ts               # CHANGED (2-minute give-up, owner email)
├── integration-pg/order-concurrency.test.ts # NEW
├── e2e/admin-orders.spec.ts                 # NEW (list, order page, email link; phone projects)
├── e2e/admin-order-workflow.spec.ts         # NEW (status, payment, cancel, correction; phone projects)
├── e2e/admin-home.spec.ts                   # NEW (counts, settings notice; phone projects)
├── e2e/order-tracking.spec.ts               # NEW (customer page; storefront phone projects incl. webkit-mobile)
└── e2e/admin-access.spec.ts                 # CHANGED (fill `orders/[id]` with the sentinel order's id)

playwright.config.ts                          # CHANGED: `order-tracking` added to STOREFRONT_SPECS (no new project, no CI matrix change)

docs/design/storefront.md                     # CHANGED: §8.8, §9, §12 (see below)
docs/roadmap.md                               # CHANGED at the end: 002 status
```

**Structure Decision**: the existing single Next.js project. Admin data access lives in
`src/server/orders/` next to the order code from 001; Server Actions are thin wrappers in the
route folder, as for products, categories and settings. No new e2e Playwright project, so no CI
matrix change; the customer order page joins `STOREFRONT_SPECS`, so it also runs on
`webkit-mobile` (iPhone Safari).

## Design system updates (`docs/design/storefront.md`, in this branch)

The design system is binding (constitution, Development Workflow), so the first implementation
phase writes the design before the screens are built, and tasks cite these sections:

- **Header note and §1 scope**: the document now also designs the admin order screens (§12);
  remove "It does not design the admin area".
- **§8.8 Order page `/{locale}/order/{token}`** — rewritten as a status tracker: h1 "תודה!
  ההזמנה התקבלה" only within the first hour after ordering (`justPlaced`), otherwise "ההזמנה
  שלכם" / "Your order"; number (24/800, `<bdi>`); payment chip ("שולם" / "ממתין לתשלום" /
  "הוחזר"); `OrderProgress` (4 steps, done = `ink` dot with `check`, current = `sun` ring + bold
  label + `aria-current="step"`, todo = `field` outline; vertical list below 640 px, horizontal
  from 640 px; step 3 label by delivery method); status-specific `Notice`: Shipped → `info` with
  tracking number (`<bdi dir="ltr">`, `tnum`) or "המשלוח בדרך"; Ready for pickup → `info` with
  Aviva's note, else pickup instructions, else "כתבו לי כדי לתאם איסוף" + the seller's phone and email + Contact; Cancelled →
  `info` "ההזמנה בוטלה" (+ "הכסף הוחזר" when refunded, "הכסף יוחזר אליכם" while still paid) with the
  seller's phone and email + Contact, replacing
  the progress and the check circle, and no "ממתין לתשלום" chip on a Cancelled order; offline payment `attention` Notice only while awaiting payment and neither Cancelled nor
  Completed; the `made` Notice
  per this table (first matching row wins):

  | Status | Payment state | `made` Notice |
  |---|---|---|
  | Shipped, Ready for pickup, Completed, Cancelled | any | hidden |
  | New, In preparation | refunded | hidden |
  | New | awaiting payment | "קיבלתי את ההזמנה ואתחיל לעבוד עליה בקרוב." / "I got your order and will start on it soon." (`madeAwaiting`, wording changed; Clarifications 2026-11-09) |
  | New | paid | "עכשיו אני מתחילה לסרוג." (`madePaid`) |
  | In preparation | awaiting payment or paid | "אני סורגת את ההזמנה שלכם עכשיו." (`madeInPreparation`; also for cash at pickup, Clarifications 2026-11-09) |

  The check circle (except on Cancelled orders) and "אישור נשלח גם במייל." stay at all times; then
  `OrderSummary` and the back link as today. Pickup orders that are New or In preparation keep
  today's `info` Notice with the shop's pickup instructions (not shown once Completed or
  Cancelled). Expired-link `EmptyState` text no longer mentions a
  fixed 30 days.
- **§9 States matrix**: Order row updated (cancelled state, expired link).
- **§12 Admin area** — expanded from the stub, "Operate mode" on the same tokens and `ui/`
  primitives:
  - **§12.1 Frame**: the existing protected layout (header, nav pills, `max-w-5xl` main) and
    shared admin patterns: page title 28/800; status badge colours (New `sun-soft`, In
    preparation `photo`, Shipped / Ready `panel` + `ink` border, Completed `panel` + `field`
    border, Cancelled `panel` + `alert` border and text) and payment badges (awaiting `panel` +
    `field` border, paid `sun-soft`, refunded `photo`) — colour is never the only signal (text
    label always present); `Toast` after each action; dates in Israel time.
  - **§12.2 Orders list**: number box first (`TextField` `inputmode="numeric"`, label "מעבר
    להזמנה לפי מספר", secondary button "מעבר"), then status `ChipRow` and payment `ChipRow`
    (each with "הכול"), the removable "בלי הזמנות שבוטלו" chip when `open=1`, "ניקוי הסינון"
    quiet link; cards (one link each, white `rounded-card`, `line` border): "#1023" (700,
    `tnum`) + date, customer name, total (`Price md`), two badges; paging row "הקודם · עמוד 2
    מתוך 5 · הבא" with directional chevrons; empty state ("אין הזמנות שמתאימות לסינון" + clear).
  - **§12.3 Order page**: one column on phones, two from 900 px (details at inline-start,
    sticky actions panel at inline-end). Order: header (number, date, status + payment badges);
    alerts (`alert` Notice when the "order received" email failed, with `tel:` link; a smaller
    `alert` line when the cancellation or refund email failed; `attention` refund
    reminder when Cancelled and paid; `info` "לא ניתן ליצור קשר עם הלקוח" when anonymised);
    **actions panel** (primary button for the main next step, secondary buttons for the others,
    quiet "חזרה שלב אחד" for step back, `TextField` "מספר משלוח (לא חובה)" / `TextArea` "הערה
    לאיסוף (לא חובה)" shown with the Shipped / Ready buttons, on a Shipped / Ready order the stored tracking number / pickup note with a quiet "עריכה"
    button that opens the same field and "שמירה", payment buttons, `ConfirmDialog` texts per
    action; completing an offline order that still awaits payment opens a dialog with two
    choices, primary "סימון כשולם והשלמה" and secondary "השלמה בלי תשלום" (plus Cancel); the
    cancel dialog also says the customer will get a cancellation email, the refund
    dialog that the customer will get a refund email); items (72×90 photo well, name, options, quantity × unit price, line
    total, "זמן הכנה"); totals; customer (name, `tel:` and `mailto:` as 44 px `LinkButton`s with
    `phone` / `mail` icons, `<bdi dir="ltr">`); delivery (address lines or "איסוף עצמי"); note
    (`whitespace-pre-line`, `dir="auto"`); payment (method, state, paid / refunded date and
    time); tracking number / pickup note; customer-details `Disclosure` with the correction form
    (`FormField` primitives, `ErrorSummary`); history (`<ol>`, newest first, "{date} · {what} ·
    {who}").
  - **§12.4 Admin home**: h1 "לוח בקרה" + welcome; two count cards (white `rounded-card`, number
    40/800 `tnum`, label, whole card a link, 44 px+); "אין כרגע הזמנות שמחכות לך" when both are
    zero; `attention` Notice listing settings to fill with a link to the settings page.

## Old spec 001 tasks T088–T094 (starting material)

| 001 task | What carries over | What changed |
|---|---|---|
| T088 status unit test | transition table, shortcut, delivery-method rule, payment rule | adds step back (R2), confirmation set, `isOpen`; no email side effects |
| T089 admin-orders integration | list, filters, paging, mark paid, cancel confirm + `refundReminder`, refund needs `paid`, failed email on detail, `updateOrderCustomer` | **dropped**: `order-shipped` / `order-ready-for-pickup` emails; **added**: cancellation and refund emails (once each), tracking / pickup-note edits, 2-minute give-up + owner email, idempotency, stale `expectedStatus`, step back, confirm for Completed and mark paid, number lookup, link expiry on close |
| T090 admin-orders E2E | storefront order → list → filters → paid → in preparation → shipped with tracking; cancel paid → reminder → refunded; email link through sign-in from a cross-site page | **dropped**: customer email with tracking number; **added**: step back, number box; customer page checked in `order-tracking.spec.ts` |
| T091 `status.ts` | as planned | pure module also drives the page (R1) |
| T092 `orders.ts` + templates | queries and writes | split into `admin-orders.ts` (reads) and `order-changes.ts` (writes); templates are `order-cancelled`, `order-refunded` and the owner `order-email-failed` instead of shipped / ready |
| T093 admin pages | list and order page contents | number box, step back, confirmations per FR-011, layouts from storefront.md §12 |
| T094 dashboard | counts + placeholder banner | count link matches the count (`open=1`, R13); pickup instructions check |

## Risks and notes

- **Bounced emails** are not detected after Resend accepts a message (no webhook); the spec now
  says so (FR-007, edge cases), and FR-007 covers send failures, which the shop can see (R5).
- **2-minute give-up**: a short provider outage right after an order now ends that order's
  "order received" retries (other kinds keep 24 hours); Aviva is told within 5 minutes (SC-009)
  and calls the customer. This is the user's choice (Clarifications 2026-11-09). The owner email
  goes through the same provider: during a provider outage it is retried for up to 24 hours, so
  then only the admin page warning is timely.
- **No order link in later emails**: only the link token's hash is stored, so the cancellation
  and refund emails carry the seller's contact details instead of the order-page link.
- **Existing tests**: `checkout-offline.spec.ts` and `checkout-online.spec.ts` assert the order
  page by test id; ids are kept (contracts/routes.md). The heading text changes only after the
  first hour.
- **Order line ids** sort lines in placing order (001); the admin page reuses `ORDER BY id`.
- **Contact page**: `/{locale}/contact` belongs to roadmap item 003 and today falls through to
  the 404 page (the expired-link page already links there). 002's new "contact me" spots
  (cancelled notice, pickup fallback) therefore also show the seller's phone and email from
  settings, which work now; the Contact link starts working when 003 ships.
- **FR-007 flag lifetime**: the warning reads `email_failed` order events written by the
  sender, not outbox rows, so 001's 30-day outbox retention does not erase it (R5).
- At the end of the feature, update 002's status in `docs/roadmap.md` (project CLAUDE.md).

## Complexity Tracking

None. No constitution violations to justify.
