import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { setCookieCalls, setRequestCookie } from '../setup/next-mocks';
import { adminActivity, adminSession, adminUser } from '@/server/db/schema';
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
  getSession,
  setSessionCookie,
  signOutEverywhere,
  summarizeUserAgent,
} from '@/server/auth/session';

let testDb: TestDbHandle;

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));

const MIN = 60_000;
const t0 = new Date('2026-11-08T10:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

let adminId: string;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(async () => {
  await testDb.reset();
  const [row] = await testDb.db
    .insert(adminUser)
    .values({ displayName: 'Aviva', googleEmail: 'aviva@example.test', role: 'admin' })
    .returning({ id: adminUser.id });
  adminId = row?.id ?? '';
});
afterAll(() => testDb.close());

const sessions = () => testDb.db.select().from(adminSession);
const activity = () => testDb.db.select().from(adminActivity);
const sha256 = (value: string) => createHash('sha256').update(value).digest();

describe('createSession', () => {
  it('uses a 32-byte random token and stores only its SHA-256', async () => {
    const { token } = await createSession(adminId, { now: t0 });
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    const [row] = await sessions();
    expect(Buffer.from(row?.tokenHash ?? []).equals(sha256(token))).toBe(true);
    expect(JSON.stringify(row)).not.toContain(token);
    const other = await createSession(adminId, { now: t0 });
    expect(other.token).not.toBe(token);
  });

  it('lasts 12 hours, has no stage, and reduces the user agent to "device · browser"', async () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    await createSession(adminId, { now: t0, userAgent: ua });
    const [row] = await sessions();
    expect(row).not.toHaveProperty('stage');
    expect(row?.expiresAt.getTime()).toBe(at(12 * 60 * MIN).getTime());
    expect(row?.userAgentSummary).toBe('iPhone · Safari');
    expect(
      summarizeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36'),
    ).toBe('Windows · Chrome');
    expect(summarizeUserAgent(null)).toBe('');
  });
});

describe('getSession', () => {
  it('finds a session by cookie and refreshes last_seen_at', async () => {
    const { token } = await createSession(adminId, { now: t0 });
    setRequestCookie(SESSION_COOKIE, token);
    const found = await getSession(undefined, { now: at(10 * MIN) });
    expect(found?.admin.id).toBe(adminId);
    expect(found?.admin.role).toBe('admin');
    const [row] = await sessions();
    expect(row?.lastSeenAt.getTime()).toBe(at(10 * MIN).getTime());
  });

  it('returns null without a cookie, with an oversized cookie or with an unknown token', async () => {
    expect(await getSession(undefined, { now: t0 })).toBeNull();
    setRequestCookie(SESSION_COOKIE, 'x'.repeat(43));
    expect(await getSession(undefined, { now: t0 })).toBeNull();
    setRequestCookie(SESSION_COOKIE, 'x'.repeat(129));
    expect(await getSession(undefined, { now: t0 })).toBeNull();
  });

  it('ends the session after 30 minutes idle and deletes the row', async () => {
    const { token } = await createSession(adminId, { now: t0 });
    setRequestCookie(SESSION_COOKIE, token);
    expect(await getSession(undefined, { now: at(29 * MIN) })).not.toBeNull();
    // The touch at 29 minutes restarts the idle clock.
    expect(await getSession(undefined, { now: at(29 * MIN + 29 * MIN) })).not.toBeNull();
    expect(await getSession(undefined, { now: at(58 * MIN + 30 * MIN + 1000) })).toBeNull();
    expect(await sessions()).toHaveLength(0);
  });

  it('ends the session 12 hours after creation even when active, and deletes the row', async () => {
    const { token } = await createSession(adminId, { now: t0 });
    setRequestCookie(SESSION_COOKIE, token);
    const justBefore = at(12 * 60 * MIN - MIN);
    await testDb.db.update(adminSession).set({ lastSeenAt: justBefore });
    expect(await getSession(undefined, { now: justBefore })).not.toBeNull();
    const after = at(12 * 60 * MIN + MIN);
    await testDb.db.update(adminSession).set({ lastSeenAt: after });
    expect(await getSession(undefined, { now: after })).toBeNull();
    expect(await sessions()).toHaveLength(0);
  });

  it('ends a session whose row was deleted', async () => {
    const { token } = await createSession(adminId, { now: t0 });
    setRequestCookie(SESSION_COOKIE, token);
    expect(await getSession(undefined, { now: at(MIN) })).not.toBeNull();
    await testDb.db.delete(adminSession);
    expect(await getSession(undefined, { now: at(2 * MIN) })).toBeNull();
  });

  it('refuses a user whose role was changed to user: null, row deleted, signin.role_refused logged once', async () => {
    const { token } = await createSession(adminId, { now: t0 });
    setRequestCookie(SESSION_COOKIE, token);
    expect(await getSession(undefined, { now: at(MIN) })).not.toBeNull();
    await testDb.db.update(adminUser).set({ role: 'user' }).where(eq(adminUser.id, adminId));
    expect(await getSession(undefined, { now: at(2 * MIN) })).toBeNull();
    expect(await sessions()).toHaveLength(0);
    // Asking again finds no row and logs nothing more.
    expect(await getSession(undefined, { now: at(3 * MIN) })).toBeNull();
    const refused = (await activity()).filter((row) => row.action === 'signin.role_refused');
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ adminId, details: {} });
  });

  it('does not write anything in read-only mode (no touch, no delete)', async () => {
    const { token } = await createSession(adminId, { now: t0 });
    setRequestCookie(SESSION_COOKIE, token);
    expect(await getSession(undefined, { now: at(MIN), readOnly: true })).not.toBeNull();
    expect(await getSession(undefined, { now: at(20 * MIN), readOnly: true })).not.toBeNull();
    const [row] = await sessions();
    expect(row?.lastSeenAt.getTime()).toBe(t0.getTime());
    expect(await getSession(undefined, { now: at(40 * MIN), readOnly: true })).toBeNull();
    expect(await sessions()).toHaveLength(1);
  });
});

describe('deleting sessions', () => {
  it('deleteSession removes one session', async () => {
    const one = await createSession(adminId, { now: t0 });
    await createSession(adminId, { now: t0 });
    setRequestCookie(SESSION_COOKIE, one.token);
    const found = await getSession(undefined, { now: t0, readOnly: true });
    if (!found) throw new Error('session not found');
    await deleteSession(found.session);
    expect(await sessions()).toHaveLength(1);
  });

  it('signOutEverywhere deletes all sessions of the admin only', async () => {
    const [other] = await testDb.db
      .insert(adminUser)
      .values({ displayName: 'Dana', googleEmail: 'dana@example.test', role: 'admin' })
      .returning({ id: adminUser.id });
    await createSession(adminId, { now: t0 });
    await createSession(adminId, { now: t0 });
    await createSession(other?.id ?? '', { now: t0 });
    await signOutEverywhere(adminId);
    const rows = await sessions();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.adminId).toBe(other?.id);
  });

  it('leaves no sessions for a removed admin', async () => {
    await createSession(adminId, { now: t0 });
    await testDb.db.delete(adminUser).where(eq(adminUser.id, adminId));
    expect(await sessions()).toHaveLength(0);
  });
});

describe('the cookie', () => {
  it('is __Host-, Secure, HttpOnly, SameSite=Strict, Path=/ and has no Domain', async () => {
    await setSessionCookie('token-value');
    const call = setCookieCalls.find((c) => c.name === '__Host-ac_admin');
    expect(call?.value).toBe('token-value');
    expect(call?.options).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    });
    expect(call?.options).not.toHaveProperty('domain');
  });
});
