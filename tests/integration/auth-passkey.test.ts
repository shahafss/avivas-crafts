import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { setRequestCookie } from '../setup/next-mocks';
import { SoftAuthenticator } from '../fixtures/webauthn/soft-authenticator';
import {
  adminActivity,
  adminPasskey,
  adminRecoveryCode,
  adminSession,
  adminUser,
  emailOutbox,
  rateLimitBucket,
  shopSettings,
} from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import {
  SESSION_COOKIE,
  createSession,
  getSession,
  type SessionContext,
} from '@/server/auth/session';
import {
  authenticationOptions,
  registrationOptions,
  reauthOptions,
  verifyAuthentication,
  verifyReauth,
  verifyRegistration,
} from '@/server/auth/passkeys';
import {
  attemptRecovery,
  generateRecoveryCodes,
  hasOtherActiveAdmin,
} from '@/server/auth/recovery';
import { createSetupLink } from '@/server/auth/setup-links';
import { abandonedPasskeySessionsTask, isBlocked } from '@/server/auth/throttle';
import { requireRecentAuth } from '@/server/auth/require-admin';

let testDb: TestDbHandle;

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
    WEBAUTHN_RP_ID: 'localhost',
    WEBAUTHN_RP_NAME: 'Test shop',
    SECRET_HMAC_KEY: Buffer.from('passkey-test-hmac-key-0123456789abcdef').toString('base64'),
    TRUSTED_PROXY_HOPS: 0,
  }),
}));

const ORIGIN = 'http://localhost:3100';
const RP = 'localhost';
const MIN = 60_000;

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
  await testDb.db.update(shopSettings).set({ notificationEmails: ['owner@example.test'] });
});

const db = () => testDb.db;
const activity = async (action?: string) => {
  const rows = await db().select().from(adminActivity);
  return action === undefined ? rows : rows.filter((row) => row.action === action);
};
const alerts = () => db().select().from(emailOutbox).where(eq(emailOutbox.kind, 'security-alert'));
const sessionRows = () => db().select().from(adminSession);
const adminRow = async (id: string) => {
  const [row] = await db().select().from(adminUser).where(eq(adminUser.id, id));
  if (!row) throw new Error('admin missing');
  return row;
};

async function newAdmin(name: string, email: string): Promise<string> {
  const [row] = await db()
    .insert(adminUser)
    .values({ displayName: name, googleEmail: email })
    .returning({ id: adminUser.id });
  return row?.id ?? '';
}

async function addPasskey(
  adminId: string,
  soft: SoftAuthenticator,
  {
    status = 'active',
    counter = 0,
  }: { status?: 'active' | 'pending_approval'; counter?: number } = {},
): Promise<void> {
  await db()
    .insert(adminPasskey)
    .values({
      adminId,
      credentialId: soft.credentialId,
      publicKey: soft.publicKeyCose,
      counter,
      transports: ['internal'],
      deviceLabel: 'Test phone',
      status,
      registeredVia: status === 'active' ? 'setup' : 'recovery',
    });
}

async function ctxFor(token: string): Promise<SessionContext> {
  setRequestCookie(SESSION_COOKIE, token);
  const ctx = await getSession(undefined);
  if (!ctx) throw new Error('no session');
  return ctx;
}

async function pending(
  adminId: string,
  purpose: 'sign_in' | 'recovery' | 'setup' = 'sign_in',
  nextPath?: string,
) {
  const { token } = await createSession(adminId, 'pending_passkey', { purpose, nextPath });
  return { token, ctx: await ctxFor(token) };
}

async function full(adminId: string, reauth = true) {
  const { token } = await createSession(adminId, 'full', { reauth });
  return { token, ctx: await ctxFor(token) };
}

function assertion(
  soft: SoftAuthenticator,
  options: { challenge: string },
  extra: { uv?: boolean; up?: boolean; counter?: number } = {},
) {
  return soft.assert({ challenge: options.challenge, origin: ORIGIN, rpId: RP, ...extra });
}

