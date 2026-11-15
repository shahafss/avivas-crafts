# Contract: Operations files and scripts

## `render.yaml`

Region `frankfurt` for all three resources. Names: web service `avivas-crafts`, cron job
`avivas-crafts-backup`, database `avivas-crafts-db` (referenced by `fromDatabase.name`). Web service: `plan: starter`, `branch: main`,
`autoDeployTrigger: checksPass`, `healthCheckPath: /api/health`, build / pre-deploy / start
commands per research D3. Cron job: Docker from `ops/backup/`, `schedule: "30 0 * * *"`,
`autoDeployTrigger: checksPass`. Database: `basic-256mb`, PostgreSQL 17, no public IP allow-list.

### Web service environment

| Key | Source |
|---|---|
| `APP_ENV` | value `production` |
| `STORAGE_DRIVER` | value `r2` |
| `EMAIL_DRIVER` | value `resend` |
| `PAYMENT_PROVIDER` | value `none` |
| `R2_JURISDICTION` | value `eu` |
| `TRUSTED_PROXY_HOPS` | value `1` |
| `OIDC_ISSUER` | value `https://accounts.google.com` |
| `DATABASE_URL` | `fromDatabase` (connection string, private network) |
| `SECRET_HMAC_KEY` | `generateValue: true` |
| `APP_ORIGIN` | `sync: false` — `https://<shop domain>` |
| `IMAGE_PUBLIC_ORIGIN` | `sync: false` — `https://img.<shop domain>` |
| `EMAIL_FROM` | `sync: false` — e.g. `<shop name> <orders@<shop domain>>` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_PRIVATE`, `R2_BUCKET_PUBLIC` | `sync: false` |
| `RESEND_API_KEY` | `sync: false` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `sync: false` |

Not set in production: `CONSENT_TEST_CATEGORY`, `LOCAL_DATA_DIR`, `PAYPLUS_*` (until card
payment), `NODE_ENV` (Render / Next set it).

### Cron job environment

| Key | Source |
|---|---|
| `DATABASE_URL` | `fromDatabase` (connection string) |
| `BACKUP_AGE_RECIPIENT` | `sync: false` — the age public key (`age1…`) |
| `R2_ACCOUNT_ID` | `sync: false` |
| `BACKUP_BUCKET` | `sync: false` — e.g. `ac-backups` |
| `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` | `sync: false` — token: write to the backup bucket |
| `IMAGES_BUCKET_PRIVATE`, `IMAGES_BUCKET_PUBLIC` | `sync: false` |
| `IMAGES_R2_ACCESS_KEY_ID`, `IMAGES_R2_SECRET_ACCESS_KEY` | `sync: false` — token: object read on both image buckets |

`backup.sh` builds the rclone remotes `backup` and `images` from these through `RCLONE_CONFIG_*`
variables. For local runs, `BACKUP_RCLONE_TYPE=local` / `IMAGES_RCLONE_TYPE=local` with folder
paths replace R2 (quickstart §3); then `BACKUP_BUCKET`, `IMAGES_BUCKET_PRIVATE` and
`IMAGES_BUCKET_PUBLIC` are folder paths.

## `ops/backup/backup.sh`

- Steps, object names and atomicity: research D4.
- Output: one line per step (`dump ok`, `encrypt ok`, `upload daily ok`, `upload monthly ok` or
  `monthly skipped`, `images ok`, `public images ok`) with no URL, key or connection string.
- Exit code: 0 when every step succeeded; non-zero otherwise (first failing step's code).

## `pnpm check:image-metadata <url|path>`

| Exit | Meaning | Output |
|---|---|---|
| 0 | No EXIF and no XMP block (read with `sharp().metadata()`, all formats incl. WebP) | `clean: <name>` |
| 1 | An EXIF or XMP block is present | `metadata found: <field names>` (GPS, Make, Model, other, XMP; never values) |
| 2 | Could not read (missing file, HTTP error, > 25 MB, not an image) | `error: <reason>` |

## `scripts/zap-baseline.sh <url>`

Runs the pinned ZAP baseline image as a named container with a 15-minute timeout (on timeout:
`docker stop <name>`); report at
`test-results/zap/report.json`. Exit 0 with no High alerts, 1 with at least one High alert, 2 on a
run error (Docker missing, timeout). Prints a count per risk level.
