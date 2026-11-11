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
| 004 | Admin security management | yes | Planned | — |
| 005 | English version and language switch | yes | Planned | — |
| 006 | Hosting and launch readiness | yes | Planned | — |

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

**Left for later**: customer search, data export and anonymisation (003); a view of the activity
log (004).

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

### 004 — Admin security management

**Goal**: screens to add and remove admins, approve or reject passkeys, use and regenerate
recovery codes, see and end sessions, and read the activity log. Sign-in itself already exists
(spec 001 Phase 2).

**Why before launch**: constitution principle IV (non-negotiable): Aviva must be able to recover
access, and a family helper needs their own admin account.

**Source**: spec 001 › FR-032–FR-035; tasks.md Phase 8 (T119–T122).

### 005 — English version and language switch

**Goal**: a visible language switch on every page shows the same page in English with a real LTR
layout, keeps the cart, remembers the choice, and shared links open in their language. Emails go
out in the language of the order. Empty English product text falls back to Hebrew.

**Why before launch**: PRODUCT.md promises an English version from the first release.

**Source**: spec 001 › User Story 4; tasks.md Phase 6 (T095–T099).

### 006 — Hosting and launch readiness

**Goal**: production on Render (Frankfurt) with Cloudflare R2, Resend and PayPlus; encrypted
off-site database backups; security headers, accessibility and storefront layout tests;
performance pass (first-load JS ≤ 150 KB gzipped); image metadata check; threat model; Hebrew
owner guide; launch checklist (domain, DNS, legal review, security scan); final walk-through.

**Deployment decision (2026-11-09)**: production only, deployed from `main` by Render's own
auto-deploy set to "after CI checks pass". No staging environment for now: a second web service
and database would roughly double the cost and break the under-₪100/month budget. Revisit if a
preview site is needed earlier.

**Source**: spec 001 › Phase 9 (T123–T134).

## Later (after launch)

Not planned yet; each needs its own decision first. From PRODUCT.md › out of scope and plans for
later:

- International shipping zones and USD prices (the data model already supports inactive zones).
- Final shop name, logo and wordmark.
- Customer accounts, reviews, wish lists, discount codes, gift cards, marketing campaigns,
  WhatsApp/SMS notifications, custom-order requests through checkout.
