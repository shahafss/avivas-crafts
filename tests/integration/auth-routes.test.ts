import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { adminActivity, adminSession, adminUser, shopSettings } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { createSession } from '@/server/auth/session';
import { abandonedPasskeySessionsTask } from '@/server/auth/throttle';
import { POST as signOut } from '@/app/api/auth/sign-out/route';
import { POST as advanceSessions } from '@/app/api/test/advance-sessions/route';

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
    .values({ displayName: 'Aviva', googleEmail: 'aviva@example.test' })
    .returning({ id: adminUser.id });
  adminId = row?.id ?? '';
});

function post(token: string, body: unknown): Request {
  return new Request('http://localhost:3100/api/auth/sign-out', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:3100',
      'Content-Type': 'application/json',
      Cookie: `__Host-ac_admin=${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/sign-out', () => {
  it('a Google-only (pending) session cannot sign the admin out everywhere, and the attempt is still counted', async () => {
    await createSession(adminId, 'full');
    await createSession(adminId, 'full');
    const pending = await createSession(adminId, 'pending_passkey', { purpose: 'sign_in' });

    expect((await signOut(post(pending.token, { all: true }))).status).toBe(200);

    const rows = await testDb.db.select().from(adminSession);
    expect(rows.filter((row) => row.stage === 'full')).toHaveLength(2);
    const [ended] = rows.filter((row) => row.stage === 'pending_passkey');
    expect(ended?.endedAt).not.toBeNull();
    expect(ended?.abandonProcessedAt).toBeNull();
    expect(
      await testDb.db
        .select()
        .from(adminActivity)
        .where(eq(adminActivity.action, 'session.revoked')),
    ).toHaveLength(0);

    await abandonedPasskeySessionsTask.run(testDb.db, new Date());
    expect(
      await testDb.db
        .select()
        .from(adminActivity)
        .where(eq(adminActivity.action, 'signin.passkey_abandoned')),
    ).toHaveLength(1);
  });

  it('a full session ends only itself, or with all:true every session, and logs session.revoked', async () => {
    const one = await createSession(adminId, 'full');
    await createSession(adminId, 'full');
    await signOut(post(one.token, {}));
    expect(await testDb.db.select().from(adminSession)).toHaveLength(1);

    const again = await createSession(adminId, 'full');
    await signOut(post(again.token, { all: true }));
    expect(await testDb.db.select().from(adminSession)).toHaveLength(0);
    expect(
      await testDb.db
        .select()
        .from(adminActivity)
        .where(eq(adminActivity.action, 'session.revoked')),
    ).toHaveLength(1);
  });
});

describe('POST /api/test/advance-sessions', () => {
  it('answers 404 unless APP_ENV is test', async () => {
    for (const appEnv of ['development', 'staging', 'production']) {
      env.values.APP_ENV = appEnv;
      expect((await advanceSessions()).status, appEnv).toBe(404);
    }
    env.values.APP_ENV = 'test';
    expect((await advanceSessions()).status).toBe(200);
  });
});
