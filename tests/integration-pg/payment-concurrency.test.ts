// Concurrent payment confirmation on real PostgreSQL, two connections (tasks.md T066).
// Written before T078-T080; fails until `confirmOnlinePayment`, `placeOrder` and
// `switchToOfflinePayment` exist. API assumed: the functions accept `{ database }` as their
// last option so a test can run them on a chosen connection (like `drainOutbox({ database })`).
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPgTestDb, type PgTestDb } from '../setup/pg';
import { makeActor, makeTestStorage, type TestStorage } from '../helpers/catalog';
import { createStubProvider, seedCatalog, type StubProvider } from '../helpers/checkout';
import { emailOutbox, orders, pendingCheckout } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { issueFormToken } from '@/server/checkout/form-token';
import { placeOrder, switchToOfflinePayment } from '@/server/checkout/place-order';
import { confirmOnlinePayment } from '@/server/orders/confirm-online-payment';

let pg: PgTestDb;
let files: TestStorage;
let provider: StubProvider;
let productId = '';

const holder = vi.hoisted((): { provider: unknown } => ({ provider: undefined }));

vi.mock('@/server/db/client', () => ({
  get db() {
    return pg.a;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => pg.a.transaction(fn),
}));
vi.mock('@/server/storage', () => ({ getStorage: () => files.storage }));
vi.mock('@/server/env', () => ({
  getEnv: () => ({
    APP_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3100',
    SECRET_HMAC_KEY: Buffer.from('payment-pg-hmac-key-0123456789abcdef').toString('base64'),
    TRUSTED_PROXY_HOPS: 0,
    PAYMENT_PROVIDER: 'fake',
    EMAIL_DRIVER: 'outbox',
    EMAIL_FROM: 'shop@example.test',
  }),
}));
vi.mock('@/server/payments', () => ({ getProvider: () => holder.provider }));
vi.mock('@/server/email/sender', () => ({ kickOutbox: vi.fn(), drainOutbox: vi.fn() }));

beforeAll(async () => {
  pg = await createPgTestDb();
  files = await makeTestStorage();
  await runSeed(pg.a, { samples: false });
  const fixture = await seedCatalog(await makeActor(pg.a as never));
  productId = fixture.candle.id;
  provider = createStubProvider();
  holder.provider = provider;
});
afterAll(async () => {
  await pg.close();
  await files.cleanup();
});

async function startOnline(ip: string) {
  const result = await placeOrder(
    {
      items: [{ productId, optionValueIds: [], quantity: 1 }],
      fullName: 'דנה כהן',
      phone: '052-234-5678',
      email: 'dana@example.com',
      deliveryMethod: 'pickup',
      paymentMethod: 'online',
      acceptTerms: true,
      marketingOptIn: false,
      honeypot: '',
      formToken: issueFormToken(Date.now() - 5000),
      locale: 'he',
    },
    { ip },
  );
  expect(result).toMatchObject({ ok: true });
  const pageId = provider.lastPageId();
  return { pageId, token: provider.resumeToken(pageId) };
}

async function reset() {
  await pg.a.delete(emailOutbox);
  await pg.a.delete(orders);
  await pg.a.delete(pendingCheckout);
}

describe('payment concurrency (real PostgreSQL)', () => {
  it('two concurrent duplicate callbacks create exactly one order and two outbox rows', async () => {
    await reset();
    const { pageId } = await startOnline('203.0.113.1');
    const status = provider.pay(pageId);
    const outcomes = await Promise.all([
      confirmOnlinePayment(status, pageId, { database: pg.a }),
      confirmOnlinePayment(status, pageId, { database: pg.b }),
    ]);
    expect([...outcomes].sort()).toEqual(['confirmed', 'duplicate']);
    expect(await pg.a.select().from(orders)).toHaveLength(1);
    expect(await pg.a.select().from(emailOutbox)).toHaveLength(2);
  });

  it('a double switch to offline payment creates exactly one offline order', async () => {
    await reset();
    const { token } = await startOnline('203.0.113.2');
    const results = await Promise.all([
      switchToOfflinePayment(token, { database: pg.a }),
      switchToOfflinePayment(token, { database: pg.b }),
    ]);
    const succeeded = results.filter((result: unknown) => (result as { ok: boolean }).ok);
    expect(succeeded).toHaveLength(1);
    expect(
      results.filter(
        (result: unknown) =>
          (result as { formError?: string }).formError === 'checkout.already_completed',
      ),
    ).toHaveLength(1);
    expect(await pg.a.select().from(orders)).toHaveLength(1);
  });

  it('switch-to-offline racing a paid callback ends in exactly one valid outcome', async () => {
    await reset();
    const { pageId, token } = await startOnline('203.0.113.3');
    const status = provider.pay(pageId);
    const [, outcome] = await Promise.all([
      switchToOfflinePayment(token, { database: pg.a }),
      confirmOnlinePayment(status, pageId, { database: pg.b }),
    ]);
    const rows = await pg.a.select().from(orders);
    expect(rows).toHaveLength(1);
    const alerts = (await pg.a.select().from(emailOutbox)).filter(
      (row) => row.kind === 'payment-attention',
    );
    if (rows[0]?.paymentMethod === 'online') {
      // The payment won: a paid online order, and the switch was refused.
      expect(outcome).toBe('confirmed');
      expect(rows[0].paymentState).toBe('paid');
      expect(alerts).toHaveLength(0);
    } else {
      // The switch won: an offline order, and the late payment alerts the owner.
      expect(outcome).toBe('switched_offline');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.orderId).toBe(rows[0]?.id);
    }
    const [pending] = await pg.a
      .select()
      .from(pendingCheckout)
      .where(eq(pendingCheckout.providerPageId, pageId));
    expect(['confirmed', 'switched_offline']).toContain(pending?.state);
  });
});
