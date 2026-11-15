# Feature Specification: Hosting and Launch Readiness

**Feature Branch**: `006-launch-readiness`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "Roadmap item 006 — Hosting and launch readiness (docs/roadmap.md ›
006; frozen spec 001 › Phase 9, tasks T123–T134). Production only on Render (Frankfurt),
auto-deployed from `main` after CI passes, no staging (deployment decision 2026-11-09). Google
OAuth client per owner decision 2026-11-12. Owner decisions of 2026-11-13: 006 builds everything
that lives in the repository (deployment blueprint, encrypted off-site database backup job,
security-headers / accessibility / storefront-layout tests, performance pass, image-metadata check,
opt-in design-review screenshots, threat model, Hebrew owner guide, launch checklist, final
walk-through); account-side steps are checklist steps the owner does; the owner guide's sign-in
part is rewritten for Google sign-in; no domain yet (placeholder); launch with offline payment only
and a safe 'no card payment' mode; no lawyer yet (legal review stays a checklist item)."

## Context

Features 001–005 built the shop: catalog, cart, guest checkout with online (card) and offline
payment, order handling, privacy and legal pages, Google-only admin sign-in, and the English
version. Everything runs locally and in CI. Nothing runs in production yet.

Spec 001 planned the launch work as its Phase 9 (T123–T134) and moved it here unchanged. Since
then three things changed it:

- **Feature 004** removed passkeys, recovery codes, setup links and the `admin:add` /
  `admin:reset` scripts. An admin is now a user whose role is `admin`, set with
  `pnpm admin:role`. Every Phase 9 step that mentions passkeys, recovery codes or setup links is
  rewritten or dropped.
- **Feature 005** already added `tests/e2e/bundle-size.spec.ts` for every storefront route,
  including the content page and contact. It also runs accessibility checks on the Hebrew and
  English home pages, a product page and the admin product list. The product page is at 149.3 KB
  of its 150 KB budget.
- **No staging** (decision 2026-11-09). The Phase 9 checks that ran "on staging" now run on
  production after it is deployed, before the shop is announced (see Assumptions).

**Terms in this spec**: "the owner" is the person who sets up and maintains the shop (accounts,
deployment, the repository); "Aviva" is the shop's owner who runs it day to day. (The constitution
and `docs/privacy/` call them the maintainer and the owner.)

Spec 001 is frozen. This feature reuses its decisions (FRs, SCs, research, the security design in
its plan) and never edits it. Results that 001 planned to record in its own
`checklists/validation.md` are recorded in this feature's folder instead.

### Owner decisions (2026-11-13)

1. **Scope**: 006 builds everything that lives in the repository: the Render blueprint, the
   encrypted off-site database backup job, the security-headers, accessibility and
   storefront-layout tests, the performance pass, the image-metadata check script, the opt-in
   design-review screenshots, the threat model, the Hebrew owner guide, the launch checklist and
   the final walk-through. Account-side steps (Render, Cloudflare R2, Resend, the Google OAuth
   client, the domain and DNS) are launch-checklist steps the owner does, not code.
2. **Owner guide**: its sign-in part is rewritten for Google sign-in (feature 004). The old setup
   link and recovery codes are gone.
3. **No domain yet**: the owner will buy one soon. Docs and configuration use the clear
   placeholder `<shop domain>`, and the checklist says everywhere it must be filled in.
4. **Offline payment only at launch**: bank transfer, Bit, PayBox and cash on pickup, which the
   shop already supports. There is no PayPlus account; card payment is off at launch, and the
   choice of payment provider is a later, separate discussion. Production needs a safe "no card
   payment" mode: checkout shows only offline methods, and the fake provider never runs in
   production. The PayPlus steps move out of the launch blockers into a "Later" section of the
   checklist.
5. **No lawyer yet**: legal review of the legal drafts stays a launch-checklist item.

## Clarifications

### Session 2026-11-14

- Q: The legal drafts and privacy documents still name PayPlus and card payment; what should 006
  do with them? → A: Update them to offline payment only now, so the lawyer reviews accurate text;
  the checklist's "Later" card-payment section says to add the provider back.