describe('authentication', () => {
  it("requires user verification and offers only the admin's own active passkeys", async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const other = await newAdmin('Dana', 'dana@example.test');
    const mine = new SoftAuthenticator();
    const pendingOne = new SoftAuthenticator();
    const theirs = new SoftAuthenticator();
    await addPasskey(admin, mine);
    await addPasskey(admin, pendingOne, { status: 'pending_approval' });
    await addPasskey(other, theirs);
    const { ctx, token } = await pending(admin);
    const options = await authenticationOptions(ctx);
    expect(options.userVerification).toBe('required');
    expect(options.rpId).toBe('localhost');
    expect(options.allowCredentials?.map((c) => c.id)).toEqual([mine.id]);
    const stored = (await sessionRows())[0];
    expect(stored?.webauthnChallenge).toContain(options.challenge);
    expect(token).toBeTruthy();
  });

  it('rejects an assertion without the UV flag and records the failure', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const soft = new SoftAuthenticator();
    await addPasskey(admin, soft);
    const { ctx, token } = await pending(admin);
    const options = await authenticationOptions(ctx);
    const result = await verifyAuthentication(
      await ctxFor(token),
      assertion(soft, options, { uv: false }),
    );
    expect(result).toMatchObject({ ok: false, error: 'passkey_failed' });
    expect(await activity('signin.passkey_failed')).toHaveLength(1);
    expect((await sessionRows())[0]?.stage).toBe('pending_passkey');
  });

  it('rejects an assertion without user presence, a wrong challenge and an unknown credential', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const soft = new SoftAuthenticator();
    await addPasskey(admin, soft);
    const { ctx, token } = await pending(admin);
    const options = await authenticationOptions(ctx);
    expect(
      (await verifyAuthentication(await ctxFor(token), assertion(soft, options, { up: false }))).ok,
    ).toBe(false);
    const options2 = await authenticationOptions(await ctxFor(token));
    expect(
      (
        await verifyAuthentication(
          await ctxFor(token),
          assertion(soft, { challenge: 'bogus-challenge' }),
        )
      ).ok,
    ).toBe(false);
    const options3 = await authenticationOptions(await ctxFor(token));
    const stranger = new SoftAuthenticator();
    expect(
      (await verifyAuthentication(await ctxFor(token), assertion(stranger, options3))).ok,
    ).toBe(false);
    expect(options2.challenge).not.toBe(options.challenge);
  });

  it('accepts a valid assertion: rotates to a full session with reauth_at and answers the redirect', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const soft = new SoftAuthenticator();
    await addPasskey(admin, soft);
    const { ctx, token } = await pending(admin, 'sign_in', '/admin/orders/abc');
    const options = await authenticationOptions(ctx);
    const result = await verifyAuthentication(await ctxFor(token), assertion(soft, options));
    expect(result).toMatchObject({ ok: true, redirect: '/admin/orders/abc' });
    if (!result.ok) return;
    expect(result.token).not.toBe(token);
    const rows = await sessionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stage: 'full', adminId: admin });
    expect(rows[0]?.reauthAt).not.toBeNull();
    const [passkey] = await db().select().from(adminPasskey);
    expect(passkey?.counter).toBe(1);
    expect(passkey?.lastUsedAt).not.toBeNull();
    expect(await activity('signin.success')).toHaveLength(1);
    // The old pending token is gone.
    setRequestCookie(SESSION_COOKIE, token);
    expect(await getSession(undefined)).toBeNull();
  });

  it('answers /admin when the pending session has no next path, and refuses a replayed counter', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const soft = new SoftAuthenticator();
    await addPasskey(admin, soft, { counter: 7 });
    const first = await pending(admin);
    const options = await authenticationOptions(first.ctx);
    expect(
      (
        await verifyAuthentication(
          await ctxFor(first.token),
          assertion(soft, options, { counter: 3 }),
        )
      ).ok,
    ).toBe(false);
    const options2 = await authenticationOptions(await ctxFor(first.token));
    const ok = await verifyAuthentication(
      await ctxFor(first.token),
      assertion(soft, options2, { counter: 8 }),
    );
    expect(ok).toMatchObject({ ok: true, redirect: '/admin' });
  });

  it('uses a challenge only once', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const soft = new SoftAuthenticator();
    await addPasskey(admin, soft);
    const { ctx, token } = await pending(admin);
    const options = await authenticationOptions(ctx);
    const response = assertion(soft, options, { uv: false });
    await verifyAuthentication(await ctxFor(token), response);
    const replay = await verifyAuthentication(await ctxFor(token), assertion(soft, options));
    expect(replay.ok).toBe(false);
  });

  it('blocks the admin for 15 minutes after 5 failures, logs signin.blocked and alerts', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const soft = new SoftAuthenticator();
    await addPasskey(admin, soft);
    const { token } = await pending(admin);
    for (let i = 0; i < 5; i += 1) {
      const options = await authenticationOptions(await ctxFor(token));
      const result = await verifyAuthentication(
        await ctxFor(token),
        assertion(soft, options, { uv: false }),
      );
      expect(result.ok).toBe(false);
    }
    const row = await adminRow(admin);
    expect(isBlocked(row)).toBe(true);
    expect(row.passkeyFailCount).toBe(5);
    const blockedUntil = row.passkeyBlockedUntil?.getTime() ?? 0;
    expect(blockedUntil).toBeGreaterThan(Date.now() + 14 * MIN);
    expect(blockedUntil).toBeLessThanOrEqual(Date.now() + 15 * MIN + 1000);
    expect(await activity('signin.passkey_failed')).toHaveLength(5);
    expect(await activity('signin.blocked')).toHaveLength(1);
    const queued = await alerts();
    expect(queued).toHaveLength(2);
    expect(queued.every((mail) => mail.dedupeKey.startsWith('security:blocked:'))).toBe(true);

    // While blocked even a valid assertion is refused.
    const options = await authenticationOptions(await ctxFor(token));
    expect(await verifyAuthentication(await ctxFor(token), assertion(soft, options))).toMatchObject(
      { ok: false, error: 'blocked' },
    );
  });

  it('counts only failures from the last 15 minutes', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const soft = new SoftAuthenticator();
    await addPasskey(admin, soft);
    const { token } = await pending(admin);
    const fail = async () => {
      const options = await authenticationOptions(await ctxFor(token));
      await verifyAuthentication(await ctxFor(token), assertion(soft, options, { uv: false }));
    };
    for (let i = 0; i < 4; i += 1) await fail();
    // Move those four failures out of the window.
    await db()
      .update(rateLimitBucket)
      .set({ expiresAt: new Date(Date.now() - 1000) });
    await fail();
    expect(isBlocked(await adminRow(admin))).toBe(false);
  });
});

