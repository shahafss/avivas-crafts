import 'server-only';
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { logActivity } from '@/server/activity/log';
import { adminActivity, consentRecord, emailOutbox, orders } from '@/server/db/schema';
import type { JobTask } from '@/server/jobs/daily-maintenance';
import { anonymizeOrders, deleteOutboxOfOrders } from './anonymize';

/** At most this many orders per run; a backlog finishes over the following days (R11). */
const MAX_ORDERS_PER_RUN = 500;

/**
 * Calendar arithmetic in SQL from the `now` the task was given (R11), so an order 6 years and
 * 11 months old is never touched and tests can inject the clock.
 */
function before(now: Date, interval: string) {
  return sql`${now.toISOString()}::timestamptz - ${interval}::interval`;
}

/**
 * Orders older than 7 years lose their personal data (FR-026, 001 data-model › order), through the
 * same `anonymizeOrders` as the admin's request, as the system; their outbox rows go with them.
 * Never touches `pending_checkout` (SC-007). Logs one `system` activity row per run that anonymised
 * anything (data-model.md › admin_activity), so an idle day adds nothing.
 */
export const anonymizeOldOrders: JobTask = {
  name: 'anonymize-old-orders',
  async run(db, now) {
    const count = await db.transaction(async (tx) => {
      const old = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(and(isNull(orders.anonymizedAt), lt(orders.createdAt, before(now, '7 years'))))
        .orderBy(asc(orders.createdAt), asc(orders.id))
        .limit(MAX_ORDERS_PER_RUN);
      const ids = await anonymizeOrders(
        tx,
        old.map((row) => row.id),
        null,
        now,
      );
      if (ids.length === 0) return 0;
      await deleteOutboxOfOrders(tx, ids);
      await logActivity(tx, {
        adminId: null,
        actorKind: 'system',
        action: 'customer.anonymized',
        details: { count: ids.length },
      });
      return ids.length;
    });
    return `anonymised ${String(count)}`;
  },
};

export const deleteOldActivity: JobTask = {
  name: 'delete-old-activity',
  async run(db, now) {
    const rows = await db
      .delete(adminActivity)
      .where(lt(adminActivity.at, before(now, '2 years')))
      .returning({ id: adminActivity.id });
    return `deleted ${String(rows.length)}`;
  },
};

export const deleteOldConsent: JobTask = {
  name: 'delete-old-consent',
  async run(db, now) {
    const rows = await db
      .delete(consentRecord)
      .where(lt(consentRecord.decidedAt, before(now, '2 years')))
      .returning({ id: consentRecord.id });
    return `deleted ${String(rows.length)}`;
  },
};

/**
 * Sent mail 30 days after sending; failed mail 30 days after its final failure
 * (`next_attempt_at`, which the sender sets when it gives up). Pending mail is never deleted.
 */
export const deleteOldOutbox: JobTask = {
  name: 'delete-old-outbox',
  async run(db, now) {
    const cutoff = before(now, '30 days');
    const rows = await db
      .delete(emailOutbox)
      .where(
        or(
          and(eq(emailOutbox.status, 'sent'), lt(emailOutbox.sentAt, cutoff)),
          and(eq(emailOutbox.status, 'failed'), lt(emailOutbox.nextAttemptAt, cutoff)),
        ),
      )
      .returning({ id: emailOutbox.id });
    return `deleted ${String(rows.length)}`;
  },
};
