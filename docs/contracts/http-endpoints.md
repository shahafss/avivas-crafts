# Contract: HTTP Endpoints (Route Handlers)

> **Living document.** Moved from `specs/001-online-crafts-shop/` on 2026-11-09. Every feature that
> changes this contract updates this file in its own branch. Unqualified references to `spec.md`,
> `plan.md`, `research.md` (R-numbers), `quickstart.md`, FR-/SC- numbers and task IDs mean the
> ones in [`specs/001-online-crafts-shop/`](../../specs/001-online-crafts-shop/) unless a later
> spec is named.

Route handlers live in `src/app/api/**/route.ts`. All responses are JSON unless stated. Errors use
`{ "error": "<code>" }` with no stack traces or internal details (ASVS V16).

## POST `/api/payments/{provider}/callback`

Server-to-server notification from the payment provider (`provider` = `payplus` | `fake`).

- **Auth**: provider signature (PayPlus: `hash` header = Base64(HMAC-SHA256(secret, body)),
  `user-agent: PayPlus`). Invalid or missing signature → `401`, logged as a security event.
- **Then**: the handler calls `provider.fetchPaymentStatus(pageId)` (server-to-server IPN query)
  and passes the verified result and `pageId` to `confirmOnlinePayment(status, pageId)` (see
  [payment-provider.md](./payment-provider.md)). The callback body alone is never trusted for
  amount or status.
- **Responses**: `200 {"ok":true}` for processed, duplicate, second_payment, switched_offline, failed or mismatch outcomes (the
  provider must not retry a handled notification); `401` bad signature; `200` for an unknown reference (a verified paid status for it raises a `payment-attention` alert);
  `503` on transient errors (provider retries).
- **Idempotency**: repeat calls for an already-confirmed checkout return `200` and change nothing
  (FR-019).
- No CSRF check (no cookies used); body size limit 64 KB; rate limited per IP-hash (120/min).

## GET `/api/payments/status?c={resumeToken}`

Used by the payment-return page to poll (every 2 s, up to 60 s).

- Looks up the pending checkout by token hash. If still `awaiting_provider` and the last provider
  query was ≥ 5 s ago (`last_status_check_at`), performs the same server-side status query as the
  callback and confirms if verified. Rate limited 60/min per IP-hash.
- `orderUrl` uses the derived online-order token `HMAC(SECRET_HMAC_KEY, 'order:' + hex(SHA-256(c)))`
  — the same value `confirmOnlinePayment` computes from the stored `resume_token_hash`.
- **Response**: `{"state":"awaiting_provider"|"confirmed"|"failed"|"mismatch"|"switched_offline"|"expired", "orderUrl"?: "/he/order/<token>"}`
  (`switched_offline`: the visitor already chose direct payment; the return page then offers no retry),
  with `Cache-Control: no-store`.
- No personal data in the response. No `Origin` check (plan.md › V4): it reads no cookies and can
  confirm a payment only from the provider's own verified status.

## POST `/api/auth/google/start`

Form POST (`application/x-www-form-urlencoded`) with `purpose=sign_in|recovery|setup`, an optional
`next=<admin path>` and, for setup, `t=<setupToken>`; same-origin `Origin` required. The setup token is never in a URL the
server sees: setup links have the form `/admin/setup#t=<token>`, and the setup page's script reads
the fragment, removes it from the address bar (`history.replaceState`) and submits it in this form.
Creates an `oauth_flow` row (state, PKCE verifier, nonce, and `next_path` when `next` passes
`safeAdminNext()` — otherwise it is dropped; 10-minute expiry) and responds `303` to Google's
authorisation endpoint with `scope=openid email` (minimal) and `prompt=select_account`. Rate limited
10 per 15 minutes per IP-hash. The pages that post this form (`/admin/sign-in*`, `/admin/setup`)
list the OIDC issuer's origin in their CSP `form-action` (research.md › R14), because Chromium
applies `form-action` to this redirect.

## GET `/api/auth/google/callback?code&state`

Validates `state` (single use), exchanges the code with PKCE, validates the ID token (issuer,
audience, expiry, nonce) via openid-client, requires `email_verified`, then:

- email/sub not approved → activity `signin.google_rejected` (no email stored),
  throttled notification to admins, redirect `/admin/sign-in?e=not_allowed`;
