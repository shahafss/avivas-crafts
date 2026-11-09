import 'server-only';
import { and, asc, desc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { emailOutbox, orderEvent } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { getEnv } from '@/server/env';
import { enqueueOrderEmailFailed } from '@/server/orders/order-emails';
import { log } from '@/server/security/logger';
import { getSettings } from '@/server/settings/settings';
import { createOutboxOnlyDriver } from './drivers/outbox-only';
import { createResendDriver } from './drivers/resend';
import type { EmailDriver } from './drivers/types';

const LEASE_MS = 2 * 60_000;
/** Well under the lease, so a hung provider call cannot outlive the claim. */
const SEND_TIMEOUT_MS = 30_000;
const GIVE_UP_AFTER_MS = 24 * 60 * 60_000;
/** Minutes before the next attempt after the 1st, 2nd, ... failure; the last value repeats. */
const BACKOFF_MINUTES = [1, 2, 5, 10, 30, 60];
/** Owner mail that must not wait behind customer mail (Resend's free plan caps at 100/day). */
const PRIORITY_KINDS = ['new-order', 'security-alert', 'order-email-failed'];
/**
 * The order-received email gives up sooner than other mail (002 R5): at the first failed attempt
 * that is the third or later and made at least this long after it was queued.
 */
const CONFIRMATION_GIVE_UP_AFTER_MS = 2 * 60_000;
const CONFIRMATION_GIVE_UP_ATTEMPTS = 3;
/** Customer order emails whose give-up is recorded as an `email_failed` order event. */
const RECORDED_GIVE_UP_KINDS = ['order-confirmation', 'order-cancelled', 'order-refunded'];

export interface DrainOptions {
  limit?: number;
  now?: Date;
  /** Test hook; defaults to the driver chosen by `EMAIL_DRIVER`. */
  driver?: EmailDriver;
  /** Test hook (two connections in concurrency tests); defaults to the app's `db`. */
  database?: DbLike;
  /** Test hook; defaults to 30 s. */
  sendTimeoutMs?: number;
  /**
   * Called once after the send loop when this pass queued an `order-email-failed` owner email, so
   * it goes out at once. Defaults to `kickOutbox`; tests pass a `vi.fn()`.
   */
  onOwnerAlertQueued?: () => void;
}

function givesUp(
  row: { kind: string; orderId: string | null; createdAt: Date },
  attempts: number,
  now: Date,
): boolean {
  const age = now.getTime() - row.createdAt.getTime();
  if (age >= GIVE_UP_AFTER_MS) return true;
  return (
    row.kind === 'order-confirmation' &&
    row.orderId !== null &&
    attempts >= CONFIRMATION_GIVE_UP_ATTEMPTS &&
    age >= CONFIRMATION_GIVE_UP_AFTER_MS
  );
}

let defaultDriver: EmailDriver | undefined;

function getDriver(): EmailDriver {
  if (defaultDriver) return defaultDriver;
  const env = getEnv();
  defaultDriver =
    env.EMAIL_DRIVER === 'resend'
      ? createResendDriver(env.RESEND_API_KEY ?? '')
      : createOutboxOnlyDriver({ keepBodies: env.APP_ENV !== 'production' });
  return defaultDriver;
}

/** `"Shop name" <address>`: the shop name, never the legal business name. */
export function formatFrom(shopName: string, address: string): string {
  const safe = shopName
    .replace(/[\r\n]+/g, ' ')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"');
  return `"${safe}" <${address}>`;
}

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error('send timed out'));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

export function backoffMinutes(attempts: number): number {
  return BACKOFF_MINUTES[Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1] ?? 60;
}

/**
 * Claims due rows in one short transaction (SKIP LOCKED, so two senders never take the same
 * row; an expired lease makes a `sending` row claimable again), then sends each outside it.
 * Returns the number of rows sent.
 */
