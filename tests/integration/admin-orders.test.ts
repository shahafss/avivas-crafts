// 002 US1 (tasks.md T006): the admin order loaders of src/server/orders/admin-orders.ts
// (contracts/server-actions.md > Data loaders; data-model.md > Derived read models).
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { makeActor } from '../helpers/catalog';
import {
  adminUser,
  orderEvent,
  orderLine,
  orders,
  product,
  shippingZone,
} from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { insertOrder, randomToken, type NewOrder } from '@/server/orders/create-order';
import type { LineSnapshot } from '@/server/orders/snapshots';
import {
  findOrderIdByNumber,
  getOrderCounts,
  getOrderDetail,
  listOrders,
} from '@/server/orders/admin-orders';

let testDb: TestDbHandle;
let zoneId = '';

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
vi.mock('@/server/storage', () => ({ getStorage: () => undefined }));
vi.mock('@/server/env', () => ({
  getEnv: () => ({
    APP_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3100',
    SECRET_HMAC_KEY: Buffer.from('admin-orders-test-hmac-key-0123456789abcdef').toString('base64'),
    EMAIL_DRIVER: 'outbox',
    EMAIL_FROM: 'shop@example.test',
  }),
}));
vi.mock('@/server/email/sender', () => ({ kickOutbox: vi.fn(), drainOutbox: vi.fn() }));

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
  const [zone] = await testDb.db.select({ id: shippingZone.id }).from(shippingZone).limit(1);
  zoneId = zone?.id ?? '';
});

function line(overrides: Partial<LineSnapshot> = {}): LineSnapshot {
  return {
    product_id: null,
    option_value_ids: [],
    product_name_he: 'בובה סרוגה',
    product_name_en: 'Crocheted doll',
    prep_time_he: 'כשבועיים',
    prep_time_en: 'about two weeks',
    options: [{ group_he: 'צבע', group_en: 'Colour', value_he: 'חום', value_en: 'Brown' }],
    unit_price_minor: 10000,
    quantity: 2,
    line_total_minor: 20000,
    sourceImageKey: null,
    ...overrides,
  };
}

interface MakeOptions extends Partial<NewOrder> {
  createdAt?: Date;
  status?: (typeof orders.$inferSelect)['status'];
  paymentState?: (typeof orders.$inferSelect)['paymentState'];
}

/** A real order (lines, `created` event and outbox rows) made through the checkout's own path. */
async function makeOrder({ createdAt, status, paymentState, ...overrides }: MakeOptions = {}) {
  const created = await insertOrder(testDb.db, {
    locale: 'he',
    zoneId,
    currency: 'ILS',
    customer: { name: 'דנה כהן', phone: '+972522345678', email: 'dana@example.test' },
    deliveryMethod: 'shipping',
    address: { country: 'IL', city: 'חיפה', line1: 'הרצל 5', line2: null, postalCode: null },
    note: null,
    paymentMethod: 'offline',
    paid: null,
    subtotalMinor: 20000,
    deliveryFeeMinor: 3000,
    totalMinor: 23000,
    termsAcceptedAt: new Date(),
    termsVersion: 1,
    privacyVersion: 1,
    marketingOptIn: false,
    marketingOptInAt: null,
    lines: [line()],
    token: randomToken(),
    now: new Date(),
    ...overrides,
  });
  const patch: Partial<typeof orders.$inferInsert> = {};
  if (createdAt !== undefined) patch.createdAt = createdAt;
  if (status !== undefined) patch.status = status;
  if (paymentState !== undefined) patch.paymentState = paymentState;
  if (Object.keys(patch).length > 0) {
    await testDb.db.update(orders).set(patch).where(eq(orders.id, created.orderId));
  }
  return created;
}

const minutes = (n: number) => new Date(Date.UTC(2026, 10, 1, 12, n));

