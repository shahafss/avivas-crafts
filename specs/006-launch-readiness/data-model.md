# Data Model: Hosting and Launch Readiness (006)

**No database schema change and no migration.** The Drizzle schema in `src/server/db/schema/`
stays the source of truth. This feature adds one configuration value and one derived rule.

## Configuration: `PAYMENT_PROVIDER`

| Value | Allowed in | Meaning |
|---|---|---|
| `payplus` | every `APP_ENV` | Card payment through PayPlus; requires the `PAYPLUS_*` variables. Not used at launch. |
| `fake` | development, test, staging | Same-origin fake payment page for tests. Refused when `APP_ENV=production` (001, kept). |
| `none` (new) | every `APP_ENV` | No card provider. Card payment is unavailable everywhere. Production's value at launch. |

## Derived: effective payment methods

Input: `shop_settings.online_payment_enabled`, `shop_settings.offline_payment_enabled` (existing
columns, database check `online OR offline`) and `PAYMENT_PROVIDER`.

```text
cardAvailable = PAYMENT_PROVIDER !== 'none'
online        = cardAvailable && online_payment_enabled
offline       = offline_payment_enabled || !cardAvailable
```

| Provider | stored online | stored offline | → online | → offline |
|---|---|---|---|---|
| payplus / fake | on | on | on | on |
| payplus / fake | on | off | on | off |
| payplus / fake | off | on | off | on |
| none | on | on | **off** | on |
| none | on | off | **off** | **on** |
| none | off | on | off | on |

(`off/off` cannot be stored: database check.) Every surface that offers, shows or accepts a
payment method reads only these effective values ([contracts/payment-mode.md](contracts/payment-mode.md)).

Settings writes under `none`: `onlinePaymentEnabled: true` or `offlinePaymentEnabled: false` is
rejected with `admin.settings.errors.card_not_set_up`; stored values are not rewritten
automatically.

## Operational entities (files, not tables)

- **Blueprint** (`render.yaml`): web service, cron job, database; environment keys per
  [contracts/operations.md](contracts/operations.md).
- **Backup object**: `ac-backups/db/daily/YYYY-MM-DD.dump.age` (expires after 30 days),
  `ac-backups/db/monthly/YYYY-MM.dump.age` (365 days), `ac-backups/images/<same keys as the
  private bucket>` and `ac-backups/images-public/<same keys as the public bucket>` (never deleted
  by the job).
- **Validation record** (`checklists/validation.md`): rows of scenario, source quickstart, result,
  date, note; plus measurement rows (bundle sizes, memory, design review) and the owner's
  stopwatch rows.
