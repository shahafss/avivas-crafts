# Contract: Server Actions (003)

All actions return the existing `ActionResult<T>` (`src/server/catalog/result.ts`) with
translation keys. Cross-site protection is Next.js's same-origin check on Server Actions (unchanged
from 001). Input is parsed with Zod after the guard; the data-layer function holds the rules and
does the work in one transaction.

## Public actions

### `submitContact(input)` — `src/app/[locale]/(shop)/contact/actions.ts`

```ts
input: { name: string; email: string; message: string; honeypot: string; formToken: string; locale: 'he' | 'en' }
→ SubmitContactResult = { ok: true; data: undefined } | (Failure & { retryAfterMinutes?: number })
// retryAfterMinutes is set only with formError 'contact.errors.rate_limited'
```

Order of checks (data layer `src/server/contact/submit.ts`, research R13; user decision Q3:
only messages actually sent count toward the limit):

1. `honeypot !== ''` or `!verifyFormToken(formToken)` → `formError: 'contact.errors.expired'`
   (the visitor sees "please reload the page and try again"; nothing sent, nothing counted).
2. Fields: `name` trimmed 2–100 → `contact.errors.name`; `email` (checkout's email rule, ≤ 254,
   domain lower-cased) → `contact.errors.email`; `message` trimmed 10–5,000 →
   `contact.errors.message_short` / `contact.errors.message_long`. All field errors at once;
   nothing counted.
3. Rate limit `checkRateLimit('contact', getClientIp(headers) ?? 'unknown', {limit: 5, windowSec: 3600})`
   (clock-hour window) → over the limit: `formError: 'contact.errors.rate_limited'` with
   `retryAfterMinutes = ceil(retryAfterSec / 60)` in the result for the message.
4. One transaction: one `contact-message` outbox row per notification address
   (contracts/emails.md), `replyTo` = the visitor's email, `dedupeKey` `contact:<uuid>:<index>`.
   After commit, `kickOutbox()`.

No activity row (not an admin action); the structured logger records only
`contact_message_queued` with no fields.

### `saveConsent(input)` — `src/app/[locale]/(shop)/consent/actions.ts`

```ts
input: { choices: Record<string, boolean> }   // keys = enabled optional category ids
→ ActionResult<{ choices: Record<string, boolean> }>
```