export async function drainOutbox({
  limit = 20,
  now = new Date(),
  driver,
  database = db,
  sendTimeoutMs = SEND_TIMEOUT_MS,
  onOwnerAlertQueued = kickOutbox,
}: DrainOptions = {}): Promise<number> {
  const claimed = await database.transaction(async (tx) => {
    const due = tx
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(
        or(
          and(eq(emailOutbox.status, 'pending'), lte(emailOutbox.nextAttemptAt, now)),
          and(eq(emailOutbox.status, 'sending'), lt(emailOutbox.lockedUntil, now)),
        ),
      )
      .orderBy(desc(inArray(emailOutbox.kind, PRIORITY_KINDS)), asc(emailOutbox.nextAttemptAt))
      .limit(limit)
      .for('update', { skipLocked: true });
    return tx
      .update(emailOutbox)
      .set({ status: 'sending', lockedUntil: new Date(now.getTime() + LEASE_MS) })
      .where(inArray(emailOutbox.id, due))
      .returning();
  });
  if (claimed.length === 0) return 0;

  const chosen = driver ?? getDriver();
  const settings = await getSettings();
  const address = getEnv().EMAIL_FROM;
  let sent = 0;
  let ownerAlertQueued = false;

  for (const row of claimed) {
    const shopName =
      row.locale === 'en' ? (settings.shopNameEn ?? settings.shopNameHe) : settings.shopNameHe;
    // Only the sender that still holds this claim may record the outcome.
    const holdsClaim = and(
      eq(emailOutbox.id, row.id),
      eq(emailOutbox.status, 'sending'),
      row.lockedUntil === null
        ? isNull(emailOutbox.lockedUntil)
        : eq(emailOutbox.lockedUntil, row.lockedUntil),
    );
    try {
      await withTimeout(
        chosen.send({
          from: formatFrom(shopName, address),
          to: row.toAddress,
          replyTo: row.replyTo ?? undefined,
          subject: row.subject,
          html: row.html,
          text: row.textBody,
        }),
        sendTimeoutMs,
      );
      await database
        .update(emailOutbox)
        .set({
          status: 'sent',
          sentAt: now,
          lockedUntil: null,
          attempts: row.attempts + 1,
          ...(chosen.keepBodies ? {} : { html: '', textBody: '', replyTo: null }),
        })
        .where(holdsClaim);
      sent += 1;
    } catch {
      const attempts = row.attempts + 1;
      let giveUp = givesUp(row, attempts, now);
      // The failed row keeps its bodies until it is deleted.
      const failed = { status: 'failed', lockedUntil: null, attempts } as const;
      if (giveUp && row.orderId !== null && RECORDED_GIVE_UP_KINDS.includes(row.kind)) {
        const orderId = row.orderId;
        // One transaction: the event and the owner email exist only if this sender really
        // recorded the failure (a sender that lost its claim changes nothing).
        const recorded = await database
          .transaction(async (tx) => {
            const updated = await tx
              .update(emailOutbox)
              .set(failed)
              .where(holdsClaim)
              .returning({ id: emailOutbox.id });
            if (updated.length === 0) return false;
            await tx.insert(orderEvent).values({
              orderId,
              adminId: null,
              kind: 'email_failed',
              data: { emailKind: row.kind },
              createdAt: sql`clock_timestamp()`,
            });
            if (row.kind === 'order-confirmation') await enqueueOrderEmailFailed(tx, orderId);
            return row.kind === 'order-confirmation';
          })
          .catch(() => {
            // Rolled back: fall back to a normal retry below so the attempt still counts.
            log.error('email_give_up_record_failed', { kind: row.kind, orderId });
            return 'error' as const;
          });
        if (recorded === 'error') {
          giveUp = false;
          await database
            .update(emailOutbox)
            .set({
              status: 'pending',
              lockedUntil: null,
              attempts,
              nextAttemptAt: new Date(now.getTime() + backoffMinutes(attempts) * 60_000),
            })
            .where(holdsClaim);
        } else if (recorded) ownerAlertQueued = true;
      } else {
        await database
          .update(emailOutbox)
          .set(
            giveUp
              ? failed
              : {
                  status: 'pending',
                  lockedUntil: null,
                  attempts,
                  nextAttemptAt: new Date(now.getTime() + backoffMinutes(attempts) * 60_000),
                },
          )
          .where(holdsClaim);
      }
      log.warn(giveUp ? 'email_failed' : 'email_retry', {
        kind: row.kind,
        ...(row.orderId === null ? {} : { orderId: row.orderId }),
        count: attempts,
      });
    }
  }
  if (ownerAlertQueued) onOwnerAlertQueued();
  return sent;
}

/** Fire-and-forget, called after the transaction that queued the mail has committed. */
export function kickOutbox(): void {
  void drainOutbox().catch(() => {
    log.error('outbox_kick_failed');
  });
}
