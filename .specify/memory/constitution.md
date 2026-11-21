<!--
Sync Impact Report
- Version change: 2.0.1 → 2.1.0 (MINOR: scoped exception added to principle VII; owner decision
  2026-11-20, feature 008)
- Modified principles: VII. Privacy and Legal Compliance by Default: new "Exception (business
  number)" bullet. The seller's business number may be given only in the order emails sent to the
  buyer, not on the website, until a qualified lawyer has reviewed the decision. Reason: the
  owner is a sole trader whose business number is her personal ID number.
- Added/removed sections: none
- Templates: no template edits required
- Follow-up: lawyer review (docs/launch-checklist.md); remove or confirm the exception afterwards
- Deferred TODOs: none

Previous report (2.0.1):
- Version change: 2.0.0 → 2.0.1 (PATCH: wording; owner decision 2026-11-12)
- Modified principles: VI. Tested Critical Paths: "admin authentication (including two-factor),
  access control on every admin route" → "admin authentication and access control on every admin
  route" (two-factor no longer exists since principle IV v2.0.0 / feature 004)
- Added/removed sections: none
- Templates: no template edits required
- Deferred TODOs: none

Previous report (2.0.0):
- Version change: 1.4.1 → 2.0.0 (MAJOR: principle IV redefined; owner decision 2026-11-11)
- Modified principles: IV. Security by Design (title kept)
  - Admin access: Google sign-in only; the passkey second factor is no longer required; admins
    are users with role `admin`, set by the owner; no admin management screens, recovery codes or
    approval steps required
  - Baseline: OWASP Top 10 only; ASVS Level 2 is no longer a hard minimum
  - Intro and rationale reworded to fit a two-admin family shop
- Added sections: none
- Removed sections: none
- Templates: plan/spec/tasks templates read this file at runtime; no template edits required
- Follow-up: existing passkey, recovery-code and setup-link code (spec 001) and the passkey
  re-check before export/anonymise (spec 003) now exceed the principle; removing them is roadmap
  item 004. Frozen spec 001 is left as the historical record.
- Deferred TODOs: none
-->

# Aviva's Crafts Constitution

## Core Principles

### I. Hebrew-First, Bilingual by Design

- Hebrew is the default language and right-to-left (RTL) is the default layout for every page,
  including the admin area.
- Every user-facing string (labels, buttons, messages, emails, errors) MUST come from a
  translation source that has both a Hebrew and an English entry. Hard-coded display text in
  components is not allowed.
- Switching to English MUST render a correct left-to-right (LTR) layout, not a mirrored Hebrew one.
- Content the owner writes (product names, descriptions) MUST support a Hebrew version and an
  optional English version; when English is missing, the Hebrew text is shown.

Rationale: the shop's owner and most of its customers are Hebrew speakers; English is a
secondary audience. Retrofitting RTL and translations later is expensive.

### II. Built for a Non-Technical Owner

- The admin area MUST be usable by the owner without technical knowledge or outside help:
  plain Hebrew wording, no jargon, clear success and error feedback.
- Admin tasks (adding a product with photos, editing a price, handling an order) MUST work
  well on a mobile phone, since photos are likely taken and uploaded from a phone.
- Destructive actions (deleting a product, cancelling an order) MUST ask for confirmation.

Rationale: the shop only works if the owner can run it day to day on her own.

### III. Frictionless Guest Shopping

- Visitors MUST be able to browse, add to cart, and complete an order without creating an
  account or signing in.
- Checkout MUST ask only for the information needed to fulfil the order.
- The storefront MUST be designed mobile-first and remain fully usable on desktop.

Rationale: most shoppers arrive from a phone via a shared link; every extra step loses sales.

### IV. Security by Design (NON-NEGOTIABLE)

The shop is secured to a level that fits a small family shop: solid web basics, no card data,
and no machinery beyond what two admins need.

- **Baseline**: the OWASP Top 10 is the minimum bar. Plans MUST state how each relevant item is
  met. Formal standards such as OWASP ASVS are guidance, not requirements.