- Q: Should search engines be kept out of production until the owner announces the shop? → A: No.
  There is no special code. The site is public and indexable from the first deploy; it is simply
  not announced until the post-deploy checks pass.
- Q: How should the card-payment switch look on the admin settings screen with no card provider?
  → A: Shown disabled (greyed out) with the note "Card payment is not set up yet".
- Q: Who does the final walk-through of the 001–005 scenarios? → A: Claude walks every scenario
  locally (browser, mock Google sign-in) and records the results; the owner and Aviva do only the
  stopwatch runs on a real phone (spec 001 SC-001, SC-002, SC-010) once production is set up.
- Q: CI only runs on pull requests, pushes to `main` or by hand, and agents may not push; how is
  "E2E green in CI" met before the Phase D gate? → A: Before the gate the coordinator asks; the
  owner pushes the branch and starts CI by hand (or opens a draft pull request); the gate waits
  for green E2E.
- Q: Should the "unfinished payments are deleted within 48–72 hours" text (Privacy Policy,
  database definition) and the cookies page's "payment page" wording be removed with offline-only
  payment? → A: No, keep them for the lawyer. Launch is still offline only (decision 4 stands);
  only the PayPlus name and the card-payment promises are removed.
- Q: Should the nightly backup also copy the public images bucket? → A: Yes, into its own prefix,
  with the same no-delete copy, so a restore is a plain copy back.
- Q: Production forces an SSL connection to the database, and it is unverified whether Render's
  internal connection accepts it; make the SSL mode configurable now? → A: No. The risk is
  accepted; if the first deploy's migration fails on SSL, the fix is a quick follow-up change.
- Q: The offline payment details are empty after seeding and nothing flags them; what should 006
  do? → A: The admin home flags empty Hebrew offline payment details as needing attention while
  offline payment is available, and the launch checklist has a step to fill both languages and see
  them in a test order's email and order page.
- Q: From when are SC-001's 15 minutes measured? → A: From CI turning green on `main`, not from the
  merge (CI alone can take more than 30 minutes).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - The shop runs in production (Priority: P1)

The owner connects the repository to Render once, following the launch checklist. From then on,
each merge to `main` deploys the shop to Frankfurt automatically, but only after CI passes. The
database migrates and seeds itself before the new version starts. Render keeps a version running
only if it answers its health check.

**Why this priority**: without it there is no shop.

**Independent Test**: validate the blueprint against Render's schema, then create the service from
it in a Render account. A push to `main` with failing CI does not deploy; a push with green CI
deploys, migrates and passes the health check.

**Acceptance Scenarios**:

1. **Given** the blueprint in the repository, **When** the owner creates the Render services from
   it, **Then** it creates the web service, the database and the daily backup job in Frankfurt.
   Every secret is listed by name with no value, for the owner to fill in on Render.
2. **Given** a merge to `main`, **When** CI fails, **Then** nothing is deployed; **When** CI
   passes, **Then** the new version is built, the database is migrated and seeded (safe to repeat),
   and the version goes live only after its health check answers.
3. **Given** a required production setting is missing or unsafe (for example the fake payment
   provider, or local file storage), **When** the service starts, **Then** it refuses to start and
   names the setting, never its value.

---

### User Story 2 - Customers pay offline only, and card payment cannot appear by accident (Priority: P1)

At launch the shop has no card-payment provider. A customer at checkout sees only the offline
methods (bank transfer, Bit, PayBox, cash on pickup) and places the order exactly as today. In
the admin settings, card payment is shown as not available, so the owner cannot turn it on by
mistake.

**Why this priority**: it is the launch payment setup (owner decision 4), and a card option that
leads nowhere, or a fake provider in production, would lose orders or fake payments.

**Independent Test**: start the shop in the "no card payment" mode. Checkout offers only offline
methods and an order completes. The settings screen does not let card payment be turned on. The
payment-callback and payment-return addresses do not accept or confirm anything.

**Acceptance Scenarios**:

1. **Given** the shop runs with no card-payment provider, **When** a customer opens checkout,
   **Then** only the offline payment methods are offered, and placing an order works as in
   feature 002.
