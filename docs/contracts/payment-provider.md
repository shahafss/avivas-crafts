# Contract: Payment Provider Adapter

> **Living document.** Moved from `specs/001-online-crafts-shop/` on 2026-11-09. Every feature that
> changes this contract updates this file in its own branch. Unqualified references to `spec.md`,
> `plan.md`, `research.md` (R-numbers), `quickstart.md`, FR-/SC- numbers and task IDs mean the
> ones in [`specs/001-online-crafts-shop/`](../../specs/001-online-crafts-shop/) unless a later
> spec is named.

File: `src/server/payments/provider.ts`. Implementations: `payplus.ts` (production, sandbox in
staging) and `fake.ts` (tests and local development). Selected by env `PAYMENT_PROVIDER`.
The `fake` adapter refuses to load when `APP_ENV=production`.

```ts
interface PaymentProvider {
  readonly id: "payplus" | "fake";

  /** Create a hosted payment page for a pending checkout. */
  createPaymentPage(input: {
    reference: string;            // pending_checkout.id
    amountMinor: number;          // total incl. delivery, in currency minor units
    currency: "ILS" | "USD";
    locale: "he" | "en";          // provider page language
    customer: { name: string; email: string; phone: string }; // pre-fill only
    description: string;          // e.g. "Aviva's Crafts — 2 items"
    successUrl: string;           // /{locale}/checkout/return?c=<token>&r=success
    failureUrl: string;           // /{locale}/checkout/return?c=<token>&r=failure
    callbackUrl: string;          // https://<domain>/api/payments/<id>/callback
  }): Promise<{ pageId: string; redirectUrl: string }>;

  /** Disable a payment page so it can no longer be paid (used on retry, switch-to-offline and expiry).
   *  Best effort: callers log a failure and continue; a late payment of the page is then caught by
   *  confirmOnlinePayment's second_payment / switched_offline / mismatch / orphan_payment outcomes,
   *  which alert the owner. PayPlus support is verified in the sandbox before launch (R4 open points). */
  disablePaymentPage(pageId: string): Promise<void>;

  /** Verify the authenticity of a callback request (signature, headers). No side effects. */
  verifyCallback(req: { headers: Headers; rawBody: string }): Promise<
    { ok: true; pageId: string } | { ok: false; reason: "bad_signature" | "malformed" }
  >;

  /** Server-to-server status query; the only source of truth for confirming payment. */
  fetchPaymentStatus(pageId: string): Promise<{
    status: "paid" | "failed" | "pending";
    reference: string;            // must equal pending_checkout.id
    amountMinor: number;
    currency: "ILS" | "USD";
    transactionId: string | null; // provider transaction id (unique)
    method: "card" | "bit" | "apple_pay" | "google_pay" | "other" | null;
  }>;
}
```

The adapter never receives or returns card numbers, CVV, or expiry dates. Provider API keys
are read from the secret store (`PAYPLUS_API_KEY`, `PAYPLUS_SECRET_KEY`,
`PAYPLUS_PAYMENT_PAGE_UID`, `PAYPLUS_BASE_URL`) and never logged.

## Confirmation algorithm (`src/server/orders/confirm-online-payment.ts`)

```text
confirmOnlinePayment(status, pageId):
  BEGIN
    pc := SELECT * FROM pending_checkout WHERE id = status.reference FOR UPDATE
    if pc is null:
        if status.status = paid and an order with (provider, status.transactionId) exists
                                           → return "duplicate"   (late provider retry after the confirmed pending row was deleted)
        if status.status = paid            → enqueue owner "payment-attention" (paid for an unknown or expired checkout); log; return "orphan_payment"
        return "unknown"
    if pc.state = confirmed:
        if status.transactionId = existing order's provider_transaction_id → return "duplicate" (no writes, no emails)
        if status.status = paid            → enqueue owner "payment-attention" (possible double payment); log; return "second_payment"
        return "duplicate"
    if pc.state = mismatch                 → return "mismatch"   (already reported; no writes)
    if pc.state = switched_offline:
        if status.status = paid            → enqueue owner "payment-attention" for order pc.order_id (paid online after switching to direct payment: names that order, owner chooses to keep the online payment for it or refund it); log; return "switched_offline"
        return "switched_offline"
    if status.status ≠ paid and pageId ≠ pc.provider_page_id → return "stale"   (late news about an old, disabled page; no change)
    if status.status = pending             → return "pending"
    if status.status = failed              → set pc.state = failed; return "failed"  (no order, no emails)
    if status.amountMinor ≠ pc.total_minor or status.currency ≠ pc.currency
                                           → set pc.state = mismatch, retained_until = now()+30d; enqueue owner "payment-mismatch" email (incl. customer contact); log security event; return "mismatch"
    order := INSERT orders (number from sequence, payment_state = paid, paid_at = now(),
              provider, provider_transaction_id,
              terms_accepted_at / marketing_opt_in_at copied from pc,
              public token = HMAC(SECRET_HMAC_KEY, 'order:' + hex(pc.resume_token_hash)))   -- unique constraint guards races
    INSERT order_lines from pc.lines   (snapshot images are copied AFTER COMMIT from each line's sourceImageKey, best effort — see snapshots.ts)
    INSERT order_event(payment_confirmed)
    enqueue customer "order-confirmation" (dedupe_key order-confirmation:<order.id>)
    enqueue owner "new-order"           (dedupe_key new-order:<order.id>)
    set pc.state = confirmed, pc.order_id = order.id, and set pc's customer/address/note/lines columns to null
  COMMIT
  kick outbox sender; copy order-line snapshot images (best effort; image_key = null if the source is gone)
  return "confirmed"
```