- **Payments**: the shop MUST NOT receive, store, process, or log payment card details. Card
  entry happens only on the payment provider's hosted page or hosted fields. An order is marked
  paid only from the provider's side — a signature-verified confirmation, or the shop's own
  authenticated server-to-server status query to the provider — or by the owner marking it paid by
  hand; never from the browser.
- **Admin access**: admins sign in with an approved identity provider account (Google), whose
  own 2-step verification protects it; the shop holds no passwords, passkeys or other second
  factor. An admin is a user whose role is `admin`, set by the owner directly in the database or
  deployment; no screens to manage admins, recovery codes or approval steps are required. Sign-in
  is rate-limited and admitted only for admin users. Sessions expire after inactivity and can be
  revoked (the owner may do so directly in the database).
- **Web hardening**: HTTPS everywhere with HSTS; a strict Content Security Policy; secure,
  HttpOnly, SameSite cookies; CSRF protection on every state-changing request; server-side
  validation of all input and context-correct output encoding; no raw query building.
- **Uploads**: uploaded images MUST be verified by content (not by file name), size-limited,
  re-encoded, stripped of all metadata (including GPS location), and served from storage that
  cannot execute code.
- **Least privilege and secrets**: credentials are scoped where the platform makes this simple
  (e.g. per-bucket storage tokens); a single database account for the app is acceptable. Secrets live in the hosting platform's secret store, never in the repository or logs.
- **Dependencies**: dependencies are pinned and scanned automatically; a release MUST NOT ship
  with known High or Critical vulnerabilities.
- **Abuse protection**: public forms (checkout, contact) are rate-limited and protected
  against bots in a privacy-friendly way.
- **Logging and recovery**: security events (sign-ins, failures, admin changes, payment
  confirmations) are logged without customers' personal data or secrets (recording which admin acted is fine). Data is backed up automatically,
  encrypted, and a restore is tested before launch.

Rationale: a breach, a payment fraud, or a defaced shop would be costly for a small family
business, so the basics are non-negotiable; but the shop has two admins who also own the code,
the settings and the deployment, so access management stays as simple as signing in with Google
(owner decision 2026-11-11).

### V. Simplicity and Low Running Cost

- Design for the real scale: one owner, tens to a few hundred products, a modest number of
  orders. Do not add infrastructure, services, or abstractions for hypothetical growth.
- Prefer managed services and low-maintenance hosting with minimal monthly cost; every paid
  service or new dependency MUST be justified in the plan.
- Any complexity beyond the simplest working approach MUST be recorded and justified in the
  plan's Complexity Tracking section. Security (IV) and privacy (VII) requirements are never
  traded away for simplicity.

Rationale: there is no operations team; the system must run cheaply and quietly for years.

### VI. Tested Critical Paths

- Automated tests MUST cover the critical paths: placing an order (cart → checkout →
  payment → confirmation), payment confirmation handling, admin product create/edit/delete,
  admin authentication and access control on every admin route, cookie
  consent behavior, and language switching.
- A feature is not done until its critical-path tests pass.

Rationale: losing an order, a payment error, or exposing the admin area is the costliest
failure this shop can have.

### VII. Privacy and Legal Compliance by Default (NON-NEGOTIABLE)

Visitors' privacy and the shop's legal obligations are treated as core features, not
afterthoughts.

- **Applicable law**: the shop MUST comply with the Israeli Privacy Protection Law (including
  Amendment 13) and its Data Security Regulations, the Israeli Consumer Protection Law
  (distance-selling disclosures and cancellation rights), and the Israeli Communications Law
  rules on marketing messages. Because worldwide shipping is planned, design choices MUST also be
  GDPR-ready so enabling EU customers does not require a redesign.
- **Data minimization**: collect only data needed for a stated purpose; every personal data field
  in the plan MUST name its purpose and retention period. Data is deleted or anonymized when its
  retention period ends (order records are kept only as long as tax law requires).
- **Cookies and tracking**: only strictly necessary cookies may be set before consent. Analytics,
  marketing, or any third-party tracking MUST be off until the visitor opts in, through a
  consent banner where rejecting is as easy as accepting. Consent can be changed at any time and
  is recorded. Privacy-friendly, cookieless analytics are preferred.