2. **Given** no card-payment provider, **When** the owner opens the payment settings, **Then**
   the card-payment switch is shown disabled with the note "Card payment is not set up yet" and
   cannot be switched on; offline payment cannot be switched off, since it is the only method
   left.
3. **Given** no card-payment provider, **When** anyone calls the payment-callback address,
   **Then** it is refused and no order changes.
4. **Given** production, **When** the fake payment provider is configured, **Then** the shop
   refuses to start (already true; kept and tested).
5. **Given** the stored settings still say card payment is on (e.g. from seeding), **When** the
   shop runs with no card provider, **Then** card payment is treated as off everywhere: on product
   pages, in checkout and in order placement.

---

### User Story 3 - The data is backed up, encrypted and off-site, and can be restored (Priority: P1)

Every night a backup job dumps the database, encrypts it with a key whose private half is kept
offline, and stores it in a separate Cloudflare R2 bucket in the EU. Daily copies are kept for 30
days and monthly copies for a year. The product photos are copied too. A written restore
procedure lets the owner bring a backup back into a scratch database and check it.

**Why this priority**: constitution IV requires automatic encrypted backups and a tested restore
before launch.

**Independent Test**: run the backup job against a local database and a local or test bucket: an
encrypted file appears under the daily prefix, and on the first of the month under the monthly
prefix too, and both photo buckets are copied. Restore it with the private key into an empty database by following the README, and
the verification queries match the source.

**Acceptance Scenarios**:

1. **Given** the nightly schedule, **When** the job runs, **Then** an encrypted database dump is
   stored under the day's name, and on the first of the month also under the month's name.
2. **Given** the job, **When** it copies photos, **Then** it only adds and updates files in the
   backup; it never deletes backed-up photos because they were removed from the shop.
3. **Given** any step fails (dump, encryption, upload), **When** the job ends, **Then** it reports
   failure, so Render marks the run failed and emails the owner. Its output contains no secrets.
4. **Given** a backup file and the private key, **When** the owner follows the restore steps,
   **Then** the data comes back into a scratch database, and the listed checks (row counts, the
   latest order) confirm it.

---

### User Story 4 - Security, accessibility, layout and speed are checked automatically (Priority: P1)

Automated tests guard what the launch promises: strict security headers on every kind of page, no
accessibility violations on the storefront and the admin screens in both languages, a storefront
layout that is correct in both directions and on small phones, and first-load JavaScript within
budget. A script checks that a published photo carries no location or camera data. A written
threat model records the risks and how each is handled.

**Why this priority**: constitution IV (security), I (bilingual, accessible) and spec 001's SC-005
and SC-009. These tests keep later changes from quietly breaking the launch quality.

**Independent Test**: each test file runs on its own in CI and fails on a single deliberate
regression (a missing header, an image without alt text, a style attribute, a large added script).

**Acceptance Scenarios**:

1. **Given** the home page, a product page, checkout, the admin sign-in page and an API address,
   **When** they are loaded twice, **Then** each has a Content Security Policy with a fresh
   one-time value per load and the agreed strict directives, plus the other security headers, and
   no header that reveals the server software.
2. **Given** every storefront screen in both languages and the main admin screens, **When** they
   are checked for WCAG 2.1 A/AA, **Then** there are no violations. Keyboard-only shoppers can add
   to cart and complete checkout, and the photo zoom dialog works from the keyboard.
3. **Given** the storefront in Hebrew and English, **When** the layout test runs, **Then**
   direction, mirrored placement, no sideways scrolling at 320 and 375 px, no inline styles,
   responsive images, 44×44 px touch targets, arrow keys in the zoom dialog and reduced motion are
   all correct.
4. **Given** every storefront route, **When** the bundle test runs, **Then** first-load JavaScript
   is ≤ 150 KB gzipped (checkout ≤ 155 KB), and the consent banner and the phone-number library
   are not in the storefront's client code.
5. **Given** a published photo's address or file, **When** the image-metadata check runs,
   **Then** it fails if the photo contains any location, camera make/model or XMP data.

---

### User Story 5 - The owner can launch by following one checklist (Priority: P1)

