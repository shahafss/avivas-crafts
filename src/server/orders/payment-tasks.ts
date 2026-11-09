import 'server-only';
import { and, eq, inArray, isNotNull, isNull, lt, or, gt } from 'drizzle-orm';
import { pendingCheckout } from '@/server/db/schema';
import { kickOutbox } from '@/server/email/sender';
import type { JobTask } from '@/server/jobs/daily-maintenance';
import { getProvider } from '@/server/payments';
import { PaymentProviderError } from '@/server/payments/provider';
import { log } from '@/server/security/logger';
import { confirmOnlinePayment, type ConfirmOutcome } from './confirm-online-payment';
import { enqueuePaymentAttention } from './order-emails';

const SWEEP_AFTER_MS = 5 * 60_000;
/** After this long past `expires_at` an unverifiable checkout is dropped with an owner alert. */
const UNVERIFIED_GRACE_MS = 24 * 60 * 60_000;
const OPEN_STATES = ['awaiting_provider', 'failed'] as const;

function errorCode(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

/**
 * Every five minutes (contracts/payment-provider.md > Expiry). First the rows that are past
 * their time and no longer need to be kept (confirmed, switched, mismatch past its retention)
 * are deleted; then each expired `awaiting_provider` / `failed` row gets one last status query
 * (paid: confirmed, not lost; query failing: kept for the next run, or alerted and deleted
 * 24 h after expiry), its page disabled (best effort) and the row deleted.
 */
export const expirePendingCheckoutsTask: JobTask = {
  name: 'expire-pending-checkouts',
  async run(database, now) {
    const finished = await database
      .delete(pendingCheckout)
      .where(
        or(
          and(
            lt(pendingCheckout.expiresAt, now),
            inArray(pendingCheckout.state, ['confirmed', 'switched_offline']),
          ),
          and(eq(pendingCheckout.state, 'mismatch'), lt(pendingCheckout.retainedUntil, now)),
        ),
      )
      .returning({ id: pendingCheckout.id });

    const expired = await database
      .select()
      .from(pendingCheckout)
      .where(and(lt(pendingCheckout.expiresAt, now), inArray(pendingCheckout.state, OPEN_STATES)));

    let confirmed = 0;
    let deleted = 0;
    let kept = 0;
    for (const row of expired) {
      const provider = getProvider(row.provider);
      let outcome: ConfirmOutcome | null = null;
      if (row.providerPageId !== null) {
        try {
          const status = await provider.fetchPaymentStatus(row.providerPageId);
          if (status.status === 'paid' && status.transactionId === null) {
            // Paid, but nothing to confirm it by: as good as a status that could not be read.
            throw new PaymentProviderError(
              'fetchPaymentStatus',
              null,
              'paid without a transaction id',
            );
          }
          outcome = await confirmOnlinePayment(status, row.providerPageId, {
            database,
            now,
            provider: row.provider,
          });
        } catch (error) {
          log.warn('payment.expiry_status_failed', {
            pendingId: row.id,
            errorCode: errorCode(error),
          });
          if (now.getTime() < row.expiresAt.getTime() + UNVERIFIED_GRACE_MS) {
            kept += 1;
            continue;
          }
          await database.transaction((tx) =>
            enqueuePaymentAttention(tx, row.id, {
              case: 'unverified_expiry',
              reference: row.id,
              provider: row.provider,
              amountMinor: row.totalMinor,
              currency: row.currency,
              transactionId: null,
            }),
          );
          kickOutbox();
          log.error('payment.expiry_unverified', { pendingId: row.id });
        }
      }
      if (outcome === 'confirmed') {
        confirmed += 1;
        continue;
      }
      // A mismatch keeps its row (and the customer's contact details) for 30 days.
      if (outcome === 'mismatch') continue;
      if (row.providerPageId !== null) {
        try {
          await provider.disablePaymentPage(row.providerPageId);
        } catch (error) {
          log.warn('payment.disable_failed', { pendingId: row.id, errorCode: errorCode(error) });
        }
      }
      await database.delete(pendingCheckout).where(eq(pendingCheckout.id, row.id));
      deleted += 1;
    }
    return `deleted ${String(finished.length + deleted)}, confirmed ${String(confirmed)}, kept ${String(kept)}`;
  },
};

/**
 * Every five minutes: asks the provider about `awaiting_provider` and `failed` checkouts younger
 * than 48 h that were last checked more than five minutes ago, and confirms those that were paid
 * (a callback that never arrived, or a declined page paid on a second try).
 */
export const paymentRecoverySweepTask: JobTask = {
  name: 'payment-recovery-sweep',
  async run(database, now) {
    const cutoff = new Date(now.getTime() - SWEEP_AFTER_MS);
    const stale = or(
      isNull(pendingCheckout.lastStatusCheckAt),
      lt(pendingCheckout.lastStatusCheckAt, cutoff),
    );
    const rows = await database
      .select()
      .from(pendingCheckout)
      .where(
        and(
          inArray(pendingCheckout.state, OPEN_STATES),
          gt(pendingCheckout.expiresAt, now),
          isNotNull(pendingCheckout.providerPageId),
          stale,
        ),
      );
    let confirmed = 0;
    for (const row of rows) {
      const pageId = row.providerPageId;
      if (pageId === null) continue;
      // Taken only while still due: the status endpoint may have checked in the meantime.
      const claimed = await database
        .update(pendingCheckout)
        .set({ lastStatusCheckAt: now })
        .where(
          and(eq(pendingCheckout.id, row.id), inArray(pendingCheckout.state, OPEN_STATES), stale),
        )
        .returning({ id: pendingCheckout.id });
      if (claimed.length === 0) continue;
      try {
        const status = await getProvider(row.provider).fetchPaymentStatus(pageId);
        const outcome = await confirmOnlinePayment(status, pageId, {
          database,
          now,
          provider: row.provider,
        });
        if (outcome === 'confirmed') confirmed += 1;
      } catch (error) {
        log.warn('payment.sweep_failed', { pendingId: row.id, errorCode: errorCode(error) });
      }
    }
    return `checked ${String(rows.length)}, confirmed ${String(confirmed)}`;
  },
};
