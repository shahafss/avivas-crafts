import 'server-only';
import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { adminPasskey, adminRecoveryCode, adminSession } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { logActivity } from '@/server/activity/log';
import { kickOutbox } from '@/server/email/sender';
import { notifyAdmins } from '@/server/security/notify';
import { endPendingSession, type SessionContext } from './session';
import { isBlocked, recordFailure } from './throttle';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32
const CODE_LENGTH = 12;
const CODE_COUNT = 10;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;
/** scrypt needs 128 * N * r bytes (32 MiB), which is exactly Node's default limit. */
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(code: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(code, salt, KEY_LENGTH, { ...SCRYPT, maxmem: MAX_MEMORY }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function hashCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(code, salt);
  return `scrypt$${String(SCRYPT.N)}$${String(SCRYPT.r)}$${String(SCRYPT.p)}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Upper-case, drops spaces and dashes, reads O as 0 and I/L as 1 (Crockford). Null when malformed. */
export function normalizeRecoveryCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{12}$/.test(code) ? code : null;
}

function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET.charAt(randomInt(ALPHABET.length));
  return code;
}

/** Replaces the admin's recovery codes with 10 new ones and returns them (the only time they exist in clear). */
export async function generateRecoveryCodes(adminId: string, tx: DbLike = db): Promise<string[]> {
  const codes = Array.from({ length: CODE_COUNT }, randomCode);
  // One after another: each scrypt (N=2^15) holds about 32 MiB, and the instance has 512 MB.
  const hashes: string[] = [];
  for (const code of codes) hashes.push(await hashCode(code));
  await tx.delete(adminRecoveryCode).where(eq(adminRecoveryCode.adminId, adminId));
  await tx.insert(adminRecoveryCode).values(hashes.map((codeHash) => ({ adminId, codeHash })));
  return codes;
}

/** Checks `input` against the admin's unused codes in constant time and marks the match used. */
export async function verifyRecoveryCode(
  adminId: string,
  input: string,
  now: Date = new Date(),
): Promise<boolean> {
  const code = normalizeRecoveryCode(input);
  if (code === null) return false;
  const rows = await db
    .select()
    .from(adminRecoveryCode)
    .where(and(eq(adminRecoveryCode.adminId, adminId), isNull(adminRecoveryCode.usedAt)));
  // Every unused hash is computed and compared, so timing does not reveal which one matched.
  // One after another: each scrypt (N=2^15) holds about 32 MiB and the instance has 512 MB.
  const checks: boolean[] = [];
  for (const row of rows) {
    const [, n, r, p, salt, hash] = row.codeHash.split('$');
    if (
      n !== String(SCRYPT.N) ||
      r !== String(SCRYPT.r) ||
      p !== String(SCRYPT.p) ||
      !salt ||
      !hash
    ) {
      checks.push(false);
      continue;
    }
    const expected = Buffer.from(hash, 'base64');
    const actual = await derive(code, Buffer.from(salt, 'base64'));
    checks.push(expected.length === actual.length && timingSafeEqual(expected, actual));
  }
  const index = checks.findIndex(Boolean);
  const match = index === -1 ? undefined : rows[index];
  if (!match) return false;
  // Single use, even under two simultaneous attempts.
  const used = await db
    .update(adminRecoveryCode)
    .set({ usedAt: now })
    .where(and(eq(adminRecoveryCode.id, match.id), isNull(adminRecoveryCode.usedAt)))
    .returning({ id: adminRecoveryCode.id });
  return used.length > 0;
}

/** Whether some *other* admin has at least one `active` passkey (recovery needs their approval). */
export async function hasOtherActiveAdmin(adminId: string, tx: DbLike = db): Promise<boolean> {
  const rows = await tx
    .select({ id: adminPasskey.id })
    .from(adminPasskey)
    .where(and(ne(adminPasskey.adminId, adminId), eq(adminPasskey.status, 'active')))
    .limit(1);
  return rows.length > 0;
}

export type RecoveryResult =
  | { ok: true }
  | { ok: false; error: 'no_other_admin' | 'blocked' | 'code_invalid' | 'code_required' };

/** Ends the pending session on purpose (not an abandoned sign-in), logs `recovery.refused` and alerts. */
export async function refuseRecovery(ctx: SessionContext, now: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    await endPendingSession(ctx.session, { processed: true, now, tx });
    const activityId = await logActivity(tx, {
      adminId: ctx.admin.id,
      actorKind: 'admin',
      actorLabel: ctx.admin.displayName,
      action: 'recovery.refused',
    });
    await notifyAdmins(
      'recovery_refused',
      { at: now, adminName: ctx.admin.displayName },
      { tx, activityId, now },
    );
  });
  kickOutbox();
}

/**
 * The recovery step of a pending session. Without another admin who has an active passkey it
 * refuses first, before the code is looked at (nothing consumed, no failure counted). Otherwise
 * a valid code is consumed and passkey registration (c) opens for 5 minutes.
 */
export async function attemptRecovery(
  ctx: SessionContext,
  code: string | undefined,
  { now = new Date() }: { now?: Date } = {},
): Promise<RecoveryResult> {
  if (!(await hasOtherActiveAdmin(ctx.admin.id))) {
    await refuseRecovery(ctx, now);
    return { ok: false, error: 'no_other_admin' };
  }
  if (isBlocked(ctx.admin, now)) return { ok: false, error: 'blocked' };
  if (code === undefined || code.trim() === '') return { ok: false, error: 'code_required' };

  if (!(await verifyRecoveryCode(ctx.admin.id, code, now))) {
    const { blocked } = await recordFailure(ctx.admin, {
      action: 'signin.passkey_failed',
      details: { field: 'recovery_code' },
      now,
    });
    return { ok: false, error: blocked ? 'blocked' : 'code_invalid' };
  }
  await db.transaction(async (tx) => {
    await tx
      .update(adminSession)
      .set({ recoveryVerifiedAt: now })
      .where(eq(adminSession.tokenHash, ctx.session.tokenHash));
    const activityId = await logActivity(tx, {
      adminId: ctx.admin.id,
      actorKind: 'admin',
      actorLabel: ctx.admin.displayName,
      action: 'recovery.used',
    });
    await notifyAdmins(
      'recovery_used',
      { at: now, adminName: ctx.admin.displayName },
      { tx, activityId, now },
    );
  });
  kickOutbox();
  return { ok: true };
}