The owner opens the launch checklist and works through it top to bottom: buy the domain and fill
in `<shop domain>` everywhere it is listed, set up DNS, R2, Resend and the Google OAuth client,
create the Render services from the blueprint, set the secrets, make both admins, run the
post-deploy checks on the live site, test a backup restore, get the legal drafts reviewed, and
announce. Each step says what to do, where, and how to confirm it worked. Card payment with a
provider sits in a separate "Later" section that does not block launch.

**Why this priority**: the account-side work is the owner's (decision 1). Without a precise
checklist the launch depends on memory.

**Independent Test**: a reviewer reads the checklist with no other context and can tell, for each
step, what to do, where, and how to check it. Every `<shop domain>` placeholder in the repository
is listed in it.

**Acceptance Scenarios**:

1. **Given** the checklist, **When** the owner reaches the domain step, **Then** it lists every
   file and setting where `<shop domain>` must be replaced (OAuth redirect address, `APP_ORIGIN`,
   image host, email sender domain, docs).
2. **Given** the checklist, **When** the owner looks for launch blockers, **Then** the PayPlus
   steps are not among them; they are under "Later (card payment)", noting that the provider is
   still to be chosen.
3. **Given** the live site before announcement, **When** the owner runs the post-deploy checks,
   **Then** each check has a command or action and a pass condition (security headers including
   HSTS, the vulnerability scan with no High or Critical alerts, the link preview in WhatsApp and
   Telegram, a large phone-photo upload with the memory peak recorded, a restore test, a phone
   performance run).
4. **Given** no lawyer yet, **When** the owner reads the legal step, **Then** "legal drafts
   reviewed by a qualified legal professional" is an open launch blocker with the list of pages to
   review.

---

### User Story 6 - Aviva has a guide in Hebrew for running the shop from her phone (Priority: P2)

Aviva reads a short Hebrew guide written for her Android phone. It covers signing in with Google,
adding a product with photos and options, the English texts, handling an order, marking offline
payments received, refunds outside the shop, editing pages, answering customer data requests, and
what to do if her phone is lost.

**Why this priority**: constitution II (built for a non-technical owner). The shop can launch
without the guide, but Aviva cannot run it alone without it.

**Independent Test**: Aviva (or someone in her place) follows the guide to publish a product with 3
photos and handle a test order without other help. The guide does not mention setup links,
recovery codes or passkeys.

**Acceptance Scenarios**:

1. **Given** the guide, **When** Aviva signs in the first time, **Then** it tells her to tap
   "Sign in with Google" with the Gmail account the owner made an admin, and what the "no access"
   message means.
2. **Given** a lost or stolen phone, **When** Aviva reads that section, **Then** it tells her to
   secure her Google account (sign out other devices, change the password) and to ask the owner
   to end her shop sessions; the launch checklist tells the owner how.
3. **Given** a slow photo upload, **When** Aviva reads the photos section, **Then** it tells her
   how to switch her camera from HEIC to JPEG.

---

### User Story 7 - A final walk-through confirms the whole shop works before launch (Priority: P2)

Before the owner launches, every automated check passes, and Claude walks through every user
scenario of features 001–005 once on the current local build (browser, mock Google sign-in). The design-review screenshots of every
screen and state, in both languages and three widths, are compared with the design system, and
any fixes are made. The results are recorded with a date and pass/fail per scenario. The owner and
Aviva run the timed owner and visitor tasks with a stopwatch on a real phone once production is
set up, and record them in the same place.

**Why this priority**: it is the last gate before launch, but it depends on everything else.

**Independent Test**: the validation record exists in this feature's folder, lists every scenario
with a result and date, and links the reviewed screenshot set.

**Acceptance Scenarios**:

1. **Given** a normal test run, **When** the design-review spec is not switched on, **Then** it is
   skipped and takes no time.
2. **Given** design review switched on, **When** it runs, **Then** it saves a full-page screenshot
   of every storefront screen and state in docs/design/storefront.md §8–§9 in Hebrew and English
   and of the admin screens of §12 in Hebrew, at 375, 768 and 1280 px, into a folder that is not
   committed.
3. **Given** the walk-through, **When** it finishes, **Then** the record lists each scenario as
   pass or fail with the date, and every failure is fixed or listed as a known issue the owner
   accepted.

