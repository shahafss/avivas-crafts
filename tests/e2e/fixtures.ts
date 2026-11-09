// Shared E2E helpers. Specs import { test, expect } from here, call resetDb() in
// test.beforeAll and create the data they need themselves (isolation rule, tasks.md T005).
// DB helpers use postgres.js tagged templates on table names directly (not the app schema), so
// this file typechecks before the schema exists.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test as base, type CDPSession, type Page } from '@playwright/test';
import postgres from 'postgres';
import { assertE2eDatabase, E2E_DATABASE_URL, LOCAL_DATA_DIR, serverEnv } from './env';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const OIDC_USER_FILE = resolve(repoRoot, 'tests/fixtures/oidc/user.json');
const ADMIN_KEYS_FILE = resolve(repoRoot, 'tests/fixtures/webauthn/admin-keys.json');

/** Minimum form age enforced by the server (T075): helpers wait this long after page load. */
export const MIN_FORM_AGE_MS = 3500;

/** Test ids the sign-in screens must expose (built in T042); helpers click them. */
export const SIGN_IN_TESTIDS = {
  google: 'admin-sign-in-google',
  passkey: 'admin-sign-in-passkey',
} as const;

/** postgres.js client on the e2e database, for spec-local queries. */
export const sql = postgres(E2E_DATABASE_URL, { max: 4, onnotice: () => undefined });

// ---------------------------------------------------------------- WebAuthn

interface VirtualAuthenticator {
  cdp: CDPSession;
  authenticatorId: string;
}

const authenticators = new WeakMap<Page, VirtualAuthenticator>();
/** Credential ids already added to a page's authenticator (addCredential errors on repeats). */
const addedCredentials = new WeakMap<Page, Set<string>>();

/** Enables a CTAP2 virtual authenticator (UV succeeds, resident keys) on the page. Chromium only. */
export async function addVirtualAuthenticator(page: Page): Promise<VirtualAuthenticator> {
  const existing = authenticators.get(page);
  if (existing) return existing;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const created = { cdp, authenticatorId };
  authenticators.set(page, created);
  return created;
}

// ---------------------------------------------------------------- mock Google

/** Sets who the mock OIDC issuer signs in next (re-read on every token request). */
export async function setMockGoogleUser(
  email: string,
  { sub, email_verified = true }: { sub?: string; email_verified?: boolean } = {},
): Promise<void> {
  await mkdir(dirname(OIDC_USER_FILE), { recursive: true });
  await writeFile(
    OIDC_USER_FILE,
    JSON.stringify({ email, sub: sub ?? `google-sub-${email}`, email_verified }, null, 2),
  );
}

// ---------------------------------------------------------------- admin sign-in

interface AdminKey {
  privateKeyPkcs8: string;
  publicKeyCose: string;
  credentialId: string;
  userHandle: string;
}

export type AdminKeyName = 'a' | 'b' | 'c';

async function loadAdminKey(key: AdminKeyName): Promise<AdminKey> {
  const all = JSON.parse(await readFile(ADMIN_KEYS_FILE, 'utf8')) as Record<string, AdminKey>;
  const entry = all[key];
  if (!entry) throw new Error(`No admin key "${key}" in admin-keys.json`);
  return entry;
}

/** Waits until the page is at least `minMs` old, so the minimum-form-age check passes. */
export async function waitForFormAge(page: Page, minMs: number = MIN_FORM_AGE_MS): Promise<void> {
  const age = await page.evaluate(() => Date.now() - performance.timeOrigin);
  if (age < minMs) await page.waitForTimeout(minMs - age);
}

/**
 * Signs in as a seeded admin through the real flow: sign-in page, mock Google, passkey step.
 * Upserts admin `admin-<key>@example.test` (google_sub already bound) with one active passkey
 * taken from the fixed key pair, adds that credential to the page's virtual authenticator and
 * returns the admin id. Usable once T042 exists; T047 is its first user.
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
  const keys = await loadAdminKey(key);
  const credentialId = Buffer.from(keys.credentialId, 'base64');
  const publicKey = Buffer.from(keys.publicKeyCose, 'base64');

  const [admin] = await sql<{ id: string }[]>`
    INSERT INTO admin_user (id, display_name, google_email, google_sub)
    VALUES (gen_random_uuid(), ${name}, ${email}, ${googleSub})
    ON CONFLICT (google_email)
    DO UPDATE SET display_name = EXCLUDED.display_name, google_sub = EXCLUDED.google_sub
    RETURNING id`;
  if (!admin) throw new Error('Could not upsert admin_user');

  await sql`
    INSERT INTO admin_passkey
      (id, admin_id, credential_id, public_key, counter, transports, backed_up, device_label,
       status, registered_via)
    VALUES
      (gen_random_uuid(), ${admin.id}, ${credentialId}, ${publicKey}, 0, ${['internal']},
       false, 'Test key', 'active', 'setup')
    ON CONFLICT (credential_id)
    DO UPDATE SET admin_id = EXCLUDED.admin_id, public_key = EXCLUDED.public_key,
                  counter = 0, status = 'active'`;

  const { cdp, authenticatorId } = await addVirtualAuthenticator(page);
  const added = addedCredentials.get(page) ?? new Set<string>();
  addedCredentials.set(page, added);
  if (!added.has(keys.credentialId)) {
    await cdp.send('WebAuthn.addCredential', {
      authenticatorId,
      credential: {
        credentialId: keys.credentialId,
        isResidentCredential: true,
        rpId: 'localhost',
        privateKey: keys.privateKeyPkcs8,
        userHandle: keys.userHandle,
        signCount: 0,
      },
    });
    added.add(keys.credentialId);
  }
  await setMockGoogleUser(email, { sub: googleSub, email_verified: true });

  if (!fromCurrentPage) await page.goto('/admin/sign-in');
  await waitForFormAge(page);
  await page.getByTestId(SIGN_IN_TESTIDS.google).click();

  // The mock issuer redirects straight back; the passkey step may need a click.
  const passkeyButton = page.getByTestId(SIGN_IN_TESTIDS.passkey);
  await passkeyButton.click({ timeout: 10_000 }).catch(() => undefined);
  await page.waitForURL(
    (url) => /^\/admin(\/|$)/.test(url.pathname) && !/\/(sign-in|setup)/.test(url.pathname),
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
      await sql`UPDATE admin_user SET passkey_fail_count = 0, passkey_blocked_until = NULL`;
      await use(undefined);
    },
    { auto: true },
  ],
});

export { expect };
