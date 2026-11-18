# Quickstart: verifying 006 locally

Prerequisites: the usual local setup (`tests/README.md`, `.env.example`), the local Postgres on 5433, `pnpm install`. Run E2E
specs one file at a time (`pnpm build` once, then `pnpm exec playwright test <file> --project=…`);
the full E2E run is CI's.

## 1. No card payment mode (US2)

1. `pnpm test -- payment-availability payment-flag-usage render-blueprint` and
   `pnpm test:integration -- no-card-payment`: pass.
2. `pnpm exec playwright test tests/e2e/no-card-payment.spec.ts --project=consent`: pass.
3. By hand: set `PAYMENT_PROVIDER=none` in `.env.local`, run `pnpm dev`, then:
   - a product page shows only the offline payment line;
   - checkout offers only offline payment, and an order completes;
   - `/admin/settings` (signed in): card checkbox disabled with "Card payment is not set up yet";
   - `curl -i -X POST localhost:3001/api/payments/fake/callback` → 404.
4. `APP_ENV=production PAYMENT_PROVIDER=fake …` start → refuses, naming `PAYMENT_PROVIDER`
   (unit test in `tests/unit/env.test.ts`).

## 2. Blueprint (US1)

1. `pnpm test -- render-blueprint`: every production key from env.ts is present; secrets have no
   value.
2. Optional, with the Render CLI: `render blueprints validate render.yaml`.
3. On Render (owner, launch checklist): New → Blueprint → the repository. Render lists the web
   service, cron job and database in Frankfurt and asks for each `sync: false` value.

## 3. Backup job (US3)

```bash
docker build -t ac-backup ops/backup
```

Run it against the local database with rclone remotes on local folders (variables per
contracts/operations.md; `host.docker.internal` reaches the host's Postgres from Docker Desktop on
macOS):

```bash
docker run --rm -e DATABASE_URL=postgres://postgres:postgres@host.docker.internal:5433/avivas_crafts_dev -e BACKUP_AGE_RECIPIENT=<test public key> -e BACKUP_RCLONE_TYPE=local -e BACKUP_BUCKET=/out/backups -e IMAGES_RCLONE_TYPE=local -e IMAGES_BUCKET_PRIVATE=/in/private -e IMAGES_BUCKET_PUBLIC=/in/public -v "$PWD/.data/backup-test:/out" -v "$PWD/.data/storage:/in:ro" ac-backup
```

Expected: `db/daily/<today>.dump.age`, `images/…` and `images-public/…` under
`.data/backup-test/backups/`; exit 0;
no secret in the output. Then follow `ops/backup/README.md` › Restore with the test private key
into a scratch database and run its verification queries. Breaking `BACKUP_AGE_RECIPIENT` makes
the run exit non-zero with no file under the day's name.

## 4. Quality checks (US4)

```bash
pnpm exec playwright test tests/e2e/headers.spec.ts tests/e2e/a11y.spec.ts tests/e2e/storefront-layout.spec.ts tests/e2e/bundle-size.spec.ts --project=chromium-desktop
```

All pass. The bundle test prints each route's size: product ≤ 145 KB target, every route ≤ 150 KB,
checkout ≤ 155 KB.

```bash
pnpm check:image-metadata .data/storage/public/<some variant>.webp
```

Prints `clean` (the shop strips all metadata); `pnpm test -- check-image-metadata` passes (a WebP
or JPEG with EXIF fails the check).

Design review: `DESIGN_REVIEW=1 pnpm exec playwright test tests/e2e/design-review.spec.ts --project=chromium-desktop`
→ PNGs in `test-results/design-review/`; without the variable the spec is skipped.

## 5. Documents (US5, US6)

- `docs/launch-checklist.md`: every `<shop domain>` in the repository appears in its fill-in table
  (`grep -rn "<shop domain>" --exclude-dir=node_modules .`); PayPlus appears only under "Later".
- `docs/owner-guide-he.md`: no mention of setup links, recovery codes or passkeys.
- `grep -rni "payplus\|credit card\|כרטיס אשראי\|payment provider\|חברת הסליקה\|סליקה" docs/legal-drafts docs/privacy`
  → only the lines kept on purpose (clarified 2026-11-14): the unfinished-payments retention text
  in `privacy.{he,en}.md` and `database-definition.*`, and the cookies page's payment-page wording.

## 6. Walk-through (US7)

`pnpm verify` passes; the owner pushes the branch and runs CI, and its E2E jobs pass; the coordinator walks each scenario in
`checklists/validation.md` against `pnpm dev` and records pass/fail with the date.
