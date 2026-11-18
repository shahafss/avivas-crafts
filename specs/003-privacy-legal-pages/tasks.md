---
description: "Tasks for feature 003: Privacy, Consent, Legal and Content Pages"
---

# Tasks: Privacy, Consent, Legal and Content Pages

**Input**: design documents in `specs/003-privacy-legal-pages/` — [spec.md](spec.md),
[plan.md](plan.md), [research.md](research.md) (R1–R18), [data-model.md](data-model.md),
[contracts/](contracts/) (`server-actions.md`, `routes.md`, `consent.md`, `emails.md`),
[quickstart.md](quickstart.md).

**Tests**: required. Constitution VI names cookie consent behaviour, access control on every admin
route and the order critical path; plan.md › Constitution Check commits to unit, integration and
E2E tests per story (research R18). Test tasks marked "write first" deliver the failing test
before the code.

**Organization**: by user story (spec.md US1–US8). Spec 001 tasks T100–T118 were the starting
material; plan.md › "Old spec 001 tasks" says what carried over, changed or was dropped.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US8 from spec.md (user-story phases only)
- Paths are relative to the repository root

## Conventions for every task

- Read the contract / data-model / research section a task names before starting; constraints
  quoted in a task are binding.
- **Design system**: `docs/design/storefront.md` is binding; `§` references point into it as
  updated by T001. Never run prettier on that file. Use only the `@theme` tokens and the
  primitives in `src/components/ui/` (`Button` variants `primary`/`secondary`/`quiet`,
  `LinkButton`, `IconButton`, `ChipLink`, `ChipRow`, `Notice`, `Price`, `Disclosure`,
  `EmptyState`, `Breadcrumbs`, `Prose`, `TextField`, `TextArea`, `Checkbox`, `FormField`,
  `ErrorSummary`, `ConfirmDialog`, `Toast`, `Icon`, `Spinner`). No `style` attribute or prop
  (nonce CSP); logical properties only; phones and emails in `<bdi dir="ltr">`; numbers `tnum`;
  44×44 px targets; buttons never disabled except `aria-busy` while running.
- **Strings**: every user-facing string goes into `src/i18n/messages/he.json` **and** `en.json`
  (visitor strings: real Hebrew and English; admin strings: Hebrew plus a real English entry, as
  the existing admin keys). Tasks name the namespace. The two message files are shared, so tasks
  that add strings are **not** [P] relative to each other. `tests/unit/i18n-parity.test.ts`
  must keep passing.
- **Owner-written text** (page titles and bodies, business name and address) goes through
  `pick()` from `src/lib/i18n-fallback.ts`; a Hebrew fallback on `/en` gets `fallbackAttrs()`
  (`lang="he" dir="auto"`). Markdown is rendered only by `renderMarkdown()` and shown only through
  `src/components/ui/Markdown.tsx`.
- **Admin access**: every admin `page.tsx` and every Server Action calls `requireAdmin()` as its
  first statement (before parsing input or reading params). New admin pages keep
  `generateMetadata` static (a fixed title, no params or database reads), as the order page does,
  so nothing runs before the guard. Writes take an `Actor`
  (`actorOf(context)` from `src/server/catalog/result.ts`) and write `logActivity()` in the same
  transaction. The existing file-tree tests (`tests/integration/admin-actions-guard.test.ts`,
  `tests/e2e/admin-access.spec.ts`) pick new files up; do not edit them unless they fail for a
  new dynamic segment.
- **No personal data** in URLs, `admin_activity.details` (only `ACTIVITY_DETAIL_KEYS`),
  `order_event.data`, logger fields or email subjects.
- Database access through the Drizzle query builder only (`.for('update')`, `.returning()`,
  `onConflictDoUpdate`); no `sql.raw`, no `db.execute()` with interpolated strings. Integration
  tests use PGlite (`tests/setup/pglite.ts`, see `tests/README.md`) and `makeActor()` from
  `tests/helpers/catalog.ts` for an `admin_user` row.
- No data cache (`'use cache'`, `unstable_cache`); after a successful action the island calls
  `router.refresh()` where the page shows changed data.
- **Accessibility (constitution › Product Constraints, WCAG 2.1 AA)**: every new E2E spec runs an
  axe scan (`@axe-core/playwright`, as `tests/e2e/order-tracking.spec.ts` does) on each new or
  changed screen and state it visits — content pages and footer (`privacy.spec.ts`, both
  locales), contact form empty / with errors / sent (`contact.spec.ts`, both locales), customers
  screen with results and both dialogs open (`admin-privacy.spec.ts`), content list, editor with
  preview and a version page (`admin-content.spec.ts`), statistics (`admin-stats.spec.ts`),
  banner and settings dialog (`consent.spec.ts`) — and asserts zero violations.
- E2E: specs use `tests/e2e/fixtures.ts` helpers (`test`, `expect`, `resetDb`, `signInAsAdmin`,
  `sql`, `readOutbox`, `waitForFormAge`) without editing that file, call `resetDb()` in
  `test.beforeAll`, and choose projects with `test.skip`: storefront specs run on every project
  their `STOREFRONT_SPECS` match allows; admin specs run only on `chromium-mobile`
  (`test.skip(testInfo.project.name !== 'chromium-mobile', …)` as in
  `tests/e2e/admin-products.spec.ts`). No new Playwright project, so no CI matrix change.
- Shell: start every command with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`; use the test
  runners' own timeouts; never start watch mode or a dev server that does not exit. Run **single**
  E2E spec files locally (`pnpm build` once, then `pnpm exec playwright test <file> --project=…`);
  CI runs the full suite. Ports: E2E 3100, consent 3101, mock OIDC 4011.

---

## Phase 1: Setup (design first)

**Purpose**: write the binding design for the new and changed screens before building them
(constitution › Development Workflow; plan.md › Design system updates).

- [X] T001 Update `docs/design/storefront.md` exactly as plan.md › "Design system updates" lists:
  header note "Amended 2026-11-09 by `003-privacy-legal-pages`"; §7.10 Checkbox (hit area = a
  44×44 square centred on the 24 px box; label text toggles through `<label for>`; links in the
  label are plain links, not lifted; replace "the whole label row is the target"); §7.20 Footer
  (language switch "added by roadmap item 005"; "Cookie settings" is a button shown only when
  consent is required); §7.21 (server `ConsentRoot`, client `ConsentLoader` doing the
  `React.lazy` split, `ConsentBanner`, `ConsentGate`, `CookieSettingsButton`, the
  `ac:consent-settings` event, pinned test ids, nothing optional loading while a new Cookie Policy
  awaits a choice — contracts/consent.md); §12.6 toolbar as four text-labelled buttons; §7.24 (Markdown only through `ui/Markdown`,
  `#` renders as h2); §7.25 (admin rows after public rows, labelled "באזור הניהול בלבד" / "Admin
  area only"); §8.9 (`contact` not served there; Hebrew fallback marking); §8.10 (expired-form
  Notice; the rate-limit Notice becomes "שלחתם כמה הודעות ברצף. נסו שוב בעוד {minutes} דקות." /
  "You've sent several messages in a row. Try again in {minutes} minutes."); §10 island list
  (add `ConsentLoader`, `ConsentGate`, `CookieSettingsButton`; `ConsentBanner` and `ConsentGate`
  load only through `ConsentLoader`); §9 rows for content pages, admin content, customers, statistics; §12.3 (new block 8a
  "הסכמות" and the `anonymized` history entry, exactly as plan.md describes; §7.24 also names the
  `h3` style that `Prose` already has); new §12.5 Content list, §12.6 Content
  editor and versions, §12.7 Customers, §12.8 Statistics with the Hebrew labels, states and
  layouts given in plan.md; each new screen entry (§8.9, §8.10, §12.5–§12.8) ends with an
  acceptance line "axe reports no violations". Keep existing section numbers stable; qualify new requirement ids as
  "003 FR-xxx". Do not run prettier on the file.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the renderer, the content data layer with version history, and the storage registry
