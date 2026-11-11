# Research: Privacy, Consent, Legal and Content Pages (003)

Decisions for the 003 plan. Spec 001's research is background and stays valid unless a section
here says otherwise: R10 (cookieless statistics), R11 (bot and abuse protection), R12 (background
work), R14 (CSP), R16 (Markdown for editable pages), R17 (client IP) and R19 (legal approach). This
file records how 003 applies them to the code as it is after 002, and the new decisions.

## R1. What already exists (audit of 001 tasks T100–T118 against the code)

| Old task | State after 001 + 002 | 003 action |
|---|---|---|
| T100 registry test, T108 registry | No `src/lib/consent/`. `CONSENT_TEST_CATEGORY` exists in `src/server/env.ts` (refused in production); `consent` Playwright project and its web server on port 3101 exist; CSP has an `optionalScriptHosts` slot (always `[]`). | Build registry + config (R4). |
| T101 privacy e2e | `privacy` is already in `STOREFRONT_SPECS` (playwright.config.ts); no spec file. | Write it. |
| T102 consent e2e, T109 banner | No banner, gate, test script route or `saveConsent`. Messages namespace `consent` exists, empty. | Build (R5). |
| T103/T115/T116 customer tools | Columns exist: `orders.marketing_withdrawn_at`, `anonymized_at`, nullable phone/email with the `orders_contact_present` CHECK, `terms_version`, `privacy_version`. `updateOrderCustomer` (002) does correction. Admin nav already links `/admin/customers`. Admin order page already shows "anonymised" (002). | Build search, export, withdraw, anonymise (R8–R10). |
| T104 retention | `daily-maintenance.ts` has rate-limit, OAuth-flow, session and image tasks only. | Add four tasks (R11). |
| T105/T117 statistics | Tables `analytics_daily_page`, `analytics_daily_referrer` exist; no beacon, route or page. Nav links `/admin/stats`. | Build (R12). |
| T106/T110/T111 content | `content_page` exists with `version`, `owner_edited`; seed inserts seven rows with "טיוטה". `markdown-it` 15 is installed; `src/components/ui/Prose.tsx` exists; no renderer, no `Markdown` component, no public page, no admin editor. Nav links `/admin/content`. | Build (R2, R3, R6, R7). |
| T112 drafts + seed | `SeedOptions.contentDir` exists but is unused; no drafts. | Write drafts, load them (R7). |
| T113 footer | Placeholder footer (shop name and © only). | Complete, without the language switch (R14). |
| T114 contact | No route; `/{locale}/contact` is linked from the order page and the product page. Messages namespace `contact` exists, empty. Outbox already has `reply_to` and the sender already blanks `html`, `text_body`, `reply_to` after a successful send (unless the dev driver's `keepBodies`). | Build (R13). |
| T118 DSR drafts | None. | Write (R17). |
| References to T095 (`language.spec.ts`, `PUBLIC_ROUTES`) and T098 (`alternates()`, `src/lib/seo.ts`) | Do not exist; they belong to roadmap item 005. | Dropped. 003 sets each page's `<title>` only; 005 adds `hreflang` alternates and the both-languages route test. |
| T111 "make the T086 offline/pickup fields use MarkdownEditor" | The settings page keeps plain text ("Until the Markdown editor … exists"). | **Dropped on purpose**: those texts are shown as plain text in checkout, the order page and emails; switching them to Markdown would change three renderers and the emails for no spec requirement. The settings comment is updated to say so. |

## R2. Markdown rendering (FR-003)

- **Decision**: `src/server/content/markdown.ts` renders with `markdown-it` (installed) using the
  `default` preset with `html: false` (raw HTML is escaped as text), `breaks: true` (a single
  Enter is a line break, so Aviva never needs Markdown's two trailing spaces), `linkify: true`
  with `linkify.set({fuzzyLink: false})` (only written-out `https://…` addresses become links; a
  bare `www.example.co.il` stays text),
  `typographer: false`, and these rules **disabled**: `image`, `table`, `code`, `fence`,
  `blockquote`, `hr`, `strikethrough`. Allowed output: paragraphs, `h2`/`h3`, bold/italic, ordered and
  unordered lists, links, line breaks. A heading of level 1 is rendered as `h2` and 4–6 as `h3`
  (the page `h1` is the title, one per page). `validateLink` allows only `https:`, `mailto:`,
  `tel:`, and same-site paths starting with a single `/` followed by neither `/` nor `\` (e.g.
  `/he/contact`, so drafts can link to the shop's own pages); `http:`, `javascript:`, `data:`,
  `vbscript:`, `//host`, `/\host` and anything else are dropped (reference-style links go through
  the same check) (the link text stays as text). External `https:` links get
  `rel="noopener noreferrer"`. Rendered Markdown is shown only through `src/components/ui/Markdown.tsx`.
  The project bans `dangerouslySetInnerHTML` with a custom `no-restricted-syntax` rule
  (`eslint.config.mjs`), which already exempts `src/components/ui/Markdown.tsx` and
  `src/components/shop/JsonLd.tsx` by file. `renderMarkdown()` returns a branded `RenderedHtml`
  string that `Markdown` requires.
- **Rationale**: 001 R16; FR-003 as amended 2026-11-09 (headings, bold, italic, lists, line
  breaks, links to https / email / phone / the shop's own pages). Same-site paths cannot run code.
- **Alternatives**: allowing tables (useful for the processor list, but FR-003 excludes them; the
  drafts use lists); a sanitiser on HTML input (unnecessary: no HTML is ever accepted).

## R3. Content pages: reads, writes and versions (FR-001, FR-002, FR-009–FR-011)

- **Public read**: `getPage(slug, locale)` in `src/server/content/pages.ts` returns title and body
  through `pick()` (`src/lib/i18n-fallback.ts`, existing), each with its `Picked.lang`, so a
  Hebrew fallback on `/en` is wrapped with `fallbackAttrs()` (`lang="he" dir="auto"`). Unknown
  slug → `notFound()`.
- **Write**: `updateContentPage(actor, input)` in one transaction: lock the row
  (`FOR UPDATE`), check `expectedVersion` (the version the editor opened; a mismatch returns
  `admin.content.errors.stale`, so two admins never overwrite each other silently), validate
  (Hebrew title 1–120 and body 1–50,000; English title ≤ 120 and body ≤ 50,000, empty → null),
  set the new text, `version = version + 1`, `owner_edited = true`, `updated_at = now()`; for
  `terms` and `privacy` insert the new version's copy into `content_page_version` (R3a); write
  `admin_activity` `content.updated` with `{slug, to: newVersion}`. No change (identical text) →
  no version bump, `ok` with `{unchanged: true}`.
- **R3a. Version history (FR-011, Clarifications 2026-11-09)**: new table
  `content_page_version (slug, version, title_he, title_en, body_he, body_en, created_at)`,
  primary key `(slug, version)`, CHECK `slug IN ('terms','privacy')`. Rows are inserted in the
  same transaction that makes a version current (admin save, or seed loading a changed draft) and
  are never updated or deleted by any code path (no retention task touches the table; the
  integration test asserts that every writer only inserts). The migration back-fills the current
  `terms` and `privacy` rows, so every version an existing order points to has a copy. Readers:
  `listVersions(slug)` and `getVersion(slug, version)` for the admin version pages; the admin
  order page links to `/admin/content/{terms|privacy}/versions/{n}` for its `terms_version` and
  `privacy_version`.
- **Why a separate table and not JSON on `content_page`**: an append-only table is easy to
  reason about (no rewrite of a growing blob), keyed exactly as orders reference it.
- **Alternatives**: history for all seven pages (rejected by the clarification: only the two
  versions an order records); a database trigger to forbid UPDATE/DELETE (rejected for simplicity,
  constitution V; the only writer is one insert helper, covered by tests).

## R4. Device-storage registry and optional categories (FR-004, FR-020, FR-023)

- **Decision**: `src/lib/consent/registry.ts` (pure, client-safe, no env access) exports
  `STORAGE_ITEMS` — exactly the five launch items of 001 contracts/device-storage.md (`ac_cart_v1`,
  `NEXT_LOCALE`, `ac_checkout`, `__Host-ac_admin`, `__Host-ac_oauth`) plus `ac_consent` and the test
  category's `ac_test_optional`, each with `name`, `kind`, `category`, `purposeKey`, `durationKey`,
  `firstParty`, `scope`, and `onlyWhen: 'consent-required' | 'test-category' | undefined` — and
  `itemsFor(config)` which returns the items that can exist under a configuration.
  `src/server/consent/config.ts` (server-only) builds the configuration from env:
  `optionalCategories()` = the real categories (none at launch: an empty list in code, so enabling
  one is a reviewed code change, not an env flip) plus, when `CONSENT_TEST_CATEGORY=analytics`,
  the dummy `analytics` category whose only script is `/test-optional.js`;
  `consentRequired() = optionalCategories().length > 0`. Only server code calls it; pages pass the
  result down as props (the `consent` Playwright project reuses the same build with a different
  env).
- **Note on `NEXT_LOCALE`**: it is written only by the language switch, which is roadmap item 005.
  The registry still lists it (it is in the contract); next-intl's own cookie is off
  (`localeCookie: false` in `src/i18n/routing.ts`), so until item 005 nothing sets it. The E2E
  storage check allows any registry item, so it does not matter whether it appears.
- **Cookie Policy table**: `src/components/shop/StorageTable.tsx` renders `itemsFor(config)` with
  `scope: 'public'` items first, then admin items (labelled "admin area only"), with purpose and
  lifetime from `consent.items.*` strings (storefront.md §7.25).
- **CSP**: `optionalScriptHosts` stays `[]`; the test script is same-origin and loaded with the
  page nonce under `'strict-dynamic'`. A real third-party category later must add its hosts here
  (documented in contracts/consent.md).

## R5. Consent banner and gate (FR-021, FR-022, SC-003)

- **Decision** (001 T109, storefront.md §7.21, §8.13): the public layout renders the server
  `ConsentRoot`, which calls `consentRequired()`. When false it returns `null`: nothing
  consent-related is rendered, so no consent client reference reaches the page. When true it reads
  the `ac_consent` cookie (`HttpOnly`, so only the server can read it), parses `{id, version,
  choices}`, and renders the small client `ConsentLoader`, which imports `ConsentBanner` and
  `ConsentGate` with `React.lazy` + `Suspense` (`next/dynamic`'s runtime would break the product
  route's bundle budget; implementation, 2026-11-10). The split is done in a **client** loader because Next.js 16
  does not code-split a Client Component that a Server Component imports dynamically
  (`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`). The banner carries a marker
  string (`ac-consent-banner-v1`) that no other module contains, and the launch E2E check asserts
  no downloaded same-origin script contains it; implementation starts by building once and
  checking the chunks for the marker (contracts/consent.md).
- **`ConsentGate`** injects each accepted category's scripts with the page nonce (read from the
  `x-nonce` request header in the layout and passed as a prop). It renders nothing for rejected or
  undecided categories.
- **`saveConsent`** Server Action (`src/app/[locale]/(shop)/consent/actions.ts`): refuses with
  `ok: false` when `consentRequired()` is false; validates `choices` against the enabled category
  ids; inserts a `consent_record` (`choices`, `policy_version` = the `cookies` page version,
  `decided_at`), sets `ac_consent` = `<record id>.<policy version>.<base64url JSON choices>`
  (`Secure` on https origins, `HttpOnly`, `SameSite=Lax`, `Path=/`, 12 months), and expires every
  cookie of the categories now rejected (`ac_test_optional` in the test setup) so a change takes
  effect at once (US6 #4). Over the 30-per-minute limit only the `consent_record` insert is
  skipped; the cookie changes still happen, so a rejection is never lost. A malformed cookie is treated as no choice.
- **Re-ask on policy change**: the version in the cookie is compared with the current `cookies`
  page version; any save of the Cookie Policy (admin or seed) makes visitors choose again. Until
  they choose, **nothing optional loads** (`effectiveChoices` all false; user decision Q2,
  2026-11-09); the old choices only pre-set the dialog's switches.
- **Equal prominence**: both buttons are the same `secondary` `Button` size `md`, side by side,
  same width (`grid-cols-2`); the E2E test compares bounding boxes and computed styles.
- **Footer link**: "Cookie settings" is a `button` (not a link) that opens the settings `<dialog>`
  via the banner island; it is rendered only when consent is required.

## R6. Admin content screens (FR-009–FR-011, US4)

- **Routes**: `/admin/content` (list), `/admin/content/[slug]` (editor),
  `/admin/content/[slug]/versions` (history, `terms`/`privacy` only, else 404) and
  `/admin/content/[slug]/versions/[version]` (one past version, read-only, rendered like the public
  page). All call `requireAdmin()` first.
- **Editor** (`src/components/admin/MarkdownEditor.tsx`, client island): Hebrew / English tabs
  (two `role="tab"` buttons; each tab has title `TextField` + body `TextArea` 16 rows), toolbar
  buttons כותרת (`## `), מודגש (`**…**`), רשימה (`- `), קישור (`[text](https://)`) that insert
  syntax at the selection and restore focus; "תצוגה מקדימה" toggles a preview panel that calls the
  `previewContent` Server Action (server renderer, so the preview equals the public page) and
  renders the returned HTML through `Markdown`. "שמירה" (primary) calls `updateContentPage` with
  `expectedVersion`; success → `Toast` "הדף נשמר"; stale → `alert` Notice with a reload link.
- **List**: each page with title, "טיוטה שסופקה עם האתר" (`owner_edited = false`) or "נערך"
  badge, last change date (`formatDateTime`), and for Terms / Privacy a "גרסאות קודמות" link.
- **Rationale**: 001 R16; constitution II (plain Hebrew, phone-first).

## R7. Supplied drafts and the seed (FR-006–FR-008)

- **Files**: `docs/legal-drafts/{about,contact,privacy,terms,cookies,shipping-returns,accessibility}.{he,en}.md`.
  First line `# Title`; the rest is the body. The five legal pages' bodies start with the notice
  paragraph "**טיוטה — נדרשת בדיקה משפטית.** …" / "**Draft — requires legal review.** …".
  Placeholders for business facts the drafts cannot know are written as
  `[להשלמה: …]` / `[to be completed: …]` so the legal reviewer and Aviva see them.
- **Loading**: `runSeed(db, { samples, contentDir })` — `scripts/seed.ts` passes
  `contentDir = <repo>/docs/legal-drafts` (resolved from the script's location, so it works in the
  dev script, E2E setup and the deploy seed). In the seed transaction, for each slug: no row →
  insert with version 1; row with `owner_edited = false` and a different title/body → replace,
  `version + 1`; row with `owner_edited = true` → never touched; identical → nothing. For `terms`
  and `privacy`, every inserted or bumped version also inserts its `content_page_version` copy.
  `contentDir` omitted (PGlite tests that do not care) → today's placeholder behaviour; the
  placeholder insert still records the version-1 copy of `terms` and `privacy` for rows it
  inserts, so every version has its copy (data-model.md). A missing or unreadable draft file fails the seed loudly
  (deploy stops) rather than shipping a placeholder.
- **Why files and not a migration**: drafts change during legal review; the seed already runs on
  every deploy and is idempotent; files are reviewable in pull requests.

## R8. Finding a customer (FR-016)

- **Decision**: the search box takes one value. `src/server/privacy/customers.ts`
  `findCustomer(q)`: if it contains `@`, it is an email — trimmed, compared with
  `lower(customer_email) = lower(q)`; otherwise it is parsed as a phone with libphonenumber
  (default region IL, as checkout does through `normalisePhone`) and compared with the stored
  E.164 `customer_phone`. Invalid input → field error "נא להזין מייל או מספר טלפון". Anonymised
  orders have no email or phone, so they never match (spec edge case).
- **One identifier per search** (FR-016 as amended; user decision Q5): the result lists every
  order matching the searched email or phone (newest first: number, date, status badge, total,
  link to the order page where 002's correction lives), counts of the unfinished checkouts and
  stored emails the search finds, and **the other emails and phones used on those orders**, each
  a button that runs a new search for it. There is no automatic merging of identifiers (merging
  could join two different people); Aviva decides by searching again.
- **What a search finds**: orders whose email (lower-case) or phone (E.164) equals the searched
  value; unfinished checkouts with that email or phone; stored emails whose `order_id` is one of
  those orders or, for an email search, whose `lower(to_address)` / `lower(reply_to)` equals it.
  A search with no orders but with stored emails (e.g. a contact message still in the outbox)
  shows the counts and offers export and anonymise; with nothing at all it shows "לא נמצאו
  לקוחות".
- **Exactly the orders shown**: the page keeps the shown order ids; export, withdraw and
  anonymise send `{q, orderIds}`, and the server acts on the intersection of `orderIds` with what
  `q` matches now (an order that stopped matching, e.g. corrected in between, is skipped and
  counted in the result message). New orders that arrive after the search are not touched.
- **No search term in URLs (FR-016)**: the search is a Server Action (POST) called from the
  `CustomerSearch` island; results are client state; the page URL stays `/admin/customers`.
- **Activity**: `customer.searched` with `{field: 'email'|'phone', count}` (FR-019a; 001 had no
  activity for search, the approved 003 spec adds it).
- **Performance**: sequential scan over a few thousand orders is milliseconds; no index (V).

## R9. Export file (FR-017)

- **Decision**: `exportCustomer({q, orderIds})` Server Action returns
  `{filename: 'customer-YYYY-MM-DD.json', content}`; the island turns it into a `Blob` download
  (object URL, revoked right after). Content: pretty-printed UTF-8 JSON (2-space indent) with
  top-level `exportedAt`, `shop` (legal name, email, phone), `searchedBy` (`email`|`phone`),
  `orders[]` (orderNumber, createdAt, locale, status, items with options and quantities, amounts,
  currency, delivery method, address, payment method and state, paidAt, refundedAt,
  termsAcceptedAt, termsVersion, privacyVersion, marketingOptIn, marketingOptInAt,
  marketingWithdrawnAt, note, trackingNumber, pickupNote, customer name/email/phone),
  `pendingCheckouts[]` (createdAt, state, the same customer and delivery fields), `emails[]`
  (kind, to, replyTo, createdAt, status, sentAt — never the bodies, which are blanked after
  sending). Field names in English; values as stored. Exact shape (nested, `language` for the order locale): contracts/server-actions.md › `exportCustomer`; the list above is a summary.
- **Rationale**: 001 plan (JSON, "readable file"); the spec assumption keeps it. The file is
  produced on demand and never stored by the shop; the security procedure tells Aviva to send it
  only to the verified customer and delete her copy afterwards (R17).
- **Alternatives**: a route handler download (needs its own CSRF handling and admin-route test
  plumbing; a Server Action already has both); CSV (multi-table data does not fit one sheet).

## R10. Marketing withdrawal and anonymisation (FR-018, FR-019, FR-026)

- **Withdrawal** `withdrawMarketingConsent({q, orderIds, confirm: true})`: one transaction; for
  the matched orders with `marketing_opt_in = true`: `marketing_opt_in = false`,
  `marketing_withdrawn_at = now()`; `marketing_opt_in_at` kept. The unfinished checkouts the
  search finds also get `marketing_opt_in = false` (`marketing_opt_in_at` NULL), so an order
  confirmed afterwards does not bring the consent back. Activity
  `customer.marketing_withdrawn` `{count}`. Shown only when any shown order has consent.
- **Anonymisation** `anonymizeCustomer({q, orderIds, confirm: true})` → data layer
  `anonymizePerson(actor, match)` in one transaction:
  1. Collect the matched orders (`orderIds ∩ matches(q)`, `FOR UPDATE`) — only the searched
     email or phone defines the reach (user decision Q5); other identifiers on those orders are
     not used to delete anything.
  2. `anonymizeOrders(tx, orderIds, actor)` — shared with retention — applies 001 data-model.md ›
     order exactly: `customer_name = 'נמחק'`; NULL `customer_phone`, `customer_email`,
     `address_city`, `address_line1`, `address_line2`, `address_postal_code`, `note`,
     `tracking_number`, `pickup_note`, `marketing_opt_in_at`, `marketing_withdrawn_at`;
     `marketing_opt_in = false`; `anonymized_at = now()`; keeps amounts, lines, dates, status,
     payment and `address_country`. Orders already anonymised are skipped. Inserts `order_event`
     `anonymized` (`admin_id` = the admin; for the 7-year task `admin_id` NULL and
     `data: {system: true}`, so a later removed admin's NULL id is never mistaken for the system).
  3. **Leaves every unfinished checkout the search finds** (`pending_checkout` with the searched
     email or phone) to expire on its own, and counts them as `keptCheckouts` (user decisions Q1
     and round 3, 2026-11-09). Only open rows still hold personal data — `awaiting_provider` and
     `failed` (both still payable: `OPEN_STATES` in `src/server/orders/payment-tasks.ts`, retried by
     `lockPending` in `place-order.ts`) and `mismatch` (kept 30 days so Aviva can contact the
     customer); `confirmed` and `switched_offline` rows already have their personal columns cleared
     — so deleting any of them could lose a real payment. They expire within 48 h (+ the existing
     24 h grace for an unverifiable status) or 30 days. If one of them is paid afterwards,
     `confirmInTx` creates a new order with the person's details: the island's `info` Notice says
     so and tells Aviva to search again in 3 days.
  4. Deletes every `email_outbox` row (any status, owner notifications included — they hold the
     customer's details in their bodies) whose `order_id` is one of the anonymised orders, or, for
     an email search, whose `lower(to_address)` or `lower(reply_to)` equals the searched email.
     `payment-mismatch` owner emails (`order_id` NULL) belong to a kept `mismatch` checkout and stay
     with it (the sender blanks their bodies once sent; `delete-old-outbox` removes them).
  5. Activity `customer.anonymized` `{count}`.
  The confirmation dialog warns when any matched order is not Completed or Cancelled (US3 #6).
- **Order lines**: `order_line` holds product snapshots and chosen options only, no personal data
  (001 data-model), so it stays.
- **Rationale**: 001 FR-039/FR-040, 001 contracts/server-actions.md, data-model.md › order.

## R11. Retention tasks (FR-026, FR-027, US7)

Added to `dailyTasks` in `src/server/jobs/daily-maintenance.ts` (001 R12: run once per UTC day
under a `job_run` lease; each returns a non-personal summary):

| Task name | Rule | Note |
|---|---|---|
| `anonymize-old-orders` | orders with `anonymized_at IS NULL` and `created_at < now − 7 years` → `anonymizeOrders(tx, ids, system)`, plus deleting their outbox rows (step 4 above for those ids only) | at most 500 per run (a backlog finishes over days; there is none at launch) |
| `delete-old-activity` | `admin_activity.at < now − 2 years` (the column is `at`) | |
| `delete-old-consent` | `consent_record.decided_at < now − 2 years` | |
| `delete-old-outbox` | `status = 'sent' AND sent_at < now − 30 days`, or `status = 'failed' AND next_attempt_at < now − 30 days` | the sender gives up at the first failed attempt that is ≥ 24 h old (`src/server/email/sender.ts` `givesUp`), which can be much later if the app was down; so the sender's `failed` update now also sets `next_attempt_at = now`, making that column the time of the final failure (no new column) |

Every cut-off is computed from the `now` passed to `JobTask.run` (as the existing tasks do and
`tests/integration/jobs.test.ts` injects), with calendar arithmetic in SQL
(`${now}::timestamptz - interval '7 years'`), so the 6-years-11-months test order is untouched. Every task is idempotent (a second run finds nothing).
The contact message body and `reply_to` are already erased by the sender on success (FR-015);
failed contact rows keep them until `delete-old-outbox` (30 days after the final failure).

## R12. Cookieless statistics (FR-024, FR-025, US5)

- **Beacon** (001 R10, contracts/http-endpoints.md › `POST /api/v`):
  `src/components/shop/StatsBeacon.tsx` (client, in the public layout) calls
  `navigator.sendBeacon('/api/v', JSON {p, r?})` on mount and on every `usePathname()` change;
  `r` = the `document.referrer` host, lower-cased, sent with the **first beacon this document
  actually sends** (`""` only when there is no referrer; the shop's own host is sent as is). So a
  visitor who lands on an order page from an email (no beacon there) and then goes to the home
  page counts as one `(direct)` arrival; one returning from the payment page is dropped by the
  payment-host rule. A reload keeps the original `document.referrer` and counts a second arrival
  (accepted: "basic statistics"). It sends nothing for
  paths that can never be counted (`/{l}/checkout…`, `/{l}/order/…`), so order-page tokens never
  leave the browser in a beacon. Stores nothing; no cookies.
- **Route** `src/app/api/v/route.ts` → `recordView(input, ctx)` in `src/server/analytics/beacon.ts`:
  always `204` (also on any error). Drops: requests whose `Origin` header is not exactly
  `APP_ORIGIN` (`isSameOrigin()` from `src/server/security/origin.ts`; same-origin
  `navigator.sendBeacon` POSTs carry `Origin`, so cross-site pages cannot inflate the counters —
  constitution IV, CSRF on every state-changing request); bodies over 1 KB; user agents matching a bot list
  (`bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse`, case-
  insensitive); rate limit 60/min per IP-hash (`checkRateLimit('beacon', ip ?? 'unknown')`).
  Path normalisation (pure, `src/lib/analytics/normalise-path.ts`, unit-tested): strip query and
  hash, decode once, collapse trailing slash; accept only `/{he|en}`, `/{l}/c/{slug}`,
  `/{l}/p/{slug}`, `/{l}/search`, `/{l}/cart`, `/{l}/pages/{known slug}`, `/{l}/contact`
  (slug = `[a-z0-9-]{1,80}`); everything else (admin, api, `/{l}/checkout/*`, `/{l}/order/*`,
  unknown) is ignored, so private tokens never reach the tables. A path that passes the pattern is
  then checked against the database before counting (FR-024 "unknown addresses MUST NOT be
  counted"): `/p/{slug}` only for an existing **published** product, `/c/{slug}` only for an
  existing category, `/pages/{slug}` only for the six served slugs. Made-up or 404 slugs are not
  counted, so forged beacons cannot fill the tables with junk rows. Referrer: lower-case host only,
  `(direct)` for `""`, the shop's own host (from `APP_ORIGIN`) and the payment page host (`PAYPLUS_PAYMENT_HOST`, a
  visitor coming back from paying) count no visit (a full page load
  inside the shop, e.g. a plain link or a reload, is a page view, not an arrival), hosts longer
  than 255 ignored.
  Upsert `analytics_daily_page (day, path) views + 1` and, when `r` is present and external or
  empty, `analytics_daily_referrer (day, host) visits + 1`; `day` = the calendar date in
  `Asia/Jerusalem` (what Aviva calls "today"), and `getStats` uses the same zone.
- **Stats** `getStats(days: 7|30|90)` in `src/server/analytics/stats.ts`: visits per day (sum of
  referrer `visits`, zero-filled), top 10 products by views (paths `/{l}/p/{slug}` summed across
  languages, joined to the product's Hebrew name; deleted products shown by slug), top 10
  referrers. Page `/admin/stats` (period chips 7/30/90 as links with `?days=`), an SVG bar chart
  with sizes as SVG attributes (no `style`) plus a visually-hidden-toggle "הצגת הנתונים כטבלה"
  `Disclosure` with the same numbers (FR-025).
- **Retention**: the aggregates hold no personal data and are kept (spec assumption).
- **Bundle**: StatsBeacon is under 1 KB; the bundle-size spec keeps guarding the 150 KB budget.

## R13. Contact page and message (FR-012–FR-015, US2)

- **Route** `src/app/[locale]/(shop)/contact/page.tsx` (exact path required by 002's links) with
  `ContactForm` island and `actions.ts` → `submitContact(input)` in
  `src/server/contact/submit.ts`:
  1. Honeypot must be empty and `verifyFormToken` must pass (existing helper, 3 s–2 h).
  2. Zod: `name` trimmed 2–100, `email` (checkout's email rule, `lowerDomain`), `message`
     trimmed 10–5,000, `locale`. Refusals so far do **not** count toward the limit.
  3. Rate limit `contact` 5 per 3,600 s per IP-hash (`windowSec` 3600 divides 86400, so the
     window is the clock hour, user decision Q3): `checkRateLimit` increments only here, i.e. for
     a valid message about to be sent; the 6th in the same clock hour is refused with
     `retryAfterSec` turned into whole minutes ("נסו שוב בעוד {minutes} דקות").
  4. One transaction (only for an allowed, valid message): `enqueueToOwners`-style rows (`kind: 'contact-message'`, Hebrew,
     `replyTo` = visitor email, `dedupeKey: contact:<uuid>:<i>`), then `kickOutbox()` after commit.
     Owner email (contracts/emails.md): subject "הודעה חדשה מהאתר · {shop name}" (no name or
     email); body: name, email, the visitor's page language, the message as escaped text.
- **Errors**: field errors next to fields (`ErrorSummary` on submit as in checkout); rate limit →
  `alert` Notice; bot or expired token → generic "please reload" message, nothing sent.
- **Success**: the form is replaced by a `role="status"` panel that receives focus (§8.10).
- **No copy to the visitor** (spec assumption): the form cannot send mail to third parties.

## R14. Footer and public pages (FR-001, FR-002, FR-005, US1)

- **Footer** (storefront.md §7.20): server component reading `getSettings()`; business column via
  `pick()` for name and address; "עוסק מורשה {n}" / "VAT registration no. {n}" (`businessRegNumber`,
  `<bdi>`); `mailto:`/`tel:` links (`<bdi dir="ltr">`); "מידע"/"Info" and "משפטי"/"Legal" lists;
  cookie-settings button only when consent is required; © line. **The language switch in the
  bottom row is left for item 005**; §7.20 is annotated accordingly.
- **Public page** `src/app/[locale]/(shop)/pages/[slug]/page.tsx` for the six slugs other than
  `contact` (`contact` → 404 there; its page is `/contact`); `generateMetadata` title from the
  picked title. Layout §8.9: `Breadcrumbs` (Home › title), `h1`, `Prose` + `Markdown`; `cookies`
  adds `StorageTable`.
- **Not in 003**: `hreflang` alternates and the "every page in both languages" route test (005).

## R15. Terms checkbox fix (FR-028, SC-009)

- **Cause**: `src/components/ui/Checkbox.tsx` stretches the invisible `<input>` over the whole
  label row (`absolute inset-0`) and lifts links above it (`[&_a]:relative [&_a]:z-10`). A click
  at the input's centre is a click at the row's centre; in English the words "terms of sale" sit
  there, so the link receives it (and Playwright's `check()` opens the Terms tab).
- **Decision**: the input covers only a 44×44 px square centred on the 24 px box
  (`absolute` at the box's position, `size-11`, negative logical offsets), not the row. The
  `<label htmlFor>` wrapping the text still toggles the box when the text is tapped, so the whole
  row stays a target (≥ 44 px high); links inside the label are ordinary links (no z-index hack):
  browsers do not toggle a checkbox when an interactive element inside its label is activated.
  The focus ring stays on the box (`peer-focus-visible`).
- **Test**: `tests/e2e/checkout-terms.spec.ts` (matches `checkout-.*`, so storefront projects incl.
  webkit-mobile, plus chromium-desktop) on `/he/checkout` and `/en/checkout`: `check()` the box →
  checked and no new page opened; click the link → a new page with `/pages/terms` opens and the
  box is unchanged; clicking the label text toggles it. Existing `checkout-offline.spec.ts`
  link test keeps passing.
- **Design**: storefront.md §7.10 Checkbox paragraph updated (hit area = box square + label
  text; links not lifted).

## R16. Strings and languages (FR-030)

New keys, Hebrew and real English for visitor strings, Hebrew plus English entry for admin
strings (as 002): `common.footer.*`, `legal.*` (page chrome, breadcrumbs, draft-free), `consent.*`
(banner, dialog, category names, `items.<name>.purpose|duration`), `contact.*`,
`admin.content.*`, `admin.customers.*`, `admin.stats.*`, `emails.contact.*`. The existing
`i18n-parity` unit test enforces parity. The draft texts themselves are content, not messages.

## R17. Data Security Regulations drafts (FR-029, US8)

`docs/privacy/database-definition`, `security-procedure`, `access-authorizations`,
`incident-response`, `annual-review-checklist`, each in Hebrew and English (`<name>.he.md` /
`<name>.en.md`, Clarifications 2026-11-10) and each opening with the draft notice, based on
001 R19 and the personal-data register (001 data-model + 003 data-model changes): basic security
level, ≤ 3 authorised users (the two admins + the hosting maintainer), processors and locations,
backups (12 months), retention tasks, the export file handling (send only to the verified
customer, delete the local copy), incident steps (contain, assess, notify the Privacy Protection
Authority and affected people when required, record), and a yearly checklist. Content only; no
code reads them.

## R18. Testing approach (constitution VI)

- **Unit**: registry (every item has purpose/duration keys in both message files; launch items
  equal the contract; `itemsFor` with and without the test category), Markdown renderer (escapes
  raw HTML, drops images and `javascript:`/`data:`/`http:`/`//` links, allows `https:`/`mailto:`/
  `tel:`/`/path`, heading shift), path normaliser, consent cookie parse/serialise.
- **Integration (PGlite)**: content pages (fallback, update + version + history rows for
  terms/privacy only, stale version, unchanged save), seed drafts (insert / replace + bump once /
  never touch edited / history rows / missing file fails), contact (validation, honeypot, token,
  rate limit, outbox rows with `reply_to`, subject without personal data, body/reply_to blank after
  a fake send), customer tools (email any case, phone formats, export contents, withdraw,
  anonymise exact columns + pending + outbox deletion, `orderIds` intersection, idempotence),
  retention (each task's boundary, idempotence), statistics (normalisation, referrer rules, bot
  drop, rate-limit drop, no IP/UA stored, `getStats`), consent (`saveConsent` refused at launch;
  record + cookie under test config).
- **Access control**: new admin pages and actions are found by the existing file-tree tests
  (`tests/integration/admin-actions-guard.test.ts`, `tests/e2e/admin-access.spec.ts`); no edit
  needed because `requireAdmin()` redirects before dynamic segments are read.
- **E2E**: `privacy.spec.ts` (storefront projects: launch storage and network, footer details and
  links, every page in he/en, Cookie Policy table, a counted visit checked in the DB),
  `consent.spec.ts` (consent project), `contact.spec.ts` (storefront projects),
  `checkout-terms.spec.ts` (R15), `admin-privacy.spec.ts` and `admin-content.spec.ts` (phone
  projects only, like other admin specs: `test.skip` unless `chromium-mobile`), `admin-stats.spec.ts`
  (phone). `STOREFRONT_SPECS` in playwright.config.ts gains `contact`. **No new Playwright
  project, so no CI matrix change.**
