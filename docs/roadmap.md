# Roadmap

The vision (who the shop is for, what success means, principles, what is out of scope) is
[`PRODUCT.md`](../PRODUCT.md). The rules every feature follows are in the
[constitution](../.specify/memory/constitution.md). This file lists what gets built, in order.

## How this roadmap is used

- Each item becomes its own Spec Kit feature when work on it starts: switch to an up-to-date
  `dev`, then run `/speckit-specify` with the item's goal. The feature branch and folder are named
  `NNN-short-name` (`specs/NNN-short-name/`).
- Give `/speckit-specify` the item's "Source" too. Spec 001 already settled many decisions for these
  stories (clarifications, requirements FR-xxx, success criteria SC-xxx); reuse them instead of
  asking again, and change them only on purpose.
- The old task IDs under "Source" are starting material for `/speckit-tasks`, not tasks to copy
  blindly: check them against the code as it is now.
- Each feature's plan writes its own `data-model.md` and `contracts/` for what it adds or changes.
  The Drizzle schema in `src/server/db/schema/` is the source of truth for the whole data model;
  spec 001's `data-model.md` and `contracts/` are background. The design system
  [`design/storefront.md`](design/storefront.md) is binding for every feature: plans and tasks cite
  the sections they use, and a feature that changes the design updates it in the same branch.
- When a feature starts, set its status to "In progress" and link its spec folder; when it is
  merged to `dev`, set it to "Done (dev)"; when released to `main`, "Released (vX.Y.Z)".

## Statuses

| # | Item | Launch blocker | Status | Spec |
|---|------|----------------|--------|------|
| 001 | MVP: owner manages products; visitors browse, cart, guest checkout and pay | yes | Done (frozen record) | [specs/001-online-crafts-shop](../specs/001-online-crafts-shop/) |
| 002 | Order handling | yes | Done (dev) | [specs/002-order-handling](../specs/002-order-handling/) |
| 003 | Privacy, consent, legal and content pages | yes | Done (dev) | [specs/003-privacy-legal-pages](../specs/003-privacy-legal-pages/) |
| 004 | Simpler admin access | yes | Done (dev) | [specs/004-simpler-admin-access](../specs/004-simpler-admin-access/) |
| 005 | English version and language switch | yes | Done (dev) | [specs/005-english-language-switch](../specs/005-english-language-switch/) |
| 006 | Hosting and launch readiness | yes | Done (dev) | [specs/006-launch-readiness](../specs/006-launch-readiness/) |
| 007 | Storefront redesign (Shopify-like look) | yes | Done (awaiting owner test) | [specs/007-storefront-redesign](../specs/007-storefront-redesign/) |
| 008 | Post-launch fixes (orders, logo, WhatsApp, business number, link previews) | yes | Done (awaiting owner test) | [specs/008-post-launch-fixes](../specs/008-post-launch-fixes/) |
| 009 | New header logo (wordmark) | yes | Done (awaiting owner test) | [specs/009-header-logo-wordmark](../specs/009-header-logo-wordmark/) |

Numbers are a suggested order. Spec Kit gives each feature the next free number when it is
created, so if the order changes, the numbers follow the order of creation, not this table.

## Items

### 002 — Order handling

**Goal**: Aviva is notified of every order, sees and filters orders in the admin area, opens one
to see items, options, contact details, delivery choice and payment state, marks offline payments
as received, and moves orders through New → In preparation → Shipped / Ready for pickup →
Completed, or Cancelled (with refund confirmation). The customer gets one "order received" email
in the language they ordered in (plus an email when the order is cancelled or refunded), then
follows the order on its page (progress, tracking number or pickup note, payment state); no other status
or payment change sends an email. Aviva can also correct a customer's contact details.

**Left for later**: customer search, data export and anonymisation (003). A view of the activity
log was dropped (2026-11-11; see 004).

**Why first**: without it Aviva cannot run the shop; orders already arrive (spec 001 built
checkout and the order notification email).

**Source**: spec 001 › User Story 3; tasks.md Phase 5 (T088–T094); quickstart.md › US3.

### 003 — Privacy, consent, legal and content pages

**Goal**: only strictly necessary storage and cookieless visit statistics at launch; a consent
banner that stays dormant until an optional cookie category is turned on; editable About,
Contact, Privacy, Terms, Cookies, Shipping & Returns and Accessibility pages in both languages;
business details in the footer; a contact form; owner tools to find, export, correct and
anonymise a customer's data; retention tasks; Data Security Regulations drafts.

**Why before launch**: constitution principle VII (non-negotiable) and Israeli law. Legal texts
are drafts and need review by a qualified legal professional before launch.

**Source**: spec 001 › User Story 5; tasks.md Phase 7 (T100–T118); contracts/device-storage.md.

