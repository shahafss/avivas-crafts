import 'server-only';
import { inArray } from 'drizzle-orm';
import { logActivity } from '@/server/activity/log';
import {
  fieldFailure,
  formFailure,
  ok,
  type ActionResult,
  type Actor,
} from '@/server/catalog/result';
import { db } from '@/server/db/client';
import { orders, pendingCheckout } from '@/server/db/schema';
import { customerActivity, matchOrders, QUERY_ERROR, type CustomerRef } from './customers';

/**
 * Marketing withdrawal (003 research R10, FR-018): the shown orders with consent get
 * `marketing_opt_in = false` and a withdrawal date (the original consent date stays); the
 * unfinished checkouts the search finds lose their consent too, so an order confirmed afterwards
 * does not bring it back.
 */
export async function withdrawMarketingConsent(
  actor: Actor,
  ref: CustomerRef & { confirm?: boolean },
  options: { now?: Date } = {},
): Promise<ActionResult<{ count: number }>> {
  // Before any query.
  if (ref.confirm !== true) return formFailure('admin.confirm_required');
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    const match = await matchOrders(ref, tx, true);
    if (match === null) return fieldFailure('q', QUERY_ERROR);

    const orderIds = match.orders.filter((order) => order.marketingOptIn).map((order) => order.id);
    if (orderIds.length > 0) {
      await tx
        .update(orders)
        .set({ marketingOptIn: false, marketingWithdrawnAt: now, updatedAt: now })
        .where(inArray(orders.id, orderIds));
    }
    const checkoutIds = match.checkouts
      .filter((checkout) => checkout.marketingOptIn)
      .map((checkout) => checkout.id);
    if (checkoutIds.length > 0) {
      await tx
        .update(pendingCheckout)
        .set({ marketingOptIn: false, marketingOptInAt: null, updatedAt: now })
        .where(inArray(pendingCheckout.id, checkoutIds));
    }
    await logActivity(
      tx,
      customerActivity(actor, 'customer.marketing_withdrawn', { count: orderIds.length }),
    );
    return ok({ count: orderIds.length });
  });
}
