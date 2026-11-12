**טיוטה — נדרשת בדיקה משפטית / Draft — requires legal review.**

# Access authorizations

Basic security level: at most three authorised people.

## 1. Authorised people

| #   | Role                  | Person            | Access                                                                                                              | Sign-in                                                                                                                               |
| --- | --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Shop owner (admin)    | [to be completed] | Admin area: products, orders, customers, settings, content pages, statistics                                        | Google account with role `admin` and Google 2-step verification                                                                       |
| 2   | Family helper (admin) | [to be completed] | The same as the owner (identical permissions)                                                                       | Google account with role `admin` and Google 2-step verification                                                                       |
| 3   | Maintainer            | [to be completed] | Hosting account (application and database), storage and backup buckets, the code repository, the offline backup key | Provider accounts with 2-step verification; database access only from the hosting console or a protected connection, only when needed |

No other person, supplier or employee has access to the database or the admin area.

## 2. Rules

- Access is personal. No shared accounts.
- Who is an admin is decided by the maintainer: a Google account gets the role `admin` or `user`
  with the `pnpm admin:role` command, run on the hosting service. The role is checked on every
  request, so a change takes effect at once. Admins cannot change roles in the admin area.
- The maintainer does not use the admin area for daily work, and reads customer data only when
  fixing a fault, and only as far as needed.
- The offline backup private key is held by the maintainer only, stored offline and backed up
  separately from the encrypted backups.
- Processors listed in the [database definition](database-definition.en.md) receive only the data
  their service needs.

## 3. Granting and removing access

1. The owner decides who gets access.
2. The maintainer gives the person's Google account the role `admin` with `pnpm admin:role`.
3. When someone no longer needs access, remove them at once: set their role to `user` with
   `pnpm admin:role` (their sessions end), and remove the maintainer from the hosting and storage
   accounts and the repository.
4. Write the change and its date in section 4.

## 4. Change record

| Date   | Person | Change         | By     |
| ------ | ------ | -------------- | ------ |
| [date] | [name] | Access granted | [name] |

## 5. Review

Checked at least once a year (see the [annual review checklist](annual-review-checklist.en.md)), and
whenever a person joins or leaves.
