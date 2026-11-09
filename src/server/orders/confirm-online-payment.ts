import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { orders, pendingCheckout } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { kickOutbox } from '@/server/email/sender';
import { log } from '@/server/security/logger';
import { insertOrder, onlineOrderToken } from './create-order';
import { enqueuePaymentAttention, enqueuePaymentMismatch } from './order-emails';
import { copyOrderImages, lineSnapshotsSchema, type PhotoToCopy } from './snapshots';
import type { PaymentStatus } from '@/server/payments/provider';

export type ConfirmOutcome =
  | 'confirmed'
  | 'duplicate'
  | 'second_payment'
  | 'switched_offline'
  | 'mismatch'
  | 'failed'
  | 'pending'
  | 'stale'
  | 'orphan_payment'
  | 'unknown';

export interface ConfirmOptions {
  /** Test hook (two connections in concurrency tests); defaults to the app's `db`. */
  database?: DbLike;
  now?: Date;
  /** The provider that reported the status; names it in owner alerts for unknown checkouts. */
  provider?: string;
}

const MISMATCH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface Result {
  outcome: ConfirmOutcome;
  orderId?: string;
  orderNumber?: number;
  pendingId?: string;
  photos?: PhotoToCopy[];
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === 'object' && current !== null; depth += 1) {
    if ((current as { code?: unknown }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function confirmInTx(
  tx: DbLike,
  status: PaymentStatus,
  pageId: string,
  now: Date,
  providerId: string,
): Promise<Result> {
  const paid = status.status === 'paid';
  // A paid status without a transaction id cannot be told apart from a repeat: wait for one.
  if (paid && status.transactionId === null) return { outcome: 'pending' };
  const [pending] = await tx
    .select()
    .from(pendingCheckout)
    .where(eq(pendingCheckout.id, status.reference))
    .for('update');

  if (!pending) {
    if (!paid) return { outcome: 'unknown' };
    // A late provider retry after the confirmed pending row was deleted: the order is there.
    const [known] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(
        providerId === ''
          ? eq(orders.providerTransactionId, status.transactionId ?? '')
          : and(
              eq(orders.provider, providerId),
              eq(orders.providerTransactionId, status.transactionId ?? ''),
            ),
      );
    if (known) return { outcome: 'duplicate' };
    await enqueuePaymentAttention(tx, status.reference, {
      case: 'orphan_payment',
      reference: status.reference,
      provider: providerId === '' ? 'unknown' : providerId,
      amountMinor: status.amountMinor,
      currency: status.currency,
      transactionId: status.transactionId,
    });
    return { outcome: 'orphan_payment', pendingId: status.reference };
  }

  const common = {
    reference: pending.id,
    provider: pending.provider,
    amountMinor: status.amountMinor,
    currency: status.currency,
    transactionId: status.transactionId,
  };

  if (pending.state === 'confirmed') {
    const [order] = pending.orderId
      ? await tx
          .select({ transactionId: orders.providerTransactionId })
          .from(orders)
          .where(eq(orders.id, pending.orderId))
      : [];
    if (status.transactionId !== null && status.transactionId === order?.transactionId) {
      return { outcome: 'duplicate', pendingId: pending.id };
    }
    if (paid) {
      await enqueuePaymentAttention(tx, pending.id, {
        ...common,
        case: 'second_payment',
        orderId: pending.orderId ?? undefined,
      });
      return { outcome: 'second_payment', pendingId: pending.id };
    }
    return { outcome: 'duplicate', pendingId: pending.id };
  }
  if (pending.state === 'mismatch') return { outcome: 'mismatch', pendingId: pending.id };
  if (pending.state === 'switched_offline') {
    if (paid) {
      await enqueuePaymentAttention(tx, pending.id, {
        ...common,
        case: 'switched_offline',
        orderId: pending.orderId ?? undefined,
      });
    }
    return {
      outcome: 'switched_offline',
      pendingId: pending.id,
      ...(pending.orderId ? { orderId: pending.orderId } : {}),
    };
  }

  // Late news about an old, disabled page changes nothing (but a payment on it is honoured).
  if (!paid && pageId !== pending.providerPageId)
    return { outcome: 'stale', pendingId: pending.id };
  if (status.status === 'pending') return { outcome: 'pending', pendingId: pending.id };
  if (status.status === 'failed') {
    await tx
      .update(pendingCheckout)
      .set({ state: 'failed' })
      .where(eq(pendingCheckout.id, pending.id));
    return { outcome: 'failed', pendingId: pending.id };
  }

  if (status.amountMinor !== pending.totalMinor || status.currency !== pending.currency) {
    await tx
      .update(pendingCheckout)
      .set({ state: 'mismatch', retainedUntil: new Date(now.getTime() + MISMATCH_RETENTION_MS) })
      .where(eq(pendingCheckout.id, pending.id));
    await enqueuePaymentMismatch(tx, pending.id, {
      reference: pending.id,
      provider: pending.provider,
      expectedMinor: pending.totalMinor,
      expectedCurrency: pending.currency,
      reportedMinor: status.amountMinor,
      reportedCurrency: status.currency,
      transactionId: status.transactionId,
      customer: {
        name: pending.customerName ?? '',
        phone: pending.customerPhone ?? '',
        email: pending.customerEmail ?? '',
      },
    });
    return { outcome: 'mismatch', pendingId: pending.id };
  }

  const lines = lineSnapshotsSchema.parse(pending.lines);
  const created = await insertOrder(tx, {
    locale: pending.locale,
    zoneId: pending.zoneId,
    currency: pending.currency,
    customer: {
      name: pending.customerName ?? '',
      phone: pending.customerPhone,
      email: pending.customerEmail,
    },
    deliveryMethod: pending.deliveryMethod,
    address:
      pending.deliveryMethod === 'shipping'
        ? {
            country: pending.addressCountry ?? '',
            city: pending.addressCity ?? '',
            line1: pending.addressLine1 ?? '',
            line2: pending.addressLine2,
            postalCode: pending.addressPostalCode,
          }
        : null,
    note: pending.note,
    paymentMethod: 'online',
    paid: { at: now, provider: pending.provider, transactionId: status.transactionId ?? '' },
    subtotalMinor: pending.subtotalMinor,
    deliveryFeeMinor: pending.deliveryFeeMinor,
    totalMinor: pending.totalMinor,
    termsAcceptedAt: pending.termsAcceptedAt,
    termsVersion: pending.termsVersion,
    privacyVersion: pending.privacyVersion,
    marketingOptIn: pending.marketingOptIn,
    marketingOptInAt: pending.marketingOptInAt,
    lines,
    token: onlineOrderToken(pending.resumeTokenHash),
    now,
  });
  await tx
    .update(pendingCheckout)
    .set({
      state: 'confirmed',
      orderId: created.orderId,
      customerName: null,
      customerPhone: null,
      customerEmail: null,
      addressCountry: null,
      addressCity: null,
      addressLine1: null,
      addressLine2: null,
      addressPostalCode: null,
      note: null,
      lines: null,
    })
    .where(and(eq(pendingCheckout.id, pending.id), eq(pendingCheckout.state, pending.state)));
  return {
    outcome: 'confirmed',
    orderId: created.orderId,
    orderNumber: created.orderNumber,
    pendingId: pending.id,
    photos: created.photos,
  };
}

/**
 * Applies a provider-verified payment status to its pending checkout: the exact algorithm of
 * contracts/payment-provider.md. One transaction with a row lock, so concurrent and repeated
 * notifications of one payment create one order; a unique violation on the provider transaction
 * is a `duplicate`. After the commit the outbox is kicked and the order photos are copied.
 */
export async function confirmOnlinePayment(
  status: PaymentStatus,
  pageId: string,
  { database = db, now = new Date(), provider = '' }: ConfirmOptions = {},
): Promise<ConfirmOutcome> {
  let result: Result;
  try {
    result = await database.transaction((tx) => confirmInTx(tx, status, pageId, now, provider));
  } catch (error) {
    if (isUniqueViolation(error)) {
      log.info('payment.duplicate', { kind: 'unique_violation' });
      return 'duplicate';
    }
    throw error;
  }

  const fields = {
    ...(result.pendingId === undefined ? {} : { pendingId: result.pendingId }),
    ...(result.orderNumber === undefined ? {} : { orderNumber: result.orderNumber }),
  };
  switch (result.outcome) {
    case 'confirmed':
      log.info('payment.confirmed', fields);
      break;
    case 'duplicate':
      log.info('payment.duplicate', fields);
      break;
    case 'failed':
      log.info('payment.failed', fields);
      break;
    case 'mismatch':
      log.warn('payment.mismatch', fields);
      break;
    case 'second_payment':
    case 'switched_offline':
    case 'orphan_payment':
      if (status.status === 'paid') log.warn(`payment.${result.outcome}`, fields);
      break;
    default:
      break;
  }

  if (result.outcome === 'confirmed' && result.orderId !== undefined) {
    kickOutbox();
    await copyOrderImages(result.orderId, result.photos ?? [], database);
  } else if (
    result.outcome === 'mismatch' ||
    result.outcome === 'second_payment' ||
    result.outcome === 'switched_offline' ||
    result.outcome === 'orphan_payment'
  ) {
    kickOutbox();
  }
  return result.outcome;
}
