# Research: Hosting and Launch Readiness (006)

Decisions for the plan. Spec 001's research (R1–R19, frozen) stays the background; each decision
here says which 001 item it reuses or changes. "001 Txxx" means the moved task in
`specs/001-online-crafts-shop/tasks.md` Phase 9.

## D1. "No card payment" mode

**Decision**: `PAYMENT_PROVIDER` gains a third value, `none`. Rules:

- `src/server/env.ts`: enum `payplus | fake | none`. Production still refuses `fake`. The PayPlus
  variables stay required only with `payplus`. `none` needs nothing.
- One pure helper, `effectivePaymentMethods(settings, provider)` in
  `src/server/payments/availability.ts`, returns `{ online, offline, cardAvailable }`. Card payment counts only when there is a provider and the setting is on:
  `online = settings.onlinePaymentEnabled && PAYMENT_PROVIDER !== 'none'`. Offline payment is
  always on when card payment is unavailable:
  `offline = settings.offlinePaymentEnabled || !cardAvailable`. The database's existing check
  (`online OR offline`) plus this rule means the shop can always take orders.
- Every place that reads the two switches today uses the helper instead: the product page buy-box
  facts, checkout page, payment-return page, `place-order.ts` (three checks) and the admin
  settings page. A static test fails if `onlinePaymentEnabled` is read for display or decisions
  outside the helper, the settings module and the settings form.
- `getProvider()` already throws `Unknown payment provider` for `none` (it only knows `fake` and
  `payplus`); a test pins it, and no code calls it under `none` except the case below. The
  payment-callback route already answers 404 for any provider other than the configured one
  (`providerId !== env.PAYMENT_PROVIDER`), so under `none` every callback is 404; a test pins this.
- Payment tasks (`src/server/orders/payment-tasks.ts`): a stored pending checkout whose provider is
  not the configured one must still be handled, because it holds the customer's details and the
  Privacy Policy promises deletion within 48–72 hours. In the **expiry** task the "is this the
  configured provider?" check moves inside the existing `try`, so a mismatch counts as a failed
  status query: the row stays for the existing 24 h grace, then the owner gets the existing
  `payment_attention` alert and the row is deleted (lines 53–106 today). Because `provider` is also
  used after the `catch` (`disablePaymentPage`, lines 97–101), it becomes
  `let provider: PaymentProvider | null = null`, set inside the `try` only for the configured
  provider, and `disablePaymentPage` is skipped when it is `null`. In the **sweep** task
  (unexpired rows) a mismatching row is skipped. No new provider is created in either case.
- The same "configured provider only" rule applies to the two other places that call
  `getProvider(pending.provider)` for a stored row: `GET /api/payments/status` (the return page's
  poll) answers as "still pending" and never confirms when the row's provider is not the configured
  one (FR-008), and switch-to-offline in `place-order.ts` skips `disablePageBestEffort` for such a
  row (no provider call; there is no page to disable).
- `src/proxy.ts` passes `paymentHost` to the CSP only when `PAYMENT_PROVIDER === 'payplus'`.
- Admin settings: the page passes `cardPaymentAvailable`. When false, the card checkbox renders
  checked=false and disabled, with the hint "Card payment is not set up yet" / "תשלום בכרטיס עוד
  לא הוגדר", and the offline checkbox is checked and disabled (it is the only method left). The
  server action rejects `onlinePaymentEnabled: true` or `offlinePaymentEnabled: false` in this mode
  with a form error, so the rule holds even without the UI.
- The seed does not change: the effective rule makes any stored value safe.
- `.env.example` documents `none`; local development keeps `fake`.

**Rationale**: the smallest change that makes the launch setup safe. One helper avoids a card
option leaking through any one of the five places, and the server action enforces it too.

**Alternatives**: a database switch only (owner turns card payment off). Rejected: `fake` would
still be the configured provider in production, which env.ts forbids, and a mis-click could show
a card option that leads nowhere. A "manual" provider adapter. Rejected: no provider means no
adapter; `none` is clearer.

## D2. Testing the "no card payment" mode end to end