### 004 — Simpler admin access

**Goal**: admin sign-in is just "Sign in with Google". An admin is a user whose `role` is `admin`
(the other value is `user`), set by the owner directly in the database or the deployment, with no
screens for it. Passkeys are removed, and with them recovery codes, setup links, passkey approval
by another admin and the fresh passkey check before export and anonymise. The admin management
screens, the session list and the activity log viewer are not built. The `admin:add` /
`admin:reset` scripts are removed or reduced to setting the role.

**Decided (2026-11-11)**: the security rules from spec 001 went far beyond what this shop needs.
Keep the essentials (HTTPS, safe cookies, CSRF, no card data, rate-limited sign-in); Google's own
2-step verification protects the admins' accounts. Constitution principle IV was amended to
match (v2.0.0, 2026-11-11).

**Why before launch**: less admin code to ship and maintain, and no recovery path that waits for
an approval screen that does not exist.

**Source**: spec 001 › FR-032–FR-035 and Phase 2 (sign-in), read as what to remove; spec 003's
re-authentication for export and anonymise; the current code in `src/server/auth/` and
`scripts/admin-*.ts`.

### 005 — English version and language switch

**Goal**: a visible language switch on every page shows the same page in English with a real LTR
layout, keeps the cart, remembers the choice, and shared links open in their language. Emails go
out in the language of the order. Empty English product text falls back to Hebrew.

**Why before launch**: PRODUCT.md promises an English version from the first release.

**Source**: spec 001 › User Story 4; tasks.md Phase 6 (T095–T099), which are done here.

### 006 — Hosting and launch readiness

**Goal**: production on Render (Frankfurt) with Cloudflare R2 and Resend, offline payment at launch
(card payment later); encrypted off-site database backups; security headers, accessibility and storefront layout tests;
performance pass (first-load JS ≤ 150 KB gzipped); image metadata check; threat model; Hebrew
owner guide; launch checklist (domain, DNS, legal review, security scan, Google OAuth client);
final walk-through.

**Google OAuth client (owner decision 2026-11-12)**: admin sign-in runs against a mock Google
locally and in tests; production needs a real one. In Google Cloud Console: a project, an OAuth
consent screen (External, Testing mode, test users = the admins' Gmail addresses, basic scopes
only), and an OAuth client of type "Web application" with the redirect URI
`https://<shop domain>/api/auth/google/callback` (plus `http://localhost:3001/api/auth/google/callback`
for trying it locally). Set `OIDC_ISSUER=https://accounts.google.com`, `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` on Render, then `pnpm admin:role <gmail> admin` for each admin.

**Deployment decision (2026-11-09)**: production only, deployed from `main` by Render's own
auto-deploy set to "after CI checks pass". No staging environment for now: a second web service
and database would roughly double the cost and break the under-₪100/month budget. Revisit if a
preview site is needed earlier.

**Source**: spec 001 › Phase 9 (T123–T134).

### 007 — Storefront redesign

**Goal**: the storefront looks very similar to the owner's own Shopify shop (Horizon theme,
"Balance" style): white page, dark green text, sage and dark green buttons, peach band, mint
footer, Assistant font, a plain full-width header, a home page with a large photo and photo
banners, a swipeable row of featured pieces, an "All pieces" page, square product photos and a
"You may also like" row. Every current function and Aviva's wording stay; the admin area takes only
the new colours and font. New: social links in the footer, set by Aviva in Settings; a piece can be
in several categories, and Settings chooses the home row's category.

**Why before launch**: the owner paused the launch on 2026-11-16 to redesign the shop first.

**Source**: owner design discussion 2026-11-16 (decisions recorded in the spec).

### 008 — Post-launch fixes

**Goal**: fix what the first live test showed: orders no longer blocked by sample business details;
the owner's round logo in the header; a WhatsApp block on the contact page; the business number
optional and never on the website; no VAT label; a clearer product editor (photos first, field errors);
a new home band sentence; favicon and link previews.

**Source**: owner decisions 2026-11-20 (recorded in the spec).

### 009 — New header logo

**Goal**: the owner's new wordmark logo ("Aviva's Crafts" with yarn balls) sits inside the header bar
on every page, readable over the home photo (soft white backing); new tab and app icons and link
preview built from it. Replaces 008's round badge.

**Source**: owner decisions 2026-11-21 (recorded in the spec).

## Later (after launch)

Not planned yet; each needs its own decision first. From PRODUCT.md › out of scope and plans for
later:

- International shipping zones and USD prices (the data model already supports inactive zones).
- Final shop name.
- Customer accounts, reviews, wish lists, discount codes, gift cards, marketing campaigns,
  WhatsApp/SMS notifications, custom-order requests through checkout.
