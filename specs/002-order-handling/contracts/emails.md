# Contract: emails (002)

Customer emails per order (FR-002, SC-002), all in `order.locale`, all transactional:

| Kind | When | At most |
|---|---|---|
| `order-confirmation` ("order received", spec 001) | the order is confirmed (unchanged) | once |
| `order-cancelled` (new) | the order becomes Cancelled | once |
| `order-refunded` (new) | the payment is marked refunded | once |

No other status or payment change queues a customer email. Spec 001 FR-029's `order-shipped` and
`order-ready-for-pickup` are **not built**. Owner emails: `new-order` (unchanged) and the new
`order-email-failed`.

Rules for every new template (as spec 001's emails contract): rendered with
`src/server/email/layout.ts` (`<html lang dir>` from the locale, escaped interpolations, HTML +
plain text); strings in the `emails.*` namespace in both `he.json` and `en.json`; the **subject
holds only the shop name and the order number** (it stays in the outbox after the bodies are
erased); the `From` name is the shop name (sender, unchanged); queued with `enqueueEmail` inside
the transaction that makes the change, with `order_id` set; skipped when `customer_email` is null
(anonymised order); after the transaction commits the caller calls `kickOutbox()`.

## `order-confirmation` (changed: link wording only)

File: `src/server/email/templates/order-confirmation.ts`; strings `emails.order.*`.

- The closing link to `/{order.locale}/order/{token}` is presented as the place to follow the
  order: a sentence `emails.order.followIntro` ("בקישור הזה אפשר לראות בכל רגע איפה ההזמנה
  עומדת." / "This link shows where your order stands at any time.") followed by the link text
  `emails.order.viewOrder` changed to "למעקב אחרי ההזמנה" / "Follow your order". HTML and text
  bodies both.
- Everything else (subject, contents, dedupe key `order-confirmation:<orderId>`) is unchanged.
- **Give-up rule (changed)**: for rows with an `order_id`, the sender marks this kind `failed` at
  the first failed attempt that is the third attempt or later and made ≥ 2 minutes after it was
  queued (other kinds and rows without `order_id`: 24 hours) and, in the same transaction and
  only if its guarded update changed the row, records an `order_event` `email_failed {emailKind}`
  and queues `order-email-failed` (below), then kicks the outbox (the `onOwnerAlertQueued` hook,
  default `kickOutbox`) so the owner email goes out at once. `order-cancelled` and
  `order-refunded` rows that give up (24 hours) also record an `email_failed` event.

## `order-cancelled` (new, customer)

File: `src/server/email/templates/order-cancelled.ts`; strings `emails.cancelled.*`; dedupe key
`order-cancelled:<orderId>`; queued by `setOrderStatus` when the target is `cancelled` (through
`enqueueOrderCancelledEmail(tx, orderId)` in `src/server/orders/order-emails.ts`).

- Subject: `emails.cancelled.subject` — e.g. "{shopName}: הזמנה {number} בוטלה" / "{shopName}:
  order {number} was cancelled".
- Body: intro ("ההזמנה שלכם בוטלה." / "Your order was cancelled."), order number, the items and
  total (`order-parts.ts` helpers, no address), then:
  - order was `paid` at cancellation: online → "הכסף יוחזר לכרטיס האשראי דרך חברת הסליקה." /
    "The money will be returned to your card through the payment company."; offline → "אחזיר את
    הכסף באותה דרך שבה שילמתם." / "I'll return the money the same way you paid.";
    - order was already `refunded`: "הכסף כבר הוחזר לכם." / "Your money has already been returned.";
  - never paid (`awaiting_payment`): "לא נגבה תשלום." / "No payment was taken."
- Closing: "יש שאלה? אפשר לכתוב או להתקשר אליי:" with the seller's business name, phone and email
  (as the confirmation email's seller block). No order-page link (only its hash is stored).

## `order-refunded` (new, customer)

File: `src/server/email/templates/order-refunded.ts`; strings `emails.refunded.*`; dedupe key
`order-refunded:<orderId>`; queued by `markOrderRefunded` (through
`enqueueOrderRefundedEmail(tx, orderId)`).

- Subject: `emails.refunded.subject` — e.g. "{shopName}: החזר כספי להזמנה {number}" /
  "{shopName}: refund for order {number}".
- Body: "החזרתי את הכסף על ההזמנה." / "I've refunded your order.", order number, the refunded
  amount (`formatMoney(total_minor, currency, locale)`; refunds are always the full amount), the
  method sentence (online: "ההחזר יופיע בכרטיס האשראי תוך כמה ימי עסקים, לפי חברת האשראי." /
  "It will show on your card within a few business days, depending on your card company.";
  offline: "ההחזר נעשה באותה דרך שבה שילמתם." / "The refund was made the same way you paid."), the
  seller block. No order-page link.

## `order-email-failed` (new, owner, Hebrew)

File: `src/server/email/templates/order-email-failed.ts`; strings `emails.orderEmailFailed.*`;
queued by the sender through `enqueueOrderEmailFailed(tx, orderId)` (uses `enqueueToOwners`, base
key `order-email-failed:<orderId>`); a priority kind.

- Subject: "{shopName}: מייל ההזמנה {number} לא נשלח ללקוח".
- Body: "לא הצלחתי לשלוח ללקוח את מייל אישור ההזמנה, אז אין לו קישור למעקב. כדאי להתקשר אליו."
  and the link `<APP_ORIGIN>/admin/orders/<id>` ("לפתיחת ההזמנה"). No customer name, phone,
  email or address (they are on the admin page behind sign-in).

## `new-order` (owner) — unchanged

Still links to `<APP_ORIGIN>/admin/orders/<id>`; from 002 that page exists (FR-001).

## Guarantees tested

- `tests/integration/order-changes.test.ts`: after every action the outbox gained exactly the rows
  this contract names (one `order-cancelled` on cancel, one `order-refunded` on refund, none
  otherwise), also when the action is repeated.
- `tests/integration/order-emails.test.ts`: each new template in both locales (content, method
  sentences, seller block, `lang`/`dir`), and subjects without the customer's name, email, phone
  or address (sentinel values).
- `tests/integration/outbox.test.ts` (extended): the give-up rule (third attempt and ≥ 2 minutes)
  for `order-confirmation` rows with an `order_id`, including jittered tick times, one
  `order-email-failed` per recipient queued and sent in the same pass, 24 hours unchanged for
  other kinds and for rows without `order_id`.
