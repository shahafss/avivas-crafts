import 'server-only';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { and, count, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { adminPasskey, adminSession, adminUser } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { logActivity } from '@/server/activity/log';
import { kickOutbox } from '@/server/email/sender';
import { getEnv } from '@/server/env';
import { log } from '@/server/security/logger';
import { notifyAdmins } from '@/server/security/notify';
import { safeAdminNext } from './next-path';
import { generateRecoveryCodes, hasOtherActiveAdmin } from './recovery';
import {
  createSession,
  endPendingSession,
  markReauthenticated,
  type SessionContext,
  type SessionRow,
} from './session';
import { clearSetupToken, SETUP_LINK_TTL_MS } from './setup-links';
import { clearFailures, isBlocked, recordFailure } from './throttle';

const CHALLENGE_TTL_MS = 5 * 60_000;
/** A recovery code opens passkey registration for this long. */
export const RECOVERY_WINDOW_MS = 5 * 60_000;
/** A passkey assertion this recent counts as a re-check (`reauth_at`). */
export const REAUTH_WINDOW_MS = 5 * 60_000;

/** A recovery code was accepted on this session less than 5 minutes ago. */
export function recoveryCodeAccepted(session: SessionRow, now: Date = new Date()): boolean {
  const verifiedAt = session.recoveryVerifiedAt;
  return verifiedAt !== null && now.getTime() - verifiedAt.getTime() <= RECOVERY_WINDOW_MS;
}

interface Timed {
  now?: Date | undefined;
}

// ---------------------------------------------------------------- challenges

async function storeChallenge(ctx: SessionContext, challenge: string, now: Date): Promise<void> {
  const value = `${String(now.getTime() + CHALLENGE_TTL_MS)}:${challenge}`;
  await db
    .update(adminSession)
    .set({ webauthnChallenge: value })
    .where(eq(adminSession.tokenHash, ctx.session.tokenHash));
}

/** The challenge of the last options call, if still valid. Single use: it is cleared on the way. */
async function takeChallenge(ctx: SessionContext, now: Date): Promise<string | null> {
  const [row] = await db
    .select({ value: adminSession.webauthnChallenge })
    .from(adminSession)
    .where(eq(adminSession.tokenHash, ctx.session.tokenHash));
  const raw = row?.value;
  if (!raw) return null;
  const cleared = await db
    .update(adminSession)
    .set({ webauthnChallenge: null })
    .where(
      and(
        eq(adminSession.tokenHash, ctx.session.tokenHash),
        eq(adminSession.webauthnChallenge, raw),
      ),
    )
    .returning({ tokenHash: adminSession.tokenHash });
  if (cleared.length === 0) return null;
  const separator = raw.indexOf(':');
  const expiresAt = Number(raw.slice(0, separator));
  return expiresAt > now.getTime() ? raw.slice(separator + 1) : null;
}

// ---------------------------------------------------------------- helpers

async function freshAdmin(adminId: string) {
  const [admin] = await db.select().from(adminUser).where(eq(adminUser.id, adminId));
  return admin ?? null;
}

async function activePasskeys(adminId: string) {
  return db
    .select()
    .from(adminPasskey)
    .where(and(eq(adminPasskey.adminId, adminId), eq(adminPasskey.status, 'active')));
}

function transportsOf(values: string[]) {
  return values.length === 0 ? undefined : values;
}

// ---------------------------------------------------------------- authentication

/** Authentication options (UV required) limited to the admin's own `active` passkeys. */
export async function authenticationOptions(
  ctx: SessionContext,
  { now = new Date() }: Timed = {},
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const passkeys = await activePasskeys(ctx.admin.id);
  const options = await generateAuthenticationOptions({
    rpID: getEnv().WEBAUTHN_RP_ID,
    allowCredentials: passkeys.map((key) => ({
      id: Buffer.from(key.credentialId).toString('base64url'),
      transports: transportsOf(key.transports),
    })),
    userVerification: 'required',
  });
  await storeChallenge(ctx, options.challenge, now);
  return options;
}

type AssertionOutcome =
  { ok: true; passkeyId: string } | { ok: false; error: 'passkey_failed' | 'blocked' };

/** Verifies an assertion against the admin's own active passkeys; counts failures; updates the counter on success. */
async function checkAssertion(
  ctx: SessionContext,
  response: AuthenticationResponseJSON,
  failureAction: 'signin.passkey_failed' | 'signin.reauth_failed',
  now: Date,
): Promise<AssertionOutcome> {
  const admin = await freshAdmin(ctx.admin.id);
  if (!admin) return { ok: false, error: 'passkey_failed' };
  if (isBlocked(admin, now)) return { ok: false, error: 'blocked' };

  const fail = async (): Promise<AssertionOutcome> => {
    const { blocked } = await recordFailure(admin, { action: failureAction, now });
    return { ok: false, error: blocked ? 'blocked' : 'passkey_failed' };
  };

  const challenge = await takeChallenge(ctx, now);
  if (challenge === null) return fail();
  const credentialId = Buffer.from(response.rawId, 'base64url');
  const [passkey] = await db
    .select()
    .from(adminPasskey)
    .where(
      and(
        eq(adminPasskey.credentialId, credentialId),
        eq(adminPasskey.adminId, admin.id),
        eq(adminPasskey.status, 'active'),
      ),
    );
  if (!passkey) return fail();

  try {
    const env = getEnv();
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: env.APP_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
      requireUserVerification: true,
      credential: {
        id: Buffer.from(passkey.credentialId).toString('base64url'),
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
        transports: transportsOf(passkey.transports),
      },
    });
    if (!verification.verified) return await fail();
    await db
      .update(adminPasskey)
      .set({
        counter: verification.authenticationInfo.newCounter,
        backedUp: verification.authenticationInfo.credentialBackedUp,
        lastUsedAt: now,
      })
      .where(eq(adminPasskey.id, passkey.id));
  } catch {
    return await fail();
  }
  return { ok: true, passkeyId: passkey.id };
}

