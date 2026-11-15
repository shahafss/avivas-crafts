// US2 (006): PAYMENT_PROVIDER=none. Every surface that offers, accepts or contacts a card provider
// must behave as contracts/payment-mode.md says. The environment is mutable so that a pending
// card checkout can first be created under `fake` and then be seen under `none` (the owner's
// stored row outliving a provider switch).
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { makeActor, makeTestStorage, type TestStorage } from '../helpers/catalog';
import {
  createStubProvider,
  seedCatalog,
  type CheckoutFixture,
  type StubProvider,
} from '../helpers/checkout';
import { emailOutbox, orders, pendingCheckout, shopSettings } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { POST as callbackRoute } from '@/app/api/payments/[provider]/callback/route';
import { GET as statusRoute } from '@/app/api/payments/status/route';
import { issueFormToken } from '@/server/checkout/form-token';
import {
  placeOrder,
  retryOnlinePayment,
  switchToOfflinePayment,
} from '@/server/checkout/place-order';
import { fiveMinuteTasks } from '@/server/jobs/daily-maintenance';
import { getProvider } from '@/server/payments';
import { getSettings, settingsNeedingAttention, updateSettings } from '@/server/settings/settings';
import type { Actor } from '@/server/catalog/result';

let testDb: TestDbHandle;
let files: TestStorage;
let fixture: CheckoutFixture;
let provider: StubProvider;
let actor: Actor;

const env = vi.hoisted(() => ({ PAYMENT_PROVIDER: 'none' }));
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
    SECRET_HMAC_KEY: Buffer.from('no-card-test-hmac-key-0123456789abcdef').toString('base64'),
    TRUSTED_PROXY_HOPS: 1,
    PAYMENT_PROVIDER: env.PAYMENT_PROVIDER,
    EMAIL_DRIVER: 'outbox',
    EMAIL_FROM: 'shop@example.test',
  }),
}));
// The real getProvider (so 'none' really throws), wrapped to see whether it is called. A stub
// provider is returned only while a test creates a card checkout under `fake`.
vi.mock('@/server/payments', async (orig) => {
  const real = await orig<typeof import('@/server/payments')>();
  return {
    ...real,
    getProvider: vi.fn((id?: string) =>
      holder.provider !== undefined && env.PAYMENT_PROVIDER === 'fake'
        ? holder.provider
        : real.getProvider(id),
    ),
  };
});
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
  actor = await makeActor(testDb.db);
  fixture = await seedCatalog(actor);
  provider = createStubProvider();
  holder.provider = provider;
  env.PAYMENT_PROVIDER = 'none';
  vi.mocked(getProvider).mockClear();
});

const ctx = { ip: '203.0.113.7' };