describe('first passkey (setup)', () => {
  async function setupSession(adminId: string, { expire = false } = {}) {
    const { token: setupToken } = await createSetupLink(adminId);
    if (expire)
      await db()
        .update(adminUser)
        .set({ setupTokenExpiresAt: new Date(Date.now() - 1000) });
    return { setupToken, ...(await pending(adminId, 'setup')) };
  }

  it('refuses without a valid unexpired token, without the setup purpose and for admins with a passkey', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    // No token at all.
    const noToken = await pending(admin, 'setup');
    expect(await registrationOptions(noToken.ctx)).toMatchObject({
      ok: false,
      error: 'not_allowed',
    });
    // Expired token.
    const expired = await setupSession(admin, { expire: true });
    expect(await registrationOptions(await ctxFor(expired.token))).toMatchObject({
      ok: false,
      error: 'not_allowed',
    });
    // Valid token but a sign-in session.
    await createSetupLink(admin);
    const signIn = await pending(admin, 'sign_in');
    expect(await registrationOptions(signIn.ctx)).toMatchObject({
      ok: false,
      error: 'not_allowed',
    });
    // Valid token and setup session but the admin already has a passkey.
    await addPasskey(admin, new SoftAuthenticator());
    const withKey = await pending(admin, 'setup');
    expect(await registrationOptions(withKey.ctx)).toMatchObject({
      ok: false,
      error: 'not_allowed',
    });
  });

  it('ends a pending setup session when a newer setup link replaces its link', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const { token } = await setupSession(admin);
    expect(await registrationOptions(await ctxFor(token))).toMatchObject({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await createSetupLink(admin); // regenerateSetupLink
    expect(await registrationOptions(await ctxFor(token))).toMatchObject({
      ok: false,
      error: 'not_allowed',
    });
  });

  it('registers the first passkey, returns 10 recovery codes once, clears the token and signs in', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    await newAdmin('Dana', 'dana@example.test');
    const soft = new SoftAuthenticator();
    soft.backedUp = true;
    const { token } = await setupSession(admin);
    const options = await registrationOptions(await ctxFor(token));
    if (!options.ok) throw new Error(options.error);
    expect(options.options.authenticatorSelection).toMatchObject({
      userVerification: 'required',
      residentKey: 'preferred',
    });
    expect(options.options.attestation).toBe('none');
    expect(options.options.rp.id).toBe('localhost');

    const result = await verifyRegistration(
      await ctxFor(token),
      soft.register({ challenge: options.options.challenge, origin: ORIGIN, rpId: RP }),
      'הטלפון של אביבה',
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.status !== 'ok') throw new Error('unexpected');
    expect(result.recoveryCodes).toHaveLength(10);
    for (const code of result.recoveryCodes ?? []) expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(new Set(result.recoveryCodes).size).toBe(10);

    const hashes = await db().select().from(adminRecoveryCode);
    expect(hashes).toHaveLength(10);
    for (const row of hashes) {
      expect(row.codeHash).toMatch(/^scrypt\$32768\$8\$1\$/);
      expect(result.recoveryCodes?.some((code) => row.codeHash.includes(code))).toBe(false);
    }

    const [passkey] = await db().select().from(adminPasskey);
    expect(passkey).toMatchObject({
      adminId: admin,
      status: 'active',
      registeredVia: 'setup',
      deviceLabel: 'הטלפון של אביבה',
      backedUp: true,
    });
    const row = await adminRow(admin);
    expect(row.setupTokenHash).toBeNull();
    expect(row.setupTokenExpiresAt).toBeNull();

    const sessions = await sessionRows();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ stage: 'full', adminId: admin });
    expect(result.token).toBeTruthy();
    expect(sessions[0]?.abandonProcessedAt).toBeNull();

    expect(await activity('passkey.added')).toHaveLength(1);
    const queued = await alerts();
    expect(queued.map((mail) => mail.toAddress).sort()).toEqual([
      'aviva@example.test',
      'dana@example.test',
      'owner@example.test',
    ]);

    // Completing setup leaves nothing for the abandoned-session task.
    await abandonedPasskeySessionsTask.run(db(), new Date(Date.now() + 10 * MIN));
    expect(await activity('signin.passkey_abandoned')).toHaveLength(0);
  });

  it('rejects an attestation without user verification', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const soft = new SoftAuthenticator();
    const { token } = await setupSession(admin);
    const options = await registrationOptions(await ctxFor(token));
    if (!options.ok) throw new Error(options.error);
    const result = await verifyRegistration(
      await ctxFor(token),
      soft.register({ challenge: options.options.challenge, origin: ORIGIN, rpId: RP, uv: false }),
      'Phone',
    );
    expect(result).toMatchObject({ ok: false, error: 'registration_failed' });
    expect(await db().select().from(adminPasskey)).toHaveLength(0);
  });

  it('excludes existing credentials so one authenticator cannot be registered twice', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const existing = new SoftAuthenticator();
    await addPasskey(admin, existing);
    const { ctx } = await full(admin);
    const options = await registrationOptions(ctx);
    if (!options.ok) throw new Error(options.error);
    expect(options.options.excludeCredentials?.map((c) => c.id)).toEqual([existing.id]);
  });
});

