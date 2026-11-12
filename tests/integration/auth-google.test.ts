import { eq } from 'drizzle-orm';
import { Events, OAuth2Server, type MutableToken } from 'oauth2-mock-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { setCookieCalls, setRequestHeader } from '../setup/next-mocks';
import {
  adminActivity,
  adminSession,
  adminUser,
  emailOutbox,
  oauthFlow,
  shopSettings,
} from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { OAUTH_COOKIE, completeGoogleFlow, startGoogleFlow } from '@/server/auth/google';
import { POST as startRoute } from '@/app/api/auth/google/start/route';

let testDb: TestDbHandle;
let mock: OAuth2Server;

const state = vi.hoisted(() => ({
  issuer: '',
  user: { email: 'aviva@example.test', sub: 'sub-aviva', email_verified: true },
}));

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
vi.mock('@/server/email/sender', () => ({ kickOutbox: vi.fn() }));
vi.mock('@/server/env', () => ({
  getEnv: () => ({
    APP_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3100',
    OIDC_ISSUER: state.issuer,
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    SECRET_HMAC_KEY: Buffer.from('google-test-hmac-key-0123456789abcdef').toString('base64'),
    TRUSTED_PROXY_HOPS: 1,
  }),
}));

beforeAll(async () => {
  testDb = await createTestDb();
  mock = new OAuth2Server();
  await mock.issuer.keys.generate('RS256');
  mock.service.on(Events.BeforeTokenSigning, (token: MutableToken) => {
    token.payload.email = state.user.email;
    token.payload.sub = state.user.sub;
    token.payload.email_verified = state.user.email_verified;
  });
  await mock.start(0, 'localhost');
  state.issuer = mock.issuer.url ?? '';
});
afterAll(async () => {
  await mock.stop();
  await testDb.close();
});
beforeEach(async () => {
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
  await testDb.db.update(shopSettings).set({ notificationEmails: ['owner@example.test'] });
  await testDb.db
    .insert(adminUser)
    .values({ displayName: 'Aviva', googleEmail: 'aviva@example.test', role: 'admin' });
  state.user = { email: 'aviva@example.test', sub: 'sub-aviva', email_verified: true };
  setRequestHeader('x-forwarded-for', '203.0.113.7');
  setRequestHeader(
    'user-agent',
    'Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36',
  );
});

const flows = () => testDb.db.select().from(oauthFlow);
const activity = () => testDb.db.select().from(adminActivity);
const sessions = () => testDb.db.select().from(adminSession);

/** Starts the flow, plays the browser's visit to the mock issuer and returns the callback URL. */
async function startAndAuthorize(next?: string) {
  setCookieCalls.length = 0;
  const started = await startGoogleFlow(next);
  if (!started.ok) throw new Error(`start failed: ${started.error}`);
  const cookie = setCookieCalls.find((call) => call.name === OAUTH_COOKIE);
  const response = await fetch(started.url, { redirect: 'manual' });
  const location = response.headers.get('location');
  if (location === null) throw new Error(`issuer did not redirect (${String(response.status)})`);
  return {
    authorizeUrl: new URL(started.url),
    callbackUrl: new URL(location),
    cookie: cookie?.value,
    cookieOptions: cookie?.options,
  };
}

describe('startGoogleFlow', () => {
  it('builds a PKCE S256 authorisation URL with state, nonce, minimal scope and select_account', async () => {
    const { authorizeUrl, cookie, cookieOptions } = await startAndAuthorize();
    const q = authorizeUrl.searchParams;
    expect(authorizeUrl.origin).toBe(state.issuer);
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.get('nonce')).toBeTruthy();
    expect(q.get('scope')).toBe('openid email');
    expect(q.get('prompt')).toBe('select_account');
    expect(q.get('response_type')).toBe('code');
    expect(q.get('redirect_uri')).toBe('http://localhost:3100/api/auth/google/callback');
    expect(cookie).toBe(q.get('state'));
    expect(cookieOptions).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(cookieOptions).not.toHaveProperty('domain');
    const [flow] = await flows();
    expect(flow?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
    expect(flow?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60_000 + 1000);
    // Only the hash of the state is stored.
    expect(Buffer.from(flow?.stateHash ?? []).toString('utf8')).not.toContain(
      q.get('state') ?? 'x',
    );
  });

  it('stores a valid next path on the flow and drops invalid ones', async () => {
    await startAndAuthorize('/admin/orders/abc-123');
    expect((await flows())[0]?.nextPath).toBe('/admin/orders/abc-123');
    for (const bad of ['//evil.test', 'https://evil.test', '/admin/sign-in', '/he/cart']) {
      await testDb.db.delete(oauthFlow);
      await startAndAuthorize(bad);
      expect((await flows())[0]?.nextPath, bad).toBeNull();
    }
  });

  it('rate limits the 11th start within 15 minutes from one IP', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await startGoogleFlow()).ok).toBe(true);
    }
    const eleventh = await startGoogleFlow();
    expect(eleventh).toMatchObject({ ok: false, error: 'rate_limited' });
    setRequestHeader('x-forwarded-for', '203.0.113.99');
    expect((await startGoogleFlow()).ok).toBe(true);
  });
});

