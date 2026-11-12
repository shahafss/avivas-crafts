import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import {
  adminActivity,
  adminSession,
  adminUser,
  oauthFlow,
  shopSettings,
} from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { SESSION_COOKIE, createSession } from '@/server/auth/session';
import { setCookieCalls } from '../setup/next-mocks';
import { POST as signOut } from '@/app/api/auth/sign-out/route';
import { GET as googleCallback } from '@/app/api/auth/google/callback/route';

let testDb: TestDbHandle;
const env = vi.hoisted(() => {
  const values: Record<string, string> = {
    APP_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3100',
    SECRET_HMAC_KEY: Buffer.from('routes-test-hmac-key-0123456789abcdef').toString('base64'),
  };
  return { values };
});

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
vi.mock('@/server/email/sender', () => ({ kickOutbox: vi.fn() }));
vi.mock('@/server/env', () => ({ getEnv: () => env.values }));

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());

let adminId = '';
beforeEach(async () => {
  env.values.APP_ENV = 'test';
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
  await testDb.db.update(shopSettings).set({ notificationEmails: ['owner@example.test'] });
  const [row] = await testDb.db
    .insert(adminUser)
    .values({ displayName: 'Aviva', googleEmail: 'aviva@example.test', role: 'admin' })
    .returning({ id: adminUser.id });
  adminId = row?.id ?? '';
});

function post(
  token: string,
  body: unknown,
  origin: string | null = 'http://localhost:3100',
): Request {
  return new Request('http://localhost:3100/api/auth/sign-out', {
    method: 'POST',
    headers: {
      ...(origin === null ? {} : { Origin: origin }),
      'Content-Type': 'application/json',
      Cookie: `__Host-ac_admin=${token}`,
    },
    body: JSON.stringify(body),
  });
}

const sessions = () => testDb.db.select().from(adminSession);
const actions = async (action: string) =>
  testDb.db.select().from(adminActivity).where(eq(adminActivity.action, action));

describe('POST /api/auth/sign-out', () => {
  it('ends only this session, logs session.signed_out and clears the cookie', async () => {
    const one = await createSession(adminId);
    await createSession(adminId);
    expect((await signOut(post(one.token, {}))).status).toBe(200);
    expect(await sessions()).toHaveLength(1);
    const signedOut = await actions('session.signed_out');
    expect(signedOut).toHaveLength(1);
    expect(signedOut[0]).toMatchObject({ adminId, details: {} });
    expect(await actions('session.revoked')).toHaveLength(0);
    const cleared = setCookieCalls.find((call) => call.name === SESSION_COOKIE);
    expect(cleared?.value).toBe('');
    expect(cleared?.options).toMatchObject({ maxAge: 0, secure: true, path: '/' });
  });

  it('with all:true ends every session of the admin and logs session.revoked', async () => {
    const [other] = await testDb.db
      .insert(adminUser)
      .values({ displayName: 'Dana', googleEmail: 'dana@example.test', role: 'admin' })
      .returning({ id: adminUser.id });
    const mine = await createSession(adminId);
    await createSession(adminId);
    await createSession(other?.id ?? '');
    await signOut(post(mine.token, { all: true }));
    const left = await sessions();
    expect(left).toHaveLength(1);
    expect(left[0]?.adminId).toBe(other?.id);
    expect(await actions('session.revoked')).toHaveLength(1);
    expect(await actions('session.signed_out')).toHaveLength(0);
  });

  it('refuses a cross-origin or origin-less request and changes nothing', async () => {
    const one = await createSession(adminId);
    expect((await signOut(post(one.token, {}, 'https://evil.test'))).status).toBe(403);
    expect((await signOut(post(one.token, {}, null))).status).toBe(403);
    expect(await sessions()).toHaveLength(1);
    expect(await actions('session.signed_out')).toHaveLength(0);
  });
});

describe('GET /api/auth/google/callback', () => {
  it('sends a callback whose sign-in flow is gone back to the sign-in page with ?e=error', async () => {
    expect(await testDb.db.select().from(oauthFlow)).toHaveLength(0);
    const request = new NextRequest(
      'http://localhost:3100/api/auth/google/callback?state=gone-state&code=abc',
      { headers: { Cookie: '__Host-ac_oauth=gone-state' } },
    );
    const response = await googleCallback(request);
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/admin/sign-in');
    expect(location.searchParams.get('e')).toBe('error');
    expect(await sessions()).toHaveLength(0);
  });
});
