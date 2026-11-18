import 'server-only';
import { lt, or } from 'drizzle-orm';
import { IDLE_MS } from '@/server/auth/session';
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

/** Sessions past their 12 h lifetime or idle for more than 30 minutes. */
export const deleteExpiredSessions: JobTask = {
  name: 'cleanup-admin-session',
  async run(db, now) {
    const rows = await db
      .delete(adminSession)
      .where(
        or(
          lt(adminSession.expiresAt, now),
          lt(adminSession.lastSeenAt, new Date(now.getTime() - IDLE_MS)),
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
