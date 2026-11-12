**טיוטה — נדרשת בדיקה משפטית / Draft — requires legal review.**

# Security procedure

Applies to the Aviva's Crafts database (see [database-definition.en.md](database-definition.en.md)) at the
basic security level.

## 1. Responsibility

The owner is responsible for the database. The maintainer carries out the technical controls below.
[to be completed: name of the person appointed as security officer; by default the owner.]

## 2. Access control

- The admin area is the only way to read customer data. It needs a Google sign-in with an account that has
  the role `admin` in the shop (set by the maintainer with `pnpm admin:role`), protected by that
  Google account's 2-step verification. The shop stores no admin passwords.
- Until then, the admin area shows no drafts, orders, settings or customer data.
- Sign-ins from unapproved accounts are refused and logged, the sign-in start is rate limited, and
  the owner is emailed (at most one email per 15 minutes).
- The role is checked on every request: setting a user's role to `user` ends their access and
  deletes their sessions at once.
- Sessions end after 30 minutes of inactivity or 12 hours in all; an admin can sign out. To sign
  everyone out, delete the `admin_session` rows.
- Everyone with access uses a device protected by a screen lock and updated software, and a Google
  account with 2-Step Verification (accepted as a launch step and a documented residual risk, since
  the shop cannot verify it).
- The access list is in [access-authorizations.en.md](access-authorizations.en.md).

## 3. Logging

Admin sign-ins and admin changes (products, prices, orders, settings, customer searches, exports,
withdrawals, anonymisation) are written to the activity log, kept 2 years. The log and the
application's own logs never hold personal data (no names, emails, phones, addresses, order
tokens). The daily anonymisation task writes its own entry as the system.

## 4. Protection of data in use

- All traffic is encrypted (HTTPS, HSTS). Pages are served with a strict Content Security Policy,
  and forms are protected against cross-site requests.
- Card data is entered only on the payment provider's page and never reaches the shop.
- Public forms (checkout, contact) are rate-limited and filtered against bots without puzzles. IP
  addresses are stored only as a daily-rotating keyed hash, 24 hours at most.
- Private product and order images are served only to a signed-in admin.
- Secrets (database URL, HMAC key, provider keys) live only in the hosting environment, never in
  the code repository.
- Dependencies are audited in CI (`pnpm run audit`) and updated; high-severity findings block a merge.

## 5. Backups

- A nightly encrypted dump of the database (encrypted to a public key; the private key is kept
  offline by the maintainer, the server cannot read its own backups) is stored in the private
  backup bucket: 30 daily copies and 12 monthly copies, so up to 12 months. Images are copied
  alongside.
- The hosting provider also keeps short point-in-time recovery for the database.
- A restore into a scratch database is tested before launch and then yearly (see the checklist).
- Erasure and anonymisation reach backups only as old copies expire; this is stated in the Privacy
  Policy.

## 6. Retention and deletion

The automatic tasks in the database definition (section 7) remove old orders' personal data, old
activity, old cookie-choice records and old emails. The maintainer checks yearly that they ran
(the `job_run` table).

## 7. Handling customer data requests and export files

1. Verify the request comes from the person: the email or phone must match an order, and the reply
   goes only to that same address.
2. Use the admin customers screen (search, export, withdraw marketing consent, anonymise).
3. A customer export is a file made on demand. It is never stored by the shop. The admin sends it
   **only to the verified customer**, then **deletes the local copy** (including the downloads
   folder and any mail draft) and empties the trash.
4. Do not forward exports to anyone else, do not keep them in chat, shared drives or on removable
   media.
5. Answer as soon as possible. Record nothing extra; the activity log already records the action
   without personal data.

## 8. Devices and the workplace

Devices used for the admin area: updated operating system and browser, screen lock, no shared
accounts, lost devices reported at once so their sessions can be removed. Do not leave
the admin area open on an unattended device.

## 9. People

The two admins and the maintainer are told the content of this procedure and of the incident
procedure when they get access and yearly. A person who leaves has their role set to `user` at
once (their sessions end).

## 10. Incidents

See [incident-response.en.md](incident-response.en.md).

## 11. Review

At least once a year, using [annual-review-checklist.en.md](annual-review-checklist.en.md).
