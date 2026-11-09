// 002 US2 (tasks.md T013): the status changes of src/server/orders/order-changes.ts
// (contracts/server-actions.md > setOrderStatus, stepBackOrderStatus, updateFulfilmentDetails;
// research R2, R3, R4, R6, R16). Orders are created through `insertOrder()` as the checkout does.
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { makeActor } from '../helpers/catalog';
import { adminActivity, emailOutbox, orderEvent, orders, shippingZone } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import type { Actor } from '@/server/catalog/result';
import { insertOrder, randomToken, type NewOrder } from '@/server/orders/create-order';
import type { LineSnapshot } from '@/server/orders/snapshots';
import {
  markOrderPaid,
  markOrderRefunded,
  setOrderStatus,
  stepBackOrderStatus,
  updateFulfilmentDetails,
} from '@/server/orders/order-changes';
import { getOrderDetail } from '@/server/orders/admin-orders';
import type { OrderStatus } from '@/server/orders/status';

let testDb: TestDbHandle;
let zoneId = '';
let actor: Actor;

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
    SECRET_HMAC_KEY: Buffer.from('order-changes-test-hmac-key-0123456789abcdef').toString('base64'),
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
  actor = await makeActor(testDb.db);
});

function line(): LineSnapshot {
  return {
    product_id: null,
    option_value_ids: [],
    product_name_he: 'בובה סרוגה',
    product_name_en: 'Crocheted doll',
    prep_time_he: 'כשבועיים',
    prep_time_en: 'about two weeks',
    options: [],
    unit_price_minor: 10000,
    quantity: 1,
    line_total_minor: 10000,
    sourceImageKey: null,
  };
}

interface MakeOptions extends Partial<NewOrder> {
  status?: OrderStatus;
  paymentState?: (typeof orders.$inferSelect)['paymentState'];
}

async function makeOrder({ status, paymentState, ...overrides }: MakeOptions = {}) {
  const pickup = overrides.deliveryMethod === 'pickup';
  const created = await insertOrder(testDb.db, {
    locale: 'he',
    zoneId,
    currency: 'ILS',
    customer: { name: 'דנה כהן', phone: '+972522345678', email: 'dana@example.test' },
    deliveryMethod: 'shipping',
    address: pickup
      ? null
      : { country: 'IL', city: 'חיפה', line1: 'הרצל 5', line2: null, postalCode: null },
    note: null,
    paymentMethod: 'offline',
    paid: null,
    subtotalMinor: 10000,
    deliveryFeeMinor: pickup ? 0 : 3000,
    totalMinor: pickup ? 10000 : 13000,
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
  if (status !== undefined) patch.status = status;
  if (paymentState !== undefined) patch.paymentState = paymentState;
  if (Object.keys(patch).length > 0) {
    await testDb.db.update(orders).set(patch).where(eq(orders.id, created.orderId));
  }
  return created;
}

const pickupOrder = (options: MakeOptions = {}) =>
  makeOrder({ deliveryMethod: 'pickup', ...options });

async function getOrder(id: string) {
  const [row] = await testDb.db.select().from(orders).where(eq(orders.id, id));
  if (!row) throw new Error('no order');
  return row;
}

/** Events of kinds written from 002, oldest first (the `created` event is left out). */
async function events(id: string) {
  const rows = await testDb.db
    .select()
    .from(orderEvent)
    .where(eq(orderEvent.orderId, id))
    .orderBy(asc(orderEvent.createdAt));
  return rows.filter((row) => row.kind !== 'created');
}

async function activity() {
  return testDb.db.select().from(adminActivity).orderBy(asc(adminActivity.at));
}

async function outboxCount() {
  return (await testDb.db.select().from(emailOutbox)).length;
}

async function expectUntouched(id: string, run: () => Promise<unknown>) {
  const before = await getOrder(id);
  const eventCount = (await events(id)).length;
  const activityCount = (await activity()).length;
  const outbox = await outboxCount();
  await run();
  expect(await getOrder(id)).toEqual(before);
  expect((await events(id)).length).toBe(eventCount);
  expect((await activity()).length).toBe(activityCount);
  expect(await outboxCount()).toBe(outbox);
}

const NOW = new Date(Date.UTC(2026, 10, 9, 10, 0, 0));
const DAY = 24 * 60 * 60 * 1000;

describe('setOrderStatus: forward moves', () => {
  const moves: [OrderStatus, OrderStatus, 'shipping' | 'pickup'][] = [
    ['new', 'in_preparation', 'shipping'],
    ['new', 'shipped', 'shipping'],
    ['in_preparation', 'shipped', 'shipping'],
    ['new', 'ready_for_pickup', 'pickup'],
    ['in_preparation', 'ready_for_pickup', 'pickup'],
    ['shipped', 'completed', 'shipping'],
    ['ready_for_pickup', 'completed', 'pickup'],
    ['new', 'cancelled', 'shipping'],
    ['in_preparation', 'cancelled', 'pickup'],
    ['shipped', 'cancelled', 'shipping'],
    ['ready_for_pickup', 'cancelled', 'pickup'],
  ];

  it.each(moves)(
    'allows %s -> %s (%s): one status_changed event and one activity row',
    async (from, to, deliveryMethod) => {
      const created = await makeOrder({
        deliveryMethod,
        address: deliveryMethod === 'pickup' ? null : undefined,
        status: from,
      });
      const outboxBefore = await outboxCount();
      const result = await setOrderStatus(
        actor,
        {
          orderId: created.orderId,
          expectedStatus: from,
          to: to as 'in_preparation',
          ...(to === 'completed' || to === 'cancelled' ? { confirm: true as const } : {}),
        },
        { now: NOW },
      );
      expect(result).toMatchObject({ ok: true, data: { changed: true, status: to } });
      expect((await getOrder(created.orderId)).status).toBe(to);
      const written = await events(created.orderId);
      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({
        kind: 'status_changed',
        adminId: actor.adminId,
        data: { from, to },
      });
      const rows = await activity();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'order.status_changed',
        targetType: 'order',
        targetId: String(created.orderNumber),
        adminId: actor.adminId,
        details: { from, to, orderNumber: created.orderNumber },
      });
      // Only a cancel will queue an email (US5 adds it); no other move does (FR-002, SC-002).
      if (to !== 'cancelled') expect(await outboxCount()).toBe(outboxBefore);
    },
  );

  it('refuses ready_for_pickup on a shipping order and shipped on a pickup order', async () => {
    const shipping = await makeOrder();
    const pickup = await pickupOrder();
    await expectUntouched(shipping.orderId, async () => {
      expect(
        await setOrderStatus(actor, {
          orderId: shipping.orderId,
          expectedStatus: 'new',
          to: 'ready_for_pickup',
        }),
      ).toEqual({ ok: false, formError: 'admin.orders.errors.not_allowed' });
    });
    await expectUntouched(pickup.orderId, async () => {
      expect(
        await setOrderStatus(actor, {
          orderId: pickup.orderId,
          expectedStatus: 'new',
          to: 'shipped',
        }),
      ).toEqual({ ok: false, formError: 'admin.orders.errors.not_allowed' });
    });
  });

  it('refuses anything out of completed and cancelled', async () => {
    for (const status of ['completed', 'cancelled'] as const) {
      const created = await makeOrder({ status });
      await expectUntouched(created.orderId, async () => {
        for (const to of ['in_preparation', 'shipped', 'completed', 'cancelled'] as const) {
          const result = await setOrderStatus(actor, {
            orderId: created.orderId,
            expectedStatus: status,
            to,
            confirm: true,
          });
          // Repeating the status the order is already in is the idempotent no-op.
          if (to === status) expect(result).toMatchObject({ ok: true, data: { changed: false } });
          else expect(result).toEqual({ ok: false, formError: 'admin.orders.errors.not_allowed' });
        }
      });
    }
  });

  it('refuses new -> completed', async () => {
    const created = await makeOrder();
    await expectUntouched(created.orderId, async () => {
      expect(
        await setOrderStatus(actor, {
          orderId: created.orderId,
          expectedStatus: 'new',
          to: 'completed',
          confirm: true,
        }),
      ).toEqual({ ok: false, formError: 'admin.orders.errors.not_allowed' });
    });
  });
});

