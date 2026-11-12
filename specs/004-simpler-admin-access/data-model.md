# Data Model: Simpler Admin Access

Changes only; the whole model's source of truth is `src/server/db/schema/`. One migration
(`0003_…`) makes all of them.

## admin_user (kept, one column added, four dropped)

| Column | Change | Notes |
|---|---|---|
| `role` | **added** `user_role` enum (`admin`, `user`), NOT NULL, default `user` | migration sets existing rows to `admin` |
| `setup_token_hash`, `setup_token_expires_at` | **dropped** | setup links removed |
| `passkey_fail_count`, `passkey_blocked_until` | **dropped** | passkey lockout removed |
| `id`, `display_name`, `google_email`, `google_sub`, `created_at`, `updated_at` | unchanged | checks unchanged |

Rules: only `role = 'admin'` may sign in or hold a working session. `google_sub` is bound on the
first successful sign-in, as today.

## admin_session (kept, simplified)

Kept: `token_hash` (PK), `admin_id` (FK cascade), `created_at`, `last_seen_at`, `expires_at`,
`user_agent_summary`.

Dropped: `stage`, `webauthn_challenge`, `recovery_verified_at`, `purpose`, `ended_at`,
`abandon_processed_at`, `reauth_at`, `next_path`.

Lifecycle: created by the Google callback for an admin → touched on each request → deleted on
sign-out, after 30 min idle or 12 h in all (on the next read, and by the daily cleanup), when the
role command sets a role other than `admin`, when `getSession()` finds the user's role is not
`admin`, or by the owner deleting rows. The migration deletes every existing row.

## oauth_flow (kept, simplified)

Dropped: `purpose`, `setup_token_hash`. The migration deletes every existing row.

## Dropped entirely

- Tables `admin_passkey`, `admin_recovery_code`.
- Enums `passkey_status`, `passkey_registered_via`, `session_stage`, `oauth_purpose`.

## admin_activity (unchanged)

New actions written by this feature: `signin.role_refused` (adminId set, details `{}`),
`admin.role_set` (actorKind `system`, actorLabel `admin:role`, details `{ role }`). Existing
`signin.google_rejected`, `signin.success` and `session.revoked` (sign out everywhere) are unchanged;
`session.signed_out` (adminId set, details `{}`) is new for a single-session sign-out;
`signin.blocked`, `signin.passkey_failed` and `signin.passkey_abandoned` are no longer written. `role` is added to `ACTIVITY_DETAIL_KEYS`. Old rows are kept.