---

### Edge Cases

- **Stored card setting with no provider**: the seed or old data says card payment is on, but
  there is no provider. Card payment is treated as off everywhere (US2 scenario 5).
- **No payment method at all**: offline payment switched off and no card provider. The settings
  screen prevents this, and the database already requires at least one method to be on. If the
  stored settings have card payment on and offline payment off (e.g. from before), offline payment
  is treated as on whenever there is no card provider, so the shop can always take orders.
- **A customer returns to an old payment-return link**: with no provider, the return page shows
  the order's real state and never confirms a payment.
- **First deploy on an empty database**: migrations and the seed create the settings, zones and
  content pages. A redeploy changes nothing that the owner has edited.
- **The backup job runs while a deploy migrates**: the dump is consistent (a single snapshot). Its
  own locks do not block the shop, but a migration that alters a table waits for the dump to
  finish, and the shop's queries on that table wait behind it. At 00:30 UTC with a small database
  this is a short, accepted delay.
- **The backup bucket is unreachable or the public key is malformed**: the run fails loudly; no
  partial file is left under the day's name. A valid but wrong public key produces backups nobody
  can decrypt; only the restore test catches that, which is why the checklist requires one.
- **Domain not bought yet**: the service cannot go public; the checklist puts the domain step
  first. Sign-in with Google only works once the OAuth redirect address uses the real domain. The
  shop's address is fixed into the build, so it must be set before the first build, and changing
  it later needs a rebuild, not just a restart.
- **The product page exceeds its budget** after a change in this feature: the performance pass
  trims it back under 150 KB; the budget is not raised.
- **Test data on a public site**: the site is indexable from the first deploy, so the checklist
  tells the owner to cancel the test orders placed during the post-deploy checks and to remove or
  unpublish test products before announcing.
- **A header test runs over plain http in E2E**: HSTS and upgrade-insecure-requests are absent
  there by design. Their https values are covered by a unit test and by the live-site check.

## Requirements _(mandatory)_

### Functional Requirements

**Deployment (US1)**

- **FR-001**: The repository MUST contain a Render blueprint that defines, in the Frankfurt
  region: the web service (build with the pinned package manager, migrate and seed before deploy,
  start, health check), a PostgreSQL 17 database on the smallest paid plan, and the daily backup
  job. Every secret and environment-specific value MUST be listed by name only, with no value.
- **FR-002**: The web service MUST deploy automatically from `main` only after the CI checks pass.
  There MUST be no staging service.
- **FR-003**: The existing health address MUST be the deployment health check, and MUST reveal no
  version, configuration or data.
- **FR-004**: The shop MUST refuse to start in production when a required setting is missing or
  unsafe, naming the setting and never its value. Unsafe includes the fake payment provider, local
  file storage, a non-https sign-in issuer and the consent test category (all already enforced;
  kept and tested).
- **FR-005**: Docs and configuration MUST use the placeholder `<shop domain>` (and `img.<shop
  domain>` for the image host) wherever the domain is needed. No made-up domain may appear.

**No card payment mode (US2)**

- **FR-006**: The shop MUST support running with no card-payment provider, and production MUST be
  able to run that way. In this mode card payment is unavailable everywhere: product pages,
  checkout and order placement offer and accept only offline payment, whatever the stored
  settings say.
- **FR-007**: In this mode the admin settings MUST show the card-payment switch disabled with the
  note "Card payment is not set up yet" (in Hebrew, as the whole admin area is), MUST NOT let it be switched on,
  and MUST NOT let offline payment be switched off. The disabled control follows the design system
  (docs/design/storefront.md §7.10 form controls), which this feature updates with a disabled
  state.
- **FR-008**: In this mode the payment-callback address MUST refuse every request without changing
  any order, and the payment-return page MUST never confirm a payment.
- **FR-009**: The fake payment provider MUST NOT be usable in production (kept from 001). The
  "no card payment" mode MUST be covered by unit, integration and E2E tests.
- **FR-010**: In this mode the Content Security Policy MUST NOT allow any payment host.
- **FR-010b**: While offline payment is available, the admin home MUST list empty Hebrew offline
  payment details (the bank transfer, Bit and PayBox text shown in checkout, on the order page and
  in the order email) among the settings that need attention, the same way it lists empty pickup
  instructions today.
