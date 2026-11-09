# Contract: admin order Server Actions (002)

File: `src/app/admin/(protected)/orders/[id]/actions.ts` (`'use server'`). Each action is a thin
wrapper: **first statement `requireAdmin()`** (before any input is parsed; the existing
`tests/integration/admin-actions-guard.test.ts` walks every `actions.ts` and checks this), then
Zod parsing, then the data-layer function in `src/server/orders/order-changes.ts`, which takes an
`Actor` (`actorOf(context)`) and does the work in one transaction (research R3). None is a ⟳
passkey re-check action. Cross-site protection: Next.js Server Actions accept only same-origin
POSTs (Origin/Host check) and the admin session cookie is `SameSite=Strict` (spec 001 plan,
unchanged).

All return the existing `ActionResult<T>` (`src/server/catalog/result.ts`): `{ok: true, data}` or
`{ok: false, formError?, fieldErrors?}` with translation keys. The order id is a UUID; a
malformed or unknown id → `formError: 'admin.orders.errors.not_found'`.

Common refusals (all leave the order untouched):

| Key | When |
|---|---|
| `admin.orders.errors.not_found` | id malformed or no such order |
| `admin.orders.errors.stale` | `expectedStatus` ≠ current status and current ≠ target (someone just changed it) |
| `admin.orders.errors.not_allowed` | the transition or payment mark is not allowed by `status.ts` |
| `admin.confirm_required` | an action that needs `confirm: true` did not send it (existing key) |
| `admin.orders.errors.invalid` | any other malformed input |

Check order (data layer): missing `confirm` where required → `admin.confirm_required` (before
any database access); then, inside the locked transaction, not found → idempotent → stale →
rules → field lengths, except that payment marks check the payment method first (an online
order → `not_allowed` for `markOrderPaid`, even though it is already paid). The data-layer functions check `confirm` themselves (it is part of their
input; see Data-layer functions), so the rule holds even when they are called directly; the
actions pass it through after Zod.