describe('recovery codes', () => {
  it('works once and permits registration only within 5 minutes', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const helper = await newAdmin('Dana', 'dana@example.test');
    await addPasskey(helper, new SoftAuthenticator());
    const codes = await generateRecoveryCodes(admin);
    const first = await pending(admin, 'recovery');
    expect(await attemptRecovery(first.ctx, codes[0])).toEqual({ ok: true });
    expect(await activity('recovery.used')).toHaveLength(1);
    expect((await sessionRows())[0]?.recoveryVerifiedAt).not.toBeNull();

    // The same code does not work again, and the failure is counted.
    const second = await pending(admin, 'recovery');
    expect(await attemptRecovery(second.ctx, codes[0])).toMatchObject({
      ok: false,
      error: 'code_invalid',
    });
    expect(await activity('signin.passkey_failed')).toHaveLength(1);
    // Lower-case input with separators is accepted.
    const spaced = (codes[1] ?? '').toLowerCase().replace(/(.{4})/g, '$1-');
    expect(await attemptRecovery(await ctxFor(second.token), spaced)).toEqual({ ok: true });

    // Registration after more than 5 minutes is refused.
    const options = await registrationOptions(await ctxFor(first.token), {
      now: new Date(Date.now() + 6 * MIN),
    });
    expect(options).toMatchObject({ ok: false, error: 'not_allowed' });
    expect(await registrationOptions(await ctxFor(first.token))).toMatchObject({ ok: true });
  });

  it('hardened recovery: stores the passkey pending_approval, ends the session, alerts and blocks sign-in with it', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const helper = await newAdmin('Dana', 'dana@example.test');
    await addPasskey(helper, new SoftAuthenticator());
    const codes = await generateRecoveryCodes(admin);
    const { token } = await pending(admin, 'recovery');
    expect(await attemptRecovery(await ctxFor(token), codes[0])).toEqual({ ok: true });

    const options = await registrationOptions(await ctxFor(token));
    if (!options.ok) throw new Error(options.error);
    const recovered = new SoftAuthenticator();
    const result = await verifyRegistration(
      await ctxFor(token),
      recovered.register({ challenge: options.options.challenge, origin: ORIGIN, rpId: RP }),
      'New phone',
    );
    expect(result).toEqual({ ok: true, status: 'pending_approval' });

    const [passkey] = await db().select().from(adminPasskey).where(eq(adminPasskey.adminId, admin));
    expect(passkey).toMatchObject({ status: 'pending_approval', registeredVia: 'recovery' });
    // No full session, and the pending one is ended and already processed.
    const sessions = await sessionRows();
    expect(sessions.some((row) => row.stage === 'full')).toBe(false);
    expect(sessions[0]?.endedAt).not.toBeNull();
    expect(sessions[0]?.abandonProcessedAt).not.toBeNull();
    expect(await activity('passkey.pending_approval')).toHaveLength(1);
    expect(
      (await alerts()).filter((mail) => mail.dedupeKey.startsWith('security:recovery_pending:'))
        .length,
    ).toBe(3);

    // It is left out of allowCredentials and sign-in with it is rejected.
    const again = await pending(admin);
    const authOptions = await authenticationOptions(again.ctx);
    expect(authOptions.allowCredentials ?? []).toEqual([]);
    const attempt = await verifyAuthentication(
      await ctxFor(again.token),
      assertion(recovered, authOptions),
    );
    expect(attempt.ok).toBe(false);
    expect((await sessionRows()).some((row) => row.stage === 'full')).toBe(false);

    // The session ending is not counted as abandoned.
    await abandonedPasskeySessionsTask.run(db(), new Date(Date.now() + 10 * MIN));
    expect((await activity('signin.passkey_abandoned')).length).toBe(1); // only the second, unfinished sign-in session
  });

  it('refuses with no_other_admin before checking the code when nobody else has an active passkey', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const helper = await newAdmin('Dana', 'dana@example.test'); // no passkey
    const codes = await generateRecoveryCodes(admin);
    expect(await hasOtherActiveAdmin(admin)).toBe(false);
    await addPasskey(helper, new SoftAuthenticator(), { status: 'pending_approval' });
    expect(await hasOtherActiveAdmin(admin)).toBe(false);

    const { token } = await pending(admin, 'recovery');
    expect(await attemptRecovery(await ctxFor(token), codes[0])).toMatchObject({
      ok: false,
      error: 'no_other_admin',
    });
    // The valid code is still unused, no failure is counted.
    expect((await db().select().from(adminRecoveryCode)).every((row) => row.usedAt === null)).toBe(
      true,
    );
    expect((await adminRow(admin)).passkeyFailCount).toBe(0);
    expect(await activity('signin.passkey_failed')).toHaveLength(0);
    expect(await activity('recovery.refused')).toHaveLength(1);
    expect(
      (await alerts()).filter((mail) => mail.dedupeKey.startsWith('security:recovery_refused:'))
        .length,
    ).toBe(3);
    const [session] = await sessionRows();
    expect(session?.endedAt).not.toBeNull();
    expect(session?.abandonProcessedAt).not.toBeNull();

    // Also when called without any code (the page's button).
    const second = await pending(admin, 'recovery');
    expect(await attemptRecovery(second.ctx, undefined)).toMatchObject({
      ok: false,
      error: 'no_other_admin',
    });

    await abandonedPasskeySessionsTask.run(db(), new Date(Date.now() + 10 * MIN));
    expect(await activity('signin.passkey_abandoned')).toHaveLength(0);
  });

  it('register/verify for recovery refuses the same way if the other admin disappeared in between', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const helper = await newAdmin('Dana', 'dana@example.test');
    await addPasskey(helper, new SoftAuthenticator());
    const codes = await generateRecoveryCodes(admin);
    const { token } = await pending(admin, 'recovery');
    expect(await attemptRecovery(await ctxFor(token), codes[0])).toEqual({ ok: true });
    const options = await registrationOptions(await ctxFor(token));
    if (!options.ok) throw new Error(options.error);

    await db().delete(adminUser).where(eq(adminUser.id, helper));
    const soft = new SoftAuthenticator();
    const result = await verifyRegistration(
      await ctxFor(token),
      soft.register({ challenge: options.options.challenge, origin: ORIGIN, rpId: RP }),
      'New phone',
    );
    expect(result).toMatchObject({ ok: false, error: 'no_other_admin' });
    expect(await db().select().from(adminPasskey)).toHaveLength(0);
  });

  it('stores scrypt hashes with their own salts and regenerating replaces the set', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const first = await generateRecoveryCodes(admin);
    const second = await generateRecoveryCodes(admin);
    const rows = await db().select().from(adminRecoveryCode);
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((row) => row.codeHash.split('$')[4])).size).toBe(10);
    expect(first.some((code) => second.includes(code))).toBe(false);
  });
});