**Decision**: the second E2E server (port `CONSENT_PORT`, today used only by `consent.spec.ts`)
also runs with `PAYMENT_PROVIDER=none`. A new spec, `tests/e2e/no-card-payment.spec.ts`, joins the
`consent` Playwright project (its `testMatch` widens to both specs). Its checks: checkout shows only
the offline method and an order completes; the product page shows only offline payment facts; the
admin settings checkboxes are disabled with the note; `POST /api/payments/payplus/callback` and
`/api/payments/fake/callback` answer 404 and change nothing.

`consent.spec.ts` only opens the checkout form, which works the same with `none`. The `consent`
project already runs in the `chromium-desktop` CI job, so **no new CI matrix entry** is needed.

**Rationale**: a third web server would cost memory on the 16 GB development machine and time in
CI. The consent server already exists to vary the environment.

**Alternatives**: integration tests only. Rejected: FR-009 asks for E2E coverage of checkout and
settings in this mode.

## D3. Render blueprint (`render.yaml`)

**Decision** (001 T128, changed): one blueprint at the repository root. Names: web service
`avivas-crafts` (so the Render hostname is `avivas-crafts.onrender.com`), cron job
`avivas-crafts-backup`, database `avivas-crafts-db` (also the `fromDatabase.name`).

- `services[0]`: `type: web`, `runtime: node`, `region: frankfurt`, `plan: starter`,
  `branch: main`, `autoDeployTrigger: checksPass`, `healthCheckPath: /api/health`.
  Build: `corepack enable pnpm && pnpm install --frozen-lockfile --prod=false && pnpm build`
  (`--prod=false` because migrate, seed and `admin:role` need `tsx`). Pre-deploy:
  `pnpm db:migrate && pnpm db:seed` (both safe to repeat). Start: `pnpm start`. Node 24 comes from
  `.nvmrc` (`24`), which Render reads before `engines.node`.
- `services[1]`: `type: cron`, `runtime: docker`, `region: frankfurt`, `plan: starter`,
  `dockerfilePath: ./ops/backup/Dockerfile`, `dockerContext: ./ops/backup`,
  `schedule: "30 0 * * *"` (00:30 UTC = 02:30 Israel in winter, 03:30 in summer; cron on Render
  is UTC-only), `branch: main`, `autoDeployTrigger: checksPass`.
- `databases[0]`: `region: frankfurt`, `plan: basic-256mb`, `postgresMajorVersion: "17"`,
  `ipAllowList: []` (private network only).
