# Contract: routes (002)

Every admin route below is under `src/app/admin/(protected)/`, so the protected layout's
`requireAdmin()` runs, **and** each `page.tsx` calls `requireAdmin()` itself before loading data
(spec 001 contract, unchanged). Signed out → `/admin/sign-in?next=<path>` and nothing about the
order is rendered (FR-019, SC-006). Responses are `no-store` + `noindex` (next.config.ts,
unchanged). Layouts are specified in `docs/design/storefront.md` §12 (updated in this branch).

## `GET /admin` (changed)

Admin home: count cards and the settings notice (FR-017, research R13, storefront.md §12.4).

## `GET /admin/orders` (new)

Query parameters (all optional, validated; an invalid value is ignored):

| Param | Values | Meaning |
|---|---|---|
| `status` | `new` `in_preparation` `shipped` `ready_for_pickup` `completed` `cancelled` | status filter |
| `payment` | `awaiting_payment` `paid` `refunded` | payment filter |
| `open` | `1` | exclude Cancelled (set by the admin home link; shown as a removable chip) |
| `page` | integer ≥ 1 (beyond the last page → last page) | 25 rows per page |
| `number` | `#?\d{1,9}` after trimming | order-number box: found → `redirect('/admin/orders/<id>')`; not found → list with an `info` Notice naming the number; not a number → `info` Notice "מספר הזמנה הוא רק ספרות"; filters kept |

Response: the list newest first (storefront.md §12.2). Paging links keep `status`, `payment` and
`open`. "Clear filters" links to `/admin/orders`. Empty result → empty state with a clear link.

## `GET /admin/orders/[id]` (new)

`id` must be a UUID; malformed or unknown → `notFound()` (the admin 404 page, not an error).
Shows the order (FR-006, FR-007, FR-008; storefront.md §12.3). The owner's `new-order` email
links here (`<APP_ORIGIN>/admin/orders/<id>`, unchanged); signed out it goes through sign-in and
`safeAdminNext()` (which already accepts this path) back to the order (FR-001, US1 #7).

Order snapshot photos: `<img src="/api/admin/media/<order_line.image_key>">` (existing route;
its key pattern already accepts `orders/…-400.webp`; admin session required).

## `GET /{locale}/order/{token}` (changed)

- Validity: FR-015 rule (data-model.md › orders). Invalid / expired → the existing
  `EmptyState` "הקישור כבר לא פעיל" with the Contact link (wording updated so it no longer says
  "valid for 30 days", storefront.md §8.8).
- Content: the status tracker of storefront.md §8.8 (updated). Never renders the customer's name,
  address, phone or email; `noindex` (unchanged); `no-store` (unchanged).
- Test ids kept for existing specs: `order-number`, `order-payment-state`, `order-summary`,
  `order-line`, `order-prep-time`, `offline-instructions`, `pickup-instructions`. New:
  `order-progress` (the `<ol>`), `order-step` (each `<li>`, with `aria-current="step"` on the
  current one), `order-tracking-number`, `order-pickup-note`, `order-cancelled`.