- approved → binds `google_sub` if unset (and rejects if a different sub is already bound),
  creates a `pending_passkey` session (copying `oauth_flow.next_path`) and responds `200` with a minimal HTML page that navigates
  (nonce'd script + meta refresh) to `/admin/sign-in/passkey` (or the recovery / setup page
  according to `purpose`). An HTTP redirect is not used here because the navigation started on
  Google's site, and browsers withhold the `SameSite=Strict` session cookie on such a redirect.

## POST `/api/auth/passkey/options` and `/api/auth/passkey/verify`

Require a `pending_passkey` session and a same-origin `Origin` header.

- `options` → WebAuthn authentication options (challenge stored on the session, 5-minute expiry,
  `allowCredentials` = this admin's passkeys, `userVerification: "required"`).
- `verify` body = WebAuthn assertion JSON → on success: counter updated, session rotated to a new
  `full` session (old token deleted), activity `signin.success`, `200 {"redirect": <the pending session's next_path, or "/admin">}`;
  on failure: fail count++, activity `signin.passkey_failed`; at 5 failures in 15 minutes the
  admin is blocked for 15 minutes (`signin.blocked`) and admins are emailed. A `pending_passkey`
  session that expires or is replaced without reaching `full` is counted as a failure by the
  minute job (`signin.passkey_abandoned`, throttled security alert);
  `401 {"error":"passkey_failed"|"blocked"}`.

## POST `/api/auth/passkey/register/options` and `/api/auth/passkey/register/verify`

Allowed when either (a) a `full` session (adding another passkey) whose `reauth_at` is less than 5
minutes old — otherwise `403 {"error":"reauth_required"}` (contracts/server-actions.md › Passkey
re-check), (b) a `pending_passkey` session
created with `purpose=setup` and a valid unused setup token for this admin with zero passkeys, or
(c) a `pending_passkey` session on which a recovery code was just accepted (flag on the session,
5-minute window). Registration options: `residentKey: "preferred"`,
`userVerification: "required"`, `excludeCredentials` = existing passkeys, attestation `none`.
`verify` body includes `deviceLabel`. For (b), a successful registration rotates the pending
session to a new `full` session (the admin lands on the dashboard). For (c) the hardened recovery
rule applies: the passkey is always stored `pending_approval`, the pending session is ended (no
`full` session; `ended_at` and `abandon_processed_at` set at once, so it is not counted as an
abandoned sign-in) and the response is `200 {"status":"pending_approval"}`; all admins and
notification addresses get a `security-alert`. As a safety net, (c) re-checks that another admin
with an active passkey still exists and otherwise answers `409 {"error":"no_other_admin"}` without
storing anything. The passkey `verify` endpoint (sign-in) rejects `pending_approval` passkeys
(they are also left out of `allowCredentials`). On first passkey: recovery codes are generated and
returned **once** in the response; setup token is cleared. Activity `passkey.added`; all admins
emailed for (b) and (c).

## POST `/api/auth/recovery`

Requires a `pending_passkey` session. Body `{code}`. **First**, if no *other* admin with at least
one `active` passkey exists, responds `409 {"error":"no_other_admin"}` without looking at the code
(no code consumed, no failure counted), ends the pending session the same way (not counted as
abandoned), writes activity `recovery.refused` and sends a `security-alert`; the recovery page shows the same Hebrew explanation (contact the maintainer, who
runs `pnpm admin:reset`) as soon as it loads, instead of the code form, **without writing anything on
load** (admin GET pages never change state), plus a button that posts here without a code; this
endpoint's refusal then ends the pending session (`ended_at` and `abandon_processed_at` set, activity
`recovery.refused`, one `security-alert`), so it is not counted as an abandoned sign-in. A pending
session simply left open on that page is handled by the abandoned-passkey task like any other. Otherwise: constant-time
comparison against unused hashes; counts toward the same failure throttle as passkey attempts.
Success marks the code used, activity `recovery.used`, emails all admins, and allows passkey
registration (c).

## POST `/api/auth/reauth/options` and `/api/auth/reauth/verify`

