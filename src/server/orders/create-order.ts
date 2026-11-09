import 'server-only';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { orderEvent, orderLine, orders } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { getEnv } from '@/server/env';
import { enqueueOrderEmails } from './order-emails';
import { orderLineRows, type LineSnapshot, type PhotoToCopy } from './snapshots';

/** Order confirmation links stay valid for 30 days (data-model.md > orders). */
export const ORDER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function sha256(value: string | Buffer): Buffer {
  return createHash('sha256').update(value).digest();
}

/** 32 random bytes, base64url without padding: 43 characters. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * The confirmation-page token of an online order: `HMAC(SECRET_HMAC_KEY, 'order:' + hex(hash))`
 * of the pending checkout's stored `resume_token_hash`. Both the confirmation (which only knows
 * the hash) and the status endpoint (which hashes the token it is given) can compute it.
 */
export function onlineOrderToken(resumeTokenHash: Buffer): string {
  return createHmac('sha256', Buffer.from(getEnv().SECRET_HMAC_KEY, 'base64'))
    .update(`order:${resumeTokenHash.toString('hex')}`)
    .digest('base64url');
}

export interface NewOrder {
  locale: 'he' | 'en';
  zoneId: string;
  currency: 'ILS' | 'USD';
  customer: { name: string; phone: string | null; email: string | null };
  deliveryMethod: 'shipping' | 'pickup';
  address: {
    country: string;
    city: string;
    line1: string;
    line2: string | null;
    postalCode: string | null;
  } | null;
  note: string | null;
  paymentMethod: 'online' | 'offline';
  /** Online orders are created paid, at the moment the payment is confirmed. */
  paid: { at: Date; provider: string; transactionId: string } | null;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  termsAcceptedAt: Date;
  termsVersion: number;
  privacyVersion: number;
  marketingOptIn: boolean;
  marketingOptInAt: Date | null;
  lines: readonly LineSnapshot[];
  /** The confirmation-page token whose hash is stored. */
  token: string;
  now: Date;
}

export interface CreatedOrder {
  orderId: string;
  orderNumber: number;
  photos: PhotoToCopy[];
}

/**
 * Inserts an order with its line snapshots and first event, and queues the customer and owner
 * emails, all inside the caller's transaction. Offline `placeOrder`, the switch to offline
 * payment and the online confirmation share this one path. The caller copies the photos
 * (`copyOrderImages`) and kicks the outbox after the transaction commits.
 */
export async function insertOrder(tx: DbLike, input: NewOrder): Promise<CreatedOrder> {
  const [order] = await tx
    .insert(orders)
    .values({
      publicTokenHash: sha256(input.token),
      publicTokenExpiresAt: new Date(input.now.getTime() + ORDER_TOKEN_TTL_MS),
      locale: input.locale,
      zoneId: input.zoneId,
      currency: input.currency,
      customerName: input.customer.name,
      customerPhone: input.customer.phone,
      customerEmail: input.customer.email,
      deliveryMethod: input.deliveryMethod,
      addressCountry: input.address?.country ?? null,
      addressCity: input.address?.city ?? null,
      addressLine1: input.address?.line1 ?? null,
      addressLine2: input.address?.line2 ?? null,
      addressPostalCode: input.address?.postalCode ?? null,
      note: input.note,
      paymentMethod: input.paymentMethod,
      paymentState: input.paid === null ? 'awaiting_payment' : 'paid',
      paidAt: input.paid?.at ?? null,
      provider: input.paid?.provider ?? null,
      providerTransactionId: input.paid?.transactionId ?? null,
      subtotalMinor: input.subtotalMinor,
      deliveryFeeMinor: input.deliveryFeeMinor,
      totalMinor: input.totalMinor,
      termsAcceptedAt: input.termsAcceptedAt,
      termsVersion: input.termsVersion,
      privacyVersion: input.privacyVersion,
      marketingOptIn: input.marketingOptIn,
      marketingOptInAt: input.marketingOptInAt,
    })
    .returning({ id: orders.id, orderNumber: orders.orderNumber });
  if (!order) throw new Error('order insert returned no row');

  const { rows, photos } = orderLineRows(order.id, input.lines);
  if (rows.length > 0) await tx.insert(orderLine).values(rows);
  await tx.insert(orderEvent).values({
    orderId: order.id,
    kind: input.paid === null ? 'created' : 'payment_confirmed',
    data: input.paid === null ? {} : { provider: input.paid.provider },
  });
  await enqueueOrderEmails(tx, order.id, input.token);
  return { orderId: order.id, orderNumber: order.orderNumber, photos };
}