- Environment: fixed, non-secret values are written out (`APP_ENV=production`,
  `STORAGE_DRIVER=r2`, `EMAIL_DRIVER=resend`, `PAYMENT_PROVIDER=none`, `R2_JURISDICTION=eu`,
  `TRUSTED_PROXY_HOPS=1`, `OIDC_ISSUER=https://accounts.google.com`). `DATABASE_URL` comes from
  the database (`fromDatabase … connectionString`). `SECRET_HMAC_KEY` uses
  `generateValue: true` (Render generates a base64 256-bit value, which env.ts accepts). Every
  other key — domain-dependent (`APP_ORIGIN`, `IMAGE_PUBLIC_ORIGIN`, `EMAIL_FROM`) or secret
  (R2 keys and bucket names, `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `BACKUP_*`) — is `sync: false` with no value.
- **Build-time values**: `next.config.ts` reads `APP_ORIGIN` and `APP_ENV` at build time (it
  refuses a non-https origin under production, and fixes HSTS and the Server Actions allowed origin
  into the build). So `APP_ORIGIN` must be filled in on Render **before** the first Blueprint build,
  and any later change needs Render's "Save, rebuild, and deploy", not a restart. The checklist says
  so in its Render step and its `<shop domain>` table.
- **Database SSL** (accepted risk, clarified 2026-11-14): the app, migrate and seed force
  `ssl: 'require'` in production. Not changed here; the checklist's first-deploy step says that a
  migration failing on SSL is fixed by a follow-up change.
- `src/app/api/health/route.ts` already exists and matches 001's contract (200 `{ok:true}` when
  `SELECT 1` works, 503 otherwise, `no-store`). No change.
- **Drift test**: a unit test reads `render.yaml` as text (no YAML library; text and regex checks
  are enough for a file this size). It checks region, `checksPass`, the health path, names and
  commands, and that each `sync: false` key has no `value`. It then builds an environment record
  from the web service block (its fixed values, plus dummy values of the right shape for the
  `sync: false`, `fromDatabase` and `generateValue` keys) and asserts that `parseEnv()` from
  `src/server/env.ts` accepts it. So a new required variable in env.ts that the blueprint lacks
  fails the test.

**Rationale**: 001 R2 and the 2026-11-09 decision (production only, deploy after checks pass).
Writing the fixed values out keeps a mis-set environment from being possible; secrets stay in
Render.

**Alternatives**: adding the `yaml` package to parse the blueprint in the test. Rejected:
constitution V (a dependency for one test). Validation against Render's own schema happens when
the owner creates the Blueprint (Render rejects an invalid file) and optionally with
`render blueprints validate`.

## D4. Backup job (`ops/backup/`)

**Decision** (001 R13 and T127, kept, with details fixed):

- `Dockerfile`: `alpine` pinned to an exact version tag, installing `postgresql17-client`, `age`,
  `rclone`, `bash`; copies `backup.sh`; non-root user.
- `backup.sh`: `set -euo pipefail`; works in a `mktemp -d` folder removed by a `trap`.
  1. `pg_dump --format=custom --no-owner "$DATABASE_URL" > db.dump` (a single consistent snapshot;
     it takes no locks that block the shop's reads or writes).
  2. `age -r "$BACKUP_AGE_RECIPIENT" -o db.dump.age db.dump`, then remove the plain dump.
  3. `rclone copyto db.dump.age backup:<bucket>/db/daily/YYYY-MM-DD.dump.age`. An object upload is
     atomic, so a failed run never leaves a partial object under the final name.
  4. On the 1st of the month (UTC date of the run): `rclone copyto` (server-side) to
     `db/monthly/YYYY-MM.dump.age`.
  5. `rclone copy images:<private bucket> backup:<bucket>/images/` and
     `rclone copy images:<public bucket> backup:<bucket>/images-public/` (never `sync`, so nothing
     is deleted; clarified 2026-11-14: the public bucket too, so a restore is a plain copy back).
  6. Prints one line per step with no secret and no URL; exits non-zero on any failure.
- rclone is configured only through environment variables (`RCLONE_CONFIG_BACKUP_TYPE=s3`,
  `…_PROVIDER=Cloudflare`, the EU endpoint `https://<account>.eu.r2.cloudflarestorage.com`, keys),
  so there is no config file with secrets. Two remotes: `backup` (write to the backup bucket) and
  `images` (read both image buckets), each with its own scoped R2 token.
- `README.md`: making the age key pair offline (only the public key goes to Render); the three
  buckets and the token scopes; lifecycle rules (`db/daily/` 30 days, `db/monthly/` 365 days);
  restore: download, `age -d`, `pg_restore --no-owner --dbname` into a scratch database, then
  verification queries (row counts of products, orders, content pages; the newest order's date),
  compared with what the admin area shows (the products list count and the newest order on the
  orders list), since production's database has no public address; restoring photos is a copy back
  of `images/` and `images-public/` into their buckets.
- Failure alerts: Render emails the workspace when a cron run fails (checked in the launch
  checklist).
- **Local verification** (quickstart): build the image and run it against the local Postgres with
  both rclone remotes set to `type=local` folders, then restore the result into a scratch
  database. No R2 needed. Not part of CI (CI has no Docker build step for it, and the job is small
  and stable).

**Rationale**: as 001. Photos are not encrypted: they are product photos, already public or
shown to the customer who ordered them.

## D5. Security-headers test (001 T123, adjusted)

**Decision**: `tests/e2e/headers.spec.ts`, `chromium-desktop` only. Pages: `/he`, a product page,
`/he/checkout` (with a cart line), `/admin/sign-in`, `/api/health`. Checks as 001 T123, with:
`/admin/setup` gone (004); `form-action` exactly `'self'` on the storefront (the E2E server uses the
same-origin fake provider and no payment host), and `'self' http://localhost:4012` (the E2E OIDC
issuer, `OIDC_PORT`) on `/admin/sign-in`; HSTS and `upgrade-insecure-requests` absent over http
(their https values stay covered by the existing headers unit test; the live check is in the launch
checklist). A unit test is added or extended so that `buildCsp` with no payment host and
`PAYMENT_PROVIDER=none` lists no payment host.

## D6. Accessibility test (001 T124, narrowed)

**Decision**: `tests/e2e/a11y.spec.ts`, `chromium-desktop` only, with
`@axe-core/playwright` tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, zero violations.
Storefront pages in both locales at 375 and 1280 px (viewport set per test): category, search,
cart, checkout, order confirmation (offline order), every content page, contact, 404. Home and
product are **not** repeated: `language.spec.ts` (005) already checks them in both locales on
`chromium-desktop` and `chromium-mobile` (Pixel 7), and the admin product list too. Admin: sign-in, product editor, orders list, order
detail, settings, content editor, customers (the product list is already in `language.spec.ts`).
Keyboard: add to cart and complete checkout with the keyboard only; zoom dialog opens with
Enter, arrow keys move, Esc closes and focus returns to the opener.

## D7. Storefront-layout test (001 T125)

**Decision**: `tests/e2e/storefront-layout.spec.ts`, `chromium-desktop` only (viewport set per
test), exactly as 001 T125 but citing `docs/design/storefront.md` §11 (the live design doc).

## D8. Performance pass (001 T131, narrowed)

**Decision**:

- The routes and limits already exist in `bundle-size.spec.ts` (005). Added: an assertion that
  the storefront's loaded scripts contain neither the consent banner (its `data-testid`
  `consent-banner` string) nor libphonenumber's metadata marker. The marker strings are chosen
  in the task from the built chunks.
- The product page (149.3 KB of 150) is trimmed with headroom: target ≤ 145 KB, not a test limit.
  The candidate is loading the photo zoom dialog's code (inside `src/components/shop/Gallery.tsx`)
  only on first open. **Stop rule**: if the split saves under about 1 KB, or breaks the keyboard,
  focus-return or zoom tests, revert it and report the sizes; the coordinator decides on further
  cuts. No new dependency, no budget change.
- Images: every `srcset` has `sizes` (asserted by the layout test). Keep today's rule
  (`ProductCard.tsx`: the first 4 cards eager, `fetchpriority="high"` on the first only; storefront
  §10 "first cards"); the product page's first photo is eager with `fetchpriority="high"`, the
  other photos lazy.
- `scripts/measure-app-memory.ts` re-run against the final build if Docker is available (it builds
  in a container), with a timeout; otherwise reported as not run. Result recorded in
  `checklists/validation.md`. The Lighthouse mobile run happens on the live site (checklist).

## D9. Image-metadata check (001 T132)

**Decision**: `scripts/check-image-metadata.ts` (the `check:image-metadata` package script already
exists and points to it). Input: a URL (fetched, max 25 MB) or a file path. **`exifr` cannot read
WebP** (it throws "Unknown file format"; the shop's photos are WebP), so the check reads every
format with `sharp(input).metadata()`: it fails when an `exif` or `xmp` buffer is present. When
EXIF is present, `exifr` decodes that buffer only to name the fields found (GPS, Make, Model,
other). Exit 0 and "clean" when neither is present; exit 1 with the field names (never values);
exit 2 on a read error or a non-image. Unit test: images made in the test with `sharp` (a clean
WebP from the shop's own pipeline → 0; a WebP written with `withExif` Make/Model/GPS → 1; a JPEG
with the same EXIF → 1; a missing file → 2). No binary fixtures are committed.

## D10. Design-review screenshots (001 T133)

**Decision**: `tests/e2e/design-review.spec.ts`, skipped unless `DESIGN_REVIEW=1`,
`chromium-desktop` only. Seeds through SQL in the spec: one product with options and swatches, one
not orderable, one without English text. Captures every screen and state of
`docs/design/storefront.md` §8–§9 and the admin screens of §12, in he and en, at 375, 768 and
1280 px, into `test-results/design-review/<locale>-<width>-<screen>.png` (`test-results` is
git-ignored). The coordinator reviews them against the design doc and files fixes before the
walk-through.

## D11. ZAP baseline script (001 T130)

**Decision**: `scripts/zap-baseline.sh <url>` runs the OWASP ZAP baseline Docker image (pinned
tag) with a 15-minute timeout, writes a JSON report into `test-results/zap/`, and exits 1 if the
report has any alert with risk High (ZAP has no "Critical" level). Medium and lower are printed
for the owner to judge. The container gets a fixed `--name`; on timeout the script runs
`docker stop` on it (killing only the client would leave it running). It runs against the live
site from the owner's computer (Docker needed); the checklist says how. The ZAP and Alpine tags are
pinned by hand; the checklist's yearly step says to bump them (Renovate does not see the tag in a
shell script).

## D12. Documents

- **Threat model** (001 T126): `docs/security/threat-model.md`, rewritten for 004 (no passkeys,
  recovery or setup links) and for offline-only payment (the callback is closed; the card-payment
  rows are kept as "when card payment is added"). Flows: checkout, admin sign-in, uploads, content
  editing, customer data tools, backups, payment callback. Mitigations mapped to the OWASP Top 10
  (constitution IV's bar; ASVS is guidance only since constitution 2.0). Residual risks as in spec
  FR-022, plus: ending an admin's sessions is done by the owner with `pnpm admin:role <gmail> user`
  (deletes the user's sessions) and then `admin` again.
- **Owner guide** (001 T129): `docs/owner-guide-he.md`, Hebrew, second person to Aviva, Android,
  screenshot placeholders `[צילום מסך: …]`, sections as FR-023, stopwatch scripts as FR-024.
- **Launch checklist** (001 T130): `docs/launch-checklist.md`, in English (the owner's working
  language for setup; Aviva's guide is the Hebrew one). Order: domain → 2FA on accounts → GitHub →
  Cloudflare (DNS-only, R2 buckets and tokens, image domain and `nosniff` rule) → Resend (domain,
  SPF/DKIM/DMARC) → Google OAuth client → backup key pair → Render Blueprint and secrets → first
  deploy → admins (`pnpm admin:role` in the Render shell) → shop settings and business details →
  post-deploy checks → legal review → test-data cleanup → announce. Plus a `<shop domain>` fill-in
  table (every file and setting) and a "Later" section (card payment provider: choice, then the
  PayPlus sandbox checks and keys from 001 T130, the legal and privacy documents to update, the
  PayPlus CSP host, and the cost check; HSTS preload; Cloudflare proxying needs R19 and the
  Privacy Policy first).
- **Legal and privacy drafts** (clarification 2026-11-14): `docs/legal-drafts/privacy.{he,en}.md`,
  `terms.{he,en}.md` and `docs/privacy/{database-definition,annual-review-checklist}.{he,en}.md`
  and `security-procedure.he.md` (plus `.en` if it matches) lose the PayPlus name and card-payment
  promises. Kept for the lawyer (clarified 2026-11-14): the unfinished-payments retention text
  (`privacy.{he,en}.md` and `database-definition`) and the cookies page's payment-page wording. Because
  the seed loads the drafts (`loadDrafts`, 003 R7), an edited Terms or Privacy draft becomes a new
  page version on the next seed wherever the owner has not edited the page. That is intended. The
  E2E and integration tests that read those pages' versions are checked in the task.

## D13. Walk-through and validation record (001 T134)

**Decision**: `specs/006-launch-readiness/checklists/validation.md` lists the scenarios of
`specs/002…005/quickstart.md` and of `specs/001…/quickstart.md` minus what 004 removed, each
with pass/fail and date, plus the bundle sizes, the memory measurement, the design-review result
and empty rows for the owner's stopwatch runs. The coordinator (Claude) walks the scenarios in
the built-in browser against `pnpm dev` (mock Google sign-in), after `pnpm verify` passes and the
owner has pushed the branch and run CI with green E2E (clarified 2026-11-14). The design-review
screenshots are compared with `docs/design/storefront.md` and the approved sample
`docs/design/sample-product-page.src.html`. Single spec files may be run locally; the full E2E run is left to CI (project CLAUDE.md).