A unique-violation on `(provider, provider_transaction_id)` is treated as `"duplicate"`.

**Retry**: `retryOnlinePayment` disables the old page, creates a new one, and sets
`state = awaiting_provider`, `provider_page_id = <new>`, `last_status_check_at = null`. A `paid`
status for an old page is still confirmed (the money was taken).

**Recovery sweep** (every 5 minutes, job loop): for `awaiting_provider` **and `failed`** rows younger
than 48 h whose `last_status_check_at` is older than 5 minutes, call
`fetchPaymentStatus(provider_page_id)` and run `confirmOnlinePayment(status, provider_page_id)`.
Covers lost or unverifiable callbacks — also for a `failed` row, because a hosted page that declined
a card may let the customer try again on the same page.

**Expiry** (`expire-pending-checkouts`, every 5 minutes): before an expired `awaiting_provider` or
`failed` row is deleted, it gets one final `fetchPaymentStatus(provider_page_id)` +
`confirmOnlinePayment`; a paid result confirms the order as usual (the row is then deleted at the next
run like any confirmed row). Only then is the page disabled (best effort) and the row deleted. If the
status query fails, the row is kept for the next run; a row still unverified 24 h after `expires_at`
is deleted anyway, after an owner `payment-attention` alert ("could not confirm the final status of
this payment page — check the provider dashboard") and a `payment.expiry_unverified` log event.

## Required tests (constitution VI)

- Valid callback → exactly one order, paid, two outbox rows.
- Same callback delivered twice (sequentially and concurrently) → one order, two outbox rows.
- Bad signature → 401, nothing written.
- Valid signature but status query says failed / pending → no order, no email.
- Amount or currency mismatch → no order, `mismatch`, owner alert enqueued.
- Browser success return without any callback, status query says paid → confirmed via the
  status endpoint; with status query pending → page keeps waiting, nothing marked paid.
- Abandoned checkout → deleted after 48 h, no order, no notification.
- After confirmation the pending row holds no personal data.
- Different transaction id on a confirmed checkout → `second_payment`, owner alerted, no order.
- Paid status for a `switched_offline` checkout → owner alerted with the offline order's number (`pc.order_id`, set by the switch), no order.
- Recovery sweep confirms a checkout whose callback never arrived.
- Recovery sweep confirms a `failed` checkout whose current page is later reported paid (lost callback).
- Expiry: a row whose final status query says paid is confirmed, not deleted; a failing status query
  keeps the row; 24 h after `expires_at` an unverified row is deleted with a `payment-attention` alert.
- Retry, then paid on the new page → confirmed by the status endpoint, and (separately) by the sweep.
- Late `failed` status for the old page after a retry → `stale`, row unchanged.
- Retry or switch on a `confirmed`, `switched_offline` or `mismatch` row → `checkout.already_completed`,
  nothing changes; two concurrent switches create exactly one offline order.
- A paid callback repeated after the confirmed pending row was deleted → `duplicate` (found by
  `(provider, transactionId)` on `orders`), no alert.
- `disablePaymentPage` throws during retry or switch → the action still completes (failure logged);
  a later paid status for the old page follows the normal outcomes.
- The online order's confirmation token is computable from the stored `resume_token_hash`.
- Concurrent duplicate callbacks are tested on real PostgreSQL (two connections), not PGlite.
