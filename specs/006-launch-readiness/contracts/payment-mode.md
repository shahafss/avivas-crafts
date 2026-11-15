# Contract: "No card payment" mode (`PAYMENT_PROVIDER=none`)

Behaviour of every surface when the shop runs with no card provider. "Effective" values come from
`effectivePaymentMethods` ([data-model.md](../data-model.md)).

| Surface | Behaviour under `none` |
|---|---|
| Startup (`env.ts`) | Starts with no `PAYPLUS_*` variables. In production, `fake` is still refused. |
| Product page buy-box facts | Shows only the offline payment line (storefront.md §8.4: a disabled method's line is omitted). |
| Checkout page | Offers only offline payment; no card option or card wording. |
| `placeOrder` (server action) | Accepts only `paymentMethod: 'offline'`; `online` → `checkout.payment_unavailable_method` and no order is created. |
| Retry card payment / switch to offline (pending checkouts) | Retry → `checkout.payment_unavailable_method`; switch to offline creates the offline order as today but skips `disablePageBestEffort` when the row's provider is not the configured one. No provider call is made. |
| Payment-return page | Shows the order's real state; never confirms a payment. |
| `POST /api/payments/{provider}/callback` | 404 `{"error":"not_found"}` for every `provider`; no order or pending checkout changes. |
| `GET /api/payments/status` | For a pending row whose provider is not the configured one: answers "still pending", calls no provider and never confirms (FR-008). Otherwise unchanged. |
| Payment tasks (expiry, sweep) | Normally find nothing. A stored pending row that names another provider is never left behind: in the expiry task the mismatch counts as a failed status query inside the existing `try`, so the existing 24 h grace, the owner's `payment_attention` alert and the row's deletion apply (Privacy Policy: unfinished-payment details deleted within 48–72 h). The sweep task skips such unexpired rows. No provider is created. |
| CSP `form-action` | `'self'` only (plus the OIDC origin on `/admin/sign-in*`). |
| Admin home, "needs attention" | Lists empty Hebrew offline payment details (`offlineInstructionsHe`) while offline payment is effectively on (FR-010b), like the existing empty-pickup-instructions entry. Applies under every provider. |
| Admin settings, payment section | Card checkbox: unchecked, disabled, hint "Card payment is not set up yet" / "תשלום בכרטיס עוד לא הוגדר". Offline checkbox: checked, disabled. Instructions fields stay editable. |
| `updateSettings` (server action) | Rejects a submission that **contains** `onlinePaymentEnabled: true` or `offlinePaymentEnabled: false` (other settings sections, which send only their own fields, are never blocked by the stored values) with form error `admin.settings.errors.card_not_set_up` ("Card payment is not set up yet, so offline payment must stay on." / he equivalent). |

Under `payplus` and `fake` nothing changes from today.
