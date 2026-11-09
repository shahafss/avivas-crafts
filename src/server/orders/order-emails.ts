import 'server-only';
import { createHash } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { orderLine, orders, shopSettings } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { enqueueEmail } from '@/server/email/outbox';
import { renderNewOrder } from '@/server/email/templates/new-order';
import { renderOrderConfirmation } from '@/server/email/templates/order-confirmation';
import {
  renderPaymentAttention,
  type PaymentAttentionData,
} from '@/server/email/templates/payment-attention';
import {
  renderPaymentMismatch,
  type PaymentMismatchData,
} from '@/server/email/templates/payment-mismatch';
import { getEnv } from '@/server/env';

async function loadSettings(tx: DbLike) {
  // Read through `tx`, not `getSettings()`: another connection would not see this transaction.
  const [settings] = await tx.select().from(shopSettings).where(eq(shopSettings.id, 1));
  if (!settings) throw new Error('shop_settings row is missing: run `pnpm db:seed`');
  return settings;
}

function short(address: string): string {
  return createHash('sha256').update(address.toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * The first recipient keeps the plain dedupe key of contracts/emails.md; each further address
 * (up to three) gets the key plus a short hash of the address, so every recipient has its own row.
 */
function ownerKey(base: string, index: number, address: string): string {
  return index === 0 ? base : `${base}:${short(address)}`;
}

async function enqueueToOwners(
  tx: DbLike,
  recipients: readonly string[],
  mail: {
    kind: string;
    subject: string;
    html: string;
    text: string;
    baseKey: string;
    orderId?: string;
  },
): Promise<void> {
  const sorted = [...new Set(recipients.map((address) => address.toLowerCase()))].sort();
  for (const [index, to] of sorted.entries()) {
    await enqueueEmail(tx, {
      kind: mail.kind,
      to,
      locale: 'he',
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      orderId: mail.orderId,
      dedupeKey: ownerKey(mail.baseKey, index, to),
    });
  }
}

/**
 * Queues the two emails of a new order inside the caller's transaction: the customer's
 * `order-confirmation` and the owner's `new-order`. `orderToken` is the confirmation-page token
 * (only its hash is stored, so the caller supplies it).
 */
export async function enqueueOrderEmails(
  tx: DbLike,
  orderId: string,
  orderToken: string,
): Promise<void> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('order missing');
  const lines = await tx
    .select()
    .from(orderLine)
    .where(eq(orderLine.orderId, orderId))
    .orderBy(asc(orderLine.id));
  const settings = await loadSettings(tx);
  const origin = getEnv().APP_ORIGIN;
  const data = { order, lines, settings, origin };

  if (order.customerEmail !== null) {
    const customer = renderOrderConfirmation({ ...data, orderToken });
    await enqueueEmail(tx, {
      kind: 'order-confirmation',
      to: order.customerEmail,
      locale: order.locale,
      subject: customer.subject,
      html: customer.html,
      text: customer.text,
      orderId,
      dedupeKey: `order-confirmation:${orderId}`,
    });
  }
  const owner = renderNewOrder(data);
  await enqueueToOwners(tx, settings.notificationEmails, {
    kind: 'new-order',
    ...owner,
    baseKey: `new-order:${orderId}`,
    orderId,
  });
}

/** Owner email: a paid amount or currency that differs from the checkout (no order was made). */
export async function enqueuePaymentMismatch(
  tx: DbLike,
  pendingId: string,
  data: Omit<PaymentMismatchData, 'shopName'>,
): Promise<void> {
  const settings = await loadSettings(tx);
  const mail = renderPaymentMismatch({ ...data, shopName: settings.shopNameHe });
  await enqueueToOwners(tx, settings.notificationEmails, {
    kind: 'payment-mismatch',
    ...mail,
    baseKey: `mismatch:${pendingId}`,
  });
}

/**
 * Owner email: a payment that needs a decision. `orderId` is the order it concerns (the outbox
 * row links to it), if any.
 */
export async function enqueuePaymentAttention(
  tx: DbLike,
  pendingId: string,
  data: Omit<PaymentAttentionData, 'shopName' | 'orderNumber'> & { orderId?: string | undefined },
): Promise<void> {
  const settings = await loadSettings(tx);
  let orderNumber: number | undefined;
  if (data.orderId !== undefined) {
    const [order] = await tx
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.id, data.orderId));
    orderNumber = order?.orderNumber;
  }
  const mail = renderPaymentAttention({
    ...data,
    shopName: settings.shopNameHe,
    orderNumber,
  });
  await enqueueToOwners(tx, settings.notificationEmails, {
    kind: 'payment-attention',
    ...mail,
    baseKey: `attention:${pendingId}:${data.transactionId ?? data.case}`,
    ...(data.orderId === undefined ? {} : { orderId: data.orderId }),
  });
}
