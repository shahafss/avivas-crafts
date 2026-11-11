**טיוטה — נדרשת בדיקה משפטית / Draft — requires legal review.**

# Access authorizations

Basic security level: at most three authorised people.

## 1. Authorised people

| #   | Role                  | Person            | Access                                                                                                              | Sign-in                                                                                                                               |
| --- | --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Shop owner (admin)    | [to be completed] | Admin area: products, orders, customers, settings, content pages, statistics, admin list                            | Google account on the approved list + shop passkey                                                                                    |
| 2   | Family helper (admin) | [to be completed] | The same as the owner (identical permissions)                                                                       | Google account on the approved list + shop passkey                                                                                    |
| 3   | Maintainer            | [to be completed] | Hosting account (application and database), storage and backup buckets, the code repository, the offline backup key | Provider accounts with 2-step verification; database access only from the hosting console or a protected connection, only when needed |

No other person, supplier or employee has access to the database or the admin area.

## 2. Rules

- Access is personal. No shared accounts or shared passkeys.
- An admin can add or remove approved admin Google accounts and view or remove passkeys; each such
  change asks for the passkey again.
- The maintainer does not use the admin area for daily work, and reads customer data only when
  fixing a fault, and only as far as needed.
- The offline backup private key is held by the maintainer only, stored offline and backed up
  separately from the encrypted backups.
- Processors listed in the [database definition](database-definition.en.md) receive only the data
  their service needs.

## 3. Granting and removing access

1. The owner decides who gets access.
2. An admin is added to the approved list in the admin area and registers a passkey (via a setup
   link); the maintainer sets up the first admin.
3. When someone no longer needs access, remove them at once: the admin from the approved list
   (their sessions and passkeys end), the maintainer from the hosting and storage accounts and the
   repository.
4. Write the change and its date in section 4.

## 4. Change record

| Date   | Person | Change         | By     |
| ------ | ------ | -------------- | ------ |
| [date] | [name] | Access granted | [name] |

## 5. Review

Checked at least once a year (see the [annual review checklist](annual-review-checklist.en.md)), and
whenever a person joins or leaves.