that several stories use.

**⚠️ No user-story work starts before this phase is done.**

- [X] T002 [P] Write `tests/unit/markdown.test.ts` first (research R2, FR-003 as amended) for
  `renderMarkdown()` in `src/server/content/markdown.ts`: raw HTML (`<script>`, `<img onerror=…>`,
  `<iframe>`) comes out escaped as text; `![x](https://a/b.png)` produces no `<img>`; links with
  `javascript:`, `data:`, `vbscript:`, `http:` and `//evil.example` are not rendered as `<a>` (the
  text stays); `https:`, `mailto:`, `tel:` and `/he/contact` are; external `https:` links get
  `rel="noopener noreferrer"`; `# A` renders `<h2>`, `## B` `<h2>`, `### C` `<h3>`, `#### D` `<h3>`;
  bold, italic, lists, line breaks and written-out `https://` URLs (linkify) work; tables, code
  blocks, blockquotes and `---` are not rendered as such; `/\evil.example` (read by browsers as
  `//evil.example`) and a reference-style link (`[x][r]` with `[r]: javascript:alert(1)`) are not
  rendered as links; `"a\nb"` renders `a<br>b`; a bare `www.example.co.il` stays plain text.
- [X] T003 Implement (after T002) `src/server/content/markdown.ts` (`markdown-it` `default` preset,
  `html: false`, `breaks: true`, `linkify: true` with `linkify.set({fuzzyLink: false})`, `typographer: false`, `.disable(['image','table','code','fence',
  'blockquote','hr','strikethrough'])`, `validateLink` allow-list, heading-level renderer rule,
  `rel` on external links) and `src/components/ui/Markdown.tsx` (a shared, non-async component
  with no `server-only` import and no renderer import — it only takes an already rendered `html`
  string and optional `lang`/`dir`, so both server pages and the client `MarkdownEditor` preview
  can use it). The project bans `dangerouslySetInnerHTML` through the custom `no-restricted-syntax`
  rule in `eslint.config.mjs` (`src/components/shop/JsonLd.tsx` is the existing exception):
  `eslint.config.mjs` already exempts `src/components/ui/Markdown.tsx` by file, so no disable
  comment. `renderMarkdown()` returns a branded `RenderedHtml` type (`string & {__brand:
  'RenderedHtml'}`) and `Markdown` accepts only that type, so a raw string cannot reach
  `dangerouslySetInnerHTML` by mistake. T002 passes.
- [X] T004 [P] Add `contentPageVersion` to `src/server/db/schema/commerce.ts` and export it from the
  schema index, exactly as data-model.md › "New table": PK `(slug, version)`; CHECK `slug IN
  ('terms','privacy')`; CHECK `version >= 1`; FK `slug` → `content_page.slug` ON DELETE RESTRICT;
  `title_he` text not null; `title_en` text null; `body_he` text not null CHECK `char_length <=
  50000`; `body_en` text null CHECK `char_length <= 50000`; `created_at` timestamptz not null
  default now(). Run `pnpm db:generate --name content_page_version` to create
  `src/server/db/migrations/0002_content_page_version.sql` (+ meta),
  then append, after a `--> statement-breakpoint` line (PGlite's migrator runs one statement per
  chunk; compare `0001_deferrable_unique_constraints.sql`), the back-fill statement from
  data-model.md (`INSERT … SELECT … FROM content_page WHERE slug IN ('terms','privacy') ON
  CONFLICT DO NOTHING`) to that migration file. Extend
  `tests/integration/schema.test.ts` if it enumerates tables or checks.
- [X] T005 Write `tests/integration/content-pages.test.ts` first (research R3, contracts/server-
  actions.md › `updateContentPage`) for `src/server/content/pages.ts`: `getPage('about','en')`
  returns the Hebrew title/body with `lang: 'he'`, `fallback: true` when English is NULL or blank;
  `getPage` of an unknown slug returns null; `updateContentPage` validates "`title_he` 1–120
  chars, `body_he` 1–50,000; `title_en` ≤ 120, `body_en` ≤ 50,000, empty strings stored as NULL"
  with the `admin.content.errors.*` keys; a save bumps `version` by exactly 1, sets
  `owner_edited = true`, writes `admin_activity` `content.updated` `{slug, to}`; identical text
  returns `{unchanged: true}` and writes nothing; `expectedVersion` ≠ current →
  `admin.content.errors.stale` and no change; saving `terms` or `privacy` inserts exactly one
  `content_page_version` row with the new version and texts, saving `about` inserts none;
  `listVersions('terms')` lists newest first; `getVersion('terms', n)` returns that copy;
  `listVersions('about')` → null. No code path updates or deletes `content_page_version` rows
  (assert the table only grows across all calls in the file).
- [X] T006 Implement `src/server/content/versions.ts` (`recordVersion(tx, row)`; imports only the
  Drizzle schema and `DbLike`, no env, no activity log, so `scripts/seed.ts` can use it without
  loading the app's data layer) and `src/server/content/pages.ts` (`CONTENT_SLUGS` moved to
  `src/server/content/slugs.ts`, a dependency-free module; `src/server/db/seed.ts` imports it and
  keeps re-exporting `CONTENT_SLUGS` for existing imports; `getPage`, `listPages`, `updateContentPage(actor,
  input)` in one transaction with `FOR UPDATE` calling `recordVersion` for terms/privacy,
  `listVersions`, `getVersion`), so T005 passes.
