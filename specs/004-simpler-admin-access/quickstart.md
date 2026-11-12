# Quickstart: validating 004

Ports and commands as in the project notes (dev 3001, E2E 3100/3101, mock Google 4011). Run single
E2E files locally; the full run is CI's job.

## Automated

```bash
pnpm verify
pnpm exec playwright test tests/e2e/admin-auth.spec.ts
pnpm exec playwright test tests/e2e/admin-access.spec.ts
pnpm exec playwright test tests/e2e/admin-privacy.spec.ts
```

Expected: all pass; `pnpm verify`'s audit has no High/Critical; no file imports
`@simplewebauthn/*`.

## By hand (local)

1. `pnpm dev` on a fresh database: it creates the first admin with role `admin` and prints no setup
   link. Open `http://localhost:3001/admin` → "Sign in with Google" → admin home, no other step
   (US1 #1, SC-001).
2. Open `http://localhost:3001/admin/orders` signed out → sign in → lands on Orders (US1 #2).
3. `pnpm admin:role admin-a@example.test user` while signed in → the next click in the admin area
   goes to sign-in; signing in again shows "no access" (US2 #2, US1 #3).
4. `pnpm admin:role admin-a@example.test admin` → sign-in works again (US2 #1).
5. Customers screen: export and anonymise a customer → only the existing confirmation, no passkey
   prompt (US3).
6. Open `/admin/setup`, `/admin/sign-in/passkey`, `/admin/sign-in/recovery`,
   `/api/auth/recovery` → 404 when signed in; signed out, the three pages redirect to sign-in like any
   unknown admin address, and the API path is always 404 (US4 #1).
7. `psql` on the dev database: `\dt admin_*` shows no `admin_passkey` / `admin_recovery_code`;
   `admin_user` has `role` (US4 #2, SC-004).

## Production (owner)

Run the role command from a Render shell (or a one-off job) on the web service, which already has
`DATABASE_URL`:

```bash
pnpm admin:role aviva@gmail.com admin "Aviva"
```

`admin:role` does not replace the seed's placeholder notification email (`notify@example.invalid`).
After the first deploy, set the shop's notification email in the admin settings (the settings
screen flags the placeholder).

To sign everyone out: `DELETE FROM admin_session;` in the database.
