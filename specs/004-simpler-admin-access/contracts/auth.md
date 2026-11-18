# Contract: Admin Sign-in (after 004)

Replaces the sign-in parts of spec 001's contracts and the passkey re-check of spec 003's
`contracts/server-actions.md` (those files are historical; this one wins).

## Pages

| Path                                                                | Behaviour                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/sign-in`                                                    | One "Sign in with Google" form posting to `/api/auth/google/start` with optional `next`. Error notice for `?e=` in `not_allowed`, `expired`, `error`, `rate_limited` (`blocked` removed). |
| `/admin/sign-in/passkey`, `/admin/sign-in/recovery`, `/admin/setup` | **Removed** → 404 when signed in; signed out, redirected to sign-in like any unknown admin address.                                                                                       |

## Routes

| Route                                                                                             | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/google/start`                                                                     | Unchanged except: accepts only the sign-in purpose (no `purpose` field needed; any value other than absent/`sign_in` → 400). Rate limit `googleStartAllowed()` (10 per 15 min per IP hash) → redirect `?e=rate_limited`.                                                                                                                                                                                                                                |
| `GET /api/auth/google/callback`                                                                   | Validates the flow as today; requires verified email, known user, matching/bindable `google_sub`, **and `role = 'admin'`**. Success: creates a session, sets `__Host-ac_admin`, logs `signin.success`, answers the same-site navigation page to `safeAdminNext(next) ?? '/admin'`. Any refusal: `signin.google_rejected` + throttled `google_rejected` alert, redirect `/admin/sign-in?e=not_allowed`. Expired/invalid flow: `?e=expired` / `?e=error`. |
| `POST /api/auth/sign-out`                                                                         | Same-origin only. Deletes this session (logs `session.signed_out`) or all the admin's sessions with `all` (logs `session.revoked`), clears the cookie, redirects to `/admin/sign-in`. No pending-session branch.                                                                                                                                                                                                                                        |
| `/api/auth/passkey/**`, `/api/auth/recovery`, `/api/auth/reauth/**`, `/api/test/advance-sessions` | **Removed** → 404.                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Guards (`src/server/auth/require-admin.ts`)

- `requireAdmin()`: first statement of every admin page and Server Action; returns the admin
  context for a live session whose user has role `admin`, otherwise redirects to
  `/admin/sign-in` (with a safe `next`).
- `requireAdminApi(request)`: same, answering `401 {error:'unauthorized'}`.
- **Removed**: `requireRecentAuth`, `requireRecentAuthApi`, `requirePendingSession`,
  `ReauthRequired`, the `admin.reauth_required` form error.

## Session read (`getSession`)

Returns null when: no/oversized cookie; no row; idle > 30 min or past `expires_at` (row deleted);
user role is not `admin` (row deleted, `signin.role_refused` logged once). Otherwise touches
`last_seen_at` (unless `readOnly`).

## Cookies

`__Host-ac_admin` (session) and `__Host-ac_oauth` (sign-in flow state) keep their names, flags and
lifetimes. The storage table (consent registry) describes them without mentioning passkeys.

## Security alert emails

Only `google_rejected` remains (throttled to one per 15 minutes). All other kinds and their
message keys are removed. `notifyAdmins()` sends only to users with role `admin`.
