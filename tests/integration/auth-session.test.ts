import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { setCookieCalls, setRequestCookie } from '../setup/next-mocks';
import { adminSession, adminUser } from '@/server/db/schema';
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
  getSession,
  listSessions,
  markReauthenticated,
  rotateSession,
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
    .values({ displayName: 'Aviva', googleEmail: 'aviva@example.test' })
    .returning({ id: adminUser.id });
  adminId = row?.id ?? '';
});
afterAll(() => testDb.close());

const sessions = () => testDb.db.select().from(adminSession);
const sha256 = (value: string) => createHash('sha256').update(value).digest();

describe('createSession', () => {
  it('uses a 32-byte random token and stores only its SHA-256', async () => {
    const { token } = await createSession(adminId, 'full', { now: t0 });
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    const [row] = await sessions();
    expect(Buffer.from(row?.tokenHash ?? []).equals(sha256(token))).toBe(true);
    expect(JSON.stringify(row)).not.toContain(token);
    const other = await createSession(adminId, 'full', { now: t0 });
    expect(other.token).not.toBe(token);
  });

  it('gives a full session after a passkey sign-in reauth_at = now, otherwise none', async () => {
    await createSession(adminId, 'full', { now: t0, reauth: true });
    await createSession(adminId, 'full', { now: t0 });
    const rows = await sessions();
    expect(rows.filter((row) => row.reauthAt?.getTime() === t0.getTime())).toHaveLength(1);
    expect(rows.filter((row) => row.reauthAt === null)).toHaveLength(1);
  });

  it('keeps purpose and next path on pending sessions and reduces the user agent to "device · browser"', async () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    await createSession(adminId, 'pending_passkey', {
      now: t0,
      purpose: 'sign_in',
      nextPath: '/admin/orders/abc',
      userAgent: ua,
    });
    const [row] = await sessions();
    expect(row?.purpose).toBe('sign_in');
    expect(row?.nextPath).toBe('/admin/orders/abc');
    expect(row?.userAgentSummary).toBe('iPhone · Safari');
    expect(
      summarizeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36'),
    ).toBe('Windows · Chrome');
    expect(summarizeUserAgent(null)).toBe('');
  });
});

describe('getSession', () => {
  it('finds a session by cookie and refreshes last_seen_at', async () => {
    const { token } = await createSession(adminId, 'full', { now: t0 });
    setRequestCookie(SESSION_COOKIE, token);
    const found = await getSession(undefined, { now: at(10 * MIN) });
    expect(found?.admin.id).toBe(adminId);
    expect(found?.session.stage).toBe('full');
    const [row] = await sessions();
    expect(row?.lastSeenAt.getTime()).toBe(at(10 * MIN).getTime());
  });

  it('returns null without a cookie or with an unknown token', async () => {
    expect(await getSession(undefined, { now: t0 })).toBeNull();
    setRequestCookie(SESSION_COOKIE, 'x'.repeat(43));
    expect(await getSession(undefined, { now: t0 })).toBeNull();
  });

  it('expires pending_passkey sessions after 5 minutes idle and only marks them ended', async () => {
    const { token } = await createSession(adminId, 'pending_passkey', {
      now: t0,
      purpose: 'sign_in',
    });
    setRequestCookie(SESSION_COOKIE, token);
    expect(await getSession(undefined, { now: at(4 * MIN) })).not.toBeNull();
    // The touch at 4 minutes restarts the idle clock.
    expect(await getSession(undefined, { now: at(8 * MIN) })).not.toBeNull();
    expect(await getSession(undefined, { now: at(8 * MIN + 5 * MIN + 1000) })).toBeNull();
    const [row] = await sessions();
    expect(row?.endedAt).not.toBeNull();
    expect(row?.abandonProcessedAt).toBeNull();
    // Still gone afterwards.
    expect(await getSession(undefined, { now: at(9 * MIN) })).toBeNull();
  });

  it('expires full sessions after 30 minutes idle', async () => {
    const { token } = await createSession(adminId, 'full', { now: t0 });
    setRequestCookie(SESSION_COOKIE, token);
    expect(await getSession(undefined, { now: at(29 * MIN) })).not.toBeNull();
    expect(await getSession(undefined, { now: at(29 * MIN + 30 * MIN + 1000) })).toBeNull();
    expect(await sessions()).toHaveLength(0);
  });

  it('expires full sessions 12 hours after creation even when active', async () => {
    const { token } = await createSession(adminId, 'full', { now: t0 });
    setRequestCookie(SESSION_COOKIE, token);
    const justBefore = at(12 * 60 * MIN - MIN);
    await testDb.db.update(adminSession).set({ lastSeenAt: justBefore });
    expect(await getSession(undefined, { now: justBefore })).not.toBeNull();
    const after = at(12 * 60 * MIN + MIN);
    await testDb.db.update(adminSession).set({ lastSeenAt: after });
    expect(await getSession(undefined, { now: after })).toBeNull();
  });

  it('does not write anything in read-only mode, not even for an expired pending session', async () => {
    const { token } = await createSession(adminId, 'pending_passkey', {
      now: t0,
      purpose: 'sign_in',
    });
    setRequestCookie(SESSION_COOKIE, token);
    expect(await getSession(undefined, { now: at(MIN), readOnly: true })).not.toBeNull();
    expect(await getSession(undefined, { now: at(20 * MIN), readOnly: true })).toBeNull();
    const [row] = await sessions();
    expect(row?.lastSeenAt.getTime()).toBe(t0.getTime());
    expect(row?.endedAt).toBeNull();
  });

  it('never returns an ended pending session', async () => {
    const { token } = await createSession(adminId, 'pending_passkey', {
      now: t0,
      purpose: 'sign_in',
    });
    await testDb.db.update(adminSession).set({ endedAt: at(MIN) });
    setRequestCookie(SESSION_COOKIE, token);
    expect(await getSession(undefined, { now: at(2 * MIN) })).toBeNull();
  });
});

