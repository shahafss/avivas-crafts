# Contract: `pnpm admin:role`

Replaces `pnpm admin:add` and `pnpm admin:reset` (both removed, with their `package.json`
entries).

```text
pnpm admin:role <googleEmail> <admin|user> ["display name"]
```

| Case | Result | Exit |
|---|---|---|
| Email invalid (not an email or > 254 chars), role not `admin`/`user`, or name given but not 1–60 chars | Prints usage and the reason; changes nothing | 1 |
| Run with `APP_ENV=production` | Allowed: the command is meant to run on the deployment too (Render shell / one-off job) | — |
| No user with that (lower-cased) email, role `admin` | Inserts the user with role `admin`, display name = given name or the email's local part (cut to 60) | 0 |
| No user with that email, role `user` | Changes nothing, prints "no such user" | 1 |
| User exists | Sets the role (and the display name if given) | 0 |
| Role set to `user` | Also deletes all of that user's sessions in the same transaction | 0 |

Every change writes one `admin.role_set` activity row (`actorKind: 'system'`,
`actorLabel: 'admin:role'`, `adminId` = the user, details `{ role }`), never the email, and sends
no email. Output names the user's display name and new role. Loads `.env.local` locally like the
other scripts; on the deployment it uses the service's `DATABASE_URL`. The logic lives in
`src/server/auth/admin-role.ts` (`setAdminRole(db, { email, role, name? })`, returning a result
object); `scripts/admin-role.ts` only parses arguments, calls it and prints (pattern of
`src/server/settings/zone-add.ts`).