export type SignInResult =
  | { ok: true; token: string; redirect: string }
  | { ok: false; error: 'passkey_failed' | 'blocked' };

/** Second sign-in step: a valid assertion rotates the pending session to a new `full` one. */
export async function verifyAuthentication(
  ctx: SessionContext,
  response: AuthenticationResponseJSON,
  { now = new Date() }: Timed = {},
): Promise<SignInResult> {
  if (ctx.session.stage !== 'pending_passkey') return { ok: false, error: 'passkey_failed' };
  const outcome = await checkAssertion(ctx, response, 'signin.passkey_failed', now);
  if (!outcome.ok) return outcome;

  const created = await db.transaction(async (tx) => {
    await tx.delete(adminSession).where(eq(adminSession.tokenHash, ctx.session.tokenHash));
    const next = await createSession(ctx.admin.id, 'full', {
      now,
      reauth: true,
      userAgentSummary: ctx.session.userAgentSummary,
      tx,
    });
    await logActivity(tx, {
      adminId: ctx.admin.id,
      actorKind: 'admin',
      actorLabel: ctx.admin.displayName,
      action: 'signin.success',
    });
    await clearFailures(ctx.admin.id, tx);
    return next;
  });
  return {
    ok: true,
    token: created.token,
    redirect: safeAdminNext(ctx.session.nextPath) ?? '/admin',
  };
}

// ---------------------------------------------------------------- re-check

export function reauthOptions(
  ctx: SessionContext,
  options: Timed = {},
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return authenticationOptions(ctx, options);
}

/** Passkey re-check on a `full` session: sets `reauth_at`, the token stays the same. */
export async function verifyReauth(
  ctx: SessionContext,
  response: AuthenticationResponseJSON,
  { now = new Date() }: Timed = {},
): Promise<{ ok: true } | { ok: false; error: 'passkey_failed' | 'blocked' }> {
  if (ctx.session.stage !== 'full') return { ok: false, error: 'passkey_failed' };
  const outcome = await checkAssertion(ctx, response, 'signin.reauth_failed', now);
  if (!outcome.ok) return outcome;
  await markReauthenticated(ctx.session, now);
  await clearFailures(ctx.admin.id);
  return { ok: true };
}

// ---------------------------------------------------------------- registration

type RegistrationPurpose = 'add' | 'setup' | 'recovery';
export type RegistrationError =
  'not_allowed' | 'reauth_required' | 'no_other_admin' | 'registration_failed';

export async function registrationPurpose(
  ctx: SessionContext,
  now: Date,
): Promise<{ ok: true; purpose: RegistrationPurpose } | { ok: false; error: RegistrationError }> {
  const { session } = ctx;
  const admin = await freshAdmin(ctx.admin.id);
  if (!admin) return { ok: false, error: 'not_allowed' };

  if (session.stage === 'full') {
    const recent =
      session.reauthAt !== null && now.getTime() - session.reauthAt.getTime() < REAUTH_WINDOW_MS;
    return recent ? { ok: true, purpose: 'add' } : { ok: false, error: 'reauth_required' };
  }
  if (session.purpose === 'setup') {
    const [owned] = await db
      .select({ total: count() })
      .from(adminPasskey)
      .where(eq(adminPasskey.adminId, admin.id));
    const tokenValid =
      admin.setupTokenHash !== null &&
      admin.setupTokenExpiresAt !== null &&
      admin.setupTokenExpiresAt.getTime() > now.getTime();
    // A pending setup session belongs to the link it was started with: a link created after the
    // session (regenerateSetupLink) makes the old session useless.
    const linkCreatedAt =
      admin.setupTokenExpiresAt === null
        ? null
        : admin.setupTokenExpiresAt.getTime() - SETUP_LINK_TTL_MS;
    const sameLink = linkCreatedAt !== null && session.createdAt.getTime() >= linkCreatedAt;
    return tokenValid && sameLink && (owned?.total ?? 0) === 0
      ? { ok: true, purpose: 'setup' }
      : { ok: false, error: 'not_allowed' };
  }
  if (!recoveryCodeAccepted(session, now)) return { ok: false, error: 'not_allowed' };
  if (!(await hasOtherActiveAdmin(admin.id))) return { ok: false, error: 'no_other_admin' };
  return { ok: true, purpose: 'recovery' };
}

