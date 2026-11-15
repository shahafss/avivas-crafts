# Implementation Plan: Hosting and Launch Readiness

**Branch**: `006-launch-readiness` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-launch-readiness/spec.md`

## Summary

Make the shop ready to run in production on Render (Frankfurt) with offline payment only, and
give the owner what is needed to launch it. The code changes are small and contained: a third
payment-provider value `none` with one helper that decides which payment methods are really
available (D1). Most of the feature is configuration, tests and documents: the Render blueprint
(D3), the encrypted backup job (D4), four new E2E specs and a performance trim (D5–D8, D10), two
scripts (D9, D11), the threat model, the Hebrew owner guide, the launch checklist, the legal-draft
update to offline-only (D12), and the final walk-through (D13). No database schema change.

## Technical Context

**Language/Version**: TypeScript 6 on Node 24; Bash for the backup job and the ZAP script.

**Primary Dependencies**: unchanged: Next.js 16, React 19, Drizzle, Zod 4, next-intl, sharp.
Dev: Playwright 1.65, `@axe-core/playwright`, `exifr` (all already present). Backup image:
Alpine with `postgresql17-client`, `age`, `rclone`. **No new npm dependency.**

**Storage**: PostgreSQL 17 (Render Basic-256mb). Cloudflare R2 (EU): `ac-images-private`,
`ac-images-public`, `ac-backups`. No schema or migration change.

**Testing**: Vitest (unit, integration, pg), Playwright E2E (projects `chromium-desktop`,
`chromium-mobile`, `webkit-mobile`, `consent`). The new E2E specs run in `chromium-desktop`
(viewport set per test), except `no-card-payment.spec.ts`, which runs in `consent` (D2).

**Target Platform**: Render web service Starter (512 MB, Frankfurt), Render cron job (Docker).

**Project Type**: web application (single Next.js project).

**Performance Goals**: first-load JS ≤ 150 KB gzipped per storefront route, checkout ≤ 155 KB;
product page trimmed to ≤ 145 KB for headroom (D8). Catalog and product usable within 3 s on
mobile 4G (001 SC-005; measured on the live site).

**Constraints**: production runs with `PAYMENT_PROVIDER=none`; `fake` never in production; no
staging; budget under ₪100/month; local machine is 16 GB (run single E2E specs locally, full run
in CI).

**Scale/Scope**: one owner, two admins, tens to hundreds of products.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How this plan meets it |
|---|---|---|---|
| I | Hebrew-first, bilingual | ✅ | The new admin note exists in he and en. Accessibility and layout tests run both locales; the owner guide is Hebrew. |
| II | Non-technical owner | ✅ | Hebrew owner guide for Android; the card switch is visibly disabled with a plain note rather than leading nowhere. |
| III | Frictionless guest shopping | ✅ | Checkout is unchanged apart from showing only offline methods. Keyboard-only checkout is tested. |
| IV | Security by design | ✅ | No card data at all at launch (`none`); encrypted off-site backups with a restore test (D4); threat model (D12); ZAP baseline and audit before announcing (D11). OWASP Top 10 (2025), relevant items: **A01 Broken access control** — the settings action keeps `requireAdmin`; under `none` the payment callback is closed (404) for every provider. **A02 Security misconfiguration** — env guard refuses `fake`, local storage, a non-https issuer and the consent test category in production; strict headers tested (D5); the shop domain DNS-only; `nosniff` on the image host; database with no public allow-list (`ipAllowList: []`); fixed production values written in the blueprint so they cannot be mis-set. **A03 Supply chain** — no new npm dependency; `pnpm run audit` in CI and before announcing; Alpine and ZAP image tags pinned (the Alpine tag in the Dockerfile is visible to Renovate, the ZAP tag in a shell script is not, so the checklist has a yearly bump step; `apk` packages follow the pinned Alpine release). **A04 Cryptographic failures** — backups encrypted with age to a public key, private key offline; secrets only in Render (`sync: false`, `generateValue`). **A07 Authentication failures** — the production OAuth client stays in Testing mode with only the admins as test users and the exact redirect URI; admins are made only from the Render shell (`pnpm admin:role`). **A08 Software and data integrity** — deploys only after CI checks pass (`checksPass`); pinned images. **A09 Logging and alerting** — backup output and the new log lines carry no secrets or personal data; Render emails on a failed backup run; a pending checkout of another provider still reaches the owner's `payment_attention` alert. **A10 Mishandling of exceptional conditions** — fail closed: the env check refuses to start, the backup job stops on the first error (`set -euo pipefail`), the status route never confirms for an unconfigured provider. |
| V | Simplicity and low cost | ✅ | No new npm dependency; reuses the second E2E server instead of a third (D2); cost as 001's plan minus PayPlus: about ₪60/month. |
| VI | Tested critical paths | ✅ | Placing an offline order, payment-method availability, the callback refusing in `none` mode, and settings are covered by unit, integration and E2E tests (D1, D2). |
| VII | Privacy and legal by default | ✅ | Legal and privacy drafts updated to offline-only, so they no longer list a processor the shop does not use (D12); backups stay in the EU; legal review stays a launch blocker. |
| Workflow | Branch, CI, design doc | ✅ | No new Playwright project, so no new CI matrix entry (D2). `docs/design/storefront.md` gets the disabled-checkbox state (§7.10) and the payment-settings note (§12). CI before the Phase D gate is run by the owner (clarified 2026-11-14). Roadmap status updated at the end. |

No violations, so the Complexity Tracking table stays empty.

## Design

### No card payment mode (US2, D1, D2)

- `src/server/env.ts`: `PAYMENT_PROVIDER: z.enum(['payplus', 'fake', 'none'])`.
- `src/server/payments/availability.ts` (new): `effectivePaymentMethods(settings, provider)` →
  `{ online, offline, cardAvailable }`, pure and unit-tested over every combination.
- Callers switched to it: `src/app/[locale]/(shop)/p/[slug]/page.tsx`, `checkout/page.tsx`,
  `checkout/return/page.tsx`, `src/server/checkout/place-order.ts` (initial method check, retry,
  switch to offline), `src/app/admin/(protected)/settings/page.tsx`.
- `src/server/settings/settings.ts` `updateSettings`: with no card provider, rejects a submission
  that contains card on or offline off (new error key `admin.settings.errors.card_not_set_up`);
  the check looks at the submitted fields only, never the stored row, so other sections still save.
- `src/components/admin/SettingsManager.tsx`: `cardPaymentAvailable` prop; disabled checkboxes and
  the hint text (messages he/en).
- `src/server/payments/index.ts`: `getProvider` refuses `none`.
- `src/server/orders/payment-tasks.ts`: in the expiry task, a pending row whose provider is not the
  configured one counts as a failed status query inside the existing `try` (grace, owner alert,
  deletion as today); the sweep task skips such rows (contracts/payment-mode.md).
- `src/app/api/payments/status/route.ts` and switch-to-offline in `place-order.ts`: the same
  "configured provider only" rule (research D1).
- `src/server/settings/settings.ts` `settingsNeedingAttention`: adds `offlineInstructionsHe` when it
  is empty and offline payment is effectively on (FR-010b), with its admin-home label in he/en.
- Tests whose code now calls `getEnv()` get an env mock (e.g. `tests/integration/settings.test.ts`,
  which today mocks only the database and storage).
- `src/proxy.ts`: payment host in the CSP only for `payplus`.
- Tests: unit (env, availability, CSP), integration (place-order and settings under `none`;
  callback 404), E2E `no-card-payment.spec.ts` in the `consent` project, with the second server's
  environment getting `PAYMENT_PROVIDER: 'none'` in `playwright.config.ts`.
- A static test in `tests/unit/` makes sure `onlinePaymentEnabled` is not read outside the
  helper, the settings module, the validation schema, the schema file and the settings form.

### Deployment (US1, D3)

`render.yaml` at the root as D3, plus `tests/unit/render-blueprint.test.ts` (drift test against
env.ts). `.env.example` documents `none`.

### Backups (US3, D4)

`ops/backup/Dockerfile`, `ops/backup/backup.sh`, `ops/backup/README.md`. Verified locally per
quickstart §3.

### Quality checks (US4, D5–D10)

New: `tests/e2e/headers.spec.ts`, `a11y.spec.ts`, `storefront-layout.spec.ts`,
`design-review.spec.ts`, `no-card-payment.spec.ts`; extended: `bundle-size.spec.ts`
(absent-module assertions); `scripts/check-image-metadata.ts` with
`tests/unit/check-image-metadata.test.ts`. Fixes the new specs reveal (accessibility, layout,
bundle size) are part of this feature.

### Documents (US5, US6, D11, D12)

`docs/security/threat-model.md`, `docs/owner-guide-he.md`, `docs/launch-checklist.md`,
`scripts/zap-baseline.sh`, the legal-draft and privacy-document edits, and the design-doc update.

### Walk-through (US7, D13)

`specs/006-launch-readiness/checklists/validation.md`, filled by the coordinator.

## Project Structure

### Documentation (this feature)

```text
specs/006-launch-readiness/
├── plan.md              # This file
├── research.md          # D1–D13
├── data-model.md        # No schema change; the payment-mode rule and config entities
├── quickstart.md        # How to verify each story locally
├── contracts/
│   ├── payment-mode.md  # PAYMENT_PROVIDER=none: behaviour per surface
│   └── operations.md    # render.yaml env table, backup job, scripts' CLI contracts
├── checklists/
│   ├── requirements.md
│   └── validation.md    # Walk-through record (D13), written at the end
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
render.yaml                                  # new (D3)
ops/backup/{Dockerfile,backup.sh,README.md}  # new (D4)
scripts/check-image-metadata.ts              # new (D9)
scripts/zap-baseline.sh                      # new (D11)
src/server/env.ts                            # 'none' (D1)
src/server/payments/availability.ts          # new helper (D1)
src/server/payments/index.ts                 # refuse 'none'
src/server/checkout/place-order.ts           # use helper
src/server/settings/settings.ts              # enforce in 'none' mode
src/proxy.ts                                 # payment host only for payplus
src/app/[locale]/(shop)/p/[slug]/page.tsx    # use helper (+ zoom-dialog trim, D8)
src/app/[locale]/(shop)/checkout/page.tsx    # use helper
src/app/[locale]/(shop)/checkout/return/page.tsx
src/app/admin/(protected)/settings/page.tsx
src/components/admin/SettingsManager.tsx
src/i18n/messages/{he,en}.json               # note + error key
playwright.config.ts                         # consent project: + no-card spec, PAYMENT_PROVIDER=none
tests/unit/{payment-availability,render-blueprint,check-image-metadata,payment-flag-usage}.test.ts
tests/integration/no-card-payment.test.ts
tests/e2e/{headers,a11y,storefront-layout,design-review,no-card-payment}.spec.ts
tests/e2e/bundle-size.spec.ts                # extended
docs/security/threat-model.md                # new
docs/owner-guide-he.md                       # new
docs/launch-checklist.md                     # new
docs/legal-drafts/{privacy,terms}.{he,en}.md # offline only
docs/privacy/*.md                            # offline only, where PayPlus is named
docs/design/storefront.md                    # §7.10 disabled checkbox, §12 payment settings note
docs/roadmap.md                              # status and goal line
CLAUDE.md                                    # "Where things are": new docs (no root README exists)
.env.example
```

**Structure Decision**: the existing single Next.js project; operations files under `ops/` and
`scripts/` as 001 planned.

## Risks

- **New specs reveal many accessibility or layout failures.** Fixing them is in scope, but could
  be large. Mitigation: those specs come early in the task order, so fixes get their own batch.
- **The product page cannot drop below 145 KB with the zoom-dialog change alone.** Mitigation:
  the hard limit stays 150 KB; 145 KB is a target, not a test limit.
- **Updating the Terms and Privacy drafts bumps their versions in dev and E2E databases.** Tests
  that read those versions are found in the task and adjusted.
- **Render blueprint field names differ from what D3 assumes.** Mitigation: Render validates the
  file when the owner creates the Blueprint; the checklist says to fix and re-sync before the first
  deploy.

## Post-design Constitution Check

Re-checked after D1–D13: still no violations. Removing PayPlus at launch shrinks the attack
surface (no callback, no payment host) and the third-party list.

## Complexity Tracking

None.