describe('listOrders', () => {
  it('returns newest first, ties broken by the higher order number', async () => {
    const a = await makeOrder({ createdAt: minutes(1) });
    const b = await makeOrder({ createdAt: minutes(5) });
    const c = await makeOrder({ createdAt: minutes(5) });
    const result = await listOrders({ page: 1 });
    expect(result.rows.map((row) => row.orderNumber)).toEqual([
      c.orderNumber,
      b.orderNumber,
      a.orderNumber,
    ]);
    expect(result.total).toBe(3);
    expect(result.pageCount).toBe(1);
    expect(result.page).toBe(1);
    expect(result.rows[0]).toMatchObject({
      id: c.orderId,
      customerName: 'דנה כהן',
      totalMinor: 23000,
      currency: 'ILS',
      paymentState: 'awaiting_payment',
      status: 'new',
    });
    expect(result.rows[0]?.createdAt).toEqual(minutes(5));
  });

  it('pages 25 at a time and returns the last page for a page beyond it', async () => {
    for (let i = 0; i < 27; i += 1) await makeOrder({ createdAt: minutes(i) });
    const first = await listOrders({ page: 1 });
    expect(first.rows).toHaveLength(25);
    expect(first).toMatchObject({ page: 1, pageCount: 2, total: 27 });
    const second = await listOrders({ page: 2 });
    expect(second.rows).toHaveLength(2);
    expect(second.rows.map((row) => row.orderNumber)).toEqual([1002, 1001]);
    const beyond = await listOrders({ page: 99 });
    expect(beyond).toMatchObject({ page: 2, pageCount: 2, total: 27 });
    expect(beyond.rows).toHaveLength(2);
  });

  it('reports one empty page when there are no orders', async () => {
    expect(await listOrders({ page: 1 })).toEqual({ rows: [], page: 1, pageCount: 1, total: 0 });
  });

  it('filters by status, by payment, by both, and open excludes cancelled', async () => {
    const newUnpaid = await makeOrder({ createdAt: minutes(1) });
    const cancelled = await makeOrder({ createdAt: minutes(2), status: 'cancelled' });
    const shippedPaid = await makeOrder({
      createdAt: minutes(3),
      status: 'shipped',
      paymentMethod: 'online',
      paid: { at: minutes(3), provider: 'fake', transactionId: 'tx-1' },
    });
    const newPaid = await makeOrder({
      createdAt: minutes(4),
      paymentMethod: 'online',
      paid: { at: minutes(4), provider: 'fake', transactionId: 'tx-2' },
    });
    const numbers = async (filter: Parameters<typeof listOrders>[0]) =>
      (await listOrders(filter)).rows.map((row) => row.orderNumber);

    expect(await numbers({ page: 1, status: 'new' })).toEqual([
      newPaid.orderNumber,
      newUnpaid.orderNumber,
    ]);
    expect(await numbers({ page: 1, status: 'cancelled' })).toEqual([cancelled.orderNumber]);
    expect(await numbers({ page: 1, payment: 'paid' })).toEqual([
      newPaid.orderNumber,
      shippedPaid.orderNumber,
    ]);
    expect(await numbers({ page: 1, payment: 'awaiting_payment' })).toEqual([
      cancelled.orderNumber,
      newUnpaid.orderNumber,
    ]);
    expect(await numbers({ page: 1, status: 'new', payment: 'paid' })).toEqual([
      newPaid.orderNumber,
    ]);
    expect(await numbers({ page: 1, status: 'shipped', payment: 'awaiting_payment' })).toEqual([]);
    expect(await numbers({ page: 1, open: true })).toEqual([
      newPaid.orderNumber,
      shippedPaid.orderNumber,
      newUnpaid.orderNumber,
    ]);
    expect(await numbers({ page: 1, open: true, payment: 'awaiting_payment' })).toEqual([
      newUnpaid.orderNumber,
    ]);
    expect((await listOrders({ page: 1, status: 'new' })).total).toBe(2);
  });
});

