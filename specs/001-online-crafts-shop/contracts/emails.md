# Contract: Transactional Emails

All emails are transactional (no marketing sending in scope, FR-038). Each is rendered from
`src/server/email/templates/<kind>.ts` with strings from `src/i18n/messages/{he,en}.json`
(`emails.*` keys), as HTML (`<html lang dir>`) plus a plain-text part, and queued in
`email_outbox` with a `dedupe_key`. Sender: `"<shop name>" <EMAIL_FROM>`, where the display name is
`shop_settings.shop_name_*` in the email's locale (Hebrew fallback) — not the legal business name;
`Reply-To` is the business email, or for contact messages the visitor's address from
`email_outbox.reply_to` (`enqueueEmail({…, replyTo})`).

**Subjects never contain personal data**: the subject stays in `email_outbox.subject` until the row is
deleted (30 days), while bodies are erased on sending. A subject is a fixed translated text per kind,
the shop name and, for order emails, the order number — never a customer's or visitor's name, email,
phone or address, an admin's name or email, or an unapproved account's email. Template tests assert
this with sentinel values.

| Kind | To | Trigger | Locale | Must contain | Dedupe key |
|---|---|---|---|---|---|
| `order-confirmation` | customer | order created (offline) / payment confirmed (online) | order.locale | order number; line items with options and prices; delivery fee; total and currency; payment method and state; **offline**: owner's payment instructions + "quote order number"; delivery method; address or pickup instructions; each line's preparation time (from the `order_line` snapshot); business identity (name, reg. number, address, phone, email); cancellation policy summary + link; link to order page (distance-selling written disclosure, R19) | `order-confirmation:<orderId>` |
| `new-order` | notification_emails | same moment | he | order number, items + options, total, payment method and state, customer name/phone/email, delivery method/address, note, link to the admin order page `/admin/orders/<id>` (opens through the same-site bounce, http-endpoints.md) (FR-026) | `new-order:<orderId>` |
| `order-shipped` | customer | status → shipped | order.locale | order number, tracking number if entered (FR-029) | `order-shipped:<orderId>:<n>` |
| `order-ready-for-pickup` | customer | status → ready_for_pickup | order.locale | order number, pickup instructions (owner's note or settings) | `order-ready:<orderId>:<n>` |
| `payment-mismatch` | notification_emails | provider amount/currency mismatch | he | pending checkout reference, expected vs reported amount, customer name/phone/email so the owner can follow up, instruction to check the provider dashboard (no card data) | `mismatch:<pendingId>` |
| `payment-attention` | notification_emails | a paid transaction for a checkout that is already confirmed (different transaction id), was switched to offline, or is unknown/expired; or a pending checkout deleted at expiry whose final status could not be checked | he | reference, order number if any, amount, provider transaction id, second payment, unknown/expired checkout or unverified expiry: "probably a double payment — check the provider dashboard and refund if needed"; paid after the customer switched to direct payment: names the offline order (`pending_checkout.order_id`; the outbox row's `order_id` is that order) and gives the owner the choice — keep the online payment (mark that order paid and tell the customer not to pay directly) or refund it in the provider dashboard (check first whether the customer already paid directly) | `attention:<pendingId>:<transactionId>` |
| `contact-message` | notification_emails | contact form | he (wrapper) | visitor name, email, message; Reply-To visitor | `contact:<uuid>` |
| `security-alert` | all admins' Google emails + notification_emails | blocked passkey attempts, abandoned passkey steps after a successful Google sign-in, unapproved Google sign-ins (these three are throttled to 1 per 15 min per kind), recovery code used, recovery refused because no other admin exists, recovery passkey waiting for approval / approved / rejected, passkey added/removed, admin added/removed, admin reset by the maintainer | he | what happened, when, which admin (never the unapproved account's email or any secret), what to do | throttled kinds (`google_rejected`, `blocked`, `passkey_abandoned`): `security:<kind>:<15-min window>:<recipient hash>`; all other kinds: `security:<kind>:<activityId>:<recipient hash>` (always sent; one outbox row per recipient) |

`<n>` is the number of `order_event` rows of kind `status_changed` whose `data.to` is that status,
counted inside the same transaction after the new event is written (so the first time the order
enters the state `n = 1`). The email is therefore sent again only if the owner moves the order out
of and back into the state.

Delivery: sent immediately after the transaction commits; on failure retried with backoff for
24 h, then marked `failed` and shown on the order page so the owner can call the customer
(edge case: bounced or wrong email). Bodies (and `reply_to`) are erased after sending; a `failed` row keeps them until the row is deleted 30 days later (except with the `outbox-only` driver outside production, where they are kept for tests and `pnpm dev:outbox`).