- `consentRequired()` false → `formError: 'consent.errors.unavailable'`, nothing written.
- Unknown keys are ignored; missing enabled categories count as `false`.
- Inserts `consent_record {choices, policy_version: <cookies page version>}`, sets the
  `ac_consent` cookie (contracts/consent.md) and expires the cookies of every category now
  `false`. Rate limit `consent` 30 per 60 s per IP-hash: over the limit the choice **still takes
  effect** (the `ac_consent` cookie is set and rejected categories' cookies are expired) and only
  the `consent_record` insert is skipped, so a rejection is never dropped (FR-022, constitution
  VII) while a stuck button cannot flood the table.

### `expireUndecidedCookies()` — `src/app/[locale]/(shop)/consent/actions.ts`

```ts
input: none (arguments a client sends are ignored)
→ Promise<void>
```

Public. Calls `expireOptionalCookiesIfUndecided()`: a no-op unless `consentRequired()` and
`needsChoice` (no valid `ac_consent`, or one for an older `cookies` page version); then expires the
cookie of every optional registry item and leaves `ac_consent`, so the old choice still pre-sets the
switches (FR-022, Clarifications 2026-11-10). Writes nothing to the database (one read of the
`cookies` page version), so no rate limit; it can never remove a cookie accepted under the current
policy. Called by `ConsentBanner` on mount only when `ConsentRoot` passed `staleOptional = true`
(computed on the server from the request's cookies, `HttpOnly` ones included). Cookies are expired
host-only at `Path=/`; a future category whose cookies use another `Domain` or `Path` must add them
to its registry item (applies to rejection too).

## Admin actions

Every action's **first statement is `requireAdmin()`** (before parsing; checked by
`tests/integration/admin-actions-guard.test.ts`). Writes take an `Actor` (`actorOf(context)`).
Only `exportCustomer` and `anonymizeCustomer` are ⟳ passkey re-check actions (FR-019a, user
decision at the plan gate): their first statement is `requireRecentAuth()` (which calls
`requireAdmin()` itself) and they return `{ok: false, formError: 'admin.reauth_required'}`, with no
database write, when the passkey was not confirmed in the last 5 minutes. The island wraps them in
the existing `useReauthGate()`, which opens the passkey dialog and retries. Every other action
here needs no re-check.

### Content — `src/app/admin/(protected)/content/[slug]/actions.ts`

#### `updateContentPage(input)`

```ts
input: {
  slug: 'about' | 'contact' | 'privacy' | 'terms' | 'cookies' | 'shipping-returns' | 'accessibility';
  expectedVersion: number;          // the version the editor loaded
  titleHe: string; bodyHe: string;  // required
  titleEn: string; bodyEn: string;  // '' → stored as NULL
}
→ ActionResult<{ version: number; unchanged: boolean }>
```

- Field rules (data-model.md › content_page) → `fieldErrors` with
  `admin.content.errors.{title_required|title_long|body_required|body_long}`.
- Locked row's `version !== expectedVersion` → `formError: 'admin.content.errors.stale'`.
- Identical text → `{unchanged: true}`, nothing written.
- Otherwise: update, `version + 1`, `owner_edited = true`; for `terms`/`privacy` insert the
  `content_page_version` row; activity `content.updated` `{slug, to}`. `revalidatePath` is not
  needed (public pages render per request).

#### `previewContent(input)`

```ts
input: { body: string }   // ≤ 50,000 chars
→ ActionResult<{ html: RenderedHtml }>   // the branded type renderMarkdown() returns (T003)
```

Renders with the public renderer (research R2). Read-only; no activity.

### Customers — `src/app/admin/(protected)/customers/actions.ts`

Shared input `CustomerRef = { q: string; orderIds: string[] }` (`q` 3–254 chars; `orderIds` ≤
500 UUIDs). The server re-matches `q` (research R8) and acts on `orderIds ∩ matches(q)`.
`q` that is neither an email nor a valid phone → `fieldErrors: {q: 'admin.customers.errors.query'}`.

#### `searchCustomers(input: { q: string })`

```ts
→ ActionResult<{
    field: 'email' | 'phone';
    orders: { id: string; orderNumber: number; createdAt: string; status: OrderStatus;
              paymentState: PaymentState; totalMinor: number; currency: 'ILS' | 'USD';
              marketingOptIn: boolean; open: boolean }[];   // open = not completed/cancelled
    pendingCheckouts: number;
    emails: number;
    otherIdentifiers: { emails: string[]; phones: string[] };   // used on the found orders, other than q
  }>
```

Read-only; activity `customer.searched` `{field, count}` (written even for zero results). The
result shows numbers, dates, statuses, totals and the order links (where 002 shows details), plus
`otherIdentifiers` — the other emails and phones on the found orders, so Aviva can search them
(FR-016, user decision Q5). It never includes names or addresses. "Found" means research R8 ›
"What a search finds".

#### `exportCustomer(input: CustomerRef)` ⟳

```ts
→ ActionResult<{ filename: string; content: string }>   // filename: customer-YYYY-MM-DD.json (Israel date)
```

`content` = pretty-printed UTF-8 JSON (below). Activity `customer.exported` `{count}`. Nothing
stored.

```jsonc
{
  "exportedAt": "2026-11-09T12:00:00.000Z",
  "shop": { "legalName": "…", "email": "…", "phone": "+972…" },
  "searchedBy": "email",
  "orders": [{
    "orderNumber": 1001, "createdAt": "…", "language": "he", "status": "completed",
    "customer": { "name": "…", "email": "…", "phone": "+972…" },
    "delivery": { "method": "shipping", "country": "IL", "city": "…", "line1": "…", "line2": null, "postalCode": "…" },
    "note": null, "trackingNumber": null, "pickupNote": null,
    "items": [{ "name": "…", "options": [{ "group": "…", "value": "…" }], "unitPriceMinor": 12000, "quantity": 1, "lineTotalMinor": 12000 }],
    "currency": "ILS", "subtotalMinor": 12000, "deliveryFeeMinor": 3000, "totalMinor": 15000,
    "payment": { "method": "online", "state": "paid", "paidAt": "…", "refundedAt": null },
    "terms": { "acceptedAt": "…", "termsVersion": 2, "privacyVersion": 1 },
    "marketing": { "optIn": true, "optInAt": "…", "withdrawnAt": null }
  }],
  "pendingCheckouts": [{ "createdAt": "…", "state": "…", "customer": { … }, "delivery": { … } }],
  "emails": [{ "kind": "order-confirmation", "to": "…", "replyTo": null, "createdAt": "…", "status": "sent", "sentAt": "…" }]
}
```

Amounts are in minor units (agorot / cents) as stored, with `currency`; product names in the
order's language (Hebrew fallback).

#### `withdrawMarketingConsent(input: CustomerRef & { confirm: true })`

Missing `confirm` → `admin.confirm_required` (before database access). Effect: research R10
(orders shown, plus `marketing_opt_in = false` on the unfinished checkouts the search finds).
→ `ActionResult<{ count: number }>`; activity `customer.marketing_withdrawn` `{count}`.

#### `anonymizeCustomer(input: CustomerRef & { confirm: true })` ⟳

Missing `confirm` → `admin.confirm_required`. Effect: research R10 (orders shown and the
stored emails the search finds, `order_event anonymized`; unfinished checkouts are left to
expire).
→ `ActionResult<{ count: number; skipped: number; keptCheckouts: number }>` (`skipped` = shown
orders that no longer match or were already anonymised; `keptCheckouts` = the unfinished checkouts the search found, all left to expire because each may
still become a real payment — user decisions 2026-11-09; anonymisation deletes no
`pending_checkout` row).
Activity `customer.anonymized` `{count}`, always written, including `count: 0`
(Clarifications 2026-11-10).

## Data-layer functions (for tests)

| Function | File |
|---|---|
| `getPage(slug, locale)`, `listPages()`, `updateContentPage(actor, input)`, `listVersions(slug)`, `getVersion(slug, version)` | `src/server/content/pages.ts` |
| `renderMarkdown(text)` | `src/server/content/markdown.ts` |
| `loadDrafts(tx, contentDir)` (called by `runSeed`) | `src/server/content/drafts.ts` |
| `submitContact(input, ctx: {ip, now?})` | `src/server/contact/submit.ts` |
| `findCustomer(q)`, `matchOrders(ref)` | `src/server/privacy/customers.ts` |
| `exportCustomer(actor, ref)` | `src/server/privacy/export.ts` |
| `withdrawMarketingConsent(actor, ref & {confirm})` | `src/server/privacy/consent.ts` |
| `anonymizeOrders(tx, orderIds, actor \| null)`, `anonymizePerson(actor, ref & {confirm})` | `src/server/privacy/anonymize.ts` |
| `recordView(input, ctx)` | `src/server/analytics/beacon.ts` |
| `getStats(days)` | `src/server/analytics/stats.ts` |
| `saveConsentRecord(choices, ctx)`, `parseConsentCookie(value)`, `serializeConsentCookie(record)`, `expireOptionalCookiesIfUndecided()` | `src/server/consent/consent.ts` |
| retention `JobTask`s | `src/server/jobs/daily-maintenance.ts` (tasks in `src/server/privacy/retention.ts`) |