Passkey re-check before security changes (FR-032, ASVS 5.0 V7.5). Require a `full` session and a
same-origin `Origin` header. `options` → authentication options like the sign-in step (challenge on
the session, 5 minutes, `allowCredentials` = this admin's `active` passkeys, `userVerification:
"required"`). `verify` → on success updates the passkey counter and sets the session's
`reauth_at = now()` (the session token is not rotated), `200 {"ok":true}`; on failure counts toward
the same 5-in-15-minutes throttle as sign-in, activity `signin.reauth_failed`,
`401 {"error":"passkey_failed"|"blocked"}`; while blocked, re-checks are refused (the
session stays signed in but cannot make security changes until the block ends or another admin
clears it).

## POST `/api/auth/sign-out`

Same-origin required. Deletes the current session (or all sessions of the admin with
`{"all":true}`). Clears the cookie. Not subject to the passkey re-check (contracts/server-actions.md).

## Same-site bounce for admin pages (in `src/proxy.ts`, not a route handler)

A top-level `GET` of an admin page (`/admin` and below, except `/admin/sign-in*` and `/admin/setup`)
with `Sec-Fetch-Site: cross-site` and `Sec-Fetch-Mode: navigate` — e.g. the order link in a
`new-order` email opened in webmail — arrives without the `SameSite=Strict` admin cookie. The proxy
answers it with `200` and the same minimal re-navigation page as the Google callback
(`sameSiteNavigationPage()`: `Cache-Control: no-store`, nonce'd script + `<meta http-equiv="refresh">`)
pointing at the same path and query; the second request is same-site, so the cookie is sent and
`requireAdmin()` decides as usual. The proxy reads no session and grants nothing. Requests without
`Sec-Fetch-Site` are not bounced. Because the bounce turns a cross-site top-level GET into a request that
carries the Strict cookie, admin pages MUST NOT change state on GET (tasks.md › Conventions). When `requireAdmin()` finds no `full` session on a page, it
redirects to `/admin/sign-in?next=<path+query>` (from the request header `x-admin-path`, which the
proxy always overwrites, validated by `safeAdminNext()`); the sign-in form posts `next` on to
`/api/auth/google/start`.

## POST `/api/admin/images`

Multipart upload of one photo (`file`, `productId`). Requires `full` session + same-origin
`Origin`. Limits: 20 MB body, JPEG/PNG/WebP/HEIC/HEIF by content, ≤ 51,000,000 pixels (HEIC/HEIF: ≤ `HEIC_MAX_PIXELS`, set in
T052 from the memory measurement, about 12–16 MP; over it → `too_many_pixels`). Excluded from the proxy matcher
(body-buffering limit). Responds `201 {"id","position","previewUrl"}` (`previewUrl` =
`/api/admin/media/<key>-400.webp`) or `400 {"error":"unsupported_type"|"too_large"|"too_many_pixels"|"too_many_images"|"corrupt"|"bad_request"}` (`bad_request`: missing
file or malformed product id) or `404 {"error":"not_found"}` (unknown or deleted product).
Processing is serialised (one at a time).

## GET `/api/admin/media/{...key}`

Authenticated delivery of private images (drafts, all admin previews, order snapshots). Requires a
`full` session (`401` otherwise). `key` must match
`^(p|orders)/[a-z0-9/_-]+-(400|800|1600)\.webp$` (`400` otherwise). Streams the object from the
private bucket with `Content-Type: image/webp`, `Cache-Control: private, no-store`,
`X-Content-Type-Options: nosniff`; `404` when missing.

## POST `/api/v`

Cookieless page-view beacon (`text/plain` JSON `{"p":"/he/p/doll","r":"instagram.com"}` sent by
`navigator.sendBeacon` on every page view, including client-side navigations). `r` is present only on
the first beacon of a document load (`""` for none); a beacon without `r` counts a page view but no
visit. Validates the path against the site's route patterns (admin paths ignored),
drops bot user agents, increments aggregates, stores no IP/UA/identifier. Always `204`. Rate
limited 60/min per IP-hash (silently dropped).

## GET `/api/locale?to=he|en&path=/en/...`

Language switch target (FR-042). Sets `NEXT_LOCALE` (`HttpOnly`, `SameSite=Lax`, `Path=/`, 1 year;
`Secure` when `APP_ORIGIN` is https, i.e. always in staging and production — contracts/device-storage.md)
and responds `303` to `path`. `path` MUST be a same-origin relative path starting with `/he/` or
`/en/` (or exactly `/he` or `/en`); absolute URLs, `//host`, and backslashes are rejected with
`400` (open-redirect protection). This is the only place the locale cookie is written. When a `Sec-Fetch-Site` header is present and is
neither `same-origin` nor `none`, it redirects to `path` without setting the cookie (CSRF protection).

## POST `/api/test/advance-sessions` (test only)

Exists only when `APP_ENV=test` (404 otherwise). Ages `pending_passkey` sessions and then runs the
abandoned-passkey task synchronously (the job loop does not run under `APP_ENV=test`).

## GET `/api/health`

`200 {"ok":true}` when the database answers `SELECT 1`; used by Render health checks. No version
or dependency details exposed.