- **FR-010a**: The legal drafts (`docs/legal-drafts/`, both languages; they are also the seed text
  of the content pages) and the privacy documents (`docs/privacy/`) MUST describe the shop as it
  launches: offline payment only, with no card-payment processor named and no card-payment
  promise. The retention text for unfinished payments and the cookies page's payment-page wording
  stay as they are (clarified 2026-11-14). The checklist's "Later" section lists these documents as the ones to update when a card
  provider is chosen.

**Backups (US3)**

- **FR-011**: A backup job MUST run daily at about 02:30 Israel time. It MUST dump the whole
  database, encrypt the dump with a public key (the private key is kept offline by the owner), and
  upload it to a separate EU-jurisdiction backup bucket under a daily name; on the first of the
  month also under a monthly name.
- **FR-012**: The job MUST copy the private and the public photo buckets into the backup bucket,
  each under its own prefix, without ever deleting files from the backup.
- **FR-013**: The job MUST exit with failure if any step fails, MUST NOT leave a partial file
  under the final name, and MUST NOT print secrets.
- **FR-014**: The backup README MUST cover making the key pair offline, the bucket lifecycle rules
  (daily copies expire after 30 days, monthly after 365), and a step-by-step restore into a
  scratch database with verification queries.

**Automated quality checks (US4)**

