import 'server-only';
import { asc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { logActivity } from '@/server/activity/log';
import { fieldFailure, ok, type ActionResult, type Actor } from '@/server/catalog/result';
import { isValidPhone, normalisePhone } from '@/server/checkout/validate';
import { db } from '@/server/db/client';
import { emailOutbox, orders, pendingCheckout } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { isOpen, type OrderStatus, type PaymentState } from '@/server/orders/status';

/**
 * Finding a customer (003 research R8, FR-016). One identifier per search: an email (any case)
 * or a phone (any format, compared as E.164). There is no automatic merging of identifiers.
 */

export const QUERY_ERROR = 'admin.customers.errors.query';

export type OrderRow = typeof orders.$inferSelect;
export type CheckoutRow = typeof pendingCheckout.$inferSelect;

/** An outbox row without its body (the sender blanks bodies after sending; they are never listed). */
export interface EmailSummary {
  id: string;
  kind: string;
  toAddress: string;
  replyTo: string | null;
  orderId: string | null;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  createdAt: Date;
  sentAt: Date | null;
}

export interface CustomerQuery {
  field: 'email' | 'phone';
  /** Lower-cased email, or the phone as E.164. */
  value: string;
}

/** The shared input of export, withdrawal and anonymisation. */
export interface CustomerRef {
  q: string;
  orderIds: string[];
}

export interface OtherIdentifiers {
  emails: string[];
  phones: string[];
}

export interface FoundCustomer {
  query: CustomerQuery;
  /** Newest first. */
  orders: OrderRow[];
  checkouts: CheckoutRow[];
  emails: EmailSummary[];
  otherIdentifiers: OtherIdentifiers;
}

export interface MatchedCustomer extends FoundCustomer {
  /** `orderIds` that no longer match `q` (or never did), duplicates counted once. */
  skipped: number;
}

export interface SearchOrder {
  id: string;
  orderNumber: number;
  createdAt: string;
  status: OrderStatus;
  paymentState: PaymentState;
  totalMinor: number;
  currency: 'ILS' | 'USD';
  marketingOptIn: boolean;
  /** Not completed or cancelled. */
  open: boolean;
}

export interface SearchResult {
  field: 'email' | 'phone';
  orders: SearchOrder[];
  pendingCheckouts: number;
  emails: number;
  otherIdentifiers: OtherIdentifiers;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An email (contains `@`) or a valid phone (Israel by default); anything else is `null`. */
export function parseCustomerQuery(q: string): CustomerQuery | null {
  const text = q.trim();
  if (text.length < 3 || text.length > 254) return null;
  if (text.includes('@'))
    return EMAIL.test(text) ? { field: 'email', value: text.toLowerCase() } : null;
  if (!isValidPhone(text, undefined)) return null;
  return { field: 'phone', value: normalisePhone(text, undefined) };
}

/** What `activity` rows of this feature look like: the admin, a count, never a person. */
export function customerActivity(actor: Actor, action: string, details: Record<string, unknown>) {
  return {
    adminId: actor.adminId,
    actorKind: 'admin' as const,
    actorLabel: actor.label,
    action,
    details,
  };
}

function lowerEquals(column: AnyPgColumn, value: string): SQL {
  return sql`lower(${column}) = ${value}`;
}

async function loadEmails(
  database: DbLike,
  query: CustomerQuery,
  orderIds: string[],
): Promise<EmailSummary[]> {
  const conditions: SQL[] = [];
  if (orderIds.length > 0) conditions.push(inArray(emailOutbox.orderId, orderIds));
  if (query.field === 'email') {
    conditions.push(lowerEquals(emailOutbox.toAddress, query.value));
    conditions.push(lowerEquals(emailOutbox.replyTo, query.value));
  }
  const where = or(...conditions);
  if (where === undefined) return [];
  return database
    .select({
      id: emailOutbox.id,
      kind: emailOutbox.kind,
      toAddress: emailOutbox.toAddress,
      replyTo: emailOutbox.replyTo,
      orderId: emailOutbox.orderId,
      status: emailOutbox.status,
      createdAt: emailOutbox.createdAt,
      sentAt: emailOutbox.sentAt,
    })
    .from(emailOutbox)
    .where(where)
    .orderBy(asc(emailOutbox.createdAt), asc(emailOutbox.id));
}

function otherIdentifiersOf(query: CustomerQuery, rows: OrderRow[]): OtherIdentifiers {
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const row of rows) {
    if (row.customerEmail !== null) emails.add(row.customerEmail.toLowerCase());
    if (row.customerPhone !== null) phones.add(row.customerPhone);
  }
  if (query.field === 'email') emails.delete(query.value);
  else phones.delete(query.value);
  return { emails: [...emails].sort(), phones: [...phones].sort() };
}

/**
 * Every order, unfinished checkout and stored email the searched value reaches (R8 › "What a
 * search finds"); `null` when `q` is neither an email nor a valid phone. Anonymised orders hold no
 * email or phone, so they never match. With `lock` the matching orders are locked (`FOR UPDATE`).
 */
export async function findCustomer(
  q: string,
  database: DbLike = db,
  lock = false,
): Promise<FoundCustomer | null> {
  const query = parseCustomerQuery(q);
  if (query === null) return null;
  const orderMatch =
    query.field === 'email'
      ? lowerEquals(orders.customerEmail, query.value)
      : eq(orders.customerPhone, query.value);
  const select = database.select().from(orders).where(orderMatch).orderBy(asc(orders.id));
  const found = lock ? await select.for('update') : await select;
  const matched = found.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.orderNumber - a.orderNumber,
  );

  const checkouts = await database
    .select()
    .from(pendingCheckout)
    .where(
      query.field === 'email'
        ? lowerEquals(pendingCheckout.customerEmail, query.value)
        : eq(pendingCheckout.customerPhone, query.value),
    )
    .orderBy(asc(pendingCheckout.createdAt), asc(pendingCheckout.id));

  return {
    query,
    orders: matched,
    checkouts,
    emails: await loadEmails(
      database,
      query,
      matched.map((order) => order.id),
    ),
    otherIdentifiers: otherIdentifiersOf(query, matched),
  };
}