function form(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

const allOrders = () => testDb.db.select().from(orders);
const allPending = () => testDb.db.select().from(pendingCheckout);
const setSettings = (patch: Partial<typeof shopSettings.$inferInsert>) =>
  testDb.db.update(shopSettings).set(patch).where(eq(shopSettings.id, 1));

/** A card checkout made under `fake`, whose row then names `payplus` while the env says `none`. */
async function strandedCardCheckout(): Promise<{ id: string; token: string }> {
  env.PAYMENT_PROVIDER = 'fake';
  const result = await placeOrder(form({ paymentMethod: 'online' }), ctx);
  expect(result).toMatchObject({ ok: true });
  const pageId = provider.lastPageId();
  const token = provider.resumeToken(pageId);
  const [row] = await allPending();
  if (!row) throw new Error('no pending checkout');
  await testDb.db
    .update(pendingCheckout)
    .set({ provider: 'payplus' })
    .where(eq(pendingCheckout.id, row.id));
  env.PAYMENT_PROVIDER = 'none';
  vi.mocked(getProvider).mockClear();
  provider.createPaymentPage.mockClear();
  provider.disablePaymentPage.mockClear();
  provider.fetchPaymentStatus.mockClear();
  return { id: row.id, token };
}

describe('placeOrder under none', () => {
  it('refuses a card order and creates nothing', async () => {
    await setSettings({ onlinePaymentEnabled: true, offlinePaymentEnabled: true });
    expect(await placeOrder(form({ paymentMethod: 'online' }), ctx)).toMatchObject({
      ok: false,
      formError: 'checkout.payment_unavailable_method',
    });
    expect(await allOrders()).toHaveLength(0);
    expect(await allPending()).toHaveLength(0);
    expect(provider.createPaymentPage).not.toHaveBeenCalled();
  });

  it('creates an offline order as in 002', async () => {
    expect(await placeOrder(form(), ctx)).toMatchObject({ ok: true });
    const [order] = await allOrders();
    expect(order).toMatchObject({ paymentMethod: 'offline', status: 'new' });
  });

  it('treats offline as on even when the stored flag is off', async () => {
    await setSettings({ onlinePaymentEnabled: true, offlinePaymentEnabled: false });
    expect(await placeOrder(form(), ctx)).toMatchObject({ ok: true });
    expect(await allOrders()).toHaveLength(1);
  });
});

describe('pending card checkouts under none', () => {
  it('retrying card payment is refused and calls no provider', async () => {
    const { token } = await strandedCardCheckout();
    expect(await retryOnlinePayment(token)).toMatchObject({
      ok: false,
      formError: 'checkout.payment_unavailable_method',
    });
    expect(getProvider).not.toHaveBeenCalled();
    expect(provider.createPaymentPage).not.toHaveBeenCalled();
  });

  it('switching a payplus checkout to offline creates the offline order and calls no provider', async () => {
    const { token } = await strandedCardCheckout();
    expect(await switchToOfflinePayment(token)).toMatchObject({ ok: true });
    expect(await allOrders()).toHaveLength(1);
    expect(getProvider).not.toHaveBeenCalled();
    expect(provider.disablePaymentPage).not.toHaveBeenCalled();
  });

  it('GET /api/payments/status answers pending, calls no provider and confirms nothing (FR-008)', async () => {
    const { token } = await strandedCardCheckout();
    const response = await statusRoute(
      new Request(`http://localhost/api/payments/status?c=${token}`, {
        headers: { 'x-forwarded-for': '198.51.100.20' },
      }),
    );
    expect(await response.json()).toEqual({ state: 'awaiting_provider' });
    expect(getProvider).not.toHaveBeenCalled();
    expect(provider.fetchPaymentStatus).not.toHaveBeenCalled();
    expect(await allOrders()).toHaveLength(0);
  });

  it('the expiry task creates no provider, keeps the row within the 24 h grace, then alerts and deletes it', async () => {
    const { id } = await strandedCardCheckout();
    const [row] = await allPending();
    const expires = row?.expiresAt.getTime() ?? 0;
    const task = fiveMinuteTasks.find((entry) => entry.name === 'expire-pending-checkouts');

    await task?.run(testDb.db, new Date(expires + 60_000));
    expect(getProvider).not.toHaveBeenCalled();
    expect((await allPending()).map((r) => r.id)).toEqual([id]);

    await task?.run(testDb.db, new Date(expires + 25 * 3_600_000));
    expect(getProvider).not.toHaveBeenCalled();
    expect(provider.disablePaymentPage).not.toHaveBeenCalled();
    expect(await allPending()).toHaveLength(0);
    const kinds = (await testDb.db.select().from(emailOutbox)).map((r) => r.kind);
    expect(kinds).toContain('payment-attention');
  });

  it('the sweep task leaves an unexpired row untouched and creates no provider', async () => {
    await strandedCardCheckout();
    const before = (await allPending())[0];
    const task = fiveMinuteTasks.find((entry) => entry.name === 'payment-recovery-sweep');
    await task?.run(testDb.db, new Date(Date.now() + 10 * 60_000));
    expect(getProvider).not.toHaveBeenCalled();
    expect((await allPending())[0]).toEqual(before);
  });
});

describe('callback and provider lookup under none', () => {
  it.each(['payplus', 'fake'])('POST /api/payments/%s/callback answers 404', async (id) => {
    const request = new Request(`http://localhost/api/payments/${id}/callback`, {
      method: 'POST',
      body: '{}',
      headers: { 'x-forwarded-for': '198.51.100.30' },
    });
    const response = await callbackRoute(request, { params: Promise.resolve({ provider: id }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
    expect(await allPending()).toHaveLength(0);
    expect(await allOrders()).toHaveLength(0);
  });

  it('getProvider() and getProvider("none") throw', async () => {
    const real = await vi.importActual<typeof import('@/server/payments')>('@/server/payments');
    expect(() => real.getProvider()).toThrow();
    expect(() => real.getProvider('none')).toThrow();
  });
});

describe('settings under none', () => {
  it('refuses online on', async () => {
    expect(await updateSettings(actor, { onlinePaymentEnabled: true })).toMatchObject({
      ok: false,
      formError: 'admin.settings.errors.card_not_set_up',
    });
  });

  it('refuses offline off', async () => {
    expect(await updateSettings(actor, { offlinePaymentEnabled: false })).toMatchObject({
      ok: false,
      formError: 'admin.settings.errors.card_not_set_up',
    });
  });

  it('saves offline instructions alone', async () => {
    expect(
      await updateSettings(actor, { offlineInstructionsHe: 'העברה בנקאית לחשבון 123' }),
    ).toMatchObject({ ok: true });
    expect((await getSettings()).offlineInstructionsHe).toBe('העברה בנקאית לחשבון 123');
  });

  it('saves business details when the stored values are online on / offline off', async () => {
    await setSettings({ onlinePaymentEnabled: true, offlinePaymentEnabled: false });
    expect(await updateSettings(actor, { shopNameHe: 'חנות חדשה' })).toMatchObject({ ok: true });
    expect((await getSettings()).shopNameHe).toBe('חנות חדשה');
  });

  it('lists offlineInstructionsHe while empty and offline is effectively on, not once filled', async () => {
    await setSettings({ offlineInstructionsHe: null });
    expect(await settingsNeedingAttention()).toContain('offlineInstructionsHe');
    await setSettings({ offlineInstructionsHe: 'העברה בנקאית' });
    expect(await settingsNeedingAttention()).not.toContain('offlineInstructionsHe');
  });
});
