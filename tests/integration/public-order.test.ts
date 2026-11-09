// US4: the order page's link lifetime (tasks.md T025; research R4, FR-015).
// `getOrderByToken`: an open order always resolves; a closed order resolves while
// `public_token_expires_at` is in the future.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { makeActor, makeTestStorage, type TestStorage } from '../helpers/catalog';
import { createStubProvider, seedCatalog, type CheckoutFixture } from '../helpers/checkout';
import { orders } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { issueFormToken } from '@/server/checkout/form-token';
import { placeOrder } from '@/server/checkout/place-order';
import { getOrderByToken } from '@/server/orders/public-order';

let testDb: TestDbHandle;
let files: TestStorage;
let fixture: CheckoutFixture;

const holder = vi.hoisted((): { provider: unknown } => ({ provider: undefined }));

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
vi.mock('@/server/storage', () => ({ getStorage: () => files.storage }));
vi.mock('@/server/env', () => ({
  getEnv: () => ({
    APP_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3100',
    SECRET_HMAC_KEY: Buffer.from('place-order-test-hmac-key-0123456789abcdef').toString('base64'),
    TRUSTED_PROXY_HOPS: 0,
    PAYMENT_PROVIDER: 'fake',
    EMAIL_DRIVER: 'outbox',
    EMAIL_FROM: 'shop@example.test',
  }),
}));
vi.mock('@/server/payments', () => ({ getProvider: () => holder.provider }));
vi.mock('@/server/email/sender', () => ({ kickOutbox: vi.fn(), drainOutbox: vi.fn() }));

beforeAll(async () => {
  testDb = await createTestDb();
  files = await makeTestStorage();
});
afterAll(async () => {
  await testDb.close();
  await files.cleanup();
});
beforeEach(async () => {
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
  fixture = await seedCatalog(await makeActor(testDb.db));
  holder.provider = createStubProvider();
});

const DAY = 24 * 60 * 60 * 1000;

async function place(): Promise<string> {
  const result = await placeOrder(
    {
      items: [{ productId: fixture.doll.id, optionValueIds: [fixture.doll.brown], quantity: 1 }],
      fullName: 'דנה כהן',
      phone: '052-234-5678',
      email: 'dana@example.com',
      deliveryMethod: 'shipping',
      address: { country: 'IL', city: 'חיפה', line1: 'הרצל 5' },
      paymentMethod: 'offline',
      acceptTerms: true,
      marketingOptIn: false,
      note: '',
      honeypot: '',
      formToken: issueFormToken(Date.now() - 5000),
      locale: 'he',
    },
    { ip: '203.0.113.7' },
  );
  expect(result).toMatchObject({ ok: true });
  return (result as { redirect: string }).redirect.split('/').pop() ?? '';
}

async function setOrder(values: Partial<typeof orders.$inferInsert>): Promise<void> {
  await testDb.db.update(orders).set(values);
}

describe('getOrderByToken: link lifetime', () => {
  it('an open order still resolves after its token expiry date', async () => {
    const token = await place();
    await setOrder({
      status: 'in_preparation',
      publicTokenExpiresAt: new Date(Date.now() - 10 * DAY),
    });
    const found = await getOrderByToken(token);
    expect(found?.order.status).toBe('in_preparation');
    expect(found?.lines).toHaveLength(1);
  });

  it.each(['shipped', 'ready_for_pickup'] as const)(
    'a %s order resolves after expiry',
    async (status) => {
      const token = await place();
      await setOrder({ status, publicTokenExpiresAt: new Date(Date.now() - DAY) });
      expect(await getOrderByToken(token)).not.toBeNull();
    },
  );

  it.each(['completed', 'cancelled'] as const)(
    'a %s order resolves while the expiry is in the future and not after it',
    async (status) => {
      const token = await place();
      await setOrder({ status, publicTokenExpiresAt: new Date(Date.now() + 5 * DAY) });
      expect(await getOrderByToken(token)).not.toBeNull();
      await setOrder({ publicTokenExpiresAt: new Date(Date.now() - 1000) });
      expect(await getOrderByToken(token)).toBeNull();
    },
  );

  it('a closed order is judged against the given "now"', async () => {
    const token = await place();
    const expires = new Date(Date.now() + 5 * DAY);
    await setOrder({ status: 'completed', publicTokenExpiresAt: expires });
    expect(await getOrderByToken(token, new Date(expires.getTime() - 1))).not.toBeNull();
    expect(await getOrderByToken(token, expires)).toBeNull();
  });

  it('an unknown token and a malformed token resolve to null', async () => {
    await place();
    expect(await getOrderByToken('A'.repeat(43))).toBeNull();
    expect(await getOrderByToken('short')).toBeNull();
    expect(await getOrderByToken('../etc/passwd')).toBeNull();
  });
});

describe('getOrderByToken: justPlaced', () => {
  it('is true within one hour of created_at and false after', async () => {
    const token = await place();
    const [order] = await testDb.db.select().from(orders);
    const created = order?.createdAt ?? new Date();
    expect(
      (await getOrderByToken(token, new Date(created.getTime() + 59 * 60 * 1000)))?.justPlaced,
    ).toBe(true);
    expect(
      (await getOrderByToken(token, new Date(created.getTime() + 61 * 60 * 1000)))?.justPlaced,
    ).toBe(false);
  });
});
