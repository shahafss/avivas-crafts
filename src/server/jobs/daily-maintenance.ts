import 'server-only';
import { and, eq, isNotNull, lt, or } from 'drizzle-orm';
import { abandonedPasskeySessionsTask } from '@/server/auth/throttle';
import { purgeDeletedImagesTask } from '@/server/catalog/images';
import { adminSession, oauthFlow, rateLimitBucket } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import {
  expirePendingCheckoutsTask,
  paymentRecoverySweepTask,
} from '@/server/orders/payment-tasks';
import {
  anonymizeOldOrders,
  deleteOldActivity,
  deleteOldConsent,
  deleteOldOutbox,
} from '@/server/privacy/retention';

export interface JobTask {
  /** Stored as `job_run.job`. */
  name: string;
  /** Lease length; defaults to 5 minutes. */
  maxDurationMs?: number;
  /** Returns a short, non-personal summary for `job_run.last_result`. */
  run: (db: DbLike, now: Date) => Promise<string | undefined>;
}

/** Run every minute (after the outbox drain). */
export const minuteTasks: JobTask[] = [abandonedPasskeySessionsTask];

/** Run every five minutes. */
export const fiveMinuteTasks: JobTask[] = [expirePendingCheckoutsTask, paymentRecoverySweepTask];

export const deleteExpiredRateLimitBuckets: JobTask = {
  name: 'cleanup-rate-limit',
  async run(db, now) {
    const rows = await db
      .delete(rateLimitBucket)
      .where(lt(rateLimitBucket.expiresAt, now))
      .returning({ key: rateLimitBucket.key });
    return `deleted ${String(rows.length)}`;
  },
};

export const deleteExpiredOauthFlows: JobTask = {
  name: 'cleanup-oauth-flow',
  async run(db, now) {
    const rows = await db
      .delete(oauthFlow)
      .where(lt(oauthFlow.expiresAt, now))
      .returning({ hash: oauthFlow.stateHash });
    return `deleted ${String(rows.length)}`;
  },
};

/**
 * Expired `full` sessions, and `pending_passkey` sessions whose abandonment was already handled.
 * Unprocessed pending sessions stay for the abandoned-sessions task.
 */
export const deleteExpiredSessions: JobTask = {
  name: 'cleanup-admin-session',
  async run(db, now) {
    const rows = await db
      .delete(adminSession)
      .where(
        or(
          and(eq(adminSession.stage, 'full'), lt(adminSession.expiresAt, now)),
          and(
            eq(adminSession.stage, 'pending_passkey'),
            isNotNull(adminSession.abandonProcessedAt),
          ),
        ),
      )
      .returning({ hash: adminSession.tokenHash });
    return `deleted ${String(rows.length)}`;
  },
};

/** Run when `job_run.last_finished_at` is before the current UTC day. */
export const dailyTasks: JobTask[] = [
  deleteExpiredRateLimitBuckets,
  deleteExpiredOauthFlows,
  deleteExpiredSessions,
  purgeDeletedImagesTask,
  anonymizeOldOrders,
  deleteOldActivity,
  deleteOldConsent,
  deleteOldOutbox,
];