describe('setOrderStatus: tracking number and pickup note', () => {
  it('stores the tracking number trimmed, and an empty one as null', async () => {
    const a = await makeOrder();
    await setOrderStatus(actor, {
      orderId: a.orderId,
      expectedStatus: 'new',
      to: 'shipped',
      trackingNumber: '  RR123456789IL  ',
    });
    expect((await getOrder(a.orderId)).trackingNumber).toBe('RR123456789IL');
    const b = await makeOrder();
    await setOrderStatus(actor, {
      orderId: b.orderId,
      expectedStatus: 'new',
      to: 'shipped',
      trackingNumber: '   ',
    });
    expect((await getOrder(b.orderId)).trackingNumber).toBeNull();
  });

  it('accepts 100 characters and refuses 101 with a field error', async () => {
    const created = await makeOrder();
    await expectUntouched(created.orderId, async () => {
      expect(
        await setOrderStatus(actor, {
          orderId: created.orderId,
          expectedStatus: 'new',
          to: 'shipped',
          trackingNumber: 'x'.repeat(101),
        }),
      ).toEqual({
        ok: false,
        fieldErrors: { trackingNumber: 'admin.orders.errors.tracking_too_long' },
      });
    });
    await setOrderStatus(actor, {
      orderId: created.orderId,
      expectedStatus: 'new',
      to: 'shipped',
      trackingNumber: 'x'.repeat(100),
    });
    expect((await getOrder(created.orderId)).trackingNumber).toBe('x'.repeat(100));
  });

  it('stores the pickup note (500 characters at most) and refuses 501', async () => {
    const created = await pickupOrder();
    await expectUntouched(created.orderId, async () => {
      expect(
        await setOrderStatus(actor, {
          orderId: created.orderId,
          expectedStatus: 'new',
          to: 'ready_for_pickup',
          pickupNote: 'y'.repeat(501),
        }),
      ).toEqual({
        ok: false,
        fieldErrors: { pickupNote: 'admin.orders.errors.pickup_note_too_long' },
      });
    });
    await setOrderStatus(actor, {
      orderId: created.orderId,
      expectedStatus: 'new',
      to: 'ready_for_pickup',
      pickupNote: ` ${'y'.repeat(500)} `,
    });
    expect((await getOrder(created.orderId)).pickupNote).toBe('y'.repeat(500));
  });

  it('leaves both columns alone for other targets', async () => {
    const created = await makeOrder();
    await testDb.db
      .update(orders)
      .set({ trackingNumber: 'KEEP', pickupNote: 'KEEP-NOTE' })
      .where(eq(orders.id, created.orderId));
    await setOrderStatus(actor, {
      orderId: created.orderId,
      expectedStatus: 'new',
      to: 'in_preparation',
      trackingNumber: 'IGNORED',
    });
    expect(await getOrder(created.orderId)).toMatchObject({
      trackingNumber: 'KEEP',
      pickupNote: 'KEEP-NOTE',
    });
  });
});

