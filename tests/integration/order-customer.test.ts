// 002 US6 (tasks.md T038): `updateOrderCustomer` of src/server/orders/order-changes.ts
// (contracts/server-actions.md > updateOrderCustomer; research R10). Orders are created through
// `insertOrder()` as the checkout does.
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { makeActor } from '../helpers/catalog';
import {
  adminActivity,
  emailOutbox,
  orderEvent,
  orderLine,
  orders,
  shippingZone,
} from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import type { Actor } from '@/server/catalog/result';
import { insertOrder, randomToken, type NewOrder } from '@/server/orders/create-order';
import type { LineSnapshot } from '@/server/orders/snapshots';
import { setOrderStatus, updateOrderCustomer } from '@/server/orders/order-changes';
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
    SECRET_HMAC_KEY: Buffer.from('order-customer-test-hmac-key-0123456789abcdef').toString(
      'base64',
    ),
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

const E = 'admin.orders.customer.errors';

const SHIPPING = {
  fullName: 'דנה כהן',
  phone: '052-234-5678',
  email: 'dana@example.test',
  address: { city: 'חיפה', line1: 'הרצל 5', line2: '', postalCode: '' },
};

function submit(orderId: string, overrides: Record<string, unknown> = {}) {
  return updateOrderCustomer(actor, {
    orderId,
    ...SHIPPING,
    ...overrides,
  });
}

async function counts(id: string) {
  return {
    order: await getOrder(id),
    events: (await events(id)).length,
    activity: (await activity()).length,
    outbox: await outboxCount(),
  };
}