/**
 * The orders Aviva acts on: `orderIds` intersected with what `q` matches now (an order corrected
 * in between is skipped and counted; orders that arrive later are never touched).
 */
export async function matchOrders(
  ref: CustomerRef,
  database: DbLike = db,
  lock = false,
): Promise<MatchedCustomer | null> {
  const found = await findCustomer(ref.q, database, lock);
  if (found === null) return null;
  const wanted = new Set(ref.orderIds);
  const selected = found.orders.filter((order) => wanted.has(order.id));
  return {
    ...found,
    orders: selected,
    emails: await loadEmails(
      database,
      found.query,
      selected.map((order) => order.id),
    ),
    otherIdentifiers: otherIdentifiersOf(found.query, selected),
    skipped: wanted.size - selected.length,
  };
}

/** The search: read-only, but written to the activity log (`customer.searched` `{field, count}`). */
export async function searchCustomers(
  actor: Actor,
  q: string,
): Promise<ActionResult<SearchResult>> {
  if (parseCustomerQuery(q) === null) return fieldFailure('q', QUERY_ERROR);
  return db.transaction(async (tx) => {
    const found = await findCustomer(q, tx);
    if (found === null) return fieldFailure('q', QUERY_ERROR);
    await logActivity(
      tx,
      customerActivity(actor, 'customer.searched', {
        field: found.query.field,
        count: found.orders.length,
      }),
    );
    return ok({
      field: found.query.field,
      orders: found.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt.toISOString(),
        status: order.status,
        paymentState: order.paymentState,
        totalMinor: order.totalMinor,
        currency: order.currency,
        marketingOptIn: order.marketingOptIn,
        open: isOpen(order.status),
      })),
      pendingCheckouts: found.checkouts.length,
      emails: found.emails.length,
      otherIdentifiers: found.otherIdentifiers,
    });
  });
}