describe('abandoned second step', () => {
  it('counts an idle-expired pending session once: failure, activity and one throttled alert', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const { token } = await pending(admin);
    const later = new Date(Date.now() + 6 * MIN);
    await abandonedPasskeySessionsTask.run(db(), later);
    expect(await activity('signin.passkey_abandoned')).toHaveLength(1);
    const [session] = await sessionRows();
    expect(session?.abandonProcessedAt).not.toBeNull();
    expect(session?.endedAt).not.toBeNull();
    const queued = await alerts();
    expect(queued).toHaveLength(2);
    expect(queued.every((mail) => mail.dedupeKey.startsWith('security:passkey_abandoned:'))).toBe(
      true,
    );
    // Second run changes nothing.
    await abandonedPasskeySessionsTask.run(db(), later);
    expect(await activity('signin.passkey_abandoned')).toHaveLength(1);
    // A fresh pending session is left alone.
    const fresh = await pending(admin);
    await abandonedPasskeySessionsTask.run(db(), new Date(Date.now() + MIN));
    expect(await activity('signin.passkey_abandoned')).toHaveLength(1);
    expect(fresh.token).not.toBe(token);
  });

  it('counts sessions replaced by a newer sign-in and counts toward the block', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    for (let i = 0; i < 5; i += 1) {
      await pending(admin);
    }
    await db().update(adminSession).set({ endedAt: new Date() });
    await abandonedPasskeySessionsTask.run(db(), new Date());
    expect(await activity('signin.passkey_abandoned')).toHaveLength(5);
    expect(isBlocked(await adminRow(admin))).toBe(true);
    expect(await activity('signin.blocked')).toHaveLength(1);
    // Only one abandoned alert and one blocked alert per 15 minutes.
    const kinds = new Set((await alerts()).map((mail) => mail.dedupeKey.split(':')[1]));
    expect([...kinds].sort()).toEqual(['blocked', 'passkey_abandoned']);
  });

  it('is cleaned up by the daily task only after it was processed', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    await pending(admin);
    const { deleteExpiredSessions } = await import('@/server/jobs/daily-maintenance');
    await deleteExpiredSessions.run(db(), new Date());
    expect(await sessionRows()).toHaveLength(1);
    await abandonedPasskeySessionsTask.run(db(), new Date(Date.now() + 10 * MIN));
    await deleteExpiredSessions.run(db(), new Date());
    expect(await sessionRows()).toHaveLength(0);
  });
});

