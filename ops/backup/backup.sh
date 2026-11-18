#!/usr/bin/env bash
# Nightly backup: encrypted database dump + copies of both image buckets (006 research D4,
# contracts/operations.md). Configuration is environment only; rclone remotes are built from it.
# Output is one line per step and never contains a URL, key or connection string.
set -euo pipefail

BACKUP_RCLONE_TYPE="${BACKUP_RCLONE_TYPE:-s3}"
IMAGES_RCLONE_TYPE="${IMAGES_RCLONE_TYPE:-s3}"

required=(DATABASE_URL BACKUP_AGE_RECIPIENT BACKUP_BUCKET IMAGES_BUCKET_PRIVATE IMAGES_BUCKET_PUBLIC)
if [[ "$BACKUP_RCLONE_TYPE" == "s3" ]]; then
  required+=(R2_ACCOUNT_ID BACKUP_R2_ACCESS_KEY_ID BACKUP_R2_SECRET_ACCESS_KEY)
fi
if [[ "$IMAGES_RCLONE_TYPE" == "s3" ]]; then
  required+=(IMAGES_R2_ACCESS_KEY_ID IMAGES_R2_SECRET_ACCESS_KEY)
  [[ "$BACKUP_RCLONE_TYPE" == "s3" ]] || required+=(R2_ACCOUNT_ID)
fi

missing=()
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done
if ((${#missing[@]} > 0)); then
  echo "missing environment variables: ${missing[*]}" >&2
  exit 2
fi

# No config file exists (environment only): keep rclone's "config not found" notice out of the output.
export RCLONE_LOG_LEVEL=ERROR

# Remotes `backup` (write to the backup bucket) and `images` (read both image buckets).
export RCLONE_CONFIG_BACKUP_TYPE="$BACKUP_RCLONE_TYPE"
if [[ "$BACKUP_RCLONE_TYPE" == "s3" ]]; then
  export RCLONE_CONFIG_BACKUP_PROVIDER=Cloudflare
  export RCLONE_CONFIG_BACKUP_ENDPOINT="https://${R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com"
  export RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_BACKUP_NO_CHECK_BUCKET=true
fi
export RCLONE_CONFIG_IMAGES_TYPE="$IMAGES_RCLONE_TYPE"
if [[ "$IMAGES_RCLONE_TYPE" == "s3" ]]; then
  export RCLONE_CONFIG_IMAGES_PROVIDER=Cloudflare
  export RCLONE_CONFIG_IMAGES_ENDPOINT="https://${R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com"
  export RCLONE_CONFIG_IMAGES_ACCESS_KEY_ID="$IMAGES_R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_IMAGES_SECRET_ACCESS_KEY="$IMAGES_R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_IMAGES_NO_CHECK_BUCKET=true
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

today="$(date -u +%F)"
month="$(date -u +%Y-%m)"
day_of_month="$(date -u +%d)"
bucket="${BACKUP_BUCKET%/}"
daily="backup:${bucket}/db/daily/${today}.dump.age"
monthly="backup:${bucket}/db/monthly/${month}.dump.age"

# Runs one step; the tool's own stderr goes to a file in $work (it can contain the database host or
# the R2 endpoint) and is discarded with it. On failure only "<step> failed" is printed, and the
# script exits with the tool's code.
step() {
  local name="$1"
  shift
  local code=0
  "$@" 2>>"$work/stderr.log" || code=$?
  if ((code != 0)); then
    echo "${name} failed" >&2
    exit "$code"
  fi
}

# 1. One consistent snapshot; takes no locks that block the shop's reads or writes.
step dump pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$work/db.dump"
echo "dump ok"

# 2. Encrypt to the public key, then remove the plain dump straight away.
step encrypt age -r "$BACKUP_AGE_RECIPIENT" -o "$work/db.dump.age" "$work/db.dump"
rm -f "$work/db.dump"
echo "encrypt ok"

# 3. An object upload is atomic: a failed run never leaves a partial file under the final name.
step "upload daily" rclone copyto "$work/db.dump.age" "$daily"
echo "upload daily ok"

# 4. On the 1st of the month (UTC), keep a monthly copy (server-side copy).
if [[ "$day_of_month" == "01" ]]; then
  step "upload monthly" rclone copyto "$daily" "$monthly"
  echo "upload monthly ok"
else
  echo "monthly skipped"
fi

# 5. Both image buckets. `copy`, never `sync`: nothing is ever deleted from the backup.
step images rclone copy "images:${IMAGES_BUCKET_PRIVATE%/}" "backup:${bucket}/images/"
echo "images ok"
step "public images" rclone copy "images:${IMAGES_BUCKET_PUBLIC%/}" "backup:${bucket}/images-public/"
echo "public images ok"
