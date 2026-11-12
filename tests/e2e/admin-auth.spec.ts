import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { serverEnv } from './env';
import { expect, resetDb, setMockGoogleUser, SIGN_IN_TESTIDS, sql, test } from './fixtures';

// The admin sign-in: one Google step, then the admin home; the refusals and sign-out. The steps
// share one database and build on each other, so they run in order.
test.describe.configure({ mode: 'serial' });

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const he = JSON.parse(readFileSync(resolve(repoRoot, 'src/i18n/messages/he.json'), 'utf8')) as {
  admin: { auth: { signIn: { errors: Record<string, string> } } };
};

const AVIVA = { email: 'aviva@example.test', sub: 'sub-aviva', name: 'אביבה' };

/** Runs `pnpm admin:role` like the owner would. */
function adminRole(email: string, role: 'admin' | 'user', name?: string): string {
  return execFileSync('pnpm', ['admin:role', email, role, ...(name === undefined ? [] : [name])], {
    cwd: repoRoot,
    env: { ...process.env, ...serverEnv() },
    encoding: 'utf8',
  });
}

async function count(query: Promise<{ n: string }[]>): Promise<number> {
  return Number((await query)[0]?.n ?? 0);
}

const activityCount = (action: string) =>
  count(sql<{ n: string }[]>`SELECT count(*) AS n FROM admin_activity WHERE action = ${action}`);

/** The one Google step: sign-in page, then the mock issuer answers straight away. */
async function signInWithGoogle(
  page: Page,
  user: { email: string; sub: string },
  from = '/admin/sign-in',
): Promise<void> {
  await page.context().clearCookies();
  await setMockGoogleUser(user.email, { sub: user.sub });
  await page.goto(from);
  await page.getByTestId(SIGN_IN_TESTIDS.google).click();
}

test.beforeAll(async () => {
  await resetDb();
});

test('an admin signs in with Google alone, lands on the admin home, signs out and in again', async ({
  page,
}) => {
  adminRole(AVIVA.email, 'admin', AVIVA.name);
  await signInWithGoogle(page, AVIVA);
  await page.waitForURL((url) => url.pathname === '/admin');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const cookie = (await page.context().cookies()).find((c) => c.name === '__Host-ac_admin');
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/' });
  expect(await activityCount('signin.success')).toBe(1);

  await page.getByTestId('admin-sign-out').click();
  await page.waitForURL('**/admin/sign-in');
  expect(await activityCount('session.signed_out')).toBe(1);
  await page.goto('/admin');
  await page.waitForURL(
    (url) => url.pathname === '/admin/sign-in' && url.searchParams.get('next') === '/admin',
  );

  await signInWithGoogle(page, AVIVA);
  await page.waitForURL((url) => url.pathname === '/admin');
  expect(await activityCount('signin.success')).toBe(2);
});

test('a different Google account is refused with a Hebrew message', async ({ page }) => {
  await signInWithGoogle(page, { email: 'stranger@example.test', sub: 'sub-stranger' });
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

test('a user whose role is user is refused the same way, without a session', async ({ page }) => {
  adminRole(AVIVA.email, 'user');
  try {
    await signInWithGoogle(page, AVIVA);
    await page.waitForURL('**/admin/sign-in?e=not_allowed');
    await expect(page.locator('#sign-in-error')).toBeVisible();
    expect(await count(sql<{ n: string }[]>`SELECT count(*) AS n FROM admin_session`)).toBe(0);
  } finally {
    adminRole(AVIVA.email, 'admin');
  }
});

test('after signing in the admin lands on the page asked for in `next`', async ({ page }) => {
  await signInWithGoogle(page, AVIVA, '/admin/sign-in?next=/admin/orders');
  await page.waitForURL((url) => url.pathname === '/admin/orders');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the sign-in page has no axe violations', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/admin/sign-in');
  await expect(page.getByTestId(SIGN_IN_TESTIDS.google)).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('the removed passkey, recovery, setup and reauth addresses answer 404', async ({ page }) => {
  // Signed out, an unknown admin address goes to sign-in like every other one; signed in it is a 404.
  for (const path of ['/admin/setup', '/admin/sign-in/passkey', '/admin/sign-in/recovery']) {
    await page.goto(path);
    await expect(page, path).toHaveURL((url) => url.pathname === '/admin/sign-in');
  }
  await signInWithGoogle(page, AVIVA);
  await page.waitForURL((url) => url.pathname === '/admin');
  for (const path of ['/admin/setup', '/admin/sign-in/passkey', '/admin/sign-in/recovery']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
  for (const path of [
    '/api/auth/recovery',
    '/api/auth/passkey/options',
    '/api/auth/reauth/options',
    '/api/auth/reauth/verify',
    '/api/auth/passkey/verify',
    '/api/auth/passkey/register/options',
    '/api/auth/passkey/register/verify',
    '/api/test/advance-sessions',
  ]) {
    for (const method of ['get', 'post'] as const) {
      const response = await page.request[method](path, { maxRedirects: 0 });
      expect(response.status(), `${method} ${path}`).toBe(404);
    }
  }
});
