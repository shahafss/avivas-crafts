import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page } from '@playwright/test';
import { serverEnv } from './env';
import {
  addVirtualAuthenticator,
  expect,
  readOutbox,
  resetDb,
  setMockGoogleUser,
  SIGN_IN_TESTIDS,
  sql,
  test,
} from './fixtures';

// The whole admin sign-in: setup link -> Google -> passkey -> recovery codes -> dashboard, the
// refusals, the 5-failure block, abandoned second steps and hardened recovery. The steps share
// one database and build on each other, so they run in order.
test.describe.configure({ mode: 'serial' });

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const he = JSON.parse(readFileSync(resolve(repoRoot, 'src/i18n/messages/he.json'), 'utf8')) as {
  admin: { auth: { signIn: { errors: Record<string, string> } } };
};

const AVIVA = { email: 'aviva@example.test', sub: 'sub-aviva', name: 'אביבה' };
const DANA = { email: 'dana@example.test', sub: 'sub-dana', name: 'דנה' };

let avivaCodes: string[] = [];

/** Runs `pnpm admin:add` like the maintainer would and returns the printed setup link. */
function adminAdd(email: string, name: string): string {
  const output = execFileSync('pnpm', ['admin:add', email, name], {
    cwd: repoRoot,
    env: { ...process.env, ...serverEnv() },
    encoding: 'utf8',
  });
  const link = /(https?:\/\/\S+\/admin\/setup#t=\S+)/.exec(output)?.[1];
  if (!link) throw new Error(`No setup link in the output of admin:add:\n${output}`);
  return link;
}

async function count(query: Promise<{ n: string }[]>): Promise<number> {
  return Number((await query)[0]?.n ?? 0);
}

const activityCount = (action?: string) =>
  count(
    action === undefined
      ? sql<{ n: string }[]>`SELECT count(*) AS n FROM admin_activity`
      : sql<{ n: string }[]>`SELECT count(*) AS n FROM admin_activity WHERE action = ${action}`,
  );
const outboxCount = (dedupePrefix?: string) =>
  count(
    dedupePrefix === undefined
      ? sql<{ n: string }[]>`SELECT count(*) AS n FROM email_outbox`
      : sql<
          { n: string }[]
        >`SELECT count(*) AS n FROM email_outbox WHERE dedupe_key LIKE ${`${dedupePrefix}%`}`,
  );

/** Google step for an approved account: stops on the page the callback leads to. */
async function googleStep(
  page: Page,
  user: { email: string; sub: string },
  buttonTestId: string,
): Promise<void> {
  await setMockGoogleUser(user.email, { sub: user.sub });
  await page.getByTestId(buttonTestId).click();
}

async function signInToPasskeyPage(
  page: Page,
  user: { email: string; sub: string },
): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/admin/sign-in');
  await googleStep(page, user, SIGN_IN_TESTIDS.google);
  await page.waitForURL('**/admin/sign-in/passkey');
}

async function newContext(
  browser: import('@playwright/test').Browser,
  use: Record<string, unknown>,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(use);
  const page = await context.newPage();
  await addVirtualAuthenticator(page);
  return { context, page };
}

const INVALID_ASSERTION = {
  id: 'AAAAAAAAAAAAAAAAAAAAAA',
  rawId: 'AAAAAAAAAAAAAAAAAAAAAA',
  type: 'public-key',
  response: { clientDataJSON: 'AAAA', authenticatorData: 'AAAA', signature: 'AAAA' },
  clientExtensionResults: {},
};

test.beforeAll(async () => {
  await resetDb();
});

test('setup link, Google, passkey, recovery codes, dashboard; sign out; sign in again', async ({
  page,
}) => {
  await addVirtualAuthenticator(page);
  const link = adminAdd(AVIVA.email, AVIVA.name);

  await page.goto(link);
  // The token left the address bar at once: it was never part of a URL the server saw.
  await expect(page.getByTestId('admin-setup-google')).toBeVisible();
  await expect.poll(() => page.url()).not.toContain('t=');
  await googleStep(page, AVIVA, 'admin-setup-google');

  // The callback's same-site page lands on the setup page with a pending session.
  await page.waitForURL('**/admin/setup');
  await page.getByTestId('admin-setup-device-label').fill('הטלפון של אביבה');
  await page.getByTestId('admin-setup-register').click();

  const codes = page.getByTestId('admin-setup-codes').locator('li');
  await expect(codes).toHaveCount(10);
  avivaCodes = (await codes.allTextContents()).map((text) => text.replaceAll('-', ''));
  for (const code of avivaCodes) expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
  await page.getByTestId('admin-setup-saved').click();
  await page.waitForURL((url) => url.pathname === '/admin');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const cookie = (await page.context().cookies()).find((c) => c.name === '__Host-ac_admin');
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/' });
  expect(await activityCount('passkey.added')).toBe(1);

  // Sign out, then sign in again with Google + passkey.
  await page.getByTestId('admin-sign-out').click();
  await page.waitForURL('**/admin/sign-in');
  await page.goto('/admin');
  await page.waitForURL(
    (url) => url.pathname === '/admin/sign-in' && url.searchParams.get('next') === '/admin',
  );

  await page.goto('/admin/sign-in');
  await googleStep(page, AVIVA, SIGN_IN_TESTIDS.google);
  await page.waitForURL('**/admin/sign-in/passkey');
  await page.getByTestId(SIGN_IN_TESTIDS.passkey).click();
  await page.waitForURL((url) => url.pathname === '/admin');
  expect(await activityCount('signin.success')).toBe(1);
});