describe('findOrderIdByNumber', () => {
  it('finds an order by "1001" and by " #1001 "', async () => {
    const created = await makeOrder();
    expect(await findOrderIdByNumber(String(created.orderNumber))).toEqual({ id: created.orderId });
    expect(await findOrderIdByNumber(` #${String(created.orderNumber)} `)).toEqual({
      id: created.orderId,
    });
  });

  it('says invalid for text that is not 1 to 9 digits', async () => {
    for (const text of ['abc', '', '#', '  ', '1234567890', '#1234567890', '12a', '-5', '1 2']) {
      expect(await findOrderIdByNumber(text)).toEqual({ invalid: true });
    }
  });

  it('says which number was not found', async () => {
    await makeOrder();
    expect(await findOrderIdByNumber('99999')).toEqual({ notFound: 99999 });
    expect(await findOrderIdByNumber('#99999')).toEqual({ notFound: 99999 });
  });
});

describe('getOrderDetail', () => {
  it('returns null for an unknown or malformed id', async () => {
    await makeOrder();
    expect(await getOrderDetail(randomUUID())).toBeNull();
    expect(await getOrderDetail('not-a-uuid')).toBeNull();
    expect(await getOrderDetail('')).toBeNull();
  });

  it('returns the order, its lines in id order with photo urls, and the totals', async () => {
    const created = await makeOrder({
      lines: [
        line({ product_name_he: 'ראשון' }),
        line({ product_name_he: 'שני', options: [], quantity: 1, line_total_minor: 10000 }),
        line({ product_name_he: 'שלישי' }),
      ],
      subtotalMinor: 40000,
      totalMinor: 43000,
    });
    const rows = await testDb.db
      .select()
      .from(orderLine)
      .where(eq(orderLine.orderId, created.orderId));
    const second = rows.find((row) => row.productNameHe === 'שני');
    await testDb.db
      .update(orderLine)
      .set({ imageKey: `orders/${created.orderId}/${second?.id ?? ''}-400.webp` })
      .where(eq(orderLine.id, second?.id ?? ''));

    const detail = await getOrderDetail(created.orderId);
    expect(detail?.order).toMatchObject({
      id: created.orderId,
      orderNumber: created.orderNumber,
      customerName: 'דנה כהן',
      subtotalMinor: 40000,
      deliveryFeeMinor: 3000,
      totalMinor: 43000,
    });
    expect(detail?.lines.map((l) => l.productNameHe)).toEqual(['ראשון', 'שני', 'שלישי']);
    expect(detail?.lines.map((l) => l.imageUrl)).toEqual([
      null,
      `/api/admin/media/orders/${created.orderId}/${second?.id ?? ''}-400.webp`,
      null,
    ]);
    expect(detail?.lines[0]).toMatchObject({
      unitPriceMinor: 10000,
      quantity: 2,
      lineTotalMinor: 20000,
      prepTimeHe: 'כשבועיים',
    });
  });

  it('keeps the snapshot after the product is deleted (US1 #8)', async () => {
    const [made] = await testDb.db
      .insert(product)
      .values({ slug: 'gone-soon', nameHe: 'נעלם', nameEn: 'Gone', state: 'draft' })
      .returning({ id: product.id });
    const created = await makeOrder({ lines: [line({ product_id: made?.id ?? null })] });
    await testDb.db.delete(product).where(eq(product.id, made?.id ?? ''));

    const detail = await getOrderDetail(created.orderId);
    expect(detail?.lines).toHaveLength(1);
    expect(detail?.lines[0]).toMatchObject({
      productId: null,
      productNameHe: 'בובה סרוגה',
      productNameEn: 'Crocheted doll',
      unitPriceMinor: 10000,
      options: [{ group_he: 'צבע', group_en: 'Colour', value_he: 'חום', value_en: 'Brown' }],
    });
  });

  it('lists the history newest first with system, admin and removed-admin actors', async () => {
    const created = await makeOrder();
    const actor = await makeActor(testDb.db, 'Aviva');
    const gone = await makeActor(testDb.db, 'Gone');
    await testDb.db.update(orderEvent).set({ createdAt: minutes(0) });
    await testDb.db.insert(orderEvent).values([
      {
        orderId: created.orderId,
        adminId: actor.adminId,
        kind: 'status_changed',
        data: { from: 'new', to: 'in_preparation' },
        createdAt: minutes(10),
      },
      {
        orderId: created.orderId,
        adminId: gone.adminId,
        kind: 'payment_marked_paid',
        data: {},
        createdAt: minutes(20),
      },
    ]);
    await testDb.db.delete(adminUser).where(eq(adminUser.id, gone.adminId ?? ''));

    const detail = await getOrderDetail(created.orderId);
    expect(detail?.history.map((entry) => entry.kind)).toEqual([
      'payment_marked_paid',
      'status_changed',
      'created',
    ]);
    expect(detail?.history.map((entry) => entry.actor)).toEqual([
      { kind: 'removed_admin' },
      { kind: 'admin', name: 'Aviva' },
      { kind: 'system' },
    ]);
    expect(detail?.history[1]?.data).toEqual({ from: 'new', to: 'in_preparation' });
    expect(detail?.history[1]?.at).toEqual(minutes(10));
  });

  it('shows an anonymized event as the system only when data.system is true (003 T028)', async () => {
    const created = await makeOrder();
    const actor = await makeActor(testDb.db, 'Aviva');
    const gone = await makeActor(testDb.db, 'Gone');
    await testDb.db.update(orderEvent).set({ createdAt: minutes(0) });
    await testDb.db.insert(orderEvent).values([
      // Aviva erased the customer on request: her name.
      {
        orderId: created.orderId,
        adminId: actor.adminId,
        kind: 'anonymized',
        data: {},
        createdAt: minutes(10),
      },
      // An admin who was removed since: a removed admin, not the system.
      {
        orderId: created.orderId,
        adminId: gone.adminId,
        kind: 'anonymized',
        data: {},
        createdAt: minutes(20),
      },
      // The 7-year task: no admin, the system marker.
      {
        orderId: created.orderId,
        adminId: null,
        kind: 'anonymized',
        data: { system: true },
        createdAt: minutes(30),
      },
    ]);
    await testDb.db.delete(adminUser).where(eq(adminUser.id, gone.adminId ?? ''));

    const detail = await getOrderDetail(created.orderId);
    const anonymized = detail?.history.filter((entry) => entry.kind === 'anonymized');
    expect(anonymized?.map((entry) => entry.actor)).toEqual([
      { kind: 'system' },
      { kind: 'removed_admin' },
      { kind: 'admin', name: 'Aviva' },
    ]);
  });

  it('reads the failed-email events: confirmation flag, cancellation and refund list, system entries', async () => {
    const created = await makeOrder();
    const other = await makeOrder();
    await testDb.db
      .insert(orderEvent)
      .values([
        { orderId: other.orderId, kind: 'email_failed', data: { emailKind: 'order-confirmation' } },
      ]);
    const before = await getOrderDetail(created.orderId);
    expect(before).toMatchObject({ confirmationEmailFailed: false, failedCustomerEmails: [] });

    await testDb.db.insert(orderEvent).values([
      {
        orderId: created.orderId,
        kind: 'email_failed',
        data: { emailKind: 'order-cancelled' },
        createdAt: minutes(30),
      },
      {
        orderId: created.orderId,
        kind: 'email_failed',
        data: { emailKind: 'order-refunded' },
        createdAt: minutes(40),
      },
    ]);
    const cancelAndRefund = await getOrderDetail(created.orderId);
    expect(cancelAndRefund?.confirmationEmailFailed).toBe(false);
    expect([...(cancelAndRefund?.failedCustomerEmails ?? [])].sort()).toEqual([
      'order-cancelled',
      'order-refunded',
    ]);
    const failures = cancelAndRefund?.history.filter((entry) => entry.kind === 'email_failed');
    expect(failures).toHaveLength(2);
    expect(failures?.every((entry) => entry.actor.kind === 'system')).toBe(true);

    await testDb.db.insert(orderEvent).values({
      orderId: created.orderId,
      kind: 'email_failed',
      data: { emailKind: 'order-confirmation' },
    });
    expect((await getOrderDetail(created.orderId))?.confirmationEmailFailed).toBe(true);
    // The other order's event stays with the other order.
    expect((await getOrderDetail(other.orderId))?.confirmationEmailFailed).toBe(true);
    expect((await getOrderDetail(other.orderId))?.failedCustomerEmails).toEqual([]);
  });

  it('computes what is allowed from the status rules', async () => {
    const fresh = await makeOrder();
    expect((await getOrderDetail(fresh.orderId))?.allowed).toEqual({
      forward: ['in_preparation', 'shipped'],
      stepBackTo: null,
      cancel: true,
      markPaid: true,
      markRefunded: false,
      editFulfilment: null,
      editCustomer: true,
    });

    const pickup = await makeOrder({ deliveryMethod: 'pickup', address: null });
    expect((await getOrderDetail(pickup.orderId))?.allowed.forward).toEqual([
      'in_preparation',
      'ready_for_pickup',
    ]);

    const shipped = await makeOrder({
      paymentMethod: 'online',
      paid: { at: new Date(), provider: 'fake', transactionId: 'tx-9' },
    });
    await testDb.db.update(orders).set({ status: 'shipped' }).where(eq(orders.id, shipped.orderId));
    await testDb.db.insert(orderEvent).values({
      orderId: shipped.orderId,
      kind: 'status_changed',
      data: { from: 'in_preparation', to: 'shipped' },
    });
    const detail = await getOrderDetail(shipped.orderId);
    expect(detail?.allowed).toEqual({
      forward: ['completed'],
      stepBackTo: 'in_preparation',
      cancel: true,
      markPaid: false,
      markRefunded: true,
      editFulfilment: 'trackingNumber',
      editCustomer: true,
    });
    expect(detail?.allowed.forward).not.toContain('cancelled');

    await testDb.db
      .update(orders)
      .set({ status: 'cancelled' })
      .where(eq(orders.id, shipped.orderId));
    expect((await getOrderDetail(shipped.orderId))?.allowed).toMatchObject({
      forward: [],
      stepBackTo: null,
      cancel: false,
      markRefunded: true,
      editFulfilment: null,
    });
  });

  it('refuses customer edits once the order is anonymised', async () => {
    const created = await makeOrder();
    await testDb.db
      .update(orders)
      .set({ anonymizedAt: new Date(), customerEmail: null, customerPhone: null })
      .where(eq(orders.id, created.orderId));
    const detail = await getOrderDetail(created.orderId);
    expect(detail?.allowed.editCustomer).toBe(false);
    expect(detail?.order.anonymizedAt).toBeInstanceOf(Date);
  });
});

describe('getOrderCounts (US7, research R13)', () => {
  it('counts New orders and awaiting-payment orders that are not Cancelled', async () => {
    await makeOrder({ paymentState: 'paid' });
    const awaitingNew = await makeOrder();
    const inPreparation = await makeOrder({ status: 'in_preparation' });
    await makeOrder({ status: 'cancelled' });
    expect(await getOrderCounts()).toEqual({ newOrders: 2, awaitingPayment: 2 });

    const list = await listOrders({ payment: 'awaiting_payment', open: true, page: 1 });
    expect(new Set(list.rows.map((row) => row.id))).toEqual(
      new Set([awaitingNew.orderId, inPreparation.orderId]),
    );
  });

  it('is zero without orders', async () => {
    expect(await getOrderCounts()).toEqual({ newOrders: 0, awaitingPayment: 0 });
  });
});