- [X] T007 [P] Write `tests/unit/consent-registry.test.ts` first (contracts/consent.md): the
  launch items of `STORAGE_ITEMS` with no `onlyWhen` are exactly `ac_cart_v1`, `NEXT_LOCALE`,
  `ac_checkout`, `__Host-ac_admin`, `__Host-ac_oauth` with the kinds and scopes of data-model.md ›
  Device-storage registry; `ac_consent` has `onlyWhen: 'consent-required'`, `ac_test_optional`
  `onlyWhen: 'test-category'` and category `analytics`; every item's `purposeKey` and
  `durationKey` exist in both `he.json` and `en.json`; `itemsFor({required: false, categories:
  [], test: false})` contains neither `ac_consent` nor `ac_test_optional`; with the test category
  both are present.
- [X] T008 Implement `src/lib/consent/registry.ts` (pure, no env, no `server-only`) and
  `src/server/consent/config.ts` (`server-only`; `OPTIONAL_CATEGORIES = []`, `consentConfig()`
  adding the dummy `{id: 'analytics', scripts: [{src: '/test-optional.js'}]}` only when
  `getEnv().CONSENT_TEST_CATEGORY === 'analytics'`, `consentRequired()`), and add
  `consent.items.<key>.purpose|duration` strings for the seven items (he/en, wording from 001
  contracts/device-storage.md), so T007 passes.

**Checkpoint**: renderer, content data layer with history, registry ready.

---

## Phase 3: User Story 1 — A visitor reads the shop's information and legal pages (P1) 🎯 MVP

**Goal**: six pages at `/{locale}/pages/{slug}` from supplied drafts, the full footer, the Cookie
Policy table, and the Terms checkbox fix (FR-001–FR-008, FR-028).

**Independent test**: quickstart.md › US1.

- [X] T009 [P] [US1] Write `tests/e2e/privacy.spec.ts` first (already matched by `STOREFRONT_SPECS`;
  runs on chromium-desktop, chromium-mobile, webkit-mobile): `resetDb()`; in a fresh context on
  `/he`: no `consent-banner` and no `footer-cookie-settings` test id (contracts/consent.md); browse home →
  a product → add to cart → checkout offline (copy only the form-filling lines 56–67 of `place()` in
  `tests/e2e/order-tracking.spec.ts` into a local helper — not its `setCart(...)` call, since this
  test adds to the cart through the UI;
  `tests/helpers/checkout.ts` exists but serves the Vitest tests); collect `context.cookies()`, `localStorage` and `sessionStorage` keys:
  every name is in `itemsFor` of the launch config (import `STORAGE_ITEMS` from
  `src/lib/consent/registry.ts`); every request URL's origin is the app origin or
  `IMAGE_PUBLIC_ORIGIN` (from `tests/e2e/env.ts`); the footer on `/he` and `/en` shows the seeded
  business name, address, registration number, `mailto:` and `tel:` links, and links to the seven
  pages; each of the six `/pages/{slug}` opens with status 200 in he and en and shows an `h1`;
  the five legal pages show the draft notice text; `/he/pages/cookies` lists every launch registry
  item name; `/he/pages/contact` is 404; the header About / Shipping links, the product page
  shipping link and the checkout Terms/Privacy links return 200; no same-origin `.js` response
  received during the whole test contains the banner-only marker string `ac-consent-banner-v1`
  (FR-020, US6 #6: the banner code is not downloaded at launch). (The visit-count assertions are
  added in T035.)
- [X] T010 [P] [US1] Write `tests/e2e/checkout-terms.spec.ts` first (matches `checkout-.*`, so
  all three storefront projects; research R15): with a cart item, on `/en/checkout` and
  `/he/checkout`: `getByTestId('accept-terms').check()` leaves it checked and opens no new page
  (`context.on('page')` not fired); clicking the terms link opens a new page whose URL ends with
  `/pages/terms` and the box stays unchanged; clicking the label text (outside the link) toggles
  the box; a tap at the box's bounding-box centre (`page.mouse.click`) toggles it on every
  project.
- [X] T011 [P] [US1] Extend `tests/integration/seed.test.ts` first (research R7) for
  `runSeed(db, {samples: false, contentDir})` with a temporary folder of draft files: missing rows
  are inserted with version 1 and, for terms/privacy, one `content_page_version` row; a changed
  draft replaces title/body of a page with `owner_edited = false` and increments `version` exactly
  once (a second run changes nothing and adds no version row); a page with `owner_edited = true`
  is never touched; a missing draft file makes `runSeed` reject; without `contentDir` today's
  placeholder behaviour stays.
- [X] T012 [P] [US1] Write the legal drafts `docs/legal-drafts/{privacy,terms,cookies}.{he,en}.md`
  (first line `# Title`, then the body; the body starts with the notice paragraph
  "**טיוטה — נדרשת בדיקה משפטית.**" / "**Draft — requires legal review.**" and one sentence saying
  the text is not final), covering exactly spec FR-007 for these three pages: Privacy Policy from
  001 data-model.md's register plus data-model.md › "Personal data register: changes from 003"
  (controller, data and purposes, legal-obligation statement, retention incl. encrypted backups up
  to 12 months, Render/Cloudflare/PayPlus/Resend with locations and Google for admins only per 001
  research R19 — with a `[to be completed: …]` note to check Render's sub-processor list for
  Cloudflare — transfers abroad, rights and how to use them via the contact page or email,
  Privacy Protection Authority complaint, GDPR section for future EU customers); Terms (seller
  identity as עוסק מורשה, referring to the business name, number and address shown at the bottom
  of every page and on the Contact page instead of repeating them (they live in the shop
  settings); made to order and
  preparation times; prices incl. VAT; payment methods; delivery; acceptance at checkout; that
  earlier versions are kept); Cookie Policy (strictly necessary storage only, the table below the
  text, cookieless statistics, how consent works if optional cookies are enabled). Use only
  headings, bold, lists and links (FR-003); links to `/he/...` / `/en/...` paths are allowed.
- [X] T013 [P] [US1] Write `docs/legal-drafts/{shipping-returns,accessibility,about,contact}.{he,en}.md`:
  Shipping & Returns / Cancellation (notice paragraph; Consumer Protection Law s.14C rights, the
  exception for goods made specially for the customer and the cancellation fee cap — both flagged
  "for the legal reviewer to confirm", how to cancel via `/he/contact` or email, refund timing,
  shipping and pickup); Accessibility Statement (notice paragraph; IS 5568 / WCAG 2.1 AA, what was
  done, accessibility contact `[להשלמה]`, date `[להשלמה]`); About and Contact as short
  placeholders without the legal notice ("[להשלמה: אביבה תכתוב כאן…]" style; the contact text is
  the intro above the form).
- [X] T014 [US1] Implement `src/server/content/drafts.ts` `loadDrafts(tx, contentDir)` (reads the
  14 files, splits title/body, applies the insert / replace-and-bump / never-touch-edited rules,
  calls `recordVersion` for terms/privacy) and call it from `runSeed` in `src/server/db/seed.ts`
  when `contentDir` is given (replacing the placeholder insert); when it is not given, the
  placeholder insert stays but also calls `recordVersion` for the terms/privacy rows it inserts,
  so every version an order can reference has a copy in every database; make `scripts/seed.ts` pass
  `contentDir` resolved from the script's own location (`../docs/legal-drafts`), so T011 passes and
  `pnpm db:seed` loads the drafts in dev, E2E and deploy.
