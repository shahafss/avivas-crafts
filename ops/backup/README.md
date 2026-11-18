# Nightly backup

This folder holds the job that backs up the shop every night. Nothing here runs on your computer
in normal use: Render runs it (the `avivas-crafts-backup` cron job in `render.yaml`).

## What it does, and when

Every day at **00:30 UTC** (02:30 Israel time in winter, 03:30 in summer) the job:

1. Takes a copy of the whole database (`pg_dump`, one consistent snapshot; the shop keeps working).
2. Encrypts it with your **public** key (`age`). The plain copy is deleted at once. Nobody without
   your private key can read the backup, including Render and Cloudflare.
3. Uploads it to the backup bucket as `db/daily/YYYY-MM-DD.dump.age`. On the 1st of each month
   (UTC) it also keeps `db/monthly/YYYY-MM.dump.age`.
4. Copies the product photos: the private bucket into `images/` and the public bucket into
   `images-public/` of the backup bucket. It only adds files; it never deletes any.

Each step prints one line (`dump ok`, `encrypt ok`, `upload daily ok`, `upload monthly ok` or
`monthly skipped`, `images ok`, `public images ok`). Nothing secret is ever printed. If a step
fails the job stops with an error, and Render emails the workspace owner about the failed run.

## One-time setup

### 1. The encryption key pair (on your own computer)

```bash
age-keygen -o backup-key.txt
```

(Install `age` first, for example `brew install age`.) The command prints `Public key: age1…`.

- Put **only the `age1…` public key** in Render, as `BACKUP_AGE_RECIPIENT` of the backup job.
- Keep `backup-key.txt` (the private key) **offline, in two separate places** (for example a USB
  stick at home and a copy with a family member). It never goes to Render, GitHub or email. If it
  is lost, the backups cannot be opened; if someone else gets it, they can read them.

### 2. Three Cloudflare R2 buckets (EU jurisdiction)

| Bucket | Holds |
|---|---|
| `ac-images-private` | order photos and other private images (the shop's private bucket) |
| `ac-images-public` | product photos shown on the site (the shop's public bucket) |
| `ac-backups` | the encrypted database copies and the photo copies |

All three are created in the **EU jurisdiction**. The bucket names above are examples: use the
names you set for the shop (`R2_BUCKET_PRIVATE`, `R2_BUCKET_PUBLIC`) and for the backup job
(`IMAGES_BUCKET_PRIVATE`, `IMAGES_BUCKET_PUBLIC`, `BACKUP_BUCKET`).

### 3. Two scoped R2 API tokens

| Token | Permission | Bucket | Render variables (backup job) |
|---|---|---|---|
| backup | Object Read and Write | `ac-backups` only | `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` |
| images | Object Read | `ac-images-private` and `ac-images-public` only | `IMAGES_R2_ACCESS_KEY_ID`, `IMAGES_R2_SECRET_ACCESS_KEY` |

The job also needs `R2_ACCOUNT_ID` and `DATABASE_URL` (filled in by Render from the database).
A token that can only read the photos cannot damage them, and the backup token cannot touch the
live shop.

### 4. Lifecycle rules on `ac-backups`

In Cloudflare, bucket `ac-backups` > Settings > Object lifecycle rules:

- prefix `db/daily/`: delete objects after **30 days**;
- prefix `db/monthly/`: delete objects after **365 days**;
- nothing on `images/` or `images-public/`.

## Restore

You need your private key (`backup-key.txt`) and, on your computer, `rclone`, `age` and the
PostgreSQL 17 tools (`pg_restore`, `psql`). The production database has no public address, so
restore into a **scratch database on your own computer** to check the backup, as below. (After a
real disaster, Render lets you restore into a new database; the same files and steps apply.)

### 1. List and download a backup

Set up an rclone remote for the backup bucket with the **backup token** of section 3 (Object Read
and Write on `ac-backups`; a one-time `rclone config`, type `s3`, provider `Cloudflare`, endpoint
`https://<account id>.eu.r2.cloudflarestorage.com`), here called `backup`:

```bash
rclone lsf backup:ac-backups/db/daily/
rclone copy backup:ac-backups/db/daily/2026-11-15.dump.age .
```

### 2. Decrypt

```bash
age -d -i backup-key.txt -o restored.dump 2026-11-15.dump.age
```

### 3. Restore into a scratch database

```bash
createdb avivas_crafts_restore_test
pg_restore --no-owner --no-acl --dbname=avivas_crafts_restore_test restored.dump
```

### 4. Check it

```bash
psql avivas_crafts_restore_test -c "select count(*) from product"
psql avivas_crafts_restore_test -c "select count(*) from orders"
psql avivas_crafts_restore_test -c "select count(*) from content_page"
psql avivas_crafts_restore_test -c "select max(created_at) from orders"
```

Compare with the live admin area: the number of products on the products list, and the date of the
newest order on the orders list. They should match (allowing for changes since the backup ran).
When done: `dropdb avivas_crafts_restore_test`, and delete `restored.dump` (it is not encrypted).

### 5. Restore the photos

The photos are copied back as plain files. Set up a second rclone remote, called `live`, the same
way as `backup` above, but with the **app's read/write image token** (the token the shop itself
uses for `ac-images-private` and `ac-images-public`; the backup job's read-only images token cannot
write):

```bash
rclone copy backup:ac-backups/images/ live:ac-images-private/
rclone copy backup:ac-backups/images-public/ live:ac-images-public/
```

## Try it on your own computer (no R2 needed)

This is how the job was verified. It needs Docker and the local database from `compose.yaml`
(`docker compose up -d db`), and uses folders instead of R2 (`BACKUP_RCLONE_TYPE=local`,
`IMAGES_RCLONE_TYPE=local`).

```bash
docker build -t ac-backup ops/backup

# a throw-away key pair in a scratch folder
mkdir -p .data/backup-test/keys
docker run --rm --entrypoint age-keygen -v "$PWD/.data/backup-test/keys:/k" ac-backup -o /k/backup-key.txt

docker run --rm \
  -e DATABASE_URL=postgres://postgres:postgres@host.docker.internal:5433/avivas_crafts_dev \
  -e BACKUP_AGE_RECIPIENT=<the age1… public key printed above> \
  -e BACKUP_RCLONE_TYPE=local -e BACKUP_BUCKET=/out/backups \
  -e IMAGES_RCLONE_TYPE=local -e IMAGES_BUCKET_PRIVATE=/in/private -e IMAGES_BUCKET_PUBLIC=/in/public \
  -v "$PWD/.data/backup-test:/out" -v "$PWD/.data/storage:/in:ro" \
  ac-backup
```

Expected: the six step lines, exit code 0, and `db/daily/<today>.dump.age`, `images/` and
`images-public/` under `.data/backup-test/backups/`. Then follow **Restore** above using
the throw-away key. With a broken `BACKUP_AGE_RECIPIENT` (for example `age1x`) the run ends with
`encrypt failed`, a non-zero exit code, and no file under `db/daily/`. Delete
`.data/backup-test` afterwards.
