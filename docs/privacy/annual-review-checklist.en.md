**טיוטה — נדרשת בדיקה משפטית / Draft — requires legal review.**

# Annual review checklist

Do once a year, and after any severe incident or large change. Date: [date]. Done by: [name].

## Documents

- [ ] The [database definition](database-definition.en.md) still matches the shop: data kept, purposes, retention, processors and their locations.
- [ ] The register matches the Drizzle schema in `src/server/db/schema/` and the Privacy Policy and Cookie Policy pages.
- [ ] The [security procedure](security-procedure.en.md), [access list](access-authorizations.en.md) and [incident procedure](incident-response.en.md) are current; contact details are right.
- [ ] The security level (basic) still fits: still at most 3 authorised users, still no special-sensitivity data. If not, tell the legal reviewer.

## Access

- [ ] Every person on the approved-admin list still needs access; everyone who left is removed.
- [ ] Every registered passkey belongs to a device still in use; unknown or old ones are removed.
- [ ] Hosting, storage and repository access lists contain only the maintainer.
- [ ] Admins' Google accounts have 2-Step Verification on; recovery codes are held safely.

## Activity and incidents

- [ ] Read the activity log of the year for sign-ins or changes nobody recognises.
- [ ] Incident record reviewed; every incident closed with follow-up done.

## Backups and retention

- [ ] A restore from a recent backup into a scratch database works (and the offline key opens it).
- [ ] The offline backup key is safe and a second copy exists apart from the backups.
- [ ] Backup lifecycle: daily copies expire after 30 days, monthly after 365 days.
- [ ] The four daily tasks (`anonymize-old-orders`, `delete-old-activity`, `delete-old-consent`, `delete-old-outbox`) ran recently without errors (`job_run`); no order older than 7 years still holds personal data.
- [ ] No customer export file is left on any device.

## Systems

- [ ] Dependencies updated; `pnpm run audit` reports nothing high or critical.
- [ ] Operating systems and browsers on admin and maintainer devices are updated, with screen locks.
- [ ] Provider list unchanged (Render, Cloudflare, PayPlus, Resend, Google); each provider's location and sub-processors checked; the Privacy Policy still lists them.
- [ ] Secrets rotated where due; none in the repository.

## Requests

- [ ] Customer requests of the year (access, correction, erasure, withdrawal) were answered; exports were sent only to the verified person and deleted.

## Sign-off

Result: [all done / actions needed: ...]. Next review due: [date + 1 year].
