import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { and, count, eq, gt, isNotNull, isNull, like, lt, or } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { adminSession, adminUser, rateLimitBucket } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { logActivity } from '@/server/activity/log';
import { kickOutbox } from '@/server/email/sender';
import type { JobTask } from '@/server/jobs/daily-maintenance';
import { notifyAdmins } from '@/server/security/notify';
import { getEnv } from '@/server/env';
import { checkRateLimit } from '@/server/security/rate-limit';
import type { SecurityAlertKind } from '@/server/email/templates/security-alert';
import { PENDING_IDLE_MS } from './session';

/** Failed passkey / recovery-code attempts per admin within the window that cause a block. */
export const FAILURE_LIMIT = 5;
export const FAILURE_WINDOW_MS = 15 * 60_000;
export const BLOCK_MS = 15 * 60_000;

const KEY_SCOPE = 'pkfail:';

/** `pkfail:<hmac of the admin id>:` (data-model.md: bucket subjects are HMACs, never raw ids). */
function keyPrefix(adminId: string): string {
  const key = Buffer.from(getEnv().SECRET_HMAC_KEY, 'base64');
  return `${KEY_SCOPE}${createHmac('sha256', key).update(`pkfail:${adminId}`).digest('hex')}:`;
}

export function isBlocked(
  admin: { passkeyBlockedUntil: Date | null },
  now: Date = new Date(),
): boolean {
  return admin.passkeyBlockedUntil !== null && admin.passkeyBlockedUntil.getTime() > now.getTime();
}

export interface FailureTarget {
  id: string;
  displayName: string;
}

export interface RecordFailureOptions {
  /** Activity action of the failure, e.g. `signin.passkey_failed`. */
  action: string;
  /** Activity `details` (allow-listed keys only). */
  details?: Record<string, unknown> | undefined;
  /** Throttled alert to send for this failure itself (abandoned second step). */
  alert?: SecurityAlertKind | undefined;
  now?: Date | undefined;
  tx?: DbLike | undefined;
}

/**
 * Writes the failure's activity row and counts it in a sliding 15-minute window (one
 * `rate_limit_bucket` row per failure, so the count is exact and the rows clean themselves up).
 * The 5th failure blocks the admin for 15 minutes (`signin.blocked`) and alerts every admin.
 * Returns whether the admin is blocked now.
 */
export async function recordFailure(
  admin: FailureTarget,
  options: RecordFailureOptions,
): Promise<{ blocked: boolean }> {
  if (options.tx === undefined) {
    const result = await db.transaction((tx) => recordFailure(admin, { ...options, tx }));
    kickOutbox();
    return result;
  }
  const { tx, now = new Date() } = options;
  const activityId = await logActivity(tx, {
    adminId: admin.id,
    actorKind: 'admin',
    actorLabel: admin.displayName,
    action: options.action,
    details: options.details,
  });
  if (options.alert !== undefined) {
    await notifyAdmins(
      options.alert,
      { at: now, adminName: admin.displayName },
      { tx, activityId, now },
    );
  }

  await tx.insert(rateLimitBucket).values({
    key: `${keyPrefix(admin.id)}${String(now.getTime())}:${randomBytes(4).toString('hex')}`,
    count: 1,
    expiresAt: new Date(now.getTime() + FAILURE_WINDOW_MS),
  });
  const [counted] = await tx
    .select({ failures: count() })
    .from(rateLimitBucket)
    .where(
      and(like(rateLimitBucket.key, `${keyPrefix(admin.id)}%`), gt(rateLimitBucket.expiresAt, now)),
    );
  const failures = counted?.failures ?? 0;

  const [current] = await tx
    .select({ passkeyBlockedUntil: adminUser.passkeyBlockedUntil })
    .from(adminUser)
    .where(eq(adminUser.id, admin.id));
  if (!current) return { blocked: false }; // the admin was removed meanwhile
  if (failures >= FAILURE_LIMIT && !isBlocked(current, now)) {
    await tx
      .update(adminUser)
      .set({ passkeyFailCount: failures, passkeyBlockedUntil: new Date(now.getTime() + BLOCK_MS) })
      .where(eq(adminUser.id, admin.id));
    const blockedId = await logActivity(tx, {
      adminId: admin.id,
      actorKind: 'admin',
      actorLabel: admin.displayName,
      action: 'signin.blocked',
    });
    await notifyAdmins(
      'blocked',
      { at: now, adminName: admin.displayName },
      { tx, activityId: blockedId, now },
    );
    return { blocked: true };
  }
  await tx.update(adminUser).set({ passkeyFailCount: failures }).where(eq(adminUser.id, admin.id));
  return { blocked: isBlocked(current, now) };
}

/** After a successful passkey assertion (and for another admin clearing a block, T122). */
export async function clearFailures(adminId: string, tx: DbLike = db): Promise<void> {
  await tx.delete(rateLimitBucket).where(like(rateLimitBucket.key, `${keyPrefix(adminId)}%`));
  await tx
    .update(adminUser)
    .set({ passkeyFailCount: 0, passkeyBlockedUntil: null })
    .where(eq(adminUser.id, adminId));
}

/** Google sign-in starts: 10 per 15 minutes per IP-hash. */
export async function googleStartAllowed(ip: string | null, now?: Date): Promise<boolean> {
  const result = await checkRateLimit('google-start', ip ?? 'unknown', {
    limit: 10,
    windowSec: 900,
    ...(now === undefined ? {} : { now }),
  });
  return result.allowed;
}

/**
 * Pending sessions that expired or were replaced without reaching `full` (and were not ended on
 * purpose): each counts as one failure, writes `signin.passkey_abandoned` and sends the
 * throttled "passkey step not completed" alert. The daily cleanup deletes them afterwards.
 */
export const abandonedPasskeySessionsTask: JobTask = {
  name: 'abandoned-passkey-sessions',
  async run(database, now) {
    const idleBefore = new Date(now.getTime() - PENDING_IDLE_MS);
    const due = await database
      .select({ tokenHash: adminSession.tokenHash, admin: adminUser })
      .from(adminSession)
      .innerJoin(adminUser, eq(adminUser.id, adminSession.adminId))
      .where(
        and(
          eq(adminSession.stage, 'pending_passkey'),
          isNull(adminSession.abandonProcessedAt),
          or(isNotNull(adminSession.endedAt), lt(adminSession.lastSeenAt, idleBefore)),
        ),
      )
      .limit(200);

    let processed = 0;
    for (const { tokenHash, admin } of due) {
      const done = await database.transaction(async (tx) => {
        const claimed = await tx
          .update(adminSession)
          .set({ abandonProcessedAt: now })
          .where(
            and(eq(adminSession.tokenHash, tokenHash), isNull(adminSession.abandonProcessedAt)),
          )
          .returning({ tokenHash: adminSession.tokenHash });
        if (claimed.length === 0) return false; // another instance took it
        await tx
          .update(adminSession)
          .set({ endedAt: now })
          .where(and(eq(adminSession.tokenHash, tokenHash), isNull(adminSession.endedAt)));
        await recordFailure(admin, {
          action: 'signin.passkey_abandoned',
          alert: 'passkey_abandoned',
          now,
          tx,
        });
        return true;
      });
      if (done) processed += 1;
    }
    if (processed > 0) kickOutbox();
    return `abandoned ${String(processed)}`;
  },
};