test('a different Google account is refused with a Hebrew message', async ({ page }) => {
  await page.goto('/admin/sign-in');
  await googleStep(
    page,
    { email: 'stranger@example.test', sub: 'sub-stranger' },
    SIGN_IN_TESTIDS.google,
  );
  await page.waitForURL('**/admin/sign-in?e=not_allowed');
  await expect(page.locator('#sign-in-error')).toContainText(
    he.admin.auth.signIn.errors.not_allowed ?? '',
  );
  expect(await activityCount('signin.google_rejected')).toBe(1);
  const rejected = await sql<
    { actor_kind: string; actor_label: string | null; details: unknown }[]
  >`
    SELECT actor_kind, actor_label, details FROM admin_activity WHERE action = 'signin.google_rejected'`;
  expect(rejected[0]?.actor_kind).toBe('unapproved_account');
  expect(JSON.stringify(rejected)).not.toContain('stranger');
});

test('5 invalid assertions block the admin, with a message and a security alert', async ({
  page,
}, testInfo) => {
  await signInToPasskeyPage(page, AVIVA);
  const origin = new URL(testInfo.project.use.baseURL ?? 'http://localhost:3100').origin;
  const headers = { Origin: origin };

  const alertsBefore = (await readOutbox('security-alert')).filter((row) =>
    row.dedupe_key.startsWith('security:blocked:'),
  ).length;
  let last: { error?: string } = {};
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const options = await page.request.post('/api/auth/passkey/options', { headers });
    expect(options.status()).toBe(200);
    const verify = await page.request.post('/api/auth/passkey/verify', {
      headers,
      data: INVALID_ASSERTION,
    });
    expect(verify.status()).toBe(401);
    last = (await verify.json()) as { error?: string };
    if (attempt < 5) expect(last.error).toBe('passkey_failed');
  }
  expect(last.error).toBe('blocked');
  expect(await activityCount('signin.blocked')).toBe(1);

  // The next sign-in shows the block instead of the passkey button.
  await signInToPasskeyPage(page, AVIVA);
  await expect(page.getByTestId('admin-blocked')).toBeVisible();
  await expect(page.getByTestId(SIGN_IN_TESTIDS.passkey)).toHaveCount(0);

  const alerts = (await readOutbox('security-alert')).filter((row) =>
    row.dedupe_key.startsWith('security:blocked:'),
  );
  expect(alerts.length).toBeGreaterThan(alertsBefore);
});

test('an abandoned pending session is counted and alerted', async ({ page }, testInfo) => {
  // Start clean: nothing left over from the previous steps.
  await sql`UPDATE admin_session SET abandon_processed_at = now() WHERE stage = 'pending_passkey'`;
  await sql`UPDATE admin_user SET passkey_fail_count = 0, passkey_blocked_until = NULL`;
  const abandonedBefore = await activityCount('signin.passkey_abandoned');
  const alertsBefore = await outboxCount('security:passkey_abandoned:');

  await signInToPasskeyPage(page, AVIVA);
  const advanced = await page.request.post('/api/test/advance-sessions', {
    headers: { Origin: new URL(testInfo.project.use.baseURL ?? 'http://localhost:3100').origin },
  });
  expect(advanced.status()).toBe(200);

  expect(await activityCount('signin.passkey_abandoned')).toBe(abandonedBefore + 1);
  expect(await outboxCount('security:passkey_abandoned:')).toBeGreaterThan(alertsBefore);
});