describe('completeGoogleFlow', () => {
  it('signs an admin in: a session without any stage, signin.success, google_sub bound, home page', async () => {
    const { callbackUrl, cookie } = await startAndAuthorize();
    const result = await completeGoogleFlow(callbackUrl, cookie);
    expect(result).toMatchObject({ ok: true, redirectTo: '/admin' });
    if (!result.ok) throw new Error('expected success');
    expect(result.token).toBeTruthy();
    const [session] = await sessions();
    expect(session).toBeDefined();
    expect(session).not.toHaveProperty('stage');
    expect(session?.userAgentSummary).toBe('Android · Chrome');
    const [admin] = await testDb.db.select().from(adminUser);
    expect(session?.adminId).toBe(admin?.id);
    expect(admin?.googleSub).toBe('sub-aviva');
    expect(await flows()).toHaveLength(0);
    const success = (await activity()).filter((row) => row.action === 'signin.success');
    expect(success).toHaveLength(1);
    expect(success[0]).toMatchObject({ adminId: admin?.id, actorKind: 'admin' });
    expect(JSON.stringify(await activity())).not.toContain('aviva@example.test');
  });

  it('redirects to a valid next path, otherwise to /admin', async () => {
    const withNext = await startAndAuthorize('/admin/orders');
    expect(await completeGoogleFlow(withNext.callbackUrl, withNext.cookie)).toMatchObject({
      ok: true,
      redirectTo: '/admin/orders',
    });
    await testDb.db.delete(oauthFlow);
    const without = await startAndAuthorize();
    expect(await completeGoogleFlow(without.callbackUrl, without.cookie)).toMatchObject({
      ok: true,
      redirectTo: '/admin',
    });
  });

  it('refuses a user whose role is user: generic refusal, no session, rejection logged and alerted', async () => {
    await testDb.db.update(adminUser).set({ role: 'user' });
    const { callbackUrl, cookie } = await startAndAuthorize();
    expect(await completeGoogleFlow(callbackUrl, cookie)).toMatchObject({
      ok: false,
      error: 'not_allowed',
    });
    expect(await sessions()).toHaveLength(0);
    const rows = await activity();
    expect(rows.map((row) => row.action)).toEqual(['signin.google_rejected']);
    expect(rows[0]).toMatchObject({ adminId: null, actorKind: 'unapproved_account' });
    // Alerts go to users with role admin (none left here) and the notification address.
    expect(
      await testDb.db.select().from(emailOutbox).where(eq(emailOutbox.kind, 'security-alert')),
    ).toHaveLength(1);
  });

  it('uses the state once and only with the cookie it was started with', async () => {
    const { callbackUrl, cookie } = await startAndAuthorize();
    expect(await completeGoogleFlow(callbackUrl, 'a-different-cookie-value')).toMatchObject({
      ok: false,
      error: 'invalid',
    });
    expect(await completeGoogleFlow(callbackUrl, undefined)).toMatchObject({
      ok: false,
      error: 'invalid',
    });
    expect(await sessions()).toHaveLength(0);
    expect((await completeGoogleFlow(callbackUrl, cookie)).ok).toBe(true);
    // Replay of the same callback.
    expect(await completeGoogleFlow(callbackUrl, cookie)).toMatchObject({
      ok: false,
      error: 'invalid',
    });
    expect(await sessions()).toHaveLength(1);
  });

  it('rejects an expired flow', async () => {
    const { callbackUrl, cookie } = await startAndAuthorize();
    await testDb.db.update(oauthFlow).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await completeGoogleFlow(callbackUrl, cookie)).toMatchObject({
      ok: false,
      error: 'expired',
    });
  });

  it('verifies the PKCE verifier and the nonce', async () => {
    let attempt = await startAndAuthorize();
    await testDb.db.update(oauthFlow).set({ codeVerifier: 'A'.repeat(43) });
    expect((await completeGoogleFlow(attempt.callbackUrl, attempt.cookie)).ok).toBe(false);

    await testDb.db.delete(oauthFlow);
    attempt = await startAndAuthorize();
    await testDb.db.update(oauthFlow).set({ nonce: 'a-nonce-the-issuer-never-saw' });
    expect((await completeGoogleFlow(attempt.callbackUrl, attempt.cookie)).ok).toBe(false);
    expect(await sessions()).toHaveLength(0);
  });

  it('rejects email_verified=false', async () => {
    state.user = { email: 'aviva@example.test', sub: 'sub-aviva', email_verified: false };
    const { callbackUrl, cookie } = await startAndAuthorize();
    expect((await completeGoogleFlow(callbackUrl, cookie)).ok).toBe(false);
    expect(await sessions()).toHaveLength(0);
  });

  it('rejects an unknown email: activity without the email and one throttled alert', async () => {
    state.user = { email: 'Stranger@Example.test', sub: 'sub-stranger', email_verified: true };
    const { callbackUrl, cookie } = await startAndAuthorize();
    expect(await completeGoogleFlow(callbackUrl, cookie)).toMatchObject({
      ok: false,
      error: 'not_allowed',
    });

    const rows = await activity();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'signin.google_rejected',
      actorKind: 'unapproved_account',
      adminId: null,
      actorLabel: null,
    });
    expect(JSON.stringify(rows).toLowerCase()).not.toContain('stranger');
    expect(JSON.stringify(rows)).not.toContain('sub-stranger');

    const alerts = await testDb.db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.kind, 'security-alert'));
    expect(alerts).toHaveLength(2); // the admin and the notification address, once
    expect(JSON.stringify(alerts).toLowerCase()).not.toContain('stranger');

    // A second attempt within 15 minutes is logged but sends no further alert.
    const again = await startAndAuthorize();
    await completeGoogleFlow(again.callbackUrl, again.cookie);
    expect(await activity()).toHaveLength(2);
    expect(
      await testDb.db.select().from(emailOutbox).where(eq(emailOutbox.kind, 'security-alert')),
    ).toHaveLength(2);
    expect(await sessions()).toHaveLength(0);
  });

  it('rejects a different Google sub for an email whose sub is already bound', async () => {
    const first = await startAndAuthorize();
    expect((await completeGoogleFlow(first.callbackUrl, first.cookie)).ok).toBe(true);
    await testDb.db.delete(adminSession);

    state.user = { email: 'aviva@example.test', sub: 'sub-someone-else', email_verified: true };
    const second = await startAndAuthorize();
    expect(await completeGoogleFlow(second.callbackUrl, second.cookie)).toMatchObject({
      ok: false,
      error: 'not_allowed',
    });
    expect(await sessions()).toHaveLength(0);
    const rejected = (await activity()).filter((row) => row.action === 'signin.google_rejected');
    expect(rejected).toHaveLength(1);
    const [admin] = await testDb.db.select().from(adminUser);
    expect(admin?.googleSub).toBe('sub-aviva');
  });

  it('rejects a removed admin as not approved', async () => {
    const attempt = await startAndAuthorize();
    await testDb.db.delete(adminUser);
    expect(await completeGoogleFlow(attempt.callbackUrl, attempt.cookie)).toMatchObject({
      ok: false,
      error: 'not_allowed',
    });
    expect((await activity())[0]).toMatchObject({
      action: 'signin.google_rejected',
      actorKind: 'unapproved_account',
    });
  });
});