- [X] T015 [US1] Create `src/app/[locale]/(shop)/pages/[slug]/page.tsx` (storefront.md §8.9; six
  slugs, `contact` and unknown → `notFound()`; `generateMetadata` title from the picked title;
  `Breadcrumbs` Home › title, `h1`, `Prose` + `Markdown` with `fallbackAttrs`) and
  `src/components/shop/StorageTable.tsx` (§7.25; rows from `itemsFor(consentConfig())`, public
  rows first then admin rows labelled "באזור הניהול בלבד"; table from 640 px, stacked cards below
  using `td::before { content: attr(data-label) }`), rendered after the prose on `cookies`. Strings
  in `legal.*` (breadcrumb home, table headers name/purpose/lifetime/where, admin-only label).
- [X] T016 [US1] Complete `src/components/shop/Footer.tsx` per §7.20 (FR-005): business column
  (shop name h2, `businessName*` and `businessAddress*` through `pick()`, "עוסק מורשה {n}" /
  "VAT registration no. {n}" in `<bdi>`, email `mailto:` and phone `tel:` in `<bdi dir="ltr">`), "מידע"
  / "Info" (About, Shipping & returns, Contact) and "משפטי" / "Legal" (Terms, Privacy, Cookies,
  Accessibility) as h2-styled-small columns, the © line; an optional `cookieSettings?: ReactNode`
  prop rendered in the Legal list (US6 fills it); no language switch (item 005). Pass the
  settings from `src/app/[locale]/layout.tsx`. Strings in `common.footer.*`.
- [X] T017 [US1] Fix `src/components/ui/Checkbox.tsx` per research R15 and §7.10: the input is
  positioned over a 44×44 square centred on the 24 px box (not `inset-0`), the
  `[&_a]:relative [&_a]:z-10` lift is removed, the `<label htmlFor>` keeps the text clickable, the
  focus ring stays on the box (`peer-focus-visible`); update the component's doc comment.
  `Checkbox` is also used by `src/components/admin/SettingsManager.tsx`; every spec in T018 must
  still pass. `tests/e2e/order-tracking.spec.ts:66` clicks a checkbox at `position: {x: 4, y: 4}`
  of the input: if the input's new box makes that point miss, change the spec to click the box's
  centre and say so in the batch report.
- [X] T018 [US1] Run T009, T010 (single files, chromium-mobile and webkit-mobile), T011, and the
  existing specs that tick checkboxes: `checkout-offline.spec.ts`, `checkout-online.spec.ts`,
  `order-tracking.spec.ts`, `admin-settings.spec.ts`, `admin-orders.spec.ts`,
  `admin-order-workflow.spec.ts` (chromium-mobile); all pass.

**Checkpoint**: all public pages, footer and the Terms fix work with the supplied drafts.

---

## Phase 4: User Story 2 — A visitor contacts the shop (P1)

**Goal**: `/{locale}/contact` with a form that emails Aviva (FR-012–FR-015).

**Independent test**: quickstart.md › US2.

- [X] T019 [P] [US2] Write `tests/integration/contact.test.ts` first (contracts/server-actions.md
  › `submitContact`, contracts/emails.md; user decision Q3): non-empty honeypot or bad/young/old
  form token → `contact.errors.expired`; `name` trimmed 2–100, `email` invalid, `message` trimmed
  10–5,000 → the field keys, all at once; **none of these refusals counts toward the limit** (6
  invalid submissions, then a valid one is sent); 5 valid messages in one clock hour are sent and
  the 6th → `contact.errors.rate_limited` with `retryAfterMinutes` = minutes left in the hour
  (inject `now`), nothing queued; the next clock hour accepts again; a valid message queues one
  `contact-message` row per notification address (two addresses in settings → two rows) with
  `reply_to` = visitor email, locale `he`, subject `הודעה חדשה מהאתר · {shop name}` containing
  neither the name nor the email, the message HTML-escaped in the body; after `drainOutbox` with a
  fake driver the rows are `sent` with empty `html`, `text_body` and NULL `reply_to` (FR-015).
