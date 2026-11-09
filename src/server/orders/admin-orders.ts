import 'server-only';
import { and, asc, count, desc, eq, ne, type SQL } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { adminUser, orderEvent, orderLine, orders } from '@/server/db/schema';
import {
  canCancel,
  canEditFulfilment,
  canMarkPaid,
  canMarkRefunded,
  forwardTargets,
  stepBackTarget,
  type OrderStatus,
  type PaymentState,
} from './status';

/** Rows per page of the orders list (contracts/routes.md). */
export const ORDERS_PAGE_SIZE = 25;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_NUMBER = /^#?(\d{1,9})$/;

export interface AdminOrderListRow {
  id: string;
  orderNumber: number;
  createdAt: Date;
  customerName: string;
  totalMinor: number;
  currency: 'ILS' | 'USD';
  paymentState: PaymentState;
  status: OrderStatus;
}

export interface OrderListFilter {
  status?: OrderStatus | undefined;
  payment?: PaymentState | undefined;
  /** Excludes Cancelled orders (the admin home's link). */
  open?: boolean | undefined;
  /** 1-based; a page beyond the last returns the last one. */
  page: number;
}

/** The orders list, newest first (`created_at DESC, order_number DESC`), 25 per page. */
export async function listOrders(filter: OrderListFilter): Promise<{
  rows: AdminOrderListRow[];
  page: number;
  pageCount: number;
  total: number;
}> {
  const conditions: SQL[] = [];
  if (filter.status !== undefined) conditions.push(eq(orders.status, filter.status));
  if (filter.payment !== undefined) conditions.push(eq(orders.paymentState, filter.payment));
  if (filter.open === true) conditions.push(ne(orders.status, 'cancelled'));
  const where = conditions.length === 0 ? undefined : and(...conditions);

  const [counted] = await db.select({ total: count() }).from(orders).where(where);
  const total = counted?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filter.page) || 1), pageCount);

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      createdAt: orders.createdAt,
      customerName: orders.customerName,
      totalMinor: orders.totalMinor,
      currency: orders.currency,
      paymentState: orders.paymentState,
      status: orders.status,
    })
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt), desc(orders.orderNumber))
    .limit(ORDERS_PAGE_SIZE)
    .offset((page - 1) * ORDERS_PAGE_SIZE);
  return { rows, page, pageCount, total };
}

/**
 * The admin home's two counts (research R13): New orders, and awaiting-payment orders that are
 * not Cancelled (the same set as `listOrders({ payment: 'awaiting_payment', open: true })`).
 */
export async function getOrderCounts(): Promise<{ newOrders: number; awaitingPayment: number }> {
  const [newRow] = await db.select({ n: count() }).from(orders).where(eq(orders.status, 'new'));
  const [awaitingRow] = await db
    .select({ n: count() })
    .from(orders)
    .where(and(eq(orders.paymentState, 'awaiting_payment'), ne(orders.status, 'cancelled')));
  return { newOrders: newRow?.n ?? 0, awaitingPayment: awaitingRow?.n ?? 0 };
}

/** `"1023"` or `"#1023"` (trimmed, 1-9 digits) to the order's id. */
export async function findOrderIdByNumber(
  text: string,
): Promise<{ id: string } | { notFound: number } | { invalid: true }> {
  const match = ORDER_NUMBER.exec(text.trim());
  if (!match?.[1]) return { invalid: true };
  const number = Number(match[1]);
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.orderNumber, number));
  return row ? { id: row.id } : { notFound: number };
}

export type AdminOrder = typeof orders.$inferSelect;
export type AdminOrderLine = typeof orderLine.$inferSelect & { imageUrl: string | null };

export type HistoryActor =
  { kind: 'system' } | { kind: 'removed_admin' } | { kind: 'admin'; name: string };

export interface HistoryEntry {
  at: Date;
  kind: string;
  data: Record<string, unknown>;
  actor: HistoryActor;
}

export type FailedCustomerEmail = 'order-cancelled' | 'order-refunded';

export interface AdminOrderDetail {
  order: AdminOrder;
  /** In the order they were placed (`ORDER BY id`). */
  lines: AdminOrderLine[];
  /** Newest first. */
  history: HistoryEntry[];
  /** The "order received" email gave up (002 FR-007): call the customer. */
  confirmationEmailFailed: boolean;
  failedCustomerEmails: FailedCustomerEmail[];
  allowed: {
    /** Forward status steps; never `cancelled`. */
    forward: OrderStatus[];
    stepBackTo: OrderStatus | null;
    cancel: boolean;
    markPaid: boolean;
    markRefunded: boolean;
    editFulfilment: 'trackingNumber' | 'pickupNote' | null;
    editCustomer: boolean;
  };
}

/** Events the system writes itself: shown as "the system", never as a removed admin. */
const SYSTEM_KINDS = new Set(['created', 'payment_confirmed', 'email_failed']);

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Everything the order page shows; null for a malformed or unknown id. */
export async function getOrderDetail(id: string): Promise<AdminOrderDetail | null> {
  if (!UUID.test(id)) return null;
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) return null;

  const [lines, events] = await Promise.all([
    db.select().from(orderLine).where(eq(orderLine.orderId, id)).orderBy(asc(orderLine.id)),
    db
      .select({
        at: orderEvent.createdAt,
        kind: orderEvent.kind,
        data: orderEvent.data,
        adminId: orderEvent.adminId,
        adminName: adminUser.displayName,
      })
      .from(orderEvent)
      .leftJoin(adminUser, eq(adminUser.id, orderEvent.adminId))
      .where(eq(orderEvent.orderId, id))
      .orderBy(desc(orderEvent.createdAt), desc(orderEvent.id)),
  ]);

  const history: HistoryEntry[] = events.map((event) => ({
    at: event.at,
    kind: event.kind,
    data: asRecord(event.data),
    actor:
      event.adminId !== null && event.adminName !== null
        ? { kind: 'admin', name: event.adminName }
        : SYSTEM_KINDS.has(event.kind)
          ? { kind: 'system' }
          : { kind: 'removed_admin' },
  }));

  const failedKinds = history
    .filter((entry) => entry.kind === 'email_failed')
    .map((entry) => entry.data.emailKind);
  const failedCustomerEmails = (['order-cancelled', 'order-refunded'] as const).filter((kind) =>
    failedKinds.includes(kind),
  );

  // Newest first, so the first match is the latest move into the current status (research R2).
  const entered = history.find(
    (entry) => entry.kind === 'status_changed' && entry.data.to === order.status,
  );
  const enteredFrom = entered?.data.from;
  const stepBackTo = stepBackTarget(
    order.status,
    typeof enteredFrom === 'string' ? (enteredFrom as OrderStatus) : null,
  );

  return {
    order,
    lines: lines.map((line) => ({
      ...line,
      imageUrl: line.imageKey === null ? null : `/api/admin/media/${line.imageKey}`,
    })),
    history,
    confirmationEmailFailed: failedKinds.includes('order-confirmation'),
    failedCustomerEmails,
    allowed: {
      forward: forwardTargets(order.status, order.deliveryMethod),
      stepBackTo,
      cancel: canCancel(order.status),
      markPaid: canMarkPaid(order.paymentMethod, order.paymentState),
      markRefunded: canMarkRefunded(order.paymentState),
      editFulfilment: canEditFulfilment(order.status),
      editCustomer: order.anonymizedAt === null,
    },
  };
}