describe('setOrderStatus: completing and the payment shortcut', () => {
  it('needs confirm: true for completed and cancelled, before any database access', async () => {
    const created = await makeOrder({ status: 'shipped' });
    await expectUntouched(created.orderId, async () => {
      expect(
        await setOrderStatus(actor, {
          orderId: created.orderId,
          expectedStatus: 'shipped',
          to: 'completed',
        }),
      ).toEqual({ ok: false, formError: 'admin.confirm_required' });
      expect(
        await setOrderStatus(actor, {
          orderId: created.orderId,
          expectedStatus: 'shipped',
          to: 'cancelled',
        }),
      ).toEqual({ ok: false, formError: 'admin.confirm_required' });
      // Even an unknown order: the confirmation check comes first.
      expect(
        await setOrderStatus(actor, {
          orderId: randomUUID(),
          expectedStatus: 'shipped',
          to: 'completed',
        }),
      ).toEqual({ ok: false, formError: 'admin.confirm_required' });
    });
  });

  it('completes with confirm and sets the link expiry to now + 30 days (R4)', async () => {
    const created = await makeOrder({ status: 'shipped' });
    const result = await setOrderStatus(
      actor,
      { orderId: created.orderId, expectedStatus: 'shipped', to: 'completed', confirm: true },
      { now: NOW },
    );
    expect(result).toMatchObject({ ok: true, data: { changed: true, status: 'completed' } });
    const order = await getOrder(created.orderId);
    expect(order.status).toBe('completed');
    expect(order.publicTokenExpiresAt.getTime()).toBe(NOW.getTime() + 30 * DAY);
    expect(order.paymentState).toBe('awaiting_payment');
  });

  it('cancelling a paid order reports the refund reminder; an unpaid one does not', async () => {
    const paid = await makeOrder({ paymentState: 'paid' });
    expect(
      await setOrderStatus(
        actor,
        { orderId: paid.orderId, expectedStatus: 'new', to: 'cancelled', confirm: true },
        { now: NOW },
      ),
    ).toMatchObject({
      ok: true,
      data: { changed: true, status: 'cancelled', refundReminder: true },
    });
    expect((await getOrder(paid.orderId)).publicTokenExpiresAt.getTime()).toBe(
      NOW.getTime() + 30 * DAY,
    );
    const unpaid = await makeOrder();
    expect(
      await setOrderStatus(actor, {
        orderId: unpaid.orderId,
        expectedStatus: 'new',
        to: 'cancelled',
        confirm: true,
      }),
    ).toMatchObject({ ok: true, data: { refundReminder: false } });
  });

  it('alsoMarkPaid completes and marks an unpaid offline order paid: two events, two activity rows, no email', async () => {
    const created = await makeOrder({ status: 'shipped' });
    const outboxBefore = await outboxCount();
    const result = await setOrderStatus(
      actor,
      {
        orderId: created.orderId,
        expectedStatus: 'shipped',
        to: 'completed',
        confirm: true,
        alsoMarkPaid: true,
      },
      { now: NOW },
    );
    expect(result).toMatchObject({ ok: true, data: { changed: true, status: 'completed' } });
    const order = await getOrder(created.orderId);
    expect(order).toMatchObject({ status: 'completed', paymentState: 'paid' });
    expect(order.paidAt?.getTime()).toBe(NOW.getTime());
    expect((await events(created.orderId)).map((row) => row.kind).sort()).toEqual([
      'payment_marked_paid',
      'status_changed',
    ]);
    expect((await activity()).map((row) => row.action).sort()).toEqual([
      'order.marked_paid',
      'order.status_changed',
    ]);
    expect(await outboxCount()).toBe(outboxBefore);
  });

  it('alsoMarkPaid is refused on an online or already paid order, and with another target', async () => {
    const paid = await makeOrder({ status: 'shipped', paymentState: 'paid' });
    const online = await makeOrder({
      status: 'shipped',
      paymentMethod: 'online',
      paid: { at: new Date(), provider: 'fake', transactionId: 'tx-1' },
    });
    const other = await makeOrder();
    for (const [id, expectedStatus, to] of [
      [paid.orderId, 'shipped', 'completed'],
      [online.orderId, 'shipped', 'completed'],
      [other.orderId, 'new', 'in_preparation'],
    ] as const) {
      await expectUntouched(id, async () => {
        expect(
          await setOrderStatus(actor, {
            orderId: id,
            expectedStatus,
            to,
            confirm: true,
            alsoMarkPaid: true,
          }),
        ).toEqual({ ok: false, formError: 'admin.orders.errors.not_allowed' });
      });
    }
  });
});

describe('setOrderStatus: repeats, stale pages and unknown orders', () => {
  it('a repeated request changes nothing and writes nothing (US2 #9)', async () => {
    const created = await makeOrder();
    const input = {
      orderId: created.orderId,
      expectedStatus: 'new',
      to: 'in_preparation',
    } as const;
    expect(await setOrderStatus(actor, input)).toMatchObject({ ok: true, data: { changed: true } });
    await expectUntouched(created.orderId, async () => {
      expect(await setOrderStatus(actor, input)).toMatchObject({
        ok: true,
        data: { changed: false, status: 'in_preparation' },
      });
    });
    expect(await events(created.orderId)).toHaveLength(1);
    expect(await activity()).toHaveLength(1);
  });

  it('a repeated Shipped with the same tracking number is a no-op', async () => {
    const created = await makeOrder();
    const input = {
      orderId: created.orderId,
      expectedStatus: 'new',
      to: 'shipped',
      trackingNumber: 'RR1',
    } as const;
    await setOrderStatus(actor, input);
    await expectUntouched(created.orderId, async () => {
      expect(await setOrderStatus(actor, input)).toMatchObject({
        ok: true,
        data: { changed: false },
      });
    });
  });

  it('Shipped with a different tracking number from a stale page is stale and keeps the stored one', async () => {
    const created = await makeOrder({ status: 'shipped' });
    await testDb.db
      .update(orders)
      .set({ trackingNumber: 'FIRST' })
      .where(eq(orders.id, created.orderId));
    await expectUntouched(created.orderId, async () => {
      expect(
        await setOrderStatus(actor, {
          orderId: created.orderId,
          expectedStatus: 'in_preparation',
          to: 'shipped',
          trackingNumber: 'SECOND',
        }),
      ).toEqual({ ok: false, formError: 'admin.orders.errors.stale' });
    });
    expect((await getOrder(created.orderId)).trackingNumber).toBe('FIRST');
  });

  it('an expectedStatus that no longer matches is stale and writes nothing', async () => {
    const created = await makeOrder({ status: 'in_preparation' });
    await expectUntouched(created.orderId, async () => {
      expect(
        await setOrderStatus(actor, {
          orderId: created.orderId,
          expectedStatus: 'new',
          to: 'shipped',
        }),
      ).toEqual({ ok: false, formError: 'admin.orders.errors.stale' });
    });
  });

  it('an unknown or malformed id is not_found', async () => {
    for (const orderId of [randomUUID(), 'not-a-uuid']) {
      expect(
        await setOrderStatus(actor, { orderId, expectedStatus: 'new', to: 'in_preparation' }),
      ).toEqual({ ok: false, formError: 'admin.orders.errors.not_found' });
    }
  });
});

