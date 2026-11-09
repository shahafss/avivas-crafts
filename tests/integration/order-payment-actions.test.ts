// 002 US3 (review W1): the payment Server Actions of orders/[id]/actions.ts. The refund email is
// queued in the data layer's transaction; the action must kick the outbox once after a real
// refund and never otherwise.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { makeActor } from '../helpers/catalog';
import { orders, shippingZone } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { insertOrder, randomToken } from '@/server/orders/create-order';
import { kickOutbox } from '@/server/email/sender';
import {
  markOrderPaid,
  markOrderRefunded,
  setOrderStatus,
} from '@/app/admin/(protected)/orders/[id]/actions';

let testDb: TestDbHandle;
let zoneId = '';
const session = vi.hoisted(() => ({ admin: { id: '', displayName: 'Aviva' } }));

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
    SECRET_HMAC_KEY: Buffer.from('payment-actions-test-hmac-key-0123456789abcdef').toString(
      'base64',
    ),
    EMAIL_DRIVER: 'outbox',
    EMAIL_FROM: 'shop@example.test',
  }),
}));
vi.mock('@/server/email/sender', () => ({ kickOutbox: vi.fn(), drainOutbox: vi.fn() }));
vi.mock('@/server/auth/require-admin', () => ({ requireAdmin: () => Promise.resolve(session) }));

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  vi.mocked(kickOutbox).mockClear();
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
  const [zone] = await testDb.db.select({ id: shippingZone.id }).from(shippingZone).limit(1);
  zoneId = zone?.id ?? '';
  session.admin.id = (await makeActor(testDb.db)).adminId ?? '';
});

async function makeOrder(
  paymentState: 'awaiting_payment' | 'paid' | 'refunded',
  method = 'offline',
) {
  const created = await insertOrder(testDb.db, {
    locale: 'he',
    zoneId,
    currency: 'ILS',
    customer: { name: 'דנה כהן', phone: '+972522345678', email: 'dana@example.test' },
    deliveryMethod: 'pickup',
    address: null,
    note: null,
    paymentMethod: method === 'online' ? 'online' : 'offline',
    paid: null,
    subtotalMinor: 10000,
    deliveryFeeMinor: 0,
    totalMinor: 10000,
    termsAcceptedAt: new Date(),
    termsVersion: 1,
    privacyVersion: 1,
    marketingOptIn: false,
    marketingOptInAt: null,
    lines: [],
    token: randomToken(),
    now: new Date(),
  });
  await testDb.db.update(orders).set({ paymentState }).where(eq(orders.id, created.orderId));
  return created.orderId;
}

describe('markOrderRefunded action', () => {
  it('kicks the outbox once after a real refund', async () => {
    const orderId = await makeOrder('paid');
    expect(await markOrderRefunded({ orderId, confirm: true })).toEqual({
      ok: true,
      data: { changed: true },
    });
    expect(kickOutbox).toHaveBeenCalledTimes(1);
  });

  it('does not kick on a repeat, not_allowed, confirm_required (also confirm: false) or not_found', async () => {
    const refunded = await makeOrder('refunded');
    expect(await markOrderRefunded({ orderId: refunded, confirm: true })).toEqual({
      ok: true,
      data: { changed: false },
    });
    const awaiting = await makeOrder('awaiting_payment');
    expect(await markOrderRefunded({ orderId: awaiting, confirm: true })).toEqual({
      ok: false,
      formError: 'admin.orders.errors.not_allowed',
    });
    const paid = await makeOrder('paid');
    expect(await markOrderRefunded({ orderId: paid })).toEqual({
      ok: false,
      formError: 'admin.confirm_required',
    });
    expect(await markOrderRefunded({ orderId: paid, confirm: false })).toEqual({
      ok: false,
      formError: 'admin.confirm_required',
    });
    expect(await markOrderRefunded({ orderId: 'nope', confirm: true })).toEqual({
      ok: false,
      formError: 'admin.orders.errors.not_found',
    });
    expect(kickOutbox).not.toHaveBeenCalled();
  });
});

describe('markOrderPaid action', () => {
  it('marks paid without kicking the outbox; confirm: false is confirm_required', async () => {
    const orderId = await makeOrder('awaiting_payment');
    expect(await markOrderPaid({ orderId, confirm: false })).toEqual({
      ok: false,
      formError: 'admin.confirm_required',
    });
    expect(await markOrderPaid({ orderId, confirm: true })).toEqual({
      ok: true,
      data: { changed: true },
    });
    expect(kickOutbox).not.toHaveBeenCalled();
  });
});

describe('setOrderStatus action', () => {
  it('kicks the outbox once after a real cancel', async () => {
    const orderId = await makeOrder('paid');
    expect(
      await setOrderStatus({ orderId, expectedStatus: 'new', to: 'cancelled', confirm: true }),
    ).toMatchObject({
      ok: true,
      data: { changed: true, status: 'cancelled', refundReminder: true },
    });
    expect(kickOutbox).toHaveBeenCalledTimes(1);
  });

  it('does not kick on a repeat, a refusal, a missing confirm, not_found, or another status', async () => {
    const orderId = await makeOrder('awaiting_payment');
    await setOrderStatus({ orderId, expectedStatus: 'new', to: 'cancelled', confirm: true });
    vi.mocked(kickOutbox).mockClear();
    // repeat
    expect(
      await setOrderStatus({ orderId, expectedStatus: 'new', to: 'cancelled', confirm: true }),
    ).toMatchObject({ ok: true, data: { changed: false } });
    // an already cancelled order asked to cancel again: the true repeat, a no-op
    expect(
      await setOrderStatus({
        orderId,
        expectedStatus: 'cancelled',
        to: 'cancelled',
        confirm: true,
      }),
    ).toMatchObject({ ok: true, data: { changed: false } });
    // a Completed order cannot be cancelled: refused, nothing queued
    const completed = await makeOrder('awaiting_payment');
    await testDb.db.update(orders).set({ status: 'completed' }).where(eq(orders.id, completed));
    expect(
      await setOrderStatus({
        orderId: completed,
        expectedStatus: 'completed',
        to: 'cancelled',
        confirm: true,
      }),
    ).toEqual({ ok: false, formError: 'admin.orders.errors.not_allowed' });
    const open = await makeOrder('awaiting_payment');
    expect(await setOrderStatus({ orderId: open, expectedStatus: 'new', to: 'cancelled' })).toEqual(
      { ok: false, formError: 'admin.confirm_required' },
    );
    expect(
      await setOrderStatus({
        orderId: open,
        expectedStatus: 'in_preparation',
        to: 'cancelled',
        confirm: true,
      }),
    ).toEqual({ ok: false, formError: 'admin.orders.errors.stale' });
    expect(
      await setOrderStatus({
        orderId: 'nope',
        expectedStatus: 'new',
        to: 'cancelled',
        confirm: true,
      }),
    ).toEqual({ ok: false, formError: 'admin.orders.errors.not_found' });
    expect(
      await setOrderStatus({ orderId: open, expectedStatus: 'new', to: 'in_preparation' }),
    ).toMatchObject({ ok: true, data: { changed: true } });
    expect(kickOutbox).not.toHaveBeenCalled();
  });
});