describe('rotateSession', () => {
  it('deletes the old row and creates a new session for the same admin', async () => {
    const pending = await createSession(adminId, 'pending_passkey', {
      now: t0,
      purpose: 'sign_in',
      nextPath: '/admin/x',
    });
    const found = await getSessionByToken(pending.token);
    const rotated = await rotateSession(found, 'full', { now: at(MIN), reauth: true });
    expect(rotated.token).not.toBe(pending.token);
    const rows = await sessions();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.stage).toBe('full');
    expect(rows[0]?.adminId).toBe(adminId);
    expect(Buffer.from(rows[0]?.tokenHash ?? []).equals(sha256(rotated.token))).toBe(true);
    expect(rows[0]?.reauthAt?.getTime()).toBe(at(MIN).getTime());
    expect(rows[0]?.purpose).toBeNull();
    expect(rows[0]?.nextPath).toBeNull();
  });
});

describe('deleting sessions', () => {
  it('deleteSession removes one session', async () => {
    const one = await createSession(adminId, 'full', { now: t0 });
    await createSession(adminId, 'full', { now: t0 });
    await deleteSession(await getSessionByToken(one.token));
    expect(await sessions()).toHaveLength(1);
  });

  it('signOutEverywhere deletes all sessions of the admin only', async () => {
    const [other] = await testDb.db
      .insert(adminUser)
      .values({ displayName: 'Dana', googleEmail: 'dana@example.test' })
      .returning({ id: adminUser.id });
    await createSession(adminId, 'full', { now: t0 });
    await createSession(adminId, 'full', { now: t0 });
    await createSession(other?.id ?? '', 'full', { now: t0 });
    await signOutEverywhere(adminId);
    const rows = await sessions();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.adminId).toBe(other?.id);
  });

  it('leaves no sessions for a removed admin', async () => {
    await createSession(adminId, 'full', { now: t0 });
    await createSession(adminId, 'pending_passkey', { now: t0, purpose: 'sign_in' });
    await testDb.db.delete(adminUser).where(eq(adminUser.id, adminId));
    expect(await sessions()).toHaveLength(0);
  });
});

describe('listSessions, markReauthenticated and the cookie', () => {
  it('lists only full sessions of the admin, newest first, without token data', async () => {
    await createSession(adminId, 'full', {
      now: t0,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/120.0',
    });
    await createSession(adminId, 'full', { now: at(MIN) });
    await createSession(adminId, 'pending_passkey', { now: at(2 * MIN), purpose: 'sign_in' });
    const list = await listSessions(adminId);
    expect(list).toHaveLength(2);
    expect(list[0]?.createdAt.getTime()).toBe(at(MIN).getTime());
    expect(list[1]?.userAgentSummary).toBe('Mac · Firefox');
    expect(JSON.stringify(list)).not.toMatch(/tokenHash/);
  });

  it('markReauthenticated sets reauth_at', async () => {
    const { token } = await createSession(adminId, 'full', { now: t0 });
    await markReauthenticated(await getSessionByToken(token), at(3 * MIN));
    const [row] = await sessions();
    expect(row?.reauthAt?.getTime()).toBe(at(3 * MIN).getTime());
  });

  it('sets the admin cookie __Host-, Secure, HttpOnly, SameSite=Strict, Path=/ and no Domain', async () => {
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

async function getSessionByToken(token: string) {
  setRequestCookie(SESSION_COOKIE, token);
  const found = await getSession(undefined, { now: t0, readOnly: true });
  if (!found) throw new Error('session not found');
  return found.session;
}
