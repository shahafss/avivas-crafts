# Tasks: Simpler Admin Access

**Input**: Design documents from `/specs/004-simpler-admin-access/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: required (constitution VI: admin authentication and access control are critical
paths). New behaviour tests are written first and must fail on the old code.

**Organization**: this feature is mostly a removal. `tsconfig.json` type-checks `src`, `tests`
and `scripts` together, and dropping the schema breaks every file that uses the removed parts, so
Phase 2 ends in **one compiling, green state**: schema, migration, removal, and the minimum
change to every caller, test and E2E file. The story phases then add the remaining assertions.
Run commands with timeouts; never start watch mode or a dev server that does not exit. Run E2E
files one at a time.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

No setup tasks: no new dependencies, directories or tools.

---

## Phase 2: Foundational (schema, migration, removal, one green state)

**Purpose**: the new schema and sign-in with no passkey machinery, with everything compiling and
all unit/integration tests passing. Blocks all stories.

### Tests first (must fail before T005–T011)

- [X] T001 Write `tests/integration/migration-004.test.ts` (PGlite): copy migrations 0000–0002 and a trimmed `meta/_journal.json` into a temporary folder and migrate a fresh PGlite with it; insert with raw SQL two admins, passkeys, recovery codes, a setup token, a `full` and a `pending_passkey` session, `oauth_flow` rows, and `admin_activity` rows with `passkey.*`/`recovery.*` actions; then migrate with the full folder; assert tables `admin_passkey` and `admin_recovery_code` are gone, both admins remain with `role = 'admin'`, `admin_session` and `oauth_flow` are empty, activity rows are unchanged (FR-011, US4 #2, SC-004).
- [X] T002 [P] Rewrite `tests/integration/auth-google.test.ts` for contracts/auth.md: role `admin` → session created (no stage), `signin.success`, `redirectTo` = safe `next` else `/admin`; unknown email, role `user`, unverified email, `google_sub` mismatch → `not_allowed`, no session row, `signin.google_rejected` without the email, alert throttled to one per 15 min; start route rate limit → `rate_limited`; a `purpose` other than sign-in → 400 (FR-001, FR-003, FR-004, FR-006).
- [X] T003 [P] Rewrite `tests/integration/auth-session.test.ts`: idle 30 min and absolute 12 h end the session (row deleted); a deleted row ends it; role changed to `user` → `getSession()` null, row deleted, one `signin.role_refused` (FR-002, FR-005). Remove the stage, `rotateSession` and `markReauthenticated` cases.
- [X] T004 [P] Rewrite the sign-out part of `tests/integration/auth-routes.test.ts`: single sign-out deletes this session, logs `session.signed_out`, clears the cookie; `all` deletes every session of the admin and logs `session.revoked`; cross-origin refused; a callback whose `oauth_flow` row is gone gets `?e=error`. Remove passkey/recovery/reauth route cases.

### Schema and migration

- [X] T005 Edit `src/server/db/schema/admin.ts` per data-model.md: add `userRoleEnum = pgEnum('user_role', ['admin','user'])` and `admin_user.role` "NOT NULL, default `user`"; drop `admin_user.setup_token_hash`, `setup_token_expires_at`, `passkey_fail_count`, `passkey_blocked_until`; drop tables `adminPasskey`, `adminRecoveryCode`; drop `admin_session.stage`, `webauthn_challenge`, `recovery_verified_at`, `purpose`, `ended_at`, `abandon_processed_at`, `reauth_at`, `next_path`; drop `oauth_flow.purpose`, `setup_token_hash`; drop enums `passkey_status`, `passkey_registered_via`, `session_stage`, `oauth_purpose`. Update the schema index exports.
- [X] T006 Generate the migration with `pnpm db:generate` into `src/server/db/migrations/0003_*.sql` (+ meta). drizzle-kit may ask "created or renamed?" and an agent cannot answer: if so, generate in two passes (first the drops, then add `role` and `user_role`) and merge them into one `0003` file with the final snapshot and one journal entry. Hand-edit so it starts with `DELETE FROM admin_session;` and `DELETE FROM oauth_flow;` and runs `UPDATE admin_user SET role = 'admin';` right after adding the column (research R7). T001 passes.

### Removal and simplification

- [X] T007 Delete: `src/server/auth/passkeys.ts`, `recovery.ts`, `setup-links.ts`; routes `src/app/api/auth/passkey/**`, `src/app/api/auth/recovery/`, `src/app/api/auth/reauth/**`, `src/app/api/test/advance-sessions/`; pages `src/app/admin/sign-in/passkey/`, `src/app/admin/sign-in/recovery/`, `src/app/admin/setup/`; components `src/components/admin/PasskeyButton.tsx`, `RecoveryFlow.tsx`, `SetupFlow.tsx`, `ReauthGate.tsx`; the WebAuthn request schemas in `src/server/auth/api.ts`. Remove links to them (e.g. `AuthCard.tsx`, proxy/admin-bounce path lists).
- [X] T008 Reduce `src/server/auth/throttle.ts` to `googleStartAllowed()`; in `src/server/jobs/daily-maintenance.ts` remove the minute task and make the session cleanup delete expired sessions only (`expires_at` past or idle > 30 min), with no stage condition.
- [X] T009 Simplify `src/server/auth/session.ts` per contracts/auth.md: no stages; `createSession(adminId, { now, userAgent, tx })`; `getSession()` returns null and deletes the row when idle > 30 min, past `expires_at`, or the user's role is not `admin` (then logs `signin.role_refused`, adminId set, details `{}`); delete `PENDING_IDLE_MS`, `endPendingSession`, `rotateSession`, `markReauthenticated`, and `listSessions` if unused. Simplify `src/server/auth/require-admin.ts` to `requireAdmin()` and `requireAdminApi()`. T003 passes.
- [X] T010 Simplify `src/server/auth/google.ts`: sign-in purpose only (drop `GooglePurpose`, `REDIRECT_PATHS`, setup lookup); `completeGoogleFlow()` keeps state/PKCE/nonce/ID-token, `email_verified`, email lookup and `google_sub` binding, rejects unless `role === 'admin'` through the existing `reject()`, creates the session directly (logging `signin.success`) and returns `redirectTo = safeAdminNext(flow.nextPath) ?? '/admin'`. Update `src/app/api/auth/google/start/route.ts` (no purpose field; any other value → 400) and `callback/route.ts`. Update `src/app/api/auth/sign-out/route.ts` (no pending branch; log `session.signed_out` for a single sign-out) and `src/app/admin/sign-in/page.tsx` (error codes `not_allowed`, `expired`, `error`, `rate_limited`). T002 and T004 pass.
- [X] T011 Remove security-alert kinds other than `google_rejected` from `src/server/email/templates/security-alert.ts` and every caller; make `notifyAdmins()` in `src/server/security/notify.ts` send only to users with `role = 'admin'` (add a case to `tests/integration/notify.test.ts`, which also drops the `admin_added` kind).
- [X] T012 Customer tools (FR-009): `src/app/admin/(protected)/customers/actions.ts` uses `requireAdmin()` for export and anonymise; remove `useReauthGate` and the `admin.reauth_required` handling from `src/components/admin/CustomerSearch.tsx`; update `tests/integration/privacy-customers.test.ts` so both succeed for any signed-in admin with no re-check and still log as today.
- [X] T013 Remove `@simplewebauthn/browser` and `@simplewebauthn/server` from `package.json` (`pnpm install` updates the lockfile). Remove `WEBAUTHN_RP_ID`/`WEBAUTHN_RP_NAME` from `src/server/env.ts`, `.env.example`, `tests/e2e/env.ts`, `tests/unit/env.test.ts` and `scripts/measure-app-memory.ts`; in `scripts/measure-app-memory.ts` insert its admin with `role = 'admin'` and no `stage`.
- [X] T014 Remove the unused message keys from `src/i18n/messages/he.json` and `en.json`: `admin.auth.passkey`, `admin.auth.passkeyButton`, `admin.auth.reauth`, `admin.auth.recovery`, `admin.auth.setup`, `admin.auth.signIn.errors.blocked`, `admin.reauth_required`, and `emails.securityAlert.kinds.*` except `google_rejected`; reword remaining sign-in text that mentions a passkey (e.g. `admin.auth.signIn.intro`).

### Callers, tests and E2E brought to the new shape

- [X] T015 Make every remaining test compile and pass. Every test or fixture that inserts an `admin_user` meant to sign in or receive alerts sets `role: 'admin'` (e.g. `admin-images-route.test.ts`, `notify.test.ts`, `jobs.test.ts`, `tests/e2e/admin-access.spec.ts`). delete `tests/integration/auth-passkey.test.ts` and `tests/fixtures/webauthn/**`; update `tests/helpers/admin-files.ts` (the `wanted` API list ends up as only `api/admin`), `tests/integration/admin-actions-guard.test.ts` (drop stage/`reauthAt`/`requireRecentAuth` cases), `jobs.test.ts`, `payment-confirmation.test.ts`, `admin-images-route.test.ts`, `schema.test.ts`, `seed.test.ts`, `tests/unit/headers.test.ts`, `next-path.test.ts`, and seed/fixture code that inserted passkeys or stages (`src/server/db/seed.ts`, `scripts/seed.ts` if relevant).
- [X] T016 Bring E2E code to the new shape (must type-check): `tests/e2e/fixtures.ts` `signInAsAdmin()` upserts `admin-<key>@example.test` with `role = 'admin'` and `google_sub` bound and signs in through the page and mock Google (delete `addVirtualAuthenticator`, admin keys, passkey inserts; `clearThrottles` clears `rate_limit_bucket` only); remove uses of `stage`, `purpose`, `ended_at`, `reauth_at`, `advance-sessions` and passkey steps from `admin-access.spec.ts`, `admin-auth.spec.ts`, `admin-privacy.spec.ts` (delete cases that only tested removed behaviour).
- [X] T017 Write `tests/integration/admin-role.test.ts` (must fail before T018) against `setAdminRole()` covering every row of contracts/admin-role-command.md (invalid email/role/name → error and no change; new email + `admin` → inserted with the name or the email's local part cut to 60; new email + `user` → "no such user"; existing → role and optional name set; `user` → that user's sessions deleted in the same transaction; one `admin.role_set` row per change with details `{ role }`, never the email).
- [X] T018 Implement `src/server/auth/admin-role.ts` (`setAdminRole(db, { email, role, name? })` per contracts/admin-role-command.md, pattern of `src/server/settings/zone-add.ts`) and the thin `scripts/admin-role.ts` + `admin:role` in `package.json`; delete `scripts/admin-add.ts`, `scripts/admin-reset.ts` and their entries; add `role` to `ACTIVITY_DETAIL_KEYS` in `src/server/activity/log.ts`; make `scripts/dev.ts` create the first local admin with role `admin` through it and print no setup link (FR-010, FR-013).

**Checkpoint**: `pnpm verify` (with `test:pg`) passes; no file imports `@simplewebauthn/*`.

---

## Phase 3: User Story 1 - Sign in with Google only (Priority: P1) 🎯 MVP

**Goal**: one Google step to the admin home for role `admin`; everyone else refused generically.

**Independent Test**: role `admin` → admin home in one step; unknown, role `user` or unverified → generic refusal, no session.

- [X] T019 [US1] Complete `tests/e2e/admin-auth.spec.ts`: Google-only sign-in lands on the admin home; `next` to `/admin/orders`; role `user` and an unknown account see the generic refusal; sign-out; axe scan of the sign-in page. Run it on its usual projects.

**Checkpoint**: admin-auth E2E passes.

---

## Phase 4: User Story 2 - Owner controls who is an admin (Priority: P1)

**Goal**: `pnpm admin:role` works; a role change takes effect on the next request.

**Independent Test**: role `user` while signed in → next admin request goes to sign-in; role `admin` → sign-in works.

- [X] T020 [P] [US2] Extend `tests/integration/admin-actions-guard.test.ts`: every admin Server Action and admin API route refuses a session whose user has role `user` (FR-002, SC-002).
- [X] T021 [US2] Add to `tests/e2e/admin-access.spec.ts`: signed-in admin, role set to `user` in the database → next admin navigation lands on sign-in; deleting the admin's sessions does the same (US2 #2, #3).

**Checkpoint**: US2 tests pass.

---

## Phase 5: User Story 3 - Customer data tools without a second check (Priority: P2)

**Goal**: export and anonymise need only the existing confirmation (code done in T012).

**Independent Test**: export and anonymise complete after the confirmation dialog with no passkey prompt.

- [X] T022 [US3] Update `tests/e2e/admin-privacy.spec.ts`: export and anonymise succeed after the confirmation dialog with no re-check step. Run it.

---

## Phase 6: User Story 4 - Old passkey machinery is gone (Priority: P2)

**Goal**: removed addresses answer 404; documentation and storage descriptions match.

**Independent Test**: old addresses 404; no passkey/recovery/setup-link instructions in interface text or docs.

- [X] T023 [P] [US4] Add to `tests/integration/auth-routes.test.ts` (or `tests/e2e/admin-auth.spec.ts`) a check that `/admin/setup`, `/admin/sign-in/passkey`, `/admin/sign-in/recovery`, `/api/auth/recovery`, `/api/auth/passkey/options` and `/api/auth/reauth/options` return 404 (FR-012).
- [X] T024 [P] [US4] Update the `__Host-ac_admin` / `__Host-ac_oauth` entries in `src/lib/consent/registry.ts` and their storage-table text in both message files: Google sign-in only (FR-014).
- [X] T025 [P] [US4] Update `docs/privacy/{access-authorizations,security-procedure,incident-response,database-definition,annual-review-checklist}.{he,en}.md`: Google sign-in with Google 2-step verification, role `admin`/`user` set with `pnpm admin:role`, sign everyone out by deleting `admin_session` rows, removed tables and columns; no passkeys, recovery codes or setup links (FR-014).
- [X] T026 [US4] Edit `docs/design/storefront.md` **by hand, never through prettier**: sign-in screens show only the Google card and its errors (`not_allowed`, `expired`, `error`, `rate_limited`); remove passkey, recovery and setup screen sections; §12.7 export/anonymise without the re-check (around line 1224); the customers row of the states table (around line 940) without "passkey re-check" (FR-014).
- [X] T027 [US4] Update `PRODUCT.md` › "Admin sign-in" (Google account with role `admin`; no passkey) and the admin sign-in comment in `.env.example`; check `CLAUDE.md` for passkey mentions.

---

## Phase 7: Polish & Cross-Cutting

- [X] T028 Search the repository (excluding `specs/001-*`, `specs/003-*`, migrations 0000–0002 and their snapshots) for `passkey`, `webauthn`, `recovery code`, `setup link`, `reauth`, `pending_passkey`, `מפתח גישה`, `קוד שחזור` and remove or justify every hit (SC-005).
- [X] T029 Run `pnpm verify` (with `test:pg`), then `tests/e2e/admin-auth.spec.ts`, `admin-access.spec.ts`, `admin-privacy.spec.ts`, `bundle-size.spec.ts` one file at a time on their usual projects; record the results.
- [X] T030 Walk through quickstart.md › "By hand (local)" steps 1–7 against `pnpm dev`; note anything that needs a human.
- [X] T031 Set 004's status in `docs/roadmap.md` to "Done (dev)" (only after the owner approves at the Phase D gate).

---

## Dependencies & Execution Order

- Phase 2 blocks everything; inside it, T001–T004 (failing tests) come before the code they test.
- US1–US4 depend only on Phase 2 and are independent of each other; T021 uses T016's fixture.
- Polish last.

Suggested batches for the implementer: (1) T001–T018; (2) T019–T022; (3) T023–T030.

## Parallel Opportunities

- T002, T003, T004 (different test files).
- T020 runs alongside the Phase 6 file edits.
- T023, T024, T025 (different files); T026 must be done by hand.

## Implementation Strategy

MVP = Phase 2 + US1: Google-only sign-in working with the new schema. Then US2 (role command),
US3 (customer tools E2E), US4 (docs), polish. Each phase ends with its checkpoint green.