- **FR-015**: A security-headers test MUST check, on the home page, a product page, checkout, the
  admin sign-in page and an API address: a per-load CSP nonce, `strict-dynamic`,
  `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, the exact `form-action` for
  each page (`'self'` on the storefront with no card provider; `'self'` plus the sign-in issuer on
  the admin sign-in page), nosniff, Referrer-Policy, Permissions-Policy and COOP; no
  `X-Powered-By`; no CSP violations in the console; no HSTS and no upgrade-insecure-requests over
  the plain-http test origin.
- **FR-016**: An accessibility test MUST find zero WCAG 2.1 A/AA violations on: home, category,
  search, product, cart, checkout, order confirmation, every content page and contact, in both
  languages at 375 and 1280 px; and on the admin sign-in, product list, product editor, orders
  list, order detail and settings screens. It MUST also check keyboard-only add-to-cart and
  checkout, and the zoom dialog (open, move between photos, Esc, focus returns). Checks that 005's
  `language.spec.ts` already makes are not repeated.
- **FR-017**: A storefront-layout test MUST check, per docs/design/storefront.md §11, on home,
  category, search, product, cart, checkout, order confirmation, a content page, contact and the
  404 page in both languages: `lang`/`dir`; mirrored placement of the gallery and the header brand
  at 1280 px; no sideways overflow at 320 and 375 px; no `style=` in the server HTML and no
  `[style]` in the page except Next's route announcer; `srcset`, `sizes`, `width` and `height` on
  every product image; ≥ 44×44 px hit areas on header, buy-box, cart and checkout controls; arrow
  keys in the zoom dialog follow the reading direction; no transform animation on add-to-cart with
  reduced motion.
- **FR-018**: The performance pass MUST keep every storefront route at ≤ 150 KB gzipped first-load
  JavaScript (checkout ≤ 155 KB) as measured by the existing bundle test, trimming the product
  page if needed rather than raising the budget. It MUST confirm that the consent banner and the
  phone-number library are absent from the storefront's client code, MUST put lazy loading and
  high fetch priority on the right images, and MUST give every `srcset` a `sizes` attribute. It
  MUST re-run the app memory measurement against the final build and record the result.
- **FR-019**: An image-metadata check MUST take a photo address or file and fail if it finds any
  GPS, camera make or model, or XMP data.
- **FR-020**: A design-review test MUST be skipped unless switched on. When on, it MUST capture
  every storefront screen and state in docs/design/storefront.md §8–§9 in Hebrew and English, and
  the admin screens in §12 in Hebrew (the admin area has no English), at 375, 768 and 1280 px, using seeded products (one with options and
  swatches, one not orderable, one without English text). The screenshots are not committed.
- **FR-021**: New E2E specs MUST choose their Playwright projects explicitly and fit the existing
  CI matrix. A new Playwright project MUST get a CI matrix entry.

**Documents (US4–US6)**

- **FR-022**: A threat model MUST cover the assets, trust boundaries and STRIDE per flow
  (checkout, admin sign-in, uploads, content editing, customer data tools, backups, and the
  payment callback in its "no card payment" state). It MUST map mitigations to the security design
  and list residual risks as they are after feature 004: the shop cannot enforce Google 2-step
  verification; one shared database account; Render shell access is protected only by the
  owner's Render account; the same-site bounce makes the admin cookie behave like `Lax` for GET
  navigations, which is safe because admin GET pages never change state; and proxying the domain
  through Cloudflare later needs research R19 and the Privacy Policy updated first.
- **FR-023**: A Hebrew owner guide MUST be written for an Android phone with screenshot
  placeholders. It MUST cover: Google sign-in (first time and the "no access" message); adding a
  product with photos and options; filling in the English texts; switching the camera from HEIC to
  JPEG; handling an order; marking offline payments received; refunds outside the shop; editing
  pages; customer data requests; and a lost phone. It MUST NOT mention setup links, recovery codes
  or passkeys.
- **FR-024**: The owner guide MUST include walkthrough scripts with a stopwatch log for SC-001
  (publish a product with 3 photos in under 5 minutes), SC-002 (a phone visitor from product link
  to confirmed order in under 3 minutes) and SC-010 (a customer data request in under 10 minutes).
- **FR-025**: A launch checklist MUST list, in order, every account-side step with where to do it
  and how to confirm it. Launch blockers: domain purchase and every `<shop domain>` to fill in;
  Cloudflare DNS (shop domain DNS-only, not proxied); the R2 buckets (EU) and the image custom
  domain with its `nosniff` header rule; Resend with SPF/DKIM/DMARC; the Google OAuth client
  (External, Testing mode, admins as test users, the exact redirect address); the Render services
  from the blueprint and their secrets; the backup key pair and backup bucket; 2FA on the Render,
  Cloudflare, GitHub and Resend accounts; Google 2-Step Verification confirmed on both admins'
  Google accounts; `pnpm admin:role <gmail> admin` for both admins, and how to end an admin's
  sessions (`pnpm admin:role <gmail> user`, then `admin` again); shop
  settings and business details filled in; legal drafts reviewed by a qualified legal
  professional; and the post-deploy checks of FR-026.
- **FR-026**: The checklist's post-deploy checks, done on production before the shop is announced,
  MUST include: response headers on `/he` and `/admin/sign-in` (HSTS present, form-action
  correct); cookie behaviour on the live https site (constitution, before public launch):
  `curl -sI https://<shop domain>/he` sets no cookie before any consent choice, no non-essential
  cookie (e.g. Cloudflare's `__cf_bm`) appears on the storefront, and after signing in the admin
  session cookie is `Secure; HttpOnly; SameSite=Strict; Path=/` with the `__Host-` prefix and the
  sign-in state cookie is `Secure; HttpOnly; SameSite=Lax`; an OWASP ZAP baseline scan with no High or Critical alerts, run by a script in the
  repository; the dependency audit clean; the image-metadata check on a published photo; a product
  link pasted into WhatsApp and Telegram shows the photo, name and price (recording the preview
  image's size); an 8160×6144 JPEG and a HEIC of at most 16 MP uploaded with the memory peak
  recorded, and a larger HEIC refused with the size message without a restart; the trusted
  proxy count confirmed; a backup restore test done and recorded; a Lighthouse mobile run on the
  catalog and product pages; the HSTS-preload decision; and, last, cancelling the test orders and
  removing or unpublishing the test products.
- **FR-027**: The checklist MUST have a "Later" section that does not block launch, holding the
  card-payment steps: choose a provider (separate discussion), and for PayPlus specifically the
  sandbox checks, production keys and callback address that 001's T130 listed. It MUST also hold
  the running-cost check (SC-011).

**Final walk-through (US7)**

- **FR-028**: Before the Phase D gate, `pnpm verify` and the E2E suite in CI MUST pass (the owner
  pushes the branch and starts CI; clarified 2026-11-14), Claude
  MUST walk through the scenarios of features 001–005 on the current local build (browser, mock
  Google sign-in), and the design-review screenshots MUST be compared with
  docs/design/storefront.md, with the fixes made. Results (pass or fail per scenario, date) MUST be
  recorded in this feature's `checklists/validation.md`, never in spec 001's folder. The record
  MUST have empty rows for the owner's stopwatch runs (spec 001 SC-001, SC-002, SC-010), and the
  launch checklist MUST point to them.
- **FR-029**: When the feature is done, roadmap item 006's status MUST be updated in the same
  branch, and its goal line MUST say offline payment at launch (it still names PayPlus).

### Key Entities

- **Deployment blueprint**: describes the production services (web service, database, backup job),
  their region, plans, commands, schedule and the names of their settings.
- **Backup**: an encrypted database dump with a daily or monthly name, plus a copy of the photo
  bucket, in a separate EU bucket with expiry rules.
- **Payment mode**: which payment methods the running shop can offer. At launch: offline only,
  with no card provider.
- **Launch checklist**: ordered owner steps, each with where, how to confirm, and whether it blocks
  launch; holds the `<shop domain>` fill-in list and the post-deploy checks.
- **Validation record**: the per-scenario walk-through results with dates, in this feature's
  folder.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Once CI turns green on `main`, the new version is live in production within 15
  minutes with no manual step. A commit with red CI is never deployed.
- **SC-002**: In the "no card payment" mode, 100% of checkouts offer only offline methods, and 0
  requests to the payment-callback address change an order.
- **SC-003**: A backup exists for every day of the last 30 days and every month of the last 12.
  A restore from the newest backup into an empty database takes under 30 minutes by following the
  README, and its checks match the source.
- **SC-004**: Zero accessibility violations (WCAG 2.1 A/AA) on every checked screen in both
  languages.
- **SC-005**: Every storefront route stays within its first-load JavaScript budget (≤ 150 KB, and
  checkout ≤ 155 KB, gzipped), and product and catalog pages become usable within 3 seconds on a
  mobile 4G connection (spec 001 SC-005).
- **SC-006**: Before announcement, the security scan of the live site reports no High or Critical
  findings, and a published photo carries no location metadata (spec 001 SC-009).
- **SC-007**: The owner completes the launch checklist without asking how to do a step: every
  step names where to act and how to confirm.
- **SC-008**: Aviva publishes a product with 3 photos from her phone in under 5 minutes after one
  read of the guide (spec 001 SC-001), and a customer data request in under 10 minutes (SC-010).
- **SC-009**: Production costs stay under ₪100/month at expected volume (spec 001 SC-011), with
  no card-payment fees at launch.

## Assumptions

- **Soft launch without staging**: production is deployed first and checked by the owner (the
  post-deploy checks of FR-026) before the shop is announced. This replaces 001's "on staging"
  checks. Nothing hides the site meanwhile: it is public and indexable from the first deploy
  (clarified 2026-11-14).
- **The backup job and the restore test** follow 001's T127 design: a separate EU backup bucket,
  public-key encryption with the private key kept offline, 30-day daily and 365-day monthly
  retention. Render emails the owner when the job fails.
- **The health address already exists** (`/api/health`); 006 checks it against the contract and
  uses it for the deployment.
- **Seeding stays safe to repeat** on production, as built in 001–005.
- **Walk-through scenarios** are those in the quickstarts of 002–005 plus 001's quickstart minus
  what 004 removed (passkeys, recovery, setup links).
- **Screenshots in the owner guide** are placeholders; the owner adds real ones later.
- **Database SSL** (clarified 2026-11-14): production keeps forcing SSL to the database; whether
  Render's internal connection accepts it is checked at the first deploy, and a failure is fixed by
  a follow-up change.
- **Running cost**: Render's Starter web service, the smallest paid PostgreSQL and a small daily
  job, plus free tiers of R2 and Resend, fit the ₪100/month budget.
- **Out of scope**: choosing or integrating a card-payment provider; a staging environment;
  proxying the shop through Cloudflare; buying the domain and the account-side setup (owner
  steps); legal review itself.