Idempotency: only a true repeat is a no-op — the order is already in the requested state **and**
any submitted tracking number / pickup note equals the stored value; the result is `{ok: true,
data: {changed: false}}` and nothing is written (no event, no activity). Same status but a
different tracking number / pickup note → `stale` (a second admin's page was out of date).

Every successful change (changed = true) writes `order_event` + `admin_activity` as in
data-model.md. Only two changes queue a customer email, inside the same transaction
(contracts/emails.md): `setOrderStatus` → `cancelled` queues `order-cancelled`, and
`markOrderRefunded` queues `order-refunded`; the action then calls `kickOutbox()` after the
transaction has committed. No other action queues any email.

## `setOrderStatus(input)`

```ts
input: {
  orderId: string;                // uuid
  expectedStatus: OrderStatus;    // what the page showed
  to: 'in_preparation' | 'shipped' | 'ready_for_pickup' | 'completed' | 'cancelled';
  trackingNumber?: string;        // only with to = 'shipped'; trimmed; ≤ 100; '' → null
  pickupNote?: string;            // only with to = 'ready_for_pickup'; trimmed; ≤ 500; '' → null
    confirm?: true;                 // required when to is 'completed' or 'cancelled'
  alsoMarkPaid?: true;            // only with to = 'completed' on an offline order awaiting payment
}
→ ActionResult<{ changed: boolean; status: OrderStatus; refundReminder: boolean }>
```

- Allowed `to` per data-model.md › Status transitions (forward only; going back is
  `stepBackOrderStatus`).
- `shipped` stores `tracking_number` (also when it is null: the field as submitted is what is
  stored); `ready_for_pickup` stores `pickup_note` likewise. Other targets leave both columns as
  they are.
- `completed` / `cancelled` also set `public_token_expires_at = now + 30 days` (research R4).
- `alsoMarkPaid: true` with `to = 'completed'` on an `offline` order in `awaiting_payment`: in the
  same transaction also sets `payment_state = 'paid'`, `paid_at = now`, and writes the
  `payment_marked_paid` event and `order.marked_paid` activity besides the status ones (research
  R9). On any other order (online, already paid or refunded, other target) → `not_allowed` and
  nothing changes.
- `refundReminder` is true when `to = 'cancelled'` and `payment_state = 'paid'` (FR-011, SC-008).
- `cancelled` queues `order-cancelled` (the paid / not-paid sentence is chosen from the payment
  state at that moment); skipped when `customer_email` is null.
- Field errors: `trackingNumber` → `admin.orders.errors.tracking_too_long` ("אפשר עד 100 תווים"),
  `pickupNote` → `admin.orders.errors.pickup_note_too_long` ("אפשר עד 500 תווים").

## `stepBackOrderStatus(input)`

```ts
input: { orderId: string; expectedStatus: 'in_preparation' | 'shipped' | 'ready_for_pickup' }
→ ActionResult<{ changed: boolean; status: OrderStatus }>
```

- Target from `stepBackTarget()` (research R2). No confirmation. Tracking number and pickup note
  are kept. Event `status_changed` with `back: true`.
- Idempotency: if the current status already equals the step-back target computed for
  `expectedStatus` → `changed: false`.

## `markOrderPaid(input)`

```ts
input: { orderId: string; confirm: true }
→ ActionResult<{ changed: boolean }>
```

- Only `payment_method = 'offline'` and `payment_state = 'awaiting_payment'`, in any status
  (also Cancelled, edge case "late payment"). Sets `payment_state = 'paid'`, `paid_at = now`.
- Online orders → `not_allowed` (FR-012). Already `paid` → `changed: false`. `refunded` →
  `not_allowed`.

## `markOrderRefunded(input)`

```ts
input: { orderId: string; confirm: true }
→ ActionResult<{ changed: boolean }>
```

- Only `payment_state = 'paid'` (online or offline), any status. Sets `refunded`, `refunded_at =
  now` and queues `order-refunded` (skipped when `customer_email` is null). Already `refunded` →
  `changed: false` (no second email). `awaiting_payment` → `not_allowed`.

## `updateFulfilmentDetails(input)`

```ts
input: {
  orderId: string;
  expectedStatus: 'shipped' | 'ready_for_pickup';
  trackingNumber?: string;        // with expectedStatus 'shipped'; trimmed; ≤ 100; '' → null
  pickupNote?: string;            // with expectedStatus 'ready_for_pickup'; trimmed; ≤ 500; '' → null
}
→ ActionResult<{ changed: boolean }>
```

- Edits the tracking number of a Shipped order or the pickup note of a Ready for pickup order
  (FR-010, research R16); the status does not change; no confirmation; no email.
- Current status ≠ `expectedStatus` → `stale`; the field that does not belong to the status (e.g.
  `pickupNote` on a Shipped order) → `not_allowed`; same value as stored → `changed: false`.
- Field errors as `setOrderStatus` (`tracking_too_long`, `pickup_note_too_long`).
- Event `fulfilment_edited {field}`, activity `order.details_updated {orderNumber, field}`; never
  the text.

## `updateOrderCustomer(input)`

```ts
input: {
  orderId: string;
  fullName: string;               // checkout rules: trimmed, 2–100
  phone: string;                  // checkout rules: libphonenumber for the order's address country (IL for pickup) → E.164
  email: string;                  // checkout rules: EMAIL_SHAPE, ≤ 254, domain lower-cased
    address?: {                     // required for shipping orders (missing → city/line1 field errors); ignored for pickup
    city: string;                 // required, ≤ 100
    line1: string;                // required, ≤ 200
    line2?: string;               // ≤ 200, '' → null
    postalCode?: string;          // IL: 7 digits; other countries ≤ 12; '' → null
  };
}
→ ActionResult<{ changed: boolean; fields: ('name' | 'phone' | 'email' | 'address')[] }>
```

- Validation reuses the checkout rules (research R10); field errors use
  `admin.orders.customer.errors.{fullName, phone, email, city, line1, line2, postalCodeIl,
  postalCode}` (own keys, because admin client components only get the `admin` and `common`
  namespaces) with paths `fullName`, `phone`, `email`, `address.city`,
  `address.line1`, `address.line2`, `address.postalCode`. Any field error → nothing saved.
- The country is not an input (it stays as stored). Nothing that differs from the stored values
  → `changed: false`.
- `anonymized_at` set → `formError: 'admin.orders.errors.anonymized'`.
- Event `customer_edited` `{fields}`; activity `customer.updated` `{orderNumber, field}`; no
  values in either.

## Data-layer functions (`src/server/orders/order-changes.ts`, `server-only`)

The actions above call these with the same input object (after Zod); tests call them directly.
`confirm` is part of the input. `options.database` lets the `integration-pg` tests pick a
connection; `options.now` fixes the clock for `paid_at`, `refunded_at` and the link expiry.

```ts
type Options = { database?: DbLike; now?: Date };

setOrderStatus(actor: Actor, input: SetOrderStatusInput, options?: Options)
  : Promise<ActionResult<{ changed: boolean; status: OrderStatus; refundReminder: boolean }>>;
stepBackOrderStatus(actor: Actor, input: StepBackInput, options?: Options)
  : Promise<ActionResult<{ changed: boolean; status: OrderStatus }>>;
markOrderPaid(actor: Actor, input: { orderId: string; confirm?: true }, options?: Options)
  : Promise<ActionResult<{ changed: boolean }>>;
markOrderRefunded(actor: Actor, input: { orderId: string; confirm?: true }, options?: Options)
  : Promise<ActionResult<{ changed: boolean }>>;
updateFulfilmentDetails(actor: Actor, input: UpdateFulfilmentInput, options?: Options)
  : Promise<ActionResult<{ changed: boolean }>>;
updateOrderCustomer(actor: Actor, input: UpdateOrderCustomerInput, options?: Options)
  : Promise<ActionResult<{ changed: boolean; fields: ('name' | 'phone' | 'email' | 'address')[] }>>;
```

`SetOrderStatusInput`, `StepBackInput`, `UpdateFulfilmentInput` and `UpdateOrderCustomerInput` are the action inputs
above, exported from the module. `Actor` and `ActionResult` come from
`src/server/catalog/result.ts`; `DbLike` from `src/server/db/types.ts`.

## Data loaders (not actions; Server Components call them after `requireAdmin()`)

File `src/server/orders/admin-orders.ts` (`server-only`):

```ts
listOrders(filter: { status?: OrderStatus; payment?: PaymentState; open?: boolean; page: number })
  → { rows: AdminOrderListRow[]; page: number; pageCount: number; total: number }   // 25 per page
findOrderIdByNumber(text: string) → { id: string } | { notFound: number } | { invalid: true }
                                                    // accepts '1023' or '#1023' (trimmed), 1–9 digits
getOrderDetail(id: string) → AdminOrderDetail | null                                // data-model.md
getOrderCounts() → { newOrders: number; awaitingPayment: number }                   // awaiting excludes cancelled
```

File `src/server/settings/settings.ts`: `settingsNeedingAttention(): Promise<string[]>` —
`placeholderFields(settings)` plus `'pickupInstructionsHe'` when any enabled zone has pickup
enabled and `pickup_instructions_he` is empty (research R13).

File `src/server/orders/public-order.ts` (changed): `getOrderByToken(token, now)` applies the
FR-015 rule (data-model.md › orders) instead of `expires_at > now` alone; return shape unchanged.