describe('stepBackOrderStatus', () => {
  async function move(id: string, expectedStatus: OrderStatus, to: OrderStatus, extra = {}) {
    const result = await setOrderStatus(actor, {
      orderId: id,
      expectedStatus,
      to: to as 'shipped',
      ...extra,
    });
    expect(result).toMatchObject({ ok: true, data: { changed: true } });
  }

  it('in_preparation goes back to new, with a back event and an activity row', async () => {
    const created = await makeOrder();
    await move(created.orderId, 'new', 'in_preparation');
    const result = await stepBackOrderStatus(actor, {
      orderId: created.orderId,
      expectedStatus: 'in_preparation',
    });
    expect(result).toMatchObject({ ok: true, data: { changed: true, status: 'new' } });
    expect((await getOrder(created.orderId)).status).toBe('new');
    const written = await events(created.orderId);
    expect(written.at(-1)).toMatchObject({
      kind: 'status_changed',
      adminId: actor.adminId,
      data: { from: 'in_preparation', to: 'new', back: true },
    });
    expect((await activity()).at(-1)).toMatchObject({
      action: 'order.status_changed',
      details: { from: 'in_preparation', to: 'new', orderNumber: created.orderNumber },
    });
  });

  it('new -> shipped -> back returns to new', async () => {
    const created = await makeOrder();
    await move(created.orderId, 'new', 'shipped');
    expect(
      await stepBackOrderStatus(actor, { orderId: created.orderId, expectedStatus: 'shipped' }),
    ).toMatchObject({ ok: true, data: { changed: true, status: 'new' } });
  });

  it('new -> in_preparation -> shipped -> back returns to in_preparation, keeping the tracking number', async () => {
    const created = await makeOrder();
    await move(created.orderId, 'new', 'in_preparation');
    await move(created.orderId, 'in_preparation', 'shipped', { trackingNumber: 'RR1' });
    const result = await stepBackOrderStatus(actor, {
      orderId: created.orderId,
      expectedStatus: 'shipped',
    });
    expect(result).toMatchObject({ ok: true, data: { changed: true, status: 'in_preparation' } });
    expect((await events(created.orderId)).at(-1)?.data).toEqual({
      from: 'shipped',
      to: 'in_preparation',
      back: true,
    });
    expect((await getOrder(created.orderId)).trackingNumber).toBe('RR1');
  });

  it('re-entering Shipped stores exactly the submitted number, and an empty one clears it', async () => {
    const created = await makeOrder();
    await move(created.orderId, 'new', 'shipped', { trackingNumber: 'RR1' });
    await stepBackOrderStatus(actor, { orderId: created.orderId, expectedStatus: 'shipped' });
    await move(created.orderId, 'new', 'shipped', { trackingNumber: 'RR2' });
    expect((await getOrder(created.orderId)).trackingNumber).toBe('RR2');
    await stepBackOrderStatus(actor, { orderId: created.orderId, expectedStatus: 'shipped' });
    await move(created.orderId, 'new', 'shipped', { trackingNumber: '' });
    expect((await getOrder(created.orderId)).trackingNumber).toBeNull();
  });

  it('uses the latest entry into the status when it was entered more than once', async () => {
    const created = await makeOrder();
    await move(created.orderId, 'new', 'shipped');
    await stepBackOrderStatus(actor, { orderId: created.orderId, expectedStatus: 'shipped' });
    await move(created.orderId, 'new', 'in_preparation');
    await move(created.orderId, 'in_preparation', 'shipped');
    expect(
      await stepBackOrderStatus(actor, { orderId: created.orderId, expectedStatus: 'shipped' }),
    ).toMatchObject({ ok: true, data: { status: 'in_preparation' } });
  });

  it('a pickup order steps back from ready_for_pickup the same way', async () => {
    const created = await pickupOrder();
    await move(created.orderId, 'new', 'in_preparation');
    await move(created.orderId, 'in_preparation', 'ready_for_pickup', { pickupNote: 'Door 3' });
    expect(
      await stepBackOrderStatus(actor, {
        orderId: created.orderId,
        expectedStatus: 'ready_for_pickup',
      }),
    ).toMatchObject({ ok: true, data: { status: 'in_preparation' } });
    expect((await getOrder(created.orderId)).pickupNote).toBe('Door 3');
  });

  it('goes to new when the history has no entry (data written outside the app)', async () => {
    const created = await makeOrder({ status: 'shipped' });
    expect(
      await stepBackOrderStatus(actor, { orderId: created.orderId, expectedStatus: 'shipped' }),
    ).toMatchObject({ ok: true, data: { changed: true, status: 'new' } });
  });

  it('a repeated step back is a no-op; a stale page is refused; no email is queued', async () => {
    const created = await makeOrder();
    await move(created.orderId, 'new', 'in_preparation');
    await move(created.orderId, 'in_preparation', 'shipped');
    const outboxBefore = await outboxCount();
    const input = { orderId: created.orderId, expectedStatus: 'shipped' } as const;
    await stepBackOrderStatus(actor, input);
    await expectUntouched(created.orderId, async () => {
      expect(await stepBackOrderStatus(actor, input)).toMatchObject({
        ok: true,
        data: { changed: false, status: 'in_preparation' },
      });
      // The page still shows New, but the order is in preparation, not what a step back from
      // New would give.
      expect(
        await stepBackOrderStatus(actor, {
          orderId: created.orderId,
          expectedStatus: 'ready_for_pickup',
        }),
      ).toEqual({ ok: false, formError: 'admin.orders.errors.stale' });
    });
    expect(await outboxCount()).toBe(outboxBefore);
  });

  it('refuses a step back for a status that has none, and unknown ids', async () => {
    const created = await makeOrder();
    await expectUntouched(created.orderId, async () => {
      expect(
        await stepBackOrderStatus(actor, {
          orderId: created.orderId,
          expectedStatus: 'completed' as 'shipped',
        }),
      ).toEqual({ ok: false, formError: 'admin.orders.errors.not_allowed' });
    });
    expect(
      await stepBackOrderStatus(actor, { orderId: randomUUID(), expectedStatus: 'shipped' }),
    ).toEqual({ ok: false, formError: 'admin.orders.errors.not_found' });
  });
});