- [X] T020 [P] [US2] Write `tests/e2e/contact.spec.ts` first, add `contact` to
  `STOREFRONT_SPECS` in `playwright.config.ts` and anchor the pattern on the file name
  (`/(^|[\\/])(cart|checkout-.*|language|privacy|catalog|order-tracking|contact)\.spec\.ts$/`) so
  `admin-privacy.spec.ts` no longer matches it: `/he/contact` and `/en/contact` show the intro,
  business details and form; after `waitForFormAge`, sending a valid message replaces the form
  with the `role="status"` panel, which has focus; `readOutbox('contact-message')` has the row
  with the visitor as reply-to; an empty submit shows field errors and the `ErrorSummary`; the contact links on the customer
  order page (`/{locale}/order/{token}` of an order placed in the spec), a product page, the home
  page (`(shop)/page.tsx`), the header and the checkout lead to this page with status 200 in the
  same language (spec US1 #6, US2 #5).
- [X] T021 [US2] Implement `src/server/email/templates/contact-message.ts` (contracts/emails.md;
  `renderEmail()`, `escapeHtml()`, strings `emails.contact.*`) and `src/server/contact/submit.ts`
  (`submitContact(input, ctx: {ip, now?})` with the check order of contracts/server-actions.md:
  bot checks, then fields, then `checkRateLimit` — so only valid messages count —; rows queued
  inside one transaction; `kickOutbox()` after commit), so T019 passes.
- [X] T022 [US2] Create `src/app/[locale]/(shop)/contact/page.tsx` (§8.10: h1, intro from
  `getPage('contact', locale)` rendered with `Markdown`, details panel from settings, form panel;
  two columns from 900 px, stacked below with the form first; `generateMetadata` title; wraps the
  form in its own `NextIntlClientProvider` with the `contact` messages, as the cart and checkout
  pages do), `actions.ts` (`submitContact` wrapper reading `getClientIp(await headers())`) and
  `src/components/shop/ContactForm.tsx` (island: name, email `dir="ltr"`, message `TextArea` 6
  rows with a counter only near 5,000, hidden honeypot, form token from the page, primary
  "שליחה"/"Send", `ErrorSummary`, rate-limit `alert` Notice "שלחתם כמה הודעות ברצף. נסו שוב בעוד
  {minutes} דקות." / English, expired-form Notice, success panel with focus). Strings in
  `contact.*`. T020 passes.

**Checkpoint**: the order page's and product page's contact links now lead to a working page.

---

## Phase 5: User Story 3 — Aviva handles a customer's request about their data (P1)

**Goal**: find, export, withdraw marketing consent, anonymise (FR-016–FR-019a).

**Independent test**: quickstart.md › US3.

- [X] T023 [P] [US3] Write `tests/integration/privacy-customers.test.ts` first (research R8–R10,
  contracts/server-actions.md › Customers, data-model.md; user decisions Q1 and Q5): create orders
  with the same email in different case and phones written `050-1234567` / `+972 50 123 4567`
  (stored E.164), another person's order, and two orders with **different emails X and Y sharing
  one phone P**; `findCustomer` / `searchCustomers` match by email any case and by phone any
  format, never the other person, never an anonymised order; a phone search for P returns both
  orders and `otherIdentifiers.emails` = [X, Y]; invalid `q` → `admin.customers.errors.query`;
  a search that finds no orders but a stored contact email (reply_to = the email) returns zero
  orders and `emails: 1`; search writes `customer.searched` `{field, count}` (also for 0);
  `exportCustomer` returns `customer-YYYY-MM-DD.json` whose parsed JSON has the shape of
  contracts/server-actions.md and writes `customer.exported` `{count}`;
  `withdrawMarketingConsent` without `confirm` → `admin.confirm_required` before any query; with
  it sets `marketing_opt_in = false`, `marketing_withdrawn_at`, keeps `marketing_opt_in_at`, and
  clears `marketing_opt_in` on the unfinished checkouts the search finds, and writes
  `customer.marketing_withdrawn` `{count}` whose details hold no personal data;
  `anonymizeCustomer` without `confirm` → refused; with it applies exactly data-model.md's
  anonymisation columns to the orders shown (name 'נמחק'; NULL phone, email, city, line1, line2,
  postal code, note, tracking number, pickup note, marketing dates; opt-in false; `anonymized_at`
  set; country, amounts, lines, status, payment kept), inserts `order_event` `anonymized` with the
  admin and `data = {}`, deletes **no** `pending_checkout` row (found rows in `awaiting_provider`,
  `failed` and `mismatch` all stay, and `keptCheckouts` counts them), deletes every `email_outbox`
  row of the anonymised orders (any status, incl. the owner's `new-order` row) and, for an email
  search, those with that email in `to_address`/`reply_to`, and keeps the `payment-mismatch` owner
  email of a kept `mismatch` row; anonymising by phone P leaves a
  still-pending `order-confirmation` row to email Y of an order **not** shown untouched; writes
  `customer.anonymized` `{count}` with no personal data; `orderIds` not matching `q` are skipped
  and counted; a second run changes nothing.
- [X] T024 [P] [US3] Write `tests/e2e/admin-privacy.spec.ts` first (chromium-mobile only; the export
  and erase steps also check the passkey re-check: after ageing the session's `reauth_at` past 5
  minutes with `sql`, "הורדת הנתונים" opens the passkey dialog and the download happens after the
  virtual authenticator confirms): place
  an offline order with marketing consent through the storefront; sign in; `/admin/customers`:
  search the email in capitals → the order listed, URL still `/admin/customers`; "הורדת הנתונים"
  downloads a `.json` containing the email; open the order link → 002's correction form exists;
  back, "הפסקת דיוור" + confirm → the order page's "הסכמות" block shows "בוטל ב-" with today's
  date; "מחיקת הפרטים" → the dialog
  warns the order is open → confirm → the order page shows "נמחק" and no email/phone/address; a
  new search finds nothing.
- [X] T025 [US3] Implement `src/server/privacy/customers.ts` (`findCustomer`, `matchOrders(ref)`
  returning the matched orders and the person's identifier sets) and `src/server/privacy/export.ts`
  (`exportCustomer(actor, ref)`; filename date from a new `isoDateInIsrael(date)` helper
  (`YYYY-MM-DD` in `Asia/Jerusalem`) added to `src/lib/format-date.ts` with a case in
  `tests/unit/format-date.test.ts`).
- [X] T026 [US3] Implement `src/server/privacy/consent.ts` (`withdrawMarketingConsent`, incl. the
  unfinished checkouts) and `src/server/privacy/anonymize.ts` (`anonymizeOrders(tx, orderIds,
  actor | null)` shared with US7 — system calls write `order_event` `data: {system: true}` — and
  `anonymizePerson(actor, ref & {confirm})` with steps 1–5 of research R10 in one transaction,
  deleting no `pending_checkout` row and returning `keptCheckouts`), so T023 passes.
- [X] T027 [US3] Create `src/app/admin/(protected)/customers/page.tsx` (§12.7; `requireAdmin()`
  first), `actions.ts` (`searchCustomers`, `exportCustomer`, `withdrawMarketingConsent`,
  `anonymizeCustomer` — thin wrappers, Zod for `q` 3–254 and `orderIds` ≤ 500 UUIDs;
  `exportCustomer` and `anonymizeCustomer` start with `requireRecentAuth()` instead of
  `requireAdmin()` and return `admin.reauth_required` without any database write when the passkey
  is older than 5 minutes (contracts/server-actions.md, FR-019a); add both names to
  `REAUTH_ACTIONS` in `tests/integration/admin-actions-guard.test.ts`; the island calls them
  through the existing `useReauthGate()` from `src/components/admin/ReauthGate.tsx`) and
  `src/components/admin/CustomerSearch.tsx` (island: search form posting through the action,
  results in client state, order cards with links and status / payment badges drawn by a new
  small client component `src/components/admin/OrderBadgesClient.tsx`; move `BADGE_BASE`,
  `STATUS_LOOK` and `PAYMENT_LOOK` out of `src/components/admin/OrderStatusBadge.tsx` into a
  dependency-free `src/components/admin/order-badge-looks.ts` that both import (the server badges
  keep working unchanged), and use `useTranslations` in the client one (the existing badges are async Server Components and cannot render in an
  island); summary counts; the "פרטים נוספים שהופיעו בהזמנות האלה" line with one quiet button per
  other email/phone that runs a new search; export as `Blob` download with the object URL
  revoked; "הפסקת דיוור" only when any shown order has `marketingOptIn`, with its `ConfirmDialog`; anonymise
  `ConfirmDialog` with the open-order `attention` line — both dialogs use exactly the Hebrew and
  English texts in plan.md › §12.7; after anonymising,
  an `info` Notice when `keptCheckouts > 0` with exactly the text in plan.md › §12.7 (payments still
  in progress were not erased; deleted automatically within 48 hours or 30 days; a new order will
  appear if one completes, so search again in 2 days); `Toast`s; `EmptyState`). The island gets its messages from the
  admin layout, which already provides the whole `admin` namespace (no extra provider). Strings in
  `admin.customers.*`. T024 passes.

- [X] T028 [US3] Admin order page (§12.3 as updated by T001): in
  `src/app/admin/(protected)/orders/[id]/page.tsx` add block 8a "הסכמות" after Payment, from the
  order row `getOrderDetail()` already returns (`terms_accepted_at`, `terms_version`,
  `privacy_version`, `marketing_opt_in`, `marketing_opt_in_at`, `marketing_withdrawn_at`): Terms
  acceptance date and time (`formatDateTime`), "תקנון גרסה {n}" and "מדיניות פרטיות גרסה {n}" as
  plain text, and the marketing line (given {date} / given {date}, withdrawn {date} / none; "—" on
  an anonymised order); add the `anonymized` case to `historyWhat()` ("פרטי הלקוח נמחקו"); in
  `src/server/orders/admin-orders.ts` show an `anonymized` event as "המערכת" only when its
  `data.system === true` (do **not** add `anonymized` to `SYSTEM_KINDS`: an admin who is later
  removed must still show as a removed admin). Strings in `admin.orders.detail.consent.*` and
  `admin.orders.history.anonymized`. Extend `tests/integration/admin-orders.test.ts` for both
  attributions. T024 asserts the withdrawal date in this block.

**Checkpoint**: SC-001 achievable from the admin area.

---

## Phase 6: User Story 4 — Aviva edits the shop's pages (P2)

**Goal**: content list, editor with preview, version history and order links (FR-009–FR-011).

**Independent test**: quickstart.md › US4.

- [X] T029 [P] [US4] Write `tests/e2e/admin-content.spec.ts` first (chromium-mobile only):
  `/admin/content` lists seven pages marked "טיוטה שסופקה עם האתר"; open About, type Hebrew and
  English text using the toolbar's bold and list buttons, preview shows `<strong>` and a list,
  save → Toast; `/he/pages/about` and `/en/pages/about` show it; the list now marks About "נערך";
  edit Terms and save; `/admin/content/terms/versions` lists two versions; opening the first
  shows the draft text; place an order and open it in the admin → its terms link opens the
  version current at order time.
- [X] T030 [US4] Create `src/components/admin/MarkdownEditor.tsx` (island per §12.6 and research
  R6: tabs, title field, a toolbar of four text-labelled `secondary` buttons — כותרת, מודגש,
  רשימה, קישור, 44 px tall, no icons — inserting `## `, `**…**`, `- `, `[text](https://)` at the
  selection and restoring focus, body `TextArea` 16 rows with `dir` per tab, preview through the
  `previewContent` action and `Markdown`, sticky save bar on phones, stale Notice with reload),
  `src/app/admin/(protected)/content/page.tsx` (§12.5 list from `listPages()`),
  `content/[slug]/page.tsx` (unknown slug → `notFound()` after the guard; the editor's messages come from the
  admin layout's `admin` namespace) and `content/[slug]/actions.ts`
  (`updateContentPage`, `previewContent` per contracts/server-actions.md). Strings in
  `admin.content.*`.
- [X] T031 [US4] Create `src/app/admin/(protected)/content/[slug]/versions/page.tsx` and
  `versions/[version]/page.tsx` (§12.6; only `terms`/`privacy`, other slugs and unknown versions →
  `notFound()` after the guard; one version rendered with `Prose` + `Markdown` and the "גרסה {n},
  בתוקף מ-{date}" line).
- [X] T032 [US4] In block 8a of `src/app/admin/(protected)/orders/[id]/page.tsx` (created by
  T028), turn "תקנון גרסה {n}" into a link to `/admin/content/terms/versions/{terms_version}` and
  "מדיניות פרטיות גרסה {n}" into a link to `/admin/content/privacy/versions/{privacy_version}`
  (§12.3). Update the comment in `src/components/admin/SettingsManager.tsx` to say the
  offline/pickup instructions stay plain text on purpose (research R1). T029 passes.

**Checkpoint**: Aviva can write About and update the legal texts; accepted versions are provable.

---

## Phase 7: User Story 5 — Visitors are counted without being tracked (P2)

**Goal**: beacon, aggregates and the statistics screen (FR-024, FR-025).

**Independent test**: quickstart.md › US5.

- [X] T033 [P] [US5] Write `tests/unit/normalise-path.test.ts` first for
  `src/lib/analytics/normalise-path.ts` (research R12): accepts `/he`, `/en/`, `/he/c/dolls`,
  `/he/p/doll-1?x=1#y` → `/he/p/doll-1`, `/en/search?q=a` → `/en/search`, `/he/cart`,
  `/he/pages/terms`, `/en/contact`; rejects `/he/checkout`, `/he/checkout/return`,
  `/he/order/<token>`, `/admin`, `/api/v`, `/fr`, `/he/pages/unknown`, slugs over 80 chars or with
  uppercase/other characters, paths over 300 chars; referrer helper: `""` → `(direct)`, the shop's
  own host (from `APP_ORIGIN`) → no visit, `Instagram.com` → `instagram.com`, hosts over 255 →
  ignored.
- [X] T034 [P] [US5] Write `tests/integration/analytics.test.ts` first: `recordView` with
  `Origin` = `APP_ORIGIN` increments `analytics_daily_page` per **Israel** calendar day
  (`Asia/Jerusalem`; a view at 23:30 UTC on 1 March counts on 2 March) and path; with `r` present
  and external or `""` it increments `analytics_daily_referrer`; with `r` = the shop's own host,
  or without `r`, only the page view; a request with no `Origin` or a different origin changes
  nothing; paths of a non-existent or unpublished product, a non-existent category, or an unknown
  page slug change nothing (FR-024), while a published product's path counts; rejected paths, bot
  user agents and bodies over 1 KB change nothing; the 61st call within a minute from one IP is
  dropped; no column anywhere receives the IP or user agent; `getStats(7|30|90)` returns
  zero-filled visits per Israel day, top 10 products by views summed across `/he/p/x` and
  `/en/p/x` with the product's Hebrew name (slug when the product is gone), top 10 referrers.
- [X] T035 [P] [US5] Write the E2E checks first: (a) in `tests/e2e/privacy.spec.ts` (T009), a
  dedicated test in a fresh context that reads the counters (via `sql`) before and after one
  defined sequence and asserts the **differences**: `page.goto('/he')` → +1 view of `/he` and +1
  `(direct)` visit; a client-side click from there to a product card → +1 view of that product
  path, +0 visits; `page.evaluate(() => location.assign('/he/pages/about'))` (a full page load
  whose referrer is the shop itself) → +1 view of `/he/pages/about`, +0 visits; in a new
  context, `page.goto` an order page (`/he/order/<token>` of an order placed in the spec) → no
  change, then a client-side click to the home page → +1 view of `/he` and +1 `(direct)` visit; (b) `tests/e2e/admin-stats.spec.ts` (chromium-mobile only): after a storefront
  visit the page shows a visit today, the product in "most viewed", and the table toggle; (c) add
  `/he/pages/terms` and `/he/contact` to the `routes` list in `tests/e2e/bundle-size.spec.ts` (the
  default budget applies).
- [X] T036 [US5] Implement `src/lib/analytics/normalise-path.ts`,
  `src/server/analytics/beacon.ts` (`recordView(input, ctx: {origin, ip, userAgent, now?})`:
  same-origin check first with `APP_ORIGIN`, then bot/size/rate checks, path normalisation, the
  existence check of research R12 (published product / existing category / served page slug),
  Israel calendar day, upserts with `onConflictDoUpdate`) and `src/app/api/v/route.ts`
  (contracts/routes.md: pass `request.headers.get('origin')`, parse ≤ 1 KB text/JSON, always `204`
  + `Cache-Control: no-store`, never throws to the client), so T033 and T034's beacon cases pass.
- [X] T037 [US5] Create `src/components/shop/StatsBeacon.tsx` (client; `navigator.sendBeacon` on
  mount and on every `usePathname()` change, except for `/{l}/checkout…` and `/{l}/order/…` paths,
  which are never sent so order-page tokens never leave the browser; `r` = lower-cased
  `document.referrer` host, `""` only when there is none, sent with the first beacon this document
  actually sends (none is sent on checkout and order paths); no storage) and render it in `src/app/[locale]/layout.tsx`. Then run `tests/e2e/bundle-size.spec.ts`
  at once: the product page was at 148.4 KB of its 150 KB budget (001 tasks.md). If any page goes
  over, do not raise a budget: shrink the beacon (no extra imports, plain `useEffect`) and, if it
  still does not fit, stop and report the numbers.
- [X] T038 [US5] Implement `src/server/analytics/stats.ts` (`getStats`) and create
  `src/app/admin/(protected)/stats/page.tsx` + `src/components/admin/StatsChart.tsx` (§12.8; period
  `ChipRow` 7/30/90 via `?days=`, default and invalid → 30; SVG bars sized with attributes,
  `role="img"` + `aria-label` summary; `Disclosure` "הצגה כטבלה" with the same numbers; two ranked
  lists; "כניסה ישירה" for `(direct)`; `EmptyState` "עוד אין נתונים"). Strings in `admin.stats.*`.
  T034 and T035 pass.

**Checkpoint**: Aviva sees basic statistics; visitors are not tracked.

---

## Phase 8: User Story 6 — Optional cookies need consent if they are ever turned on (P2)

**Goal**: the dormant consent mechanism, proven with the test category (FR-020–FR-023).

**Independent test**: quickstart.md › US6.

- [X] T039 [P] [US6] Write `tests/unit/consent-cookie.test.ts` first for `parseConsentCookie` /
  `serializeConsentCookie` in `src/server/consent/consent.ts` (contracts/consent.md format
  `<recordId>.<policyVersion>.<base64url JSON>`; malformed id, version, base64 or JSON → null;
  round trip keeps choices).
- [X] T040 [P] [US6] Write `tests/integration/consent.test.ts` first: with
  `CONSENT_TEST_CATEGORY` unset, `saveConsent` → `consent.errors.unavailable` and no row; with it
  set to `analytics`, saving `{analytics: true}` inserts a `consent_record` (choices, the `cookies`
  page version, no other data) and sets `ac_consent` (`HttpOnly`, `SameSite=Lax`, 12 months);
  saving `{analytics: false}` inserts a new record and expires `ac_test_optional`; unknown keys are
  ignored; the 31st save within a minute inserts no `consent_record` but still sets `ac_consent` and
  expires `ac_test_optional` when it rejects; `getEnv()` memoises, so switch
  `CONSENT_TEST_CATEGORY` with `vi.mock('@/server/env', …)` as `tests/integration/order-changes.test.ts`
  does; the helper that computes
  `{needsChoice, effectiveChoices}` returns all categories `false` when the cookie's policy version
  differs from the current `cookies` page version (user decision Q2) and the cookie's choices when
  it matches.
- [X] T041 [P] [US6] Write `tests/e2e/consent.spec.ts` first (runs only in the existing `consent`
  project, server with `CONSENT_TEST_CATEGORY=analytics` on port 3101; test ids from
  contracts/consent.md): first visit shows `consent-banner`; `consent-accept-all` and
  `consent-reject-all` have equal bounding-box sizes and identical computed `font`, `padding`,
  `border`, `background-color`; no `ac_test_optional` before a choice, after "Reject all", and
  after browsing and an offline checkout; after "Accept all" (fresh context) the cookie appears;
  `footer-cookie-settings` exists on every visited page and opens `consent-dialog`; switching
  `consent-switch-analytics` off there and saving removes the cookie and adds a `consent_record`
  (checked with `sql`); after accepting and then bumping the `cookies` page version in the DB, the
  banner shows again and, in a context whose `ac_test_optional` was cleared, the optional script is
  not requested and the cookie does not come back until the visitor accepts again (Q2).
- [X] T042 [US6] Implement `src/server/consent/consent.ts` (cookie helpers, `saveConsentRecord`,
  `consentState(cookieValue, cookiesVersion)` → `{choices, needsChoice, effectiveChoices}` per
  contracts/consent.md), `src/app/[locale]/(shop)/consent/actions.ts` (`saveConsent` per
  contracts/server-actions.md, rate limit `consent` 30 per 60 s) and
  `src/app/test-optional.js/route.ts` (404 unless the test category is on; otherwise the script of
  contracts/routes.md), so T039 and T040 pass.
- [X] T043 [US6] First, prove the code split (contracts/consent.md › Components): create a minimal
  `src/components/shop/ConsentBanner.tsx` containing the marker `data-consent-banner=
  "ac-consent-banner-v1"`, the client `ConsentLoader.tsx` (`React.lazy` imports of the banner
  and `ConsentGate.tsx`; `next/dynamic` was dropped for the bundle budget) and the server `ConsentRoot.tsx` (`null` unless `consentRequired()`), run
  `pnpm build`, and check that the marker is only in a chunk of its own (grep `.next/static`) and
  that T009's marker assertion passes at launch; report the chunk check in the batch report. Then
  complete them: `ConsentRoot` reads `ac_consent` and the `cookies` page version, calls
  `consentState()`, and renders `ConsentLoader` inside its own `NextIntlClientProvider` with only
  the `consent` messages; `ConsentBanner` per §7.21 (bottom sheet, equal `secondary` buttons in a
  two-column grid, "הגדרות" opening a native `<dialog>` with `role="switch"` per category and
  "necessary" shown always on, focus management, skip link "מעבר להגדרות העוגיות", listens for
  `ac:consent-settings`, the pinned test ids); `ConsentGate` appends the scripts of categories
  `true` in `effectiveChoices` once with the nonce; after `saveConsent` succeeds the banner closes,
  and the islands call `router.refresh()` so `ConsentRoot` re-reads the new cookie and the gate
  loads or stops loading at once (a removed optional cookie is already expired by the action); render `ConsentRoot` in
  `src/app/[locale]/layout.tsx` (nonce from the `x-nonce` request header) and, only when consent
  is required, pass `src/components/shop/CookieSettingsButton.tsx` (client button, label passed as
  a server-translated prop, `data-testid="footer-cookie-settings"`, dispatches
  `ac:consent-settings`) to the footer's `cookieSettings` slot. Strings in `consent.*`. T041
  passes; T009's marker check and `tests/e2e/bundle-size.spec.ts` still pass.

**Checkpoint**: enabling an optional category later needs no new mechanism.

---

## Phase 9: User Story 7 — Old data is removed on schedule (P3)

**Goal**: four daily retention tasks (FR-026, FR-027).

**Independent test**: quickstart.md › US7.

- [X] T044 [P] [US7] Write `tests/integration/retention.test.ts` first (research R11): an order
  created 7 years + 1 day ago is anonymised (same columns as T023, `order_event` with NULL
  admin, one `system` activity row `customer.anonymized` `{count}`) and its outbox rows deleted;
  one 6 years 11 months old is untouched; `admin_activity` and `consent_record` rows older than 2
  years are deleted, younger kept; outbox `sent` rows with `sent_at` 31 days ago deleted, 29 days
  kept; `failed` rows whose final failure (`next_attempt_at`) was 31 days ago deleted, 29 days ago
  kept, whatever their `created_at`; `drainOutbox` giving up on a row sets its `next_attempt_at` to
  the give-up time (extend `tests/integration/outbox.test.ts`); `pending` rows never deleted;
  `content_page_version` rows untouched; each task's second run changes nothing; the 7-year task
  handles at most 500 orders per run.
- [X] T045 [US7] Implement `src/server/privacy/retention.ts` (`anonymizeOldOrders`,
  `deleteOldActivity`, `deleteOldConsent`, `deleteOldOutbox` as `JobTask`s named
  `anonymize-old-orders`, `delete-old-activity` (column `admin_activity.at`),
  `delete-old-consent`, `delete-old-outbox` (on `next_attempt_at` for failed rows), each computing its cut-off from the `now` argument
  of `run(db, now)` and returning a non-personal summary) and add them to `dailyTasks` in
  `src/server/jobs/daily-maintenance.ts`; in `src/server/email/sender.ts` add `nextAttemptAt: now`
  to the `failed` update object (both give-up paths), so T044 passes and `tests/integration/jobs.test.ts`
  still passes.

**Checkpoint**: retention is automatic.

---

## Phase 10: User Story 8 — Data Security Regulations documents (P3)

- [X] T046 [P] [US8] Write `docs/privacy/database-definition`, `security-procedure`,
  `access-authorizations`, `incident-response`, `annual-review-checklist`, each in Hebrew and
  English as `<name>.he.md` and `<name>.en.md` with the same content (Clarifications 2026-11-10,
  as `docs/legal-drafts/`), per research R17, each starting with "**טיוטה — נדרשת בדיקה משפטית / Draft — requires legal review.**",
  consistent with 001 data-model.md's register plus data-model.md's changes and the processors in
  the Privacy Policy draft (T012): basic security level, authorised users (two admins + the
  maintainer), access rules (Google + passkey), backups (12 months), retention tasks, export-file
  handling (send only to the verified customer, delete the local copy), incident steps (contain,
  assess, notify the Privacy Protection Authority and affected people when required, record), and
  a yearly checklist.

---

## Phase 11: Polish & cross-cutting

- [X] T047 Check that `docs/design/storefront.md` §7.10, §7.20, §7.21, §7.25, §8.9, §8.10, §9 and
  §12.3–§12.8 match what was built; fix the document (not the code) where only wording differs,
  and report any real difference. Do not run prettier on it.
- [X] T048 Run `pnpm verify` (types, lint, CSS logical-property check, unit + integration, audit)
  and fix failures; confirm `tests/integration/admin-actions-guard.test.ts` lists the new action
  files and passes, and `tests/unit/i18n-parity.test.ts` passes.
- [X] T049 Run, one file at a time after one `pnpm build`: `admin-access.spec.ts`
  (chromium-mobile), `privacy.spec.ts`, `contact.spec.ts`, `checkout-terms.spec.ts` (chromium-
  mobile and webkit-mobile), `consent.spec.ts` (`--project=consent`), `admin-privacy.spec.ts`,
  `admin-content.spec.ts`, `admin-stats.spec.ts`, `bundle-size.spec.ts`, and the existing
  `checkout-offline.spec.ts`, `checkout-online.spec.ts`, `order-tracking.spec.ts`,
  `admin-settings.spec.ts`, `admin-orders.spec.ts`, `admin-order-workflow.spec.ts`; all pass.
- [X] T050 Walk through quickstart.md US1–US8 on `pnpm dev` (port 3001) and note anything that
  differs.

---

## Dependencies & execution order

- **Phase 1 (T001)** → **Phase 2 (T002–T008)** → user stories.
- **US1 (T009–T018)**: needs Phase 2. **US2 (T019–T022)**: needs Phase 2 (content `contact`
  intro via `getPage`; works with the placeholder before T014). **US3 (T023–T028)**: needs only
  Phase 2 (independent of US1/US2); T028 edits the admin order page. **US4 (T029–T032)**: needs
  Phase 2; its E2E checks public pages, so run after US1; T032 needs T028's block 8a. **US5
  (T033–T038)**: T035 extends T009 (US1). **US6 (T039–T043)**: T043 fills the footer slot from
  T016 (US1). **US7 (T044–T045)**: needs `anonymizeOrders` from T026 (US3). **US8 (T046)**: needs
  T012 for consistency; otherwise independent.
- Within a story: tests first, then data layer, then pages/islands.
- Tasks adding strings (T008, T015, T016, T021, T022, T027, T028, T030, T031, T032, T038, T042,
  T043) are not parallel with each other.
- User decisions Q1–Q5 (plan.md › Decisions from plan review) are binding for T019–T028 and
  T040–T043.

## Parallel examples

- Phase 2: T002 and T007 (unit tests) together; T004 alongside them; T003 after T002.
- US1: T009, T010, T011 together (three test files); T012 and T013 are content-only and can run
  beside code tasks.
- US3: T023 and T024 together.
- US5: T033, T034, T035 together. US6: T039, T040, T041 together. US7 T044 and US8 T046 alongside
  any story.

## Implementation strategy

1. **MVP = Phase 1 + Phase 2 + US1 + US2**: every link already in the shop resolves, legal drafts
   are visible, the Terms box works, and visitors can write to Aviva.
2. Then **US3** (data-request tools, the other P1), **US4** (editing and version history).
3. Then **US5**, **US6**, **US7**, **US8**.
4. Polish (T047–T050). Each phase ends with its own tests green, so it can be reviewed as one
   batch.

## Phase 12: Convergence

- [X] T051 Add `method="post"` to the admin customer search form in `src/components/admin/CustomerSearch.tsx` and drop the unused `name="q"`, so a submit before hydration or after a script failure never puts an email or phone in the page address; add an assertion to `tests/e2e/admin-privacy.spec.ts` that the form has `method="post"` per FR-016 / US3 #7 (partial)