describe('updateOrderCustomer', () => {
  it('saves name, phone, email and address; the phone becomes E.164 and the email domain lower-case', async () => {
    const { orderId } = await makeOrder();
    const result = await submit(orderId, {
      fullName: '  רונית לוי ',
      phone: '050-234-5678',
      email: 'Ronit@Example.TEST',
      address: { city: ' תל אביב ', line1: 'דיזנגוף 10', line2: 'דירה 3', postalCode: '6433101' },
    });
    expect(result).toEqual({
      ok: true,
      data: { changed: true, fields: ['name', 'phone', 'email', 'address'] },
    });
    const order = await getOrder(orderId);
    expect(order).toMatchObject({
      customerName: 'רונית לוי',
      customerPhone: '+972502345678',
      customerEmail: 'Ronit@example.test',
      addressCity: 'תל אביב',
      addressLine1: 'דיזנגוף 10',
      addressLine2: 'דירה 3',
      addressPostalCode: '6433101',
    });
  });

  it('never changes the country, delivery method, amounts or lines', async () => {
    const { orderId } = await makeOrder();
    const before = await getOrder(orderId);
    await submit(orderId, { fullName: 'שם אחר', phone: '050-234-5678' });
    const after = await getOrder(orderId);
    expect(after).toMatchObject({
      addressCountry: before.addressCountry,
      deliveryMethod: before.deliveryMethod,
      subtotalMinor: before.subtotalMinor,
      deliveryFeeMinor: before.deliveryFeeMinor,
      totalMinor: before.totalMinor,
      status: before.status,
      paymentState: before.paymentState,
    });
    const detail = await testDb.db.select().from(orderLine).where(eq(orderLine.orderId, orderId));
    expect(detail).toHaveLength(1);
    expect(detail[0]).toMatchObject({ quantity: 1, lineTotalMinor: 10000 });
  });

  it('refuses each invalid field with its own key and saves nothing', async () => {
    const { orderId } = await makeOrder();
    const before = await counts(orderId);
    const cases: [Record<string, unknown>, Record<string, string>][] = [
      [{ fullName: 'ד' }, { fullName: `${E}.fullName` }],
      [{ fullName: 'ד'.repeat(101) }, { fullName: `${E}.fullName` }],
      [{ phone: 'not a phone' }, { phone: `${E}.phone` }],
      [{ phone: '' }, { phone: `${E}.phone` }],
      [{ email: 'not-an-email' }, { email: `${E}.email` }],
      [{ email: `${'a'.repeat(250)}@example.test` }, { email: `${E}.email` }],
      [{ address: { ...SHIPPING.address, city: '' } }, { 'address.city': `${E}.city` }],
      [{ address: { ...SHIPPING.address, line1: '  ' } }, { 'address.line1': `${E}.line1` }],
      [
        { address: { ...SHIPPING.address, line2: 'x'.repeat(201) } },
        { 'address.line2': `${E}.line2` },
      ],
      [
        { address: { ...SHIPPING.address, postalCode: '12345' } },
        { 'address.postalCode': `${E}.postalCodeIl` },
      ],
    ];
    for (const [overrides, fieldErrors] of cases) {
      expect(await submit(orderId, overrides)).toEqual({ ok: false, fieldErrors });
    }
    const after = await counts(orderId);
    expect(after).toEqual(before);
  });

  it('reports every failing field at once', async () => {
    const { orderId } = await makeOrder();
    expect(
      await submit(orderId, {
        fullName: '',
        email: 'x',
        address: { city: '', line1: '', line2: '', postalCode: '1' },
      }),
    ).toEqual({
      ok: false,
      fieldErrors: {
        fullName: `${E}.fullName`,
        email: `${E}.email`,
        'address.city': `${E}.city`,
        'address.line1': `${E}.line1`,
        'address.postalCode': `${E}.postalCodeIl`,
      },
    });
  });

  it('a shipping order submitted without an address gets city and street errors', async () => {
    const { orderId } = await makeOrder();
    const before = await counts(orderId);
    const withoutAddress = {
      fullName: SHIPPING.fullName,
      phone: SHIPPING.phone,
      email: SHIPPING.email,
    };
    expect(await updateOrderCustomer(actor, { orderId, ...withoutAddress })).toEqual({
      ok: false,
      fieldErrors: { 'address.city': `${E}.city`, 'address.line1': `${E}.line1` },
    });
    expect(await counts(orderId)).toEqual(before);
  });

  it('a pickup order ignores the address', async () => {
    const { orderId } = await pickupOrder();
    const result = await submit(orderId, { phone: '050-234-5678' });
    expect(result).toEqual({ ok: true, data: { changed: true, fields: ['phone'] } });
    const order = await getOrder(orderId);
    expect(order).toMatchObject({
      customerPhone: '+972502345678',
      addressCountry: null,
      addressCity: null,
      addressLine1: null,
      addressLine2: null,
      addressPostalCode: null,
    });
  });

  it('identical values (after normalisation) change nothing and write no event', async () => {
    const { orderId } = await makeOrder();
    const before = await counts(orderId);
    expect(await submit(orderId, { email: 'dana@EXAMPLE.test' })).toEqual({
      ok: true,
      data: { changed: false, fields: [] },
    });
    expect(await counts(orderId)).toEqual(before);
  });

  it('records the changed fields in the event and activity, without any old or new value', async () => {
    const { orderId, orderNumber } = await makeOrder({
      customer: {
        name: 'SENTINEL-OLD-NAME',
        phone: '+972522345678',
        email: 'sentinel-old@example.test',
      },
      address: {
        country: 'IL',
        city: 'SENTINEL-OLD-CITY',
        line1: 'SENTINEL-OLD-STREET',
        line2: null,
        postalCode: null,
      },
    });
    await submit(orderId, {
      fullName: 'SENTINEL-NEW-NAME',
      phone: '050-765-4321',
      address: {
        city: 'SENTINEL-NEW-CITY',
        line1: 'SENTINEL-NEW-STREET',
        line2: '',
        postalCode: '',
      },
    });
    const [event] = await events(orderId);
    expect(event).toMatchObject({ kind: 'customer_edited', adminId: actor.adminId });
    expect(event?.data).toEqual({ fields: ['name', 'phone', 'email', 'address'] });
    const [entry] = await activity();
    expect(entry).toMatchObject({
      action: 'customer.updated',
      targetType: 'order',
      targetId: String(orderNumber),
      details: { orderNumber, field: 'name,phone,email,address' },
    });
    const written = JSON.stringify([event?.data, entry?.details]);
    for (const value of [
      'SENTINEL',
      '0507654321',
      '+972507654321',
      '052-234-5678',
      '+972522345678',
      'sentinel-old',
      '@example',
    ]) {
      expect(written).not.toContain(value);
    }
  });

  it("judges the phone by the order's own country and limits a foreign postal code to 12 characters", async () => {
    const { orderId } = await makeOrder({
      address: { country: 'GB', city: 'London', line1: '1 High St', line2: null, postalCode: null },
    });
    const address = { city: 'London', line1: '1 High St', line2: '', postalCode: '' };
    // An Israeli-only number is not valid for a UK order.
    expect(await submit(orderId, { phone: '052-234-5678', address })).toEqual({
      ok: false,
      fieldErrors: { phone: `${E}.phone` },
    });
    expect(
      await submit(orderId, {
        phone: '07400 123456',
        address: { ...address, postalCode: 'X'.repeat(13) },
      }),
    ).toEqual({ ok: false, fieldErrors: { 'address.postalCode': `${E}.postalCode` } });
    // A UK number and a free-form postal code are accepted.
    expect(
      await submit(orderId, {
        phone: '07400 123456',
        address: { ...address, postalCode: 'SW1A 1AA' },
      }),
    ).toEqual({ ok: true, data: { changed: true, fields: ['phone', 'address'] } });
    expect(await getOrder(orderId)).toMatchObject({
      customerPhone: '+447400123456',
      addressCountry: 'GB',
      addressPostalCode: 'SW1A 1AA',
    });
  });

  it('queues no email', async () => {
    const { orderId } = await makeOrder();
    const before = await outboxCount();
    await submit(orderId, { fullName: 'שם חדש' });
    expect(await outboxCount()).toBe(before);
  });

  it('an anonymised order is refused, while a status change still works', async () => {
    const { orderId } = await makeOrder();
    await testDb.db.update(orders).set({ anonymizedAt: new Date() }).where(eq(orders.id, orderId));
    const before = await counts(orderId);
    expect(await submit(orderId, { fullName: 'שם חדש' })).toEqual({
      ok: false,
      formError: 'admin.orders.errors.anonymized',
    });
    expect(await counts(orderId)).toEqual(before);
    const moved = await setOrderStatus(actor, {
      orderId,
      expectedStatus: 'new',
      to: 'in_preparation',
    });
    expect(moved).toMatchObject({ ok: true, data: { changed: true, status: 'in_preparation' } });
  });

  it('an unknown or malformed order id is not found', async () => {
    expect(await submit('00000000-0000-4000-8000-000000000000')).toEqual({
      ok: false,
      formError: 'admin.orders.errors.not_found',
    });
    expect(await submit('nope')).toEqual({
      ok: false,
      formError: 'admin.orders.errors.not_found',
    });
  });
});