describe('updateFulfilmentDetails', () => {
  it('stores a new tracking number on a Shipped order without changing the status', async () => {
    const created = await makeOrder();
    await setOrderStatus(actor, {
      orderId: created.orderId,
      expectedStatus: 'new',
      to: 'shipped',
      trackingNumber: 'OLD',
    });
    const outboxBefore = await outboxCount();
    const result = await updateFulfilmentDetails(actor, {
      orderId: created.orderId,
      expectedStatus: 'shipped',
      trackingNumber: ' NEW-1 ',
    });
    expect(result).toEqual({ ok: true, data: { changed: true } });
    expect(await getOrder(created.orderId)).toMatchObject({
      status: 'shipped',
      trackingNumber: 'NEW-1',
    });
    expect((await events(created.orderId)).at(-1)).toMatchObject({
      kind: 'fulfilment_edited',
      adminId: actor.adminId,
      data: { field: 'trackingNumber' },
    });
    expect((await activity()).at(-1)).toMatchObject({
      action: 'order.details_updated',
      targetType: 'order',
      targetId: String(created.orderNumber),
      details: { orderNumber: created.orderNumber, field: 'trackingNumber' },
    });
    expect(await outboxCount()).toBe(outboxBefore);
  });

  it('the same value again is a no-op', async () => {
    const created = await makeOrder({ status: 'shipped' });
    await testDb.db
      .update(orders)
      .set({ trackingNumber: 'SAME' })
      .where(eq(orders.id, created.orderId));
    await expectUntouched(created.orderId, async () => {
      expect(
        await updateFulfilmentDetails(actor, {
          orderId: created.orderId,
          expectedStatus: 'shipped',
          trackingNumber: ' SAME ',
        }),
      ).toEqual({ ok: true, data: { changed: false } });
    });
  });

  it('refuses 101 characters, and a pickup note on a Shipped order', async () => {
    const created = await makeOrder({ status: 'shipped' });
    await expectUntouched(created.orderId, async () => {
      expect(
        await updateFulfilmentDetails(actor, {
          orderId: created.orderId,
          expectedStatus: 'shipped',
          trackingNumber: 'x'.repeat(101),
        }),
      ).toEqual({
        ok: false,
        fieldErrors: { trackingNumber: 'admin.orders.errors.tracking_too_long' },
      });
      expect(
        await updateFulfilmentDetails(actor, {
          orderId: created.orderId,
          expectedStatus: 'shipped',
          pickupNote: 'note',
        }),
      ).toEqual({ ok: false, formError: 'admin.orders.errors.not_allowed' });
    });
  });

  it('an order that is no longer Shipped is stale', async () => {
    const created = await makeOrder({ status: 'completed' });
    await expectUntouched(created.orderId, async () => {
      expect(
        await updateFulfilmentDetails(actor, {
          orderId: created.orderId,
          expectedStatus: 'shipped',
          trackingNumber: 'LATE',
        }),
      ).toEqual({ ok: false, formError: 'admin.orders.errors.stale' });
    });
  });

  it('edits the pickup note of a Ready for pickup order, with the same rules', async () => {
    const created = await pickupOrder({ status: 'ready_for_pickup' });
    expect(
      await updateFulfilmentDetails(actor, {
        orderId: created.orderId,
        expectedStatus: 'ready_for_pickup',
        pickupNote: 'Corrected',
      }),
    ).toEqual({ ok: true, data: { changed: true } });
    expect(await getOrder(created.orderId)).toMatchObject({
      status: 'ready_for_pickup',
      pickupNote: 'Corrected',
    });
    expect((await events(created.orderId)).at(-1)).toMatchObject({
      kind: 'fulfilment_edited',
      data: { field: 'pickupNote' },
    });
    await expectUntouched(created.orderId, async () => {
      expect(
        await updateFulfilmentDetails(actor, {
          orderId: created.orderId,
          expectedStatus: 'ready_for_pickup',
          pickupNote: 'z'.repeat(501),
        }),
      ).toEqual({
        ok: false,
        fieldErrors: { pickupNote: 'admin.orders.errors.pickup_note_too_long' },
      });
      expect(
        await updateFulfilmentDetails(actor, {
          orderId: created.orderId,
          expectedStatus: 'ready_for_pickup',
          trackingNumber: 'RR1',
        }),
      ).toEqual({ ok: false, formError: 'admin.orders.errors.not_allowed' });
    });
  });

  it('a pickup note edit on an order no longer Ready for pickup is stale', async () => {
    const created = await pickupOrder({ status: 'completed' });
    await expectUntouched(created.orderId, async () => {
      expect(
        await updateFulfilmentDetails(actor, {
          orderId: created.orderId,
          expectedStatus: 'ready_for_pickup',
          pickupNote: 'Late',
        }),
      ).toEqual({ ok: false, formError: 'admin.orders.errors.stale' });
    });
  });

  it('the same pickup note again is a no-op that writes nothing', async () => {
    const created = await pickupOrder({ status: 'ready_for_pickup' });
    await testDb.db
      .update(orders)
      .set({ pickupNote: 'Same note' })
      .where(eq(orders.id, created.orderId));
    await expectUntouched(created.orderId, async () => {
      expect(
        await updateFulfilmentDetails(actor, {
          orderId: created.orderId,
          expectedStatus: 'ready_for_pickup',
          pickupNote: '  Same note ',
        }),
      ).toEqual({ ok: true, data: { changed: false } });
    });
  });

  it('leaving out the matching field is invalid; an empty string clears it', async () => {
    const created = await makeOrder({ status: 'shipped' });
    await testDb.db
      .update(orders)
      .set({ trackingNumber: 'KEEP' })
      .where(eq(orders.id, created.orderId));
    await expectUntouched(created.orderId, async () => {
      expect(
        await updateFulfilmentDetails(actor, {
          orderId: created.orderId,
          expectedStatus: 'shipped',
        }),
      ).toEqual({ ok: false, formError: 'admin.orders.errors.invalid' });
    });
    expect(
      await updateFulfilmentDetails(actor, {
        orderId: created.orderId,
        expectedStatus: 'shipped',
        trackingNumber: '',
      }),
    ).toEqual({ ok: true, data: { changed: true } });
    expect((await getOrder(created.orderId)).trackingNumber).toBeNull();
  });

  it('unknown ids are not_found', async () => {
    expect(
      await updateFulfilmentDetails(actor, {
        orderId: randomUUID(),
        expectedStatus: 'shipped',
        trackingNumber: 'x',
      }),
    ).toEqual({ ok: false, formError: 'admin.orders.errors.not_found' });
  });
});