- **Marketing**: marketing emails are sent only to people who explicitly opted in through a
  separate, unticked checkbox; every marketing email has a one-click unsubscribe. Order and
  shipping emails are transactional only.
- **Transparency**: the shop MUST publish, in both languages, a Privacy Policy, Terms of Use and
  Sale, Cookie Policy, Shipping & Returns / Cancellation Policy, Accessibility Statement, and the
  seller's identifying business details. Visitors MUST accept the Terms of Sale before placing an
  order.
- **Exception (business number)**, owner decision 2026-11-20 (feature 008), valid until a
  qualified lawyer reviews it: the seller's business number (for a sole trader, her personal ID
  number) is not shown on the website and is given to the buyer only in the order emails
  (confirmation, cancellation, refund). All other identifying details (business name, address,
  email, phone) stay published as above. This is a known deviation from the distance-selling
  disclosure "before the purchase" and is accepted by the owner pending that review.
- **Individual rights**: the owner MUST be able to find, export, correct, and delete (or
  anonymize, where records must be kept) a customer's personal data on request.
- **Third parties**: every third-party service that receives personal data (payments, email,
  hosting, analytics) MUST be listed in the Privacy Policy and justified in the plan.

Rationale: trust is the shop's main asset, privacy and consumer law carry real penalties, and
compliance is far cheaper to build in than to retrofit.

## Product Constraints

- Prices are shown in Israeli shekels (₪) by default, with additional currencies (USD) handled
  as the feature specification defines; ₪ prices include VAT where applicable.
- The shop ships within Israel at launch; data, addresses, delivery options, and legal texts MUST
  be structured so additional countries can be enabled without redesign.
- Product images MUST be resized/optimized for fast loading on mobile connections.
- The storefront MUST meet WCAG 2.1 AA accessibility in line with Israeli accessibility
  regulations (IS 5568), including in RTL.
- Pages SHOULD be indexable by search engines and shareable with a proper preview image.

## Development Workflow

- The product vision is `PRODUCT.md`; the order of work is `docs/roadmap.md`. Each roadmap item
  becomes its own Spec Kit feature when work on it starts (`/speckit-specify`), on a branch
  `NNN-short-name` created from an up-to-date `dev`. Each feature follows specify → plan → tasks →
  implement → converge, with the project maintainer approving each gate.
- Each feature's plan writes its own `data-model.md` and `contracts/` in its spec folder, covering
  what that feature adds or changes; the code (the Drizzle schema in `src/server/db/schema/`) is
  the source of truth for the whole data model. `docs/design/storefront.md` is the shop's design
  system and is binding for every feature: a feature that changes the design updates it, and
  plans and tasks cite the sections they use. `specs/001-online-crafts-shop` is frozen as the
  record of the MVP and is not edited.
- Every implementation batch is reviewed against the spec, plan, and this constitution before
  it is considered complete; violations of principles IV or VII are always Critical.
- Before public launch: an automated security scan of the running site shows no High or
  Critical findings, the security headers and cookie behavior are verified, and the legal texts
  are reviewed by a qualified legal professional (the project provides drafts, not legal advice).
- Branches: `main` is production and `dev` is integration. A feature branch merges into `dev`
  through a pull request whose CI check passes (squash merge). `dev` is released to `main` through a
  pull request with a merge commit, and the release is tagged with its version. Nothing is pushed
  directly to `dev` or `main`, and neither is ever force-pushed or rewritten.
- The maintainer creates branches other than Spec Kit feature branches, commits after testing,
  pushes, and opens and merges pull requests. Automated tooling, including AI agents, does not
  commit, push, or open or merge pull requests.

## Governance

- This constitution takes precedence over other project practices. Plans and reviews MUST check
  compliance with it and flag violations as Critical.
- Amendments are made by updating this file with a Sync Impact Report and are approved by the
  maintainer.
- Versioning follows semantic versioning: MAJOR for removing or redefining a principle, MINOR for
  adding a principle or materially expanding guidance, PATCH for wording fixes.

**Version**: 2.1.0 | **Ratified**: 2026-10-31 | **Last Amended**: 2026-11-20
