import 'server-only';
import { and, asc, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { logActivity } from '@/server/activity/log';
import {
  fieldFailure,
  formFailure,
  ok,
  type ActionResult,
  type Actor,
} from '@/server/catalog/result';
import { db } from '@/server/db/client';
import { emailOutbox, orderEvent, orders } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { customerActivity, matchOrders, QUERY_ERROR, type CustomerRef } from './customers';

/** The text that replaces the customer's name (001 data-model › order). */
export const ANONYMISED_NAME = 'נמחק';

/**
 * Applies 001 data-model › order exactly to the orders in `orderIds` that are not anonymised yet,
 * and writes one `order_event` `anonymized` for each. `actor` is the admin who asked; `null` is the
 * system (the 7-year task), marked `data: {system: true}` so an admin who is removed later is never
 * mistaken for the system. Returns the ids it anonymised. The caller owns the transaction.
 */
export async function anonymizeOrders(
  tx: DbLike,
  orderIds: string[],
  actor: Actor | null,
  now: Date = new Date(),
): Promise<string[]> {
  if (orderIds.length === 0) return [];
  const locked = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(and(inArray(orders.id, orderIds), isNull(orders.anonymizedAt)))
    .orderBy(asc(orders.id))
    .for('update');
  const ids = locked.map((row) => row.id);
  if (ids.length === 0) return [];

  await tx
    .update(orders)
    .set({
      customerName: ANONYMISED_NAME,
      customerPhone: null,
      customerEmail: null,
      addressCity: null,
      addressLine1: null,
      addressLine2: null,
      addressPostalCode: null,
      note: null,
      trackingNumber: null,
      pickupNote: null,
      marketingOptIn: false,
      marketingOptInAt: null,
      marketingWithdrawnAt: null,
      anonymizedAt: now,
      updatedAt: now,
    })
    .where(inArray(orders.id, ids));
  await tx.insert(orderEvent).values(
    ids.map((orderId) => ({
      orderId,
      adminId: actor === null ? null : actor.adminId,
      kind: 'anonymized',
      data: actor === null ? { system: true } : {},
      createdAt: sql`clock_timestamp()`,
    })),
  );
  return ids;
}

/** Deletes every outbox row of these orders, whatever its status (owner notifications included). */
export async function deleteOutboxOfOrders(tx: DbLike, orderIds: string[]): Promise<number> {
  if (orderIds.length === 0) return 0;
  const rows = await tx
    .delete(emailOutbox)
    .where(inArray(emailOutbox.orderId, orderIds))
    .returning({ id: emailOutbox.id });
  return rows.length;
}

/**
 * Anonymisation on request (003 research R10, FR-019): the shown orders that still match `q`, and
 * the stored emails of the searched email. It deletes **no** `pending_checkout` row: each one that
 * still holds personal data may become a real payment, so it is left to expire and counted in
 * `keptCheckouts` (SC-007). Only the searched value defines the reach (user decision Q5).
 */
export async function anonymizePerson(
  actor: Actor,
  ref: CustomerRef & { confirm?: boolean },
  options: { now?: Date } = {},
): Promise<ActionResult<{ count: number; skipped: number; keptCheckouts: number }>> {
  // Before any query.
  if (ref.confirm !== true) return formFailure('admin.confirm_required');
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    const match = await matchOrders(ref, tx, true);
    if (match === null) return fieldFailure('q', QUERY_ERROR);

    const anonymised = await anonymizeOrders(
      tx,
      match.orders.map((order) => order.id),
      actor,
      now,
    );

    // Emails: every row of the anonymised orders, and for an email search every row addressed to
    // or replying to that email. The owner's payment-mismatch mail belongs to the kept checkout.
    const byOrder = anonymised.length > 0 ? inArray(emailOutbox.orderId, anonymised) : undefined;
    const byEmail =
      match.query.field === 'email'
        ? and(
            or(
              sql`lower(${emailOutbox.toAddress}) = ${match.query.value}`,
              sql`lower(${emailOutbox.replyTo}) = ${match.query.value}`,
            ),
            ne(emailOutbox.kind, 'payment-mismatch'),
          )
        : undefined;
    const where = or(byOrder, byEmail);
    if (where !== undefined) await tx.delete(emailOutbox).where(where);

    // Always logged, even for count 0 (an erase that changes nothing), like the other customer
    // actions (FR-019a, US3 #7; user decision 2026-11-10).
    await logActivity(
      tx,
      customerActivity(actor, 'customer.anonymized', { count: anonymised.length }),
    );
    return ok({
      count: anonymised.length,
      skipped: match.skipped,
      keptCheckouts: match.checkouts.length,
    });
  });
}