describe('no personal data in the records (FR-018)', () => {
  it('never writes a tracking number or pickup note into an event or an activity row', async () => {
    const TRACKING = 'SENTINEL-TRACK-91827';
    const NOTE = 'SENTINEL-NOTE-55412';
    const shipping = await makeOrder();
    await setOrderStatus(actor, {
      orderId: shipping.orderId,
      expectedStatus: 'new',
      to: 'shipped',
      trackingNumber: TRACKING,
    });
    await updateFulfilmentDetails(actor, {
      orderId: shipping.orderId,
      expectedStatus: 'shipped',
      trackingNumber: `${TRACKING}-2`,
    });
    const pickup = await pickupOrder();
    await setOrderStatus(actor, {
      orderId: pickup.orderId,
      expectedStatus: 'new',
      to: 'ready_for_pickup',
      pickupNote: NOTE,
    });
    await updateFulfilmentDetails(actor, {
      orderId: pickup.orderId,
      expectedStatus: 'ready_for_pickup',
      pickupNote: `${NOTE}-2`,
    });
    const text = JSON.stringify([
      await testDb.db.select().from(orderEvent),
      await testDb.db.select().from(adminActivity),
    ]);
    expect(text).not.toContain('SENTINEL');
  });
});

// ---------------------------------------------------------------- US3: payments (T019)

const PAID_AT = {
  at: new Date(Date.UTC(2026, 10, 1, 9, 0, 0)),
  provider: 'fake',
  transactionId: 'tx-1',
};

/** An online order is created paid, as the checkout does after the provider confirms. */
const onlineOrder = (options: MakeOptions = {}) =>
  makeOrder({ paymentMethod: 'online', paid: PAID_AT, ...options });

async function emailRows(kind: string) {
  return testDb.db.select().from(emailOutbox).where(eq(emailOutbox.kind, kind));
}