test('as the sole admin, recovery explains the refusal and the button records it once', async ({
  page,
}, testInfo) => {
  await sql`UPDATE admin_session SET abandon_processed_at = now() WHERE stage = 'pending_passkey'`;
  await signInToPasskeyPage(page, AVIVA);
  await page.getByRole('link', { name: /איבדתי את מפתח הגישה/ }).click();
  await page.waitForURL('**/admin/sign-in/recovery');
  await expect(page.getByTestId('admin-recovery-needs-other')).toContainText('אדמין נוסף');

  // Loading the page wrote nothing.
  const activityBefore = await activityCount();
  const outboxBefore = await outboxCount();
  await page.reload();
  await expect(page.getByTestId('admin-recovery-needs-other')).toBeVisible();
  expect(await activityCount()).toBe(activityBefore);
  expect(await outboxCount()).toBe(outboxBefore);

  await page.getByTestId('admin-recovery-end').click();
  await page.waitForURL('**/admin/sign-in');
  expect(await activityCount('recovery.refused')).toBe(1);
  expect(await outboxCount('security:recovery_refused:')).toBe(1);
  expect(
    await count(
      sql<{ n: string }[]>`SELECT count(*) AS n FROM admin_recovery_code WHERE used_at IS NOT NULL`,
    ),
  ).toBe(0);

  // The refusal is not an abandoned sign-in.
  const abandonedBefore = await activityCount('signin.passkey_abandoned');
  const abandonedAlertsBefore = await outboxCount('security:passkey_abandoned:');
  const advanced = await page.request.post('/api/test/advance-sessions', {
    headers: { Origin: new URL(testInfo.project.use.baseURL ?? 'http://localhost:3100').origin },
  });
  expect(advanced.status()).toBe(200);
  expect(await activityCount('signin.passkey_abandoned')).toBe(abandonedBefore);
  expect(await outboxCount('security:passkey_abandoned:')).toBe(abandonedAlertsBefore);
});

test('with a second admin, a recovery code registers a passkey that waits for approval', async ({
  browser,
}, testInfo) => {
  // The second admin sets up in their own browser context.
  const second = await newContext(browser, testInfo.project.use);
  await second.page.goto(adminAdd(DANA.email, DANA.name));
  await googleStep(second.page, DANA, 'admin-setup-google');
  await second.page.waitForURL('**/admin/setup');
  await second.page.getByTestId('admin-setup-device-label').fill('הטלפון של דנה');
  await second.page.getByTestId('admin-setup-register').click();
  await expect(second.page.getByTestId('admin-setup-codes').locator('li')).toHaveCount(10);
  await second.page.getByTestId('admin-setup-saved').click();
  await second.page.waitForURL((url) => url.pathname === '/admin');
  await second.context.close();

  // Aviva lost her phone: a fresh browser without her passkey.
  const recoveryStartedAt = new Date(Date.now() - 1000);
  const lost = await newContext(browser, testInfo.project.use);
  await lost.page.goto('/admin/sign-in');
  await googleStep(lost.page, AVIVA, SIGN_IN_TESTIDS.google);
  await lost.page.waitForURL('**/admin/sign-in/passkey');
  await lost.page.getByRole('link', { name: /איבדתי את מפתח הגישה/ }).click();
  await lost.page.waitForURL('**/admin/sign-in/recovery');
  await expect(lost.page.getByTestId('admin-recovery-needs-other')).toHaveCount(0);

  const code = avivaCodes[0] ?? '';
  await lost.page.getByTestId('admin-recovery-code').fill(code.toLowerCase());
  await lost.page.getByTestId('admin-recovery-submit').click();
  await lost.page.getByTestId('admin-recovery-device-label').fill('טלפון חדש');
  await lost.page.getByTestId('admin-recovery-register').click();
  await expect(lost.page.getByTestId('admin-recovery-waiting')).toBeVisible();

  const passkeys = await sql<{ status: string; registered_via: string }[]>`
    SELECT status, registered_via FROM admin_passkey p JOIN admin_user a ON a.id = p.admin_id
    WHERE a.google_email = ${AVIVA.email} AND p.registered_via = 'recovery'`;
  expect(passkeys).toEqual([{ status: 'pending_approval', registered_via: 'recovery' }]);
  expect(await activityCount('recovery.used')).toBe(1);
  expect(await outboxCount('security:recovery_pending:')).toBeGreaterThan(0);
  const fullForAviva = await sql<{ n: string }[]>`
    SELECT count(*) AS n FROM admin_session s JOIN admin_user a ON a.id = s.admin_id
    WHERE a.google_email = ${AVIVA.email} AND s.stage = 'full' AND s.created_at > ${recoveryStartedAt}`;
  expect(Number(fullForAviva[0]?.n)).toBe(0);

  // Signing in with the new passkey is refused: it is not offered, so the browser cannot answer.
  await lost.page.context().clearCookies();
  await lost.page.goto('/admin/sign-in');
  await googleStep(lost.page, AVIVA, SIGN_IN_TESTIDS.google);
  await lost.page.waitForURL('**/admin/sign-in/passkey');
  await lost.page.getByTestId(SIGN_IN_TESTIDS.passkey).click();
  await expect(lost.page.locator('[role=alert]:not(#__next-route-announcer__)')).toBeVisible();
  expect(new URL(lost.page.url()).pathname).toBe('/admin/sign-in/passkey');
  await lost.context.close();
});