export type RegistrationOptionsResult =
  | { ok: true; options: PublicKeyCredentialCreationOptionsJSON }
  | { ok: false; error: RegistrationError };

export async function registrationOptions(
  ctx: SessionContext,
  { now = new Date() }: Timed = {},
): Promise<RegistrationOptionsResult> {
  const allowed = await registrationPurpose(ctx, now);
  if (!allowed.ok) return allowed;
  const existing = await db
    .select()
    .from(adminPasskey)
    .where(eq(adminPasskey.adminId, ctx.admin.id));
  const env = getEnv();
  const options = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    userName: ctx.admin.googleEmail,
    userDisplayName: ctx.admin.displayName,
    userID: new TextEncoder().encode(ctx.admin.id),
    attestationType: 'none',
    excludeCredentials: existing.map((key) => ({
      id: Buffer.from(key.credentialId).toString('base64url'),
      transports: transportsOf(key.transports),
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  await storeChallenge(ctx, options.challenge, now);
  return { ok: true, options };
}

export type RegistrationResult =
  | { ok: true; status: 'ok'; recoveryCodes?: string[]; token?: string }
  | { ok: true; status: 'pending_approval' }
  | { ok: false; error: RegistrationError };

export async function verifyRegistration(
  ctx: SessionContext,
  response: RegistrationResponseJSON,
  deviceLabel: string,
  { now = new Date() }: Timed = {},
): Promise<RegistrationResult> {
  const allowed = await registrationPurpose(ctx, now);
  if (!allowed.ok) return allowed;
  const label = deviceLabel.trim();
  if (label.length < 1 || label.length > 60) return { ok: false, error: 'registration_failed' };

  const challenge = await takeChallenge(ctx, now);
  if (challenge === null) return { ok: false, error: 'registration_failed' };
  const env = getEnv();
  let credential: {
    id: string;
    publicKey: Uint8Array;
    counter: number;
    transports?: string[] | undefined;
  };
  let backedUp: boolean;
  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: env.APP_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
      requireUserPresence: true,
      requireUserVerification: true,
    });
    if (!verification.verified) return { ok: false, error: 'registration_failed' };
    credential = verification.registrationInfo.credential;
    backedUp = verification.registrationInfo.credentialBackedUp;
  } catch {
    return { ok: false, error: 'registration_failed' };
  }

  const { purpose } = allowed;
  const admin = ctx.admin;
  const row = {
    adminId: admin.id,
    credentialId: Buffer.from(credential.id, 'base64url'),
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    backedUp,
    deviceLabel: label,
  };

  try {
    const result = await db.transaction(async (tx): Promise<RegistrationResult> => {
      const logAndNotify = async (
        action: string,
        kind: 'passkey_added' | 'recovery_pending',
      ): Promise<void> => {
        const activityId = await logActivity(tx, {
          adminId: admin.id,
          actorKind: 'admin',
          actorLabel: admin.displayName,
          action,
          targetType: 'passkey',
        });
        await notifyAdmins(
          kind,
          { at: now, adminName: admin.displayName },
          { tx, activityId, now },
        );
      };

      if (purpose === 'recovery') {
        await tx
          .insert(adminPasskey)
          .values({ ...row, status: 'pending_approval', registeredVia: 'recovery' });
        await endPendingSession(ctx.session, { processed: true, now, tx });
        await logAndNotify('passkey.pending_approval', 'recovery_pending');
        return { ok: true, status: 'pending_approval' };
      }
      if (purpose === 'add') {
        await tx.insert(adminPasskey).values({ ...row, status: 'active', registeredVia: 'normal' });
        await logAndNotify('passkey.added', 'passkey_added');
        return { ok: true, status: 'ok' };
      }
      await tx.insert(adminPasskey).values({ ...row, status: 'active', registeredVia: 'setup' });
      await clearSetupToken(admin.id, tx as DbLike);
      const recoveryCodes = await generateRecoveryCodes(admin.id, tx as DbLike);
      await logAndNotify('passkey.added', 'passkey_added');
      await tx.delete(adminSession).where(eq(adminSession.tokenHash, ctx.session.tokenHash));
      const next = await createSession(admin.id, 'full', {
        now,
        reauth: true,
        userAgentSummary: ctx.session.userAgentSummary,
        tx,
      });
      return { ok: true, status: 'ok', recoveryCodes, token: next.token };
    });
    kickOutbox();
    return result;
  } catch (error) {
    // Most likely the credential is already registered (unique credential id).
    log.warn('passkey_registration_failed', {
      errorCode: error instanceof Error ? error.name : 'unknown',
    });
    return { ok: false, error: 'registration_failed' };
  }
}