describe('POST /api/auth/google/start', () => {
  function post(fields: Record<string, string>): Request {
    return new Request('http://localhost:3100/api/auth/google/start', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3100',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(fields),
    });
  }

  it('redirects to the issuer for the sign-in form, with or without a purpose field', async () => {
    const variants: Record<string, string>[] = [
      {},
      { purpose: 'sign_in' },
      { next: '/admin/orders' },
    ];
    for (const fields of variants) {
      const response = await startRoute(post(fields));
      expect(response.status).toBe(303);
      expect(response.headers.get('location')?.startsWith(state.issuer)).toBe(true);
    }
  });

  it('answers 400 to any other purpose and creates no flow', async () => {
    for (const purpose of ['recovery', 'setup', 'anything']) {
      expect((await startRoute(post({ purpose }))).status, purpose).toBe(400);
    }
    expect(await flows()).toHaveLength(0);
  });

  it('sends the 11th start within 15 minutes from one IP back with ?e=rate_limited', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await startRoute(post({}))).status).toBe(303);
    }
    const eleventh = await startRoute(post({}));
    expect(eleventh.status).toBe(303);
    expect(new URL(eleventh.headers.get('location') ?? '').pathname).toBe('/admin/sign-in');
    expect(new URL(eleventh.headers.get('location') ?? '').searchParams.get('e')).toBe(
      'rate_limited',
    );
  });
});
