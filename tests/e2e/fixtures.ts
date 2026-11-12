// Shared E2E helpers. Specs import { test, expect } from here, call resetDb() in
// test.beforeAll and create the data they need themselves (isolation rule, tasks.md T005).
// DB helpers use postgres.js tagged templates on table names directly (not the app schema), so
// this file typechecks before the schema exists.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test as base, type Page } from '@playwright/test';
import postgres from 'postgres';
import {
  assertE2eDatabase,
  E2E_DATABASE_URL,
  LOCAL_DATA_DIR,
  OIDC_USER_FILE,
  serverEnv,
} from './env';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
// E2E-only file, never the dev one (see OIDC_USER_FILE in env.ts).
const OIDC_USER_PATH = resolve(repoRoot, OIDC_USER_FILE);

/** Minimum form age enforced by the server (T075): helpers wait this long after page load. */
export const MIN_FORM_AGE_MS = 3500;

/** Test ids the sign-in screen exposes; helpers click them. */
export const SIGN_IN_TESTIDS = {
  google: 'admin-sign-in-google',
} as const;

/** postgres.js client on the e2e database, for spec-local queries. */
export const sql = postgres(E2E_DATABASE_URL, { max: 4, onnotice: () => undefined });

// ---------------------------------------------------------------- mock Google

/** Sets who the mock OIDC issuer signs in next (re-read on every token request). */
export async function setMockGoogleUser(
  email: string,
  { sub, email_verified = true }: { sub?: string; email_verified?: boolean } = {},
): Promise<void> {
  await mkdir(dirname(OIDC_USER_PATH), { recursive: true });
  await writeFile(
    OIDC_USER_PATH,
    JSON.stringify({ email, sub: sub ?? `google-sub-${email}`, email_verified }, null, 2),
  );
}

// ---------------------------------------------------------------- admin sign-in

export type AdminKeyName = 'a' | 'b' | 'c';

/** Waits until the page is at least `minMs` old, so the minimum-form-age check passes. */
export async function waitForFormAge(page: Page, minMs: number = MIN_FORM_AGE_MS): Promise<void> {
  const age = await page.evaluate(() => Date.now() - performance.timeOrigin);
  if (age < minMs) await page.waitForTimeout(minMs - age);
}

/**
 * Signs in as a seeded admin through the real flow: sign-in page, then the mock Google. Upserts
 * `admin-<key>@example.test` with role `admin` and `google_sub` already bound, and returns the
 * admin id.
 */
export async function signInAsAdmin(
  page: Page,
  {
    key = 'a',
    displayName,
    fromCurrentPage = false,
  }: { key?: AdminKeyName; displayName?: string; fromCurrentPage?: boolean } = {},
): Promise<string> {
  const email = `admin-${key}@example.test`;
  const googleSub = `google-sub-admin-${key}`;
  const name = displayName ?? `Admin ${key.toUpperCase()}`;

  const [admin] = await sql<{ id: string }[]>`
    INSERT INTO admin_user (id, display_name, google_email, google_sub, role)
    VALUES (gen_random_uuid(), ${name}, ${email}, ${googleSub}, 'admin')
    ON CONFLICT (google_email)
    DO UPDATE SET display_name = EXCLUDED.display_name, google_sub = EXCLUDED.google_sub,
                  role = 'admin'
    RETURNING id`;
  if (!admin) throw new Error('Could not upsert admin_user');
  await setMockGoogleUser(email, { sub: googleSub, email_verified: true });

  if (!fromCurrentPage) await page.goto('/admin/sign-in');
  await waitForFormAge(page);
  await page.getByTestId(SIGN_IN_TESTIDS.google).click();

  // The mock issuer redirects straight back: one step, then the admin home (or the `next` page).
  await page.waitForURL(
    (url) => /^\/admin(\/|$)/.test(url.pathname) && !/\/sign-in/.test(url.pathname),
    {
      timeout: 30_000,
    },
  );
  return admin.id;
}

// ---------------------------------------------------------------- DB helpers

export interface OutboxRow {
  id: string;
  kind: string;
  to_address: string;
  locale: string;
  subject: string;
  reply_to: string | null;
  html: string;
  text_body: string;
  order_id: string | null;
  dedupe_key: string;
  status: string;
  attempts: number;
  sent_at: Date | null;
}

/** Rows of email_outbox of one kind, oldest first (bodies are kept in non-production, T026). */
export async function readOutbox(kind: string): Promise<OutboxRow[]> {
  return sql<OutboxRow[]>`
    SELECT * FROM email_outbox WHERE kind = ${kind} ORDER BY next_attempt_at, id`;
}

/**
 * Brings the e2e database back to its seeded state: truncates every application table except
 * job_run, restarts order_number_seq at 1001, empties storage/ and fake-pay/ under the e2e data
 * dir, then re-runs `pnpm db:seed` (settings, Israel zone, content pages, and sample products
 * unless `samples` is false).
 */
export async function resetDb({ samples = true }: { samples?: boolean } = {}): Promise<void> {
  assertE2eDatabase();
  const tables = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'job_run'`;
  if (tables.length > 0) {
    const list = tables.map((row) => `"public"."${row.tablename}"`).join(', ');
    await sql.unsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  }
  const [seq] = await sql<{ exists: boolean }[]>`
    SELECT to_regclass('public.order_number_seq') IS NOT NULL AS exists`;
  if (seq?.exists) await sql.unsafe('ALTER SEQUENCE order_number_seq RESTART WITH 1001');

  const dataDir = resolve(repoRoot, LOCAL_DATA_DIR);
  for (const folder of ['storage', 'fake-pay']) {
    await rm(resolve(dataDir, folder), { recursive: true, force: true });
    await mkdir(resolve(dataDir, folder), { recursive: true });
  }

  execFileSync('pnpm', ['db:seed', ...(samples ? [] : ['--no-samples'])], {
    cwd: repoRoot,
    env: { ...process.env, ...serverEnv() },
    stdio: 'inherit',
  });
}

// ---------------------------------------------------------------- test fixture

/** `test` with an auto-used beforeEach that clears throttles so specs never block each other. */
export const test = base.extend<{ clearThrottles: undefined }>({
  clearThrottles: [
    async ({}, use) => {
      await sql`TRUNCATE rate_limit_bucket, notification_throttle`;
      await use(undefined);
    },
    { auto: true },
  ],
});

export { expect };