describe('markOrderPaid', () => {
  it('marks an offline order awaiting payment as paid: paid_at, one event, one activity row, no email', async () => {
    const created = await makeOrder();
    const outbox = await outboxCount();
    const result = await markOrderPaid(
      actor,
      { orderId: created.orderId, confirm: true },
      { now: NOW },
    );
    expect(result).toEqual({ ok: true, data: { changed: true } });
    const order = await getOrder(created.orderId);
    expect(order.paymentState).toBe('paid');
    expect(order.paidAt).toEqual(NOW);
    expect(order.status).toBe('new');

    const written = await events(created.orderId);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      kind: 'payment_marked_paid',
      adminId: actor.adminId,
    });
    const rows = await activity();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'order.marked_paid',
      targetType: 'order',
      targetId: String(created.orderNumber),
      adminId: actor.adminId,
      details: { orderNumber: created.orderNumber },
    });
    expect(await outboxCount()).toBe(outbox);
  });

  it('works on a Cancelled order and leaves the status Cancelled (late payment)', async () => {
    const created = await makeOrder({ status: 'cancelled' });
    expect(await markOrderPaid(actor, { orderId: created.orderId, confirm: true })).toEqual({
      ok: true,
      data: { changed: true },
    });
    const order = await getOrder(created.orderId);
    expect(order.status).toBe('cancelled');
    expect(order.paymentState).toBe('paid');
  });

  it('refuses an online order, even though it is already paid (checked before idempotency)', async () => {
    const created = await onlineOrder();
    await expectUntouched(created.orderId, async () => {
      expect(await markOrderPaid(actor, { orderId: created.orderId, confirm: true })).toEqual({
        ok: false,
        formError: 'admin.orders.errors.not_allowed',
      });
    });
  });

  it('an offline order that is already paid is a no-op', async () => {
    const created = await makeOrder({ paymentState: 'paid' });
    await expectUntouched(created.orderId, async () => {
      expect(await markOrderPaid(actor, { orderId: created.orderId, confirm: true })).toEqual({
        ok: true,
        data: { changed: false },
      });
    });
  });

  it('a second call after a successful one changes nothing', async () => {
    const created = await makeOrder();
    await markOrderPaid(actor, { orderId: created.orderId, confirm: true });
    const events1 = (await events(created.orderId)).length;
    expect(await markOrderPaid(actor, { orderId: created.orderId, confirm: true })).toEqual({
      ok: true,
      data: { changed: false },
    });
    expect((await events(created.orderId)).length).toBe(events1);
    expect(await activity()).toHaveLength(1);
  });

  it('refuses a refunded order', async () => {
    const created = await makeOrder({ paymentState: 'refunded' });
    await expectUntouched(created.orderId, async () => {
      expect(await markOrderPaid(actor, { orderId: created.orderId, confirm: true })).toEqual({
        ok: false,
        formError: 'admin.orders.errors.not_allowed',
      });
    });
  });

  it('needs confirm: true and changes nothing without it, even for an unknown order', async () => {
    const created = await makeOrder();
    await expectUntouched(created.orderId, async () => {
      expect(await markOrderPaid(actor, { orderId: created.orderId })).toEqual({
        ok: false,
        formError: 'admin.confirm_required',
      });
      expect(await markOrderPaid(actor, { orderId: randomUUID() })).toEqual({
        ok: false,
        formError: 'admin.confirm_required',
      });
    });
  });

  it('unknown and malformed ids are not_found', async () => {
    for (const orderId of [randomUUID(), 'not-a-uuid']) {
      expect(await markOrderPaid(actor, { orderId, confirm: true })).toEqual({
        ok: false,
        formError: 'admin.orders.errors.not_found',
      });
    }
  });
});

describe('markOrderRefunded', () => {
  it.each([
    ['online', () => onlineOrder()],
    ['offline', () => makeOrder({ paymentState: 'paid' })],
  ])(
    'refunds a paid %s order: refunded_at, one event, one activity row, one order-refunded email',
    async (_method, create) => {
      const created = await create();
      const result = await markOrderRefunded(
        actor,
        { orderId: created.orderId, confirm: true },
        { now: NOW },
      );
      expect(result).toEqual({ ok: true, data: { changed: true } });
      const order = await getOrder(created.orderId);
      expect(order.paymentState).toBe('refunded');
      expect(order.refundedAt).toEqual(NOW);
      expect(order.status).toBe('new');

      const written = (await events(created.orderId)).filter(
        (row) => row.kind !== 'payment_confirmed',
      );
      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({ kind: 'refunded', adminId: actor.adminId });
      const rows = await activity();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'order.refunded',
        targetType: 'order',
        targetId: String(created.orderNumber),
        details: { orderNumber: created.orderNumber },
      });
      const mails = await emailRows('order-refunded');
      expect(mails).toHaveLength(1);
      expect(mails[0]).toMatchObject({
        toAddress: 'dana@example.test',
        locale: 'he',
        orderId: created.orderId,
        dedupeKey: `order-refunded:${created.orderId}`,
      });
    },
  );

  it("queues the email in the order's language", async () => {
    const created = await makeOrder({ paymentState: 'paid', locale: 'en' });
    await markOrderRefunded(actor, { orderId: created.orderId, confirm: true });
    const [mail] = await emailRows('order-refunded');
    expect(mail?.locale).toBe('en');
    expect(mail?.html).toContain('lang="en"');
  });

  it('works on a Cancelled order and leaves the status Cancelled', async () => {
    const created = await makeOrder({ status: 'cancelled', paymentState: 'paid' });
    expect(await markOrderRefunded(actor, { orderId: created.orderId, confirm: true })).toEqual({
      ok: true,
      data: { changed: true },
    });
    const order = await getOrder(created.orderId);
    expect(order.status).toBe('cancelled');
    expect(order.paymentState).toBe('refunded');
  });

  it('an order awaiting payment cannot be refunded', async () => {
    const created = await makeOrder();
    await expectUntouched(created.orderId, async () => {
      expect(await markOrderRefunded(actor, { orderId: created.orderId, confirm: true })).toEqual({
        ok: false,
        formError: 'admin.orders.errors.not_allowed',
      });
    });
  });

  it('a repeated refund is a no-op and queues no second email', async () => {
    const created = await makeOrder({ paymentState: 'paid' });
    await markOrderRefunded(actor, { orderId: created.orderId, confirm: true });
    await expectUntouched(created.orderId, async () => {
      expect(await markOrderRefunded(actor, { orderId: created.orderId, confirm: true })).toEqual({
        ok: true,
        data: { changed: false },
      });
    });
    expect(await emailRows('order-refunded')).toHaveLength(1);
  });

  it('needs confirm: true and changes nothing without it', async () => {
    const created = await makeOrder({ paymentState: 'paid' });
    await expectUntouched(created.orderId, async () => {
      expect(await markOrderRefunded(actor, { orderId: created.orderId })).toEqual({
        ok: false,
        formError: 'admin.confirm_required',
      });
      expect(await markOrderRefunded(actor, { orderId: randomUUID() })).toEqual({
        ok: false,
        formError: 'admin.confirm_required',
      });
    });
  });

  it('unknown and malformed ids are not_found', async () => {
    for (const orderId of [randomUUID(), 'not-a-uuid']) {
      expect(await markOrderRefunded(actor, { orderId, confirm: true })).toEqual({
        ok: false,
        formError: 'admin.orders.errors.not_found',
      });
    }
  });

  it('queues no email for an anonymised order (customer_email null), but still refunds', async () => {
    const created = await makeOrder({ paymentState: 'paid' });
    await testDb.db
      .update(orders)
      .set({ customerEmail: null, customerPhone: null, anonymizedAt: new Date() })
      .where(eq(orders.id, created.orderId));
    expect(await markOrderRefunded(actor, { orderId: created.orderId, confirm: true })).toEqual({
      ok: true,
      data: { changed: true },
    });
    expect((await getOrder(created.orderId)).paymentState).toBe('refunded');
    expect(await emailRows('order-refunded')).toHaveLength(0);
  });

  it('writes no customer data into the event or the activity row', async () => {
    const created = await makeOrder({ paymentState: 'paid' });
    await markOrderRefunded(actor, { orderId: created.orderId, confirm: true });
    const text = JSON.stringify([
      await testDb.db.select().from(orderEvent),
      await testDb.db.select().from(adminActivity),
    ]);
    expect(text).not.toContain('dana@example.test');
    expect(text).not.toContain('דנה');
  });
});

