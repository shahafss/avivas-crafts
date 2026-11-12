# Research: Simpler Admin Access

All decisions below come from reading the current code (`src/server/auth/`, `scripts/admin-*.ts`,
`src/server/db/schema/admin.ts`, the auth routes and tests) against spec 004 and constitution
v2.0.0. There were no open technical unknowns.

## R1. Keep the `admin_user` table and add a `role` column

- **Decision**: keep the table `admin_user` (Drizzle `adminUser`) and add `role` (enum
  `user_role`: `admin`, `user`; NOT NULL, default `user`). The migration sets every existing row to
  `admin`.
- **Rationale**: the spec's "User" entity is exactly today's admin record plus a role. Every
  foreign key (`admin_session`, `admin_activity`), every query, the E2E fixtures and the
  privacy documents use the current name; renaming would touch dozens of files for no behaviour
  change (constitution V, simplicity).
- **Default `user`**: a row created by mistake grants nothing; the role command always sets the
  role explicitly.
- **Alternatives**: rename to `app_user` (churn, no gain); keep "presence in the table = admin" and
  no role (the owner asked for a role so access can be removed without deleting history).

## R2. Sign-in creates a full session in the Google callback

- **Decision**: `completeGoogleFlow()` keeps state/PKCE/nonce/ID-token checks, `email_verified`,
  the email lookup and the `google_sub` binding, then additionally requires `role = 'admin'`, and
  creates the session directly. The callback page redirects to `safeAdminNext(flow.nextPath)` or
  `/admin`.
- **Rationale**: the passkey step was the only thing between Google and a full session.
- **Rejections** (no user, role `user`, unverified email, `sub` mismatch) all go through today's
  `reject()`: one generic `not_allowed` message, `signin.google_rejected` logged without the email,
  and the throttled `google_rejected` alert email kept (it is about sign-in itself).
- **Alternatives**: a separate "role refused" message (would reveal that the account is known;
  spec FR-003 forbids it).

## R3. Session model without stages

- **Decision**: drop the session stage. `admin_session` keeps `token_hash`, `admin_id`,
  `created_at`, `last_seen_at`, `expires_at`, `user_agent_summary`. Columns that only served the
  pending/passkey/recovery/re-check flows are dropped: `stage`, `webauthn_challenge`,
  `recovery_verified_at`, `purpose`, `ended_at`, `abandon_processed_at`, `reauth_at`,
  `next_path`. Enum `session_stage` is dropped.
- **Limits**: 30 minutes idle, 12 hours absolute (`FULL_IDLE_MS`, `ABSOLUTE_MS`), unchanged.
  `PENDING_IDLE_MS` goes.
- **Role check**: `getSession()` already joins `admin_user`; it now also returns null when
  `role <> 'admin'`, deletes that session row and logs `signin.role_refused` (adminId set,
  no personal data). So `requireAdmin()` / `requireAdminApi()` refuse on the very next request
  (FR-002, FR-005).
- **Revocation**: deleting rows from `admin_session` signs someone out (already true).
- **Alternatives**: checking the role only at sign-in (fails FR-002's "next request").

## R4. Remove the passkey re-check

- **Decision**: remove `requireRecentAuth()`, `requireRecentAuthApi()`, `REAUTH_WINDOW_MS`,
  `markReauthenticated()`, the `/api/auth/reauth/*` routes, `ReauthGate.tsx` and the
  `admin.reauth_required` error. Customer export and anonymise use `requireAdmin()` and keep their
  confirmation dialog and activity logging.

## R5. What is deleted

- **Modules**: `src/server/auth/passkeys.ts`, `recovery.ts`, `setup-links.ts`; the passkey,
  lockout and abandoned-session parts of `throttle.ts` (`FAILURE_*`, `BLOCK_MS`, `isBlocked`,
  `recordFailure`, `clearFailures`, `abandonedPasskeySessionsTask`) — `googleStartAllowed()` stays.
- **Routes**: `/api/auth/passkey/**`, `/api/auth/recovery`, `/api/auth/reauth/**`,
  `/api/test/advance-sessions`; pages `/admin/sign-in/passkey`, `/admin/sign-in/recovery`,
  `/admin/setup`. They then return Next.js's normal 404 (FR-012).
- **Components**: `PasskeyButton`, `RecoveryFlow`, `SetupFlow`, `ReauthGate`.
- **Jobs**: the minute task `abandoned-passkey-sessions`; the daily session cleanup keeps deleting
  expired sessions (simplified: no stage condition).
- **Alerts**: security-alert kinds other than `google_rejected` are removed with their message
  keys (`blocked`, `passkey_*`, `recovery_*`, `admin_added`, `admin_removed`, `admin_reset`).
- **Google purposes**: `recovery` and `setup` go; `oauth_flow.purpose`, `oauth_flow.setup_token_hash`
  and enum `oauth_purpose` are dropped (only sign-in remains).
- **Data**: tables `admin_passkey`, `admin_recovery_code`; enums `passkey_status`,
  `passkey_registered_via`; `admin_user` columns `setup_token_hash`, `setup_token_expires_at`,
  `passkey_fail_count`, `passkey_blocked_until`.
- **Dependencies**: `@simplewebauthn/browser`, `@simplewebauthn/server`.
- **Env**: `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME` (env schema, `.env.example`, CI env, Playwright
  env).
- **Interface text**: `admin.auth.passkey`, `passkeyButton`, `reauth`, `recovery`, `setup`, the
  `blocked` sign-in error, `admin.reauth_required`, and the matching email keys, in both languages.
- **Tests**: `auth-passkey.test.ts`, `tests/fixtures/webauthn/**`, the virtual-authenticator E2E
  helper; the rest are rewritten to the new flow.

## R6. One role command replaces `admin:add` and `admin:reset`

- **Decision**: `pnpm admin:role <googleEmail> <admin|user> ["display name"]`
  (`scripts/admin-role.ts`). See contracts/admin-role-command.md.
- **Logging**: writes `admin.role_set` to the activity log (`actorKind: 'system'`,
  `actorLabel: 'admin:role'`, details `{ role }`), never the email.
- **Production**: run from a Render shell or one-off job with the service's `DATABASE_URL`
  (documented in quickstart; part of 006's launch checklist).
- **Alternatives**: an env list of emails (the owner chose a role column); SQL by hand only (the
  command validates and ends sessions, which raw SQL would forget).

## R7. Upgrade (migration) behaviour

- **Decision**: one Drizzle migration, generated from the schema, with a hand-added first
  statement `DELETE FROM admin_session;` (sessions must end; dropping `stage` would otherwise leave
  pending sessions looking full) and `UPDATE admin_user SET role = 'admin'` after the column is
  added. `oauth_flow` rows are deleted too (a half-finished sign-in is simply restarted).
- **Kept**: `admin_activity` rows, including old `passkey.*` / `recovery.*` / `signin.passkey_*`
  actions (history is not rewritten).

## R8. Local development and tests

- `scripts/dev.ts` creates the first local admin with `admin:role <mock email> admin "Local
  Admin"` instead of `admin:add` and prints no setup link.
- E2E `signInAsAdmin()` upserts the admin with role `admin` and `google_sub` bound, then clicks
  "Sign in with Google" against the mock issuer; no authenticator, no passkey rows.
- The `clearThrottles` fixture keeps clearing `rate_limit_bucket` and stops touching the dropped
  columns.

## R9. Constitution VI wording

Principle VI still lists "admin authentication (including two-factor)" as a critical path. After
this feature there is no second factor; the critical path is "admin authentication and access
control". This is a wording-only (PATCH) amendment for the owner to approve; the plan does not
depend on it.
