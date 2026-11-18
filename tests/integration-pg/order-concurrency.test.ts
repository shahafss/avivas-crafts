// Concurrent order status changes on real PostgreSQL, two connections (tasks.md T014; research R3).
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPgTestDb, type PgTestDb } from '../setup/pg';
import { makeActor } from '../helpers/catalog';
import { adminActivity, orderEvent, orders, shippingZone } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import type { Actor } from '@/server/catalog/result';
import { insertOrder, randomToken } from '@/server/orders/create-order';
import { setOrderStatus } from '@/server/orders/order-changes';

let pg: PgTestDb;
let actor: Actor;
let zoneId = '';

vi.mock('@/server/db/client', () => ({
  get db() {
    return pg.a;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => pg.a.transaction(fn),
}));
vi.mock('@/server/storage', () => ({ getStorage: () => undefined }));
vi.mock('@/server/env', () => ({
  getEnv: () => ({
    APP_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3100',
    SECRET_HMAC_KEY: Buffer.from('order-pg-hmac-key-0123456789abcdef-xyz').toString('base64'),
    EMAIL_DRIVER: 'outbox',
    EMAIL_FROM: 'shop@example.test',
  }),
}));
vi.mock('@/server/email/sender', () => ({ kickOutbox: vi.fn(), drainOutbox: vi.fn() }));

beforeAll(async () => {
  pg = await createPgTestDb();
  await runSeed(pg.a, { samples: false });
  const [zone] = await pg.a.select({ id: shippingZone.id }).from(shippingZone).limit(1);
  zoneId = zone?.id ?? '';
  actor = await makeActor(pg.a as never);
});
afterAll(() => pg.close());

async function newOrder(): Promise<string> {
  const created = await insertOrder(pg.a, {
    locale: 'he',
    zoneId,
    currency: 'ILS',
    customer: { name: 'דנה כהן', phone: '+972522345678', email: 'dana@example.test' },
    deliveryMethod: 'shipping',
    address: { country: 'IL', city: 'חיפה', line1: 'הרצל 5', line2: null, postalCode: null },
    note: null,
    paymentMethod: 'offline',
    paid: null,
    subtotalMinor: 10000,
    deliveryFeeMinor: 3000,
    totalMinor: 13000,
    termsAcceptedAt: new Date(),
    termsVersion: 1,
    privacyVersion: 1,
    marketingOptIn: false,
    marketingOptInAt: null,
    lines: [
      {
        product_id: null,
        option_value_ids: [],
        product_name_he: 'בובה',
        product_name_en: 'Doll',
        prep_time_he: '',
        prep_time_en: '',
        options: [],
        unit_price_minor: 10000,
        quantity: 1,
        line_total_minor: 10000,
        sourceImageKey: null,
      },
    ],
    token: randomToken(),
    now: new Date(),
  });
  return created.orderId;
}

async function statusEvents(orderId: string) {
  return (await pg.a.select().from(orderEvent).where(eq(orderEvent.orderId, orderId))).filter(
    (row) => row.kind === 'status_changed',
  );
}

describe('order status concurrency (real PostgreSQL)', () => {
  it('two simultaneous identical moves succeed once: one event, one activity row', async () => {
    const orderId = await newOrder();
    await pg.a.delete(adminActivity);
    const input = { orderId, expectedStatus: 'new', to: 'in_preparation' } as const;
    const results = await Promise.all([
      setOrderStatus(actor, input, { database: pg.a }),
      setOrderStatus(actor, input, { database: pg.b }),
    ]);
    for (const result of results) expect(result).toMatchObject({ ok: true });
    expect(
      results.filter((result) => (result as { data?: { changed?: boolean } }).data?.changed),
    ).toHaveLength(1);
    expect(await statusEvents(orderId)).toHaveLength(1);
    expect(await pg.a.select().from(adminActivity)).toHaveLength(1);
  });

  it('two different moves from the same page: one wins, the other is stale', async () => {
    const orderId = await newOrder();
    const results = await Promise.all([
      setOrderStatus(
        actor,
        { orderId, expectedStatus: 'new', to: 'in_preparation' },
        { database: pg.a },
      ),
      setOrderStatus(
        actor,
        { orderId, expectedStatus: 'new', to: 'shipped', trackingNumber: 'RR1' },
        { database: pg.b },
      ),
    ]);
    const winners = results.filter(
      (result) => result.ok && (result.data as { changed: boolean }).changed,
    );
    const stale = results.filter(
      (result) => !result.ok && result.formError === 'admin.orders.errors.stale',
    );
    expect(winners).toHaveLength(1);
    expect(stale).toHaveLength(1);
    const winner = winners[0];
    const target = winner?.ok ? (winner.data as { status: string }).status : '';
    const [order] = await pg.a.select().from(orders).where(eq(orders.id, orderId));
    expect(order?.status).toBe(target);
    expect(await statusEvents(orderId)).toHaveLength(1);
  });
});