describe('setOrderStatus: cancelling (US5)', () => {
  async function cancel(orderId: string, expectedStatus: OrderStatus, extra = {}) {
    return setOrderStatus(
      actor,
      { orderId, expectedStatus, to: 'cancelled', confirm: true, ...extra },
      { now: NOW },
    );
  }
  async function cancelledRows() {
    return testDb.db.select().from(emailOutbox).where(eq(emailOutbox.kind, 'order-cancelled'));
  }

  it.each<OrderStatus>(['new', 'in_preparation', 'shipped', 'ready_for_pickup'])(
    'cancels from %s: event, activity, 30-day link, one email to the customer in the order language',
    async (from) => {
      const created = await makeOrder({ status: from, locale: 'en' });
      expect(await cancel(created.orderId, from)).toMatchObject({
        ok: true,
        data: { changed: true, status: 'cancelled', refundReminder: false },
      });
      const order = await getOrder(created.orderId);
      expect(order.status).toBe('cancelled');
      expect(order.publicTokenExpiresAt.getTime()).toBe(NOW.getTime() + 30 * DAY);
      expect((await events(created.orderId)).map((row) => [row.kind, row.data])).toEqual([
        ['status_changed', { from, to: 'cancelled' }],
      ]);
      expect((await activity()).map((row) => row.action)).toEqual(['order.status_changed']);
      const rows = await cancelledRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        toAddress: 'dana@example.test',
        locale: 'en',
        orderId: created.orderId,
        dedupeKey: `order-cancelled:${created.orderId}`,
      });
    },
  );

  it('without confirm: admin.confirm_required and nothing changes', async () => {
    const created = await makeOrder();
    await expectUntouched(created.orderId, async () => {
      expect(
        await setOrderStatus(actor, {
          orderId: created.orderId,
          expectedStatus: 'new',
          to: 'cancelled',
        }),
      ).toEqual({ ok: false, formError: 'admin.confirm_required' });
    });
  });

  it('from completed: not_allowed; from cancelled: only the true repeat, which writes nothing', async () => {
    const completed = await makeOrder({ status: 'completed' });
    await expectUntouched(completed.orderId, async () => {
      expect(await cancel(completed.orderId, 'completed')).toEqual({
        ok: false,
        formError: 'admin.orders.errors.not_allowed',
      });
    });
    const cancelled = await makeOrder({ status: 'cancelled' });
    await expectUntouched(cancelled.orderId, async () => {
      expect(await cancel(cancelled.orderId, 'cancelled')).toMatchObject({
        ok: true,
        data: { changed: false, status: 'cancelled' },
      });
    });
    expect(await cancelledRows()).toHaveLength(0);
  });

  it('a paid order reports the refund reminder, an unpaid one does not', async () => {
    const paid = await makeOrder({ paymentState: 'paid' });
    expect(await cancel(paid.orderId, 'new')).toMatchObject({ data: { refundReminder: true } });
    const unpaid = await makeOrder();
    expect(await cancel(unpaid.orderId, 'new')).toMatchObject({ data: { refundReminder: false } });
  });

  it('a repeated cancel changes nothing and queues no second email', async () => {
    const created = await makeOrder();
    await cancel(created.orderId, 'new');
    await expectUntouched(created.orderId, async () => {
      expect(await cancel(created.orderId, 'new')).toMatchObject({
        ok: true,
        data: { changed: false, status: 'cancelled' },
      });
    });
    expect(await cancelledRows()).toHaveLength(1);
  });

  it('queues no email for an anonymised order, but still cancels', async () => {
    const created = await makeOrder();
    await testDb.db
      .update(orders)
      .set({ customerEmail: null, customerPhone: null, anonymizedAt: new Date() })
      .where(eq(orders.id, created.orderId));
    expect(await cancel(created.orderId, 'new')).toMatchObject({ ok: true });
    expect((await getOrder(created.orderId)).status).toBe('cancelled');
    expect(await cancelledRows()).toHaveLength(0);
  });

  it('other status changes queue no email', async () => {
    const created = await makeOrder();
    const before = await outboxCount();
    await setOrderStatus(actor, {
      orderId: created.orderId,
      expectedStatus: 'new',
      to: 'in_preparation',
    });
    expect(await outboxCount()).toBe(before);
    expect(await cancelledRows()).toHaveLength(0);
  });

  it('a cancelled and paid order allows mark refunded, not cancel (getOrderDetail)', async () => {
    const created = await makeOrder({ paymentState: 'paid' });
    await cancel(created.orderId, 'new');
    const detail = await getOrderDetail(created.orderId);
    expect(detail?.allowed.markRefunded).toBe(true);
    expect(detail?.allowed.cancel).toBe(false);
  });
});
