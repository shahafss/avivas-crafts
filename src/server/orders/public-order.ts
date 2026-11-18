import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { orderLine, orders } from '@/server/db/schema';
import { sha256, TOKEN_PATTERN } from './create-order';
import { isOpen } from './status';

/** An order this young still clears the visitor's cart when its page opens (storefront.md §8.8). */
const JUST_PLACED_MS = 60 * 60 * 1000;

export type PublicOrder = typeof orders.$inferSelect;
export type PublicOrderLine = typeof orderLine.$inferSelect;

/**
 * The order behind an order-page link, or null when the link is unknown or no longer active
 * (002 FR-015, research R4): the link works while the order is open, whatever its stored expiry,
 * and after Completed or Cancelled until `public_token_expires_at` (set to 30 days after the
 * change). Only the token's hash is stored; the page never shows an address or phone number.
 */
export async function getOrderByToken(
  token: string,
  now: Date = new Date(),
): Promise<{ order: PublicOrder; lines: PublicOrderLine[]; justPlaced: boolean } | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.publicTokenHash, sha256(token)));
  if (!order) return null;
  if (!isOpen(order.status) && order.publicTokenExpiresAt.getTime() <= now.getTime()) return null;
  const lines = await db
    .select()
    .from(orderLine)
    .where(eq(orderLine.orderId, order.id))
    .orderBy(asc(orderLine.id));
  return { order, lines, justPlaced: now.getTime() - order.createdAt.getTime() < JUST_PLACED_MS };
}