describe('passkey re-check', () => {
  it("offers only the admin's own active passkeys and sets reauth_at without rotating the token", async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const other = await newAdmin('Dana', 'dana@example.test');
    const mine = new SoftAuthenticator();
    await addPasskey(admin, mine);
    await addPasskey(admin, new SoftAuthenticator(), { status: 'pending_approval' });
    await addPasskey(other, new SoftAuthenticator());
    const { token, ctx } = await full(admin, false);
    const options = await reauthOptions(ctx);
    expect(options.userVerification).toBe('required');
    expect(options.allowCredentials?.map((c) => c.id)).toEqual([mine.id]);

    expect((await sessionRows())[0]?.reauthAt).toBeNull();
    const result = await verifyReauth(await ctxFor(token), assertion(mine, options));
    expect(result).toEqual({ ok: true });
    const [row] = await sessionRows();
    expect(row?.reauthAt).not.toBeNull();
    // Same token still works.
    expect((await ctxFor(token)).session.stage).toBe('full');
  });

  it("fails without UV, with another admin's passkey and with a pending_approval passkey, counting each", async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const other = await newAdmin('Dana', 'dana@example.test');
    const mine = new SoftAuthenticator();
    const theirs = new SoftAuthenticator();
    const waiting = new SoftAuthenticator();
    await addPasskey(admin, mine);
    await addPasskey(other, theirs);
    await addPasskey(admin, waiting, { status: 'pending_approval' });
    const { token } = await full(admin, false);

    for (const [soft, extra] of [
      [mine, { uv: false }],
      [theirs, {}],
      [waiting, {}],
    ] as const) {
      const options = await reauthOptions(await ctxFor(token));
      expect(
        await verifyReauth(await ctxFor(token), assertion(soft, options, extra)),
      ).toMatchObject({ ok: false, error: 'passkey_failed' });
    }
    expect(await activity('signin.reauth_failed')).toHaveLength(3);
    expect((await sessionRows())[0]?.reauthAt).toBeNull();

    // Two more failures block; then even a valid assertion is refused.
    for (let i = 0; i < 2; i += 1) {
      const options = await reauthOptions(await ctxFor(token));
      await verifyReauth(await ctxFor(token), assertion(mine, options, { uv: false }));
    }
    expect(isBlocked(await adminRow(admin))).toBe(true);
    const options = await reauthOptions(await ctxFor(token));
    expect(await verifyReauth(await ctxFor(token), assertion(mine, options))).toMatchObject({
      ok: false,
      error: 'blocked',
    });
  });

  it('requireRecentAuth passes under 5 minutes and refuses with admin.reauth_required after', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    const { token } = await full(admin, true);
    setRequestCookie(SESSION_COOKIE, token);
    const fresh = await requireRecentAuth();
    expect(fresh.ok).toBe(true);

    await db()
      .update(adminSession)
      .set({ reauthAt: new Date(Date.now() - 6 * MIN) });
    expect(await requireRecentAuth()).toEqual({ ok: false, formError: 'admin.reauth_required' });
    await db().update(adminSession).set({ reauthAt: null });
    expect(await requireRecentAuth()).toEqual({ ok: false, formError: 'admin.reauth_required' });
  });

  it('refuses register/options for adding a passkey when reauth_at is older than 5 minutes', async () => {
    const admin = await newAdmin('Aviva', 'aviva@example.test');
    await addPasskey(admin, new SoftAuthenticator());
    const { token } = await full(admin, true);
    await db()
      .update(adminSession)
      .set({ reauthAt: new Date(Date.now() - 6 * MIN) });
    expect(await registrationOptions(await ctxFor(token))).toMatchObject({
      ok: false,
      error: 'reauth_required',
    });
    await db().update(adminSession).set({ reauthAt: new Date() });
    const options = await registrationOptions(await ctxFor(token));
    if (!options.ok) throw new Error(options.error);

    const added = new SoftAuthenticator();
    added.backedUp = true;
    const result = await verifyRegistration(
      await ctxFor(token),
      added.register({ challenge: options.options.challenge, origin: ORIGIN, rpId: RP }),
      'Laptop',
    );
    expect(result).toEqual({ ok: true, status: 'ok' });
    const rows = await db()
      .select()
      .from(adminPasskey)
      .where(eq(adminPasskey.registeredVia, 'normal'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'active', backedUp: true });
    expect(await db().select().from(adminRecoveryCode)).toHaveLength(0);
    expect(await activity('passkey.added')).toHaveLength(1);
  });
});
