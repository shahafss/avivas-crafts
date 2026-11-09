// US2: online payment confirmation (tasks.md T066; contracts/payment-provider.md > Required
// tests). Written before T076-T080 exist: it fails until those modules do. API assumed of the
// implementation (adjust the tests, not the contract, where it differs):
//   confirmOnlinePayment(status, pageId, opts?: { database?: DbLike })
//       from '@/server/orders/confirm-online-payment' -> outcome string
//         'confirmed' | 'duplicate' | 'second_payment' | 'switched_offline' | 'mismatch' | 'failed'
//         | 'pending' | 'stale' | 'orphan_payment' | 'unknown'
//   retryOnlinePayment / switchToOfflinePayment(resumeToken, { acceptNewTotal? })
//       from '@/server/checkout/place-order' (same result shape as placeOrder)
//   POST(request, { params: Promise<{ provider }> }) from '@/app/api/payments/[provider]/callback/route'
//   GET(request) from '@/app/api/payments/status/route'
//   fiveMinuteTasks (JobTask: name, run(db, now)) from '@/server/jobs/daily-maintenance', with the
//       tasks `expire-pending-checkouts` and `payment-recovery-sweep`
//   getProvider(id?) from '@/server/payments' (mocked here with a controllable stub)
// The order photo is copied from the private 400 variant of the line's `sourceImageKey`
// (`<sourceImageKey>-400.webp`) to `orders/<orderId>/<lineId>-400.webp`.
import { createHash, createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { exists, makeActor, makeTestStorage, type TestStorage } from '../helpers/catalog';
import {
  createStubProvider,
  seedCatalog,
  type CheckoutFixture,
  type StubProvider,
} from '../helpers/checkout';
import {
  emailOutbox,
  optionValue,
  orderEvent,
  orderLine,
  orders,
  pendingCheckout,
  product,
  productImage,
  shippingZone,
  shippingZoneCountry,
  shopSettings,
} from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { POST as callbackRoute } from '@/app/api/payments/[provider]/callback/route';
import { GET as statusRoute } from '@/app/api/payments/status/route';
import { issueFormToken } from '@/server/checkout/form-token';
import * as placeOrderModule from '@/server/checkout/place-order';
import { fiveMinuteTasks } from '@/server/jobs/daily-maintenance';
import { confirmOnlinePayment } from '@/server/orders/confirm-online-payment';

const { placeOrder, retryOnlinePayment, switchToOfflinePayment } = placeOrderModule;

let testDb: TestDbHandle;
let files: TestStorage;
let fixture: CheckoutFixture;
let provider: StubProvider;

const holder = vi.hoisted((): { provider: unknown } => ({ provider: undefined }));
const HMAC_KEY = Buffer.from('payment-test-hmac-key-0123456789abcdef');

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
    SECRET_HMAC_KEY: HMAC_KEY.toString('base64'),
    TRUSTED_PROXY_HOPS: 1,
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
  provider = createStubProvider();
  holder.provider = provider;
});

const ctx = { ip: '203.0.113.7' };

function form(overrides: Record<string, unknown> = {}) {
  return {
    items: [{ productId: fixture.doll.id, optionValueIds: [fixture.doll.brown], quantity: 2 }],
    fullName: 'דנה כהן',
    phone: '052-234-5678',
    email: 'dana@example.com',
    deliveryMethod: 'shipping',
    address: { country: 'IL', city: 'חיפה', line1: 'הרצל 5' },
    paymentMethod: 'online',
    acceptTerms: true,
    marketingOptIn: true,
    note: 'להתקשר לפני',
    honeypot: '',
    formToken: issueFormToken(Date.now() - 5000),
    locale: 'he',
    ...overrides,
  };
}

/** Places an online order; returns the pending checkout's id and the provider page and token. */
async function startOnline(overrides: Record<string, unknown> = {}, ip = ctx.ip) {
  const result = await placeOrder(form(overrides), { ip });
  if (!(result as { ok: boolean }).ok)
    throw new Error(`placeOrder failed: ${JSON.stringify(result)}`);
  const pageId = provider.lastPageId();
  const [pending] = await testDb.db
    .select()
    .from(pendingCheckout)
    .where(eq(pendingCheckout.providerPageId, pageId));
  if (!pending) throw new Error('no pending checkout');
  return { pendingId: pending.id, pageId, token: provider.resumeToken(pageId) };
}

const pendingRow = async (id: string) =>
  (await testDb.db.select().from(pendingCheckout).where(eq(pendingCheckout.id, id)))[0];
const allOrders = () => testDb.db.select().from(orders);
const outbox = (kind?: string) =>
  testDb.db
    .select()
    .from(emailOutbox)
    .then((rows) => (kind === undefined ? rows : rows.filter((row) => row.kind === kind)));

async function expectNothingWritten(run: () => Promise<unknown>) {
  const snapshot = async () =>
    JSON.stringify([
      await allOrders(),
      await testDb.db.select().from(pendingCheckout),
      await outbox(),
    ]);
  const before = await snapshot();
  await run();
  expect(await snapshot()).toBe(before);
}

function orderTokenFor(resumeTokenHash: Buffer): string {
  return createHmac('sha256', HMAC_KEY)
    .update(`order:${resumeTokenHash.toString('hex')}`)
    .digest('base64url');
}

const statusUrl = (token: string) => `http://localhost/api/payments/status?c=${token}`;
const getStatus = (token: string, ip = '198.51.100.20') =>
  statusRoute(new Request(statusUrl(token), { headers: { 'x-forwarded-for': ip } }));

describe('confirmOnlinePayment: the happy path', () => {
  it('a valid callback creates one paid order and two outbox rows with the pending snapshots', async () => {
    const { pendingId, pageId, token } = await startOnline();
    const [pendingBefore] = await testDb.db.select().from(pendingCheckout);
    // Changed after the order was placed: the order keeps the price and prep time it was placed with.
    await testDb.db
      .update(product)
      .set({ prepTimeHe: 'חודש', priceIlsMinor: 99900 })
      .where(eq(product.id, fixture.doll.id));
    provider.pay(pageId);

    const response = await callbackRoute(provider.callbackRequest(pageId), {
      params: Promise.resolve({ provider: 'fake' }),
    });
    expect(response.status).toBe(200);

    const rows = await allOrders();
    expect(rows).toHaveLength(1);
    const order = rows[0];
    expect(order).toMatchObject({
      paymentState: 'paid',
      paymentMethod: 'online',
      status: 'new',
      orderNumber: 1001,
      provider: 'fake',
      providerTransactionId: `tx-${pageId}`,
      totalMinor: 23000,
      customerEmail: 'dana@example.com',
      marketingOptIn: true,
    });
    expect(order?.paidAt).toBeInstanceOf(Date);
    // Consent timestamps are those of the checkout, not of the confirmation.
    expect(order?.termsAcceptedAt.getTime()).toBe(pendingBefore?.termsAcceptedAt.getTime());
    expect(order?.marketingOptInAt?.getTime()).toBe(pendingBefore?.marketingOptInAt?.getTime());
    // The confirmation-page token derives from the stored resume-token hash.
    expect(
      order?.publicTokenHash.equals(
        createHash('sha256')
          .update(orderTokenFor(pendingBefore?.resumeTokenHash ?? Buffer.alloc(0)))
          .digest(),
      ),
    ).toBe(true);
    expect(token).not.toBe('');

    const [line] = await testDb.db.select().from(orderLine);
    expect(line).toMatchObject({ prepTimeHe: 'כשבועיים', unitPriceMinor: 10000, quantity: 2 });
    expect(line?.imageKey).toMatch(new RegExp(`^orders/${order?.id ?? ''}/`));
    expect(await exists(files.storage, 'private', line?.imageKey ?? '')).toBe(true);

    expect((await outbox()).map((row) => row.dedupeKey).sort()).toEqual(
      [`new-order:${order?.id ?? ''}`, `order-confirmation:${order?.id ?? ''}`].sort(),
    );
    expect((await testDb.db.select().from(orderEvent)).map((event) => event.kind)).toContain(
      'payment_confirmed',
    );

    // No second copy of personal data: the pending row keeps only its bookkeeping.
    const pending = await pendingRow(pendingId);
    expect(pending).toMatchObject({
      state: 'confirmed',
      orderId: order?.id,
      customerName: null,
      customerPhone: null,
      customerEmail: null,
      addressCity: null,
      addressLine1: null,
      note: null,
      lines: null,
    });
  });

  it('a photo deleted in the meantime gives image_key null without failing', async () => {
    const { pageId } = await startOnline();
    await testDb.db.delete(productImage).where(eq(productImage.productId, fixture.doll.id));
    provider.pay(pageId);
    const keyRow = (await testDb.db.select().from(pendingCheckout))[0];
    const sourceKey = (keyRow?.lines as { sourceImageKey: string }[])[0]?.sourceImageKey ?? '';
    for (const width of [400, 800, 1600]) {
      await files.storage
        .delete('private', `${sourceKey}-${String(width)}.webp`)
        .catch(() => undefined);
    }
    const outcome = await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId);
    expect(outcome).toBe('confirmed');
    const [line] = await testDb.db.select().from(orderLine);
    expect(line?.imageKey).toBeNull();
  });

  it('the same callback twice, one after the other, makes one order', async () => {
    const { pageId } = await startOnline();
    provider.pay(pageId);
    const call = () =>
      callbackRoute(provider.callbackRequest(pageId), {
        params: Promise.resolve({ provider: 'fake' }),
      });
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    expect(await allOrders()).toHaveLength(1);
    expect(await outbox()).toHaveLength(2);
  });

  it('a bad signature gets 401 and writes nothing', async () => {
    const { pageId } = await startOnline();
    provider.pay(pageId);
    await expectNothingWritten(async () => {
      const response = await callbackRoute(provider.callbackRequest(pageId, 'forged'), {
        params: Promise.resolve({ provider: 'fake' }),
      });
      expect(response.status).toBe(401);
    });
    expect(await allOrders()).toHaveLength(0);
  });

  it('a verified failed or pending status creates no order and no email', async () => {
    const { pageId } = await startOnline();
    expect(await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId)).toBe(
      'pending',
    );
    expect(await allOrders()).toHaveLength(0);
    provider.setStatus(pageId, { status: 'failed' });
    expect(await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId)).toBe(
      'failed',
    );
    expect(await allOrders()).toHaveLength(0);
    expect(await outbox()).toHaveLength(0);
  });
});

describe('confirmOnlinePayment: amount, currency and unknown references', () => {
  it('an amount or currency mismatch makes no order, marks the row and alerts the owner', async () => {
    const { pendingId, pageId } = await startOnline();
    provider.pay(pageId, { amountMinor: 100 });
    expect(await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId)).toBe(
      'mismatch',
    );
    expect(await allOrders()).toHaveLength(0);
    const pending = await pendingRow(pendingId);
    expect(pending?.state).toBe('mismatch');
    // Contact details stay for 30 days so the owner can reach the customer.
    expect(pending?.customerEmail).toBe('dana@example.com');
    const days = ((pending?.retainedUntil?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    const mails = await outbox('payment-mismatch');
    expect(mails).toHaveLength(1);
    expect((await outbox()).filter((row) => row.kind !== 'payment-mismatch')).toHaveLength(0);

    // A repeated notification changes nothing.
    await expectNothingWritten(async () => {
      expect(await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId)).toBe(
        'mismatch',
      );
    });
  });

  it('a wrong currency is a mismatch too', async () => {
    const { pageId } = await startOnline();
    provider.pay(pageId, { currency: 'USD' });
    expect(await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId)).toBe(
      'mismatch',
    );
    expect(await allOrders()).toHaveLength(0);
  });

  it('a mismatch row is deleted once retained_until has passed', async () => {
    const { pendingId, pageId } = await startOnline();
    provider.pay(pageId, { amountMinor: 100 });
    await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId);
    const task = fiveMinuteTasks.find((entry) => entry.name === 'expire-pending-checkouts');
    await task?.run(testDb.db, new Date(Date.now() + 29 * 86_400_000));
    expect(await pendingRow(pendingId)).toBeDefined();
    await task?.run(testDb.db, new Date(Date.now() + 31 * 86_400_000));
    expect(await pendingRow(pendingId)).toBeUndefined();
  });

  it('a verified paid status for an unknown reference answers 200, makes no order and alerts the owner', async () => {
    provider.pages.set('page-ghost', {
      input: { reference: '00000000-0000-4000-8000-00000000dead' } as never,
      disabled: false,
      status: {
        status: 'paid',
        reference: '00000000-0000-4000-8000-00000000dead',
        amountMinor: 5000,
        currency: 'ILS',
        transactionId: 'tx-ghost',
        method: 'card',
      },
    });
    const response = await callbackRoute(provider.callbackRequest('page-ghost'), {
      params: Promise.resolve({ provider: 'fake' }),
    });
    expect(response.status).toBe(200);
    expect(await allOrders()).toHaveLength(0);
    expect(await outbox('payment-attention')).toHaveLength(1);
  });

  it('a USD checkout confirmed in USD makes a USD order; reported in ILS it is a mismatch', async () => {
    const [zone] = await testDb.db
      .insert(shippingZone)
      .values({
        code: 'WORLD',
        nameHe: 'העולם',
        currency: 'USD',
        enabled: true,
        shippingEnabled: true,
        shippingFeeMinor: 2500,
      })
      .returning({ id: shippingZone.id });
    await testDb.db
      .insert(shippingZoneCountry)
      .values({ zoneId: zone?.id ?? '', countryCode: 'US' });
    await testDb.db.update(product).set({ priceUsdMinor: 3000 });
    const usd = {
      phone: '(650) 253-0000',
      address: { country: 'US', city: 'Austin', line1: '1 Main St' },
    };
    const first = await startOnline(usd);
    provider.pay(first.pageId);
    expect(
      await confirmOnlinePayment(await provider.fetchPaymentStatus(first.pageId), first.pageId),
    ).toBe('confirmed');
    const [order] = await allOrders();
    expect(order).toMatchObject({ currency: 'USD', totalMinor: 8500 });
    const [line] = await testDb.db.select().from(orderLine);
    expect(line).toMatchObject({ unitPriceMinor: 3000 });

    const second = await startOnline(usd, '203.0.113.99');
    provider.pay(second.pageId, { currency: 'ILS' });
    expect(
      await confirmOnlinePayment(await provider.fetchPaymentStatus(second.pageId), second.pageId),
    ).toBe('mismatch');
  });
});

describe('confirmOnlinePayment: repeats, second payments and switched checkouts', () => {
  it('a different transaction id on a confirmed checkout is a second payment: alert, no order', async () => {
    const { pageId } = await startOnline();
    provider.pay(pageId);
    await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId);
    provider.setStatus(pageId, { transactionId: 'tx-other' });
    expect(await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId)).toBe(
      'second_payment',
    );
    expect(await allOrders()).toHaveLength(1);
    expect(await outbox('payment-attention')).toHaveLength(1);
  });

  it('a paid callback repeated after the confirmed pending row was deleted is a duplicate, with no alert', async () => {
    const { pendingId, pageId } = await startOnline();
    provider.pay(pageId);
    await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId);
    await testDb.db.delete(pendingCheckout).where(eq(pendingCheckout.id, pendingId));
    expect(await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId)).toBe(
      'duplicate',
    );
    expect(await outbox('payment-attention')).toHaveLength(0);
    expect(await allOrders()).toHaveLength(1);
  });

  it('a paid status after switching to offline makes no order and alerts the owner about that order', async () => {
    const { pendingId, pageId, token } = await startOnline();
    const switched = await switchToOfflinePayment(token, {});
    expect(switched).toMatchObject({ ok: true });
    provider.pay(pageId);
    expect(await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId)).toBe(
      'switched_offline',
    );
    const [offline] = await allOrders();
    expect(await allOrders()).toHaveLength(1);
    expect(offline).toMatchObject({ paymentMethod: 'offline', paymentState: 'awaiting_payment' });
    const alerts = await outbox('payment-attention');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.orderId).toBe(offline?.id);
    expect(`${alerts[0]?.html ?? ''}${alerts[0]?.textBody ?? ''}`).toContain(
      String(offline?.orderNumber),
    );
    expect((await pendingRow(pendingId))?.state).toBe('switched_offline');
  });

  it('a late failed status for the old page after a retry leaves the row unchanged, a paid one is honoured', async () => {
    const { pendingId, pageId, token } = await startOnline();
    expect(await retryOnlinePayment(token, {})).toMatchObject({ ok: true });
    const newPage = provider.lastPageId();
    expect(newPage).not.toBe(pageId);
    expect(provider.disablePaymentPage).toHaveBeenCalledWith(pageId);

    provider.setStatus(pageId, { status: 'failed' });
    await expectNothingWritten(async () => {
      expect(await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId)).toBe(
        'stale',
      );
    });
    expect((await pendingRow(pendingId))?.providerPageId).toBe(newPage);

    // Money was taken on the old page: it still confirms the order.
    provider.pay(pageId);
    expect(await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId)).toBe(
      'confirmed',
    );
    expect(await allOrders()).toHaveLength(1);
  });
});

describe('a paid status without a transaction id on a live checkout', () => {
  it('is only pending through the callback route and through the recovery sweep', async () => {
    const { pendingId, pageId } = await startOnline();
    provider.setStatus(pageId, { status: 'paid', transactionId: null });
    await testDb.db
      .update(pendingCheckout)
      .set({ lastStatusCheckAt: new Date(Date.now() - 6 * 60_000) })
      .where(eq(pendingCheckout.id, pendingId));

    await expectNothingWritten(async () => {
      const response = await callbackRoute(provider.callbackRequest(pageId), {
        params: Promise.resolve({ provider: 'fake' }),
      });
      expect(response.status).toBe(200);
      expect(await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId)).toBe(
        'pending',
      );
    });
    const sweep = fiveMinuteTasks.find((entry) => entry.name === 'payment-recovery-sweep');
    await sweep?.run(testDb.db, new Date());
    expect(await allOrders()).toHaveLength(0);
    expect(await outbox()).toHaveLength(0);
    expect(await pendingRow(pendingId)).toMatchObject({ state: 'awaiting_provider' });

    // A real id arriving later still makes the one order (nothing was stored as "duplicate").
    provider.setStatus(pageId, { transactionId: 'tx-real' });
    expect(await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId)).toBe(
      'confirmed',
    );
    expect(await allOrders()).toHaveLength(1);
  });
});

describe('the status endpoint and the recovery sweep', () => {
  it('confirms from the browser return when the callback never arrived', async () => {
    const { pendingId, pageId, token } = await startOnline();
    const waiting = (await (await getStatus(token)).json()) as { state: string };
    expect(waiting.state).toBe('awaiting_provider');
    expect(await allOrders()).toHaveLength(0);

    provider.pay(pageId);
    await testDb.db
      .update(pendingCheckout)
      .set({ lastStatusCheckAt: new Date(Date.now() - 10_000) })
      .where(eq(pendingCheckout.id, pendingId));
    const response = await getStatus(token);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = (await response.json()) as { state: string; orderUrl?: string };
    expect(body.state).toBe('confirmed');
    const [pending] = await testDb.db.select().from(pendingCheckout);
    // orderUrl uses HMAC(key, 'order:' + hex(SHA-256(c))): what confirmOnlinePayment derives.
    const derived = orderTokenFor(createHash('sha256').update(token).digest());
    expect(body.orderUrl).toBe(`/he/order/${derived}`);
    expect(pending?.resumeTokenHash.equals(createHash('sha256').update(token).digest())).toBe(true);
    expect(await allOrders()).toHaveLength(1);
    // The personal data of the answer: none.
    expect(JSON.stringify(body)).not.toContain('dana');
  });

  it('queries the provider at most once per 5 seconds per checkout and rate limits per IP (60/min)', async () => {
    const { token } = await startOnline();
    await getStatus(token);
    await getStatus(token);
    await getStatus(token);
    expect(provider.fetchPaymentStatus).toHaveBeenCalledTimes(1);
    // The window is a fixed minute: freeze the clock early in one so 70 requests cannot straddle two.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:05Z'));
      let blocked = 0;
      for (let index = 0; index < 70; index += 1) {
        if ((await getStatus(token, '198.51.100.77')).status === 429) blocked += 1;
      }
      expect(blocked).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports mismatch, switched_offline and expired states without personal data', async () => {
    const mismatch = await startOnline();
    provider.pay(mismatch.pageId, { amountMinor: 1 });
    await testDb.db
      .update(pendingCheckout)
      .set({ lastStatusCheckAt: null })
      .where(eq(pendingCheckout.id, mismatch.pendingId));
    expect(((await (await getStatus(mismatch.token)).json()) as { state: string }).state).toBe(
      'mismatch',
    );
    const switched = await startOnline({}, '203.0.113.60');
    expect(await switchToOfflinePayment(switched.token, {})).toMatchObject({ ok: true });
    const switchedBody = (await (await getStatus(switched.token)).json()) as Record<
      string,
      unknown
    >;
    expect(switchedBody.state).toBe('switched_offline');
    expect(JSON.stringify(switchedBody)).not.toContain('dana');
    const unknown = await getStatus('Zm9v'.repeat(8));
    expect(((await unknown.json()) as { state: string }).state).toBe('expired');
  });

  it('the recovery sweep confirms an awaiting_provider checkout whose callback never arrived', async () => {
    const { pendingId, pageId } = await startOnline();
    provider.pay(pageId);
    await testDb.db
      .update(pendingCheckout)
      .set({ lastStatusCheckAt: new Date(Date.now() - 6 * 60_000) })
      .where(eq(pendingCheckout.id, pendingId));
    const sweep = fiveMinuteTasks.find((entry) => entry.name === 'payment-recovery-sweep');
    await sweep?.run(testDb.db, new Date());
    expect(await allOrders()).toHaveLength(1);
    expect((await pendingRow(pendingId))?.state).toBe('confirmed');
  });

  it('the sweep also confirms a failed checkout whose current page is later reported paid', async () => {
    const { pendingId, pageId } = await startOnline();
    provider.setStatus(pageId, { status: 'failed' });
    await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId);
    expect((await pendingRow(pendingId))?.state).toBe('failed');
    provider.pay(pageId);
    await testDb.db
      .update(pendingCheckout)
      .set({ lastStatusCheckAt: new Date(Date.now() - 6 * 60_000) })
      .where(eq(pendingCheckout.id, pendingId));
    const sweep = fiveMinuteTasks.find((entry) => entry.name === 'payment-recovery-sweep');
    await sweep?.run(testDb.db, new Date());
    expect(await allOrders()).toHaveLength(1);
  });

  it('retry, then paid on the new page: confirmed by the status endpoint, and (separately) by the sweep', async () => {
    const first = await startOnline();
    expect(await retryOnlinePayment(first.token, {})).toMatchObject({ ok: true });
    const newPage = provider.lastPageId();
    expect(provider.pages.get(first.pageId)?.disabled).toBe(true);
    provider.pay(newPage);
    expect(((await (await getStatus(first.token)).json()) as { state: string }).state).toBe(
      'confirmed',
    );

    await testDb.reset();
    await runSeed(testDb.db, { samples: false });
    fixture = await seedCatalog(await makeActor(testDb.db));
    provider = createStubProvider();
    holder.provider = provider;
    const second = await startOnline();
    expect(await retryOnlinePayment(second.token, {})).toMatchObject({ ok: true });
    provider.pay(provider.lastPageId());
    await testDb.db
      .update(pendingCheckout)
      .set({ lastStatusCheckAt: null })
      .where(eq(pendingCheckout.id, second.pendingId));
    const sweep = fiveMinuteTasks.find((entry) => entry.name === 'payment-recovery-sweep');
    await sweep?.run(testDb.db, new Date());
    expect(await allOrders()).toHaveLength(1);
  });
});

describe('expiry of pending checkouts', () => {
  const expire = () => fiveMinuteTasks.find((entry) => entry.name === 'expire-pending-checkouts');
  const later = (hours: number) => new Date(Date.now() + hours * 3_600_000);

  it('deletes an abandoned checkout after 48 hours with no order or notification', async () => {
    const { pendingId, pageId } = await startOnline();
    await expire()?.run(testDb.db, later(47));
    expect(await pendingRow(pendingId)).toBeDefined();
    await expire()?.run(testDb.db, later(49));
    expect(await pendingRow(pendingId)).toBeUndefined();
    expect(await allOrders()).toHaveLength(0);
    expect(await outbox()).toHaveLength(0);
    expect(provider.disablePaymentPage).toHaveBeenCalledWith(pageId);
  });

  it('asks the provider first: a paid result confirms the order instead of losing it', async () => {
    const { pageId } = await startOnline();
    provider.pay(pageId);
    await expire()?.run(testDb.db, later(49));
    expect(await allOrders()).toHaveLength(1);
    // The confirmed row goes at the next run, like any confirmed row.
    await expire()?.run(testDb.db, later(50));
    expect(await testDb.db.select().from(pendingCheckout)).toHaveLength(0);
  });

  it('keeps the row when the status query fails, and after 24 more hours alerts the owner and deletes it', async () => {
    const { pendingId } = await startOnline();
    provider.state.failStatus = true;
    await expire()?.run(testDb.db, later(49));
    expect(await pendingRow(pendingId)).toBeDefined();
    await expire()?.run(testDb.db, later(48 + 25));
    expect(await pendingRow(pendingId)).toBeUndefined();
    expect(await outbox('payment-attention')).toHaveLength(1);
    expect(await allOrders()).toHaveLength(0);
  });

  it('treats a paid status without a transaction id as unverified: kept, then alerted and deleted after 24 hours', async () => {
    const { pendingId, pageId } = await startOnline();
    provider.setStatus(pageId, { status: 'paid', transactionId: null });
    await expire()?.run(testDb.db, later(49));
    expect(await pendingRow(pendingId)).toBeDefined();
    expect(await allOrders()).toHaveLength(0);
    await expire()?.run(testDb.db, later(48 + 25));
    expect(await pendingRow(pendingId)).toBeUndefined();
    expect(await outbox('payment-attention')).toHaveLength(1);
    expect(await allOrders()).toHaveLength(0);
  });

  it('deletes a confirmed row 48 hours after it was created', async () => {
    const { pendingId, pageId } = await startOnline();
    provider.pay(pageId);
    await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId);
    await expire()?.run(testDb.db, later(47));
    expect(await pendingRow(pendingId)).toBeDefined();
    await expire()?.run(testDb.db, later(49));
    expect(await pendingRow(pendingId)).toBeUndefined();
  });
});

describe('retry and switch to offline payment', () => {
  it('retry after a price change without acceptNewTotal returns total_changed and changes nothing', async () => {
    const { pendingId, token } = await startOnline();
    await testDb.db
      .update(product)
      .set({ priceIlsMinor: 11000 })
      .where(eq(product.id, fixture.doll.id));
    const pagesBefore = provider.createPaymentPage.mock.calls.length;
    await expectNothingWritten(async () => {
      const result = (await retryOnlinePayment(token, {})) as {
        ok: boolean;
        formError?: string;
        data?: { newTotalMinor: number; currency: string };
      };
      expect(result).toMatchObject({
        ok: false,
        formError: 'checkout.total_changed',
        data: { newTotalMinor: 25000, currency: 'ILS' },
      });
    });
    expect(provider.createPaymentPage.mock.calls.length).toBe(pagesBefore);
    expect(provider.disablePaymentPage).not.toHaveBeenCalled();

    // With acceptNewTotal the lines and totals change and the new page is for the new amount.
    expect(await retryOnlinePayment(token, { acceptNewTotal: true })).toMatchObject({ ok: true });
    const pending = await pendingRow(pendingId);
    expect(pending).toMatchObject({
      totalMinor: 25000,
      subtotalMinor: 22000,
      state: 'awaiting_provider',
    });
    expect((pending?.lines as { unit_price_minor: number }[])[0]?.unit_price_minor).toBe(11000);
    expect(provider.createPaymentPage.mock.calls.at(-1)?.[0]).toMatchObject({ amountMinor: 25000 });
    expect(pending?.lastStatusCheckAt).toBeNull();
    expect(pending?.providerPageId).toBe(provider.lastPageId());
  });

  it('switch to offline refuses while offline payment is disabled and leaves the row unchanged', async () => {
    const { token } = await startOnline();
    await testDb.db.update(shopSettings).set({ offlinePaymentEnabled: false });
    await expectNothingWritten(async () => {
      expect(await switchToOfflinePayment(token, {})).toMatchObject({
        ok: false,
        formError: 'checkout.offline_unavailable',
      });
    });
  });

  it('a successful switch creates the offline order, stores its id and copies consent and snapshots', async () => {
    const { pendingId, token } = await startOnline();
    const [before] = await testDb.db.select().from(pendingCheckout);
    const result = (await switchToOfflinePayment(token, {})) as { ok: boolean; redirect: string };
    expect(result.ok).toBe(true);
    expect(result.redirect).toMatch(/^\/he\/order\/[A-Za-z0-9_-]{43}$/);

    const [order] = await allOrders();
    expect(order).toMatchObject({
      paymentMethod: 'offline',
      paymentState: 'awaiting_payment',
      status: 'new',
      totalMinor: 23000,
      customerEmail: 'dana@example.com',
      marketingOptIn: true,
    });
    expect(order?.termsAcceptedAt.getTime()).toBe(before?.termsAcceptedAt.getTime());
    expect(order?.marketingOptInAt?.getTime()).toBe(before?.marketingOptInAt?.getTime());
    expect(order?.termsVersion).toBe(before?.termsVersion);
    expect(order?.privacyVersion).toBe(before?.privacyVersion);
    // The returned token opens the new offline order.
    const switchToken = result.redirect.split('/').at(-1) ?? '';
    expect(order?.publicTokenHash.equals(createHash('sha256').update(switchToken).digest())).toBe(
      true,
    );
    const [line] = await testDb.db.select().from(orderLine);
    expect(line).toMatchObject({ prepTimeHe: 'כשבועיים', quantity: 2 });
    expect(line?.imageKey).toMatch(new RegExp(`^orders/${order?.id ?? ''}/`));

    const pending = await pendingRow(pendingId);
    expect(pending).toMatchObject({
      state: 'switched_offline',
      orderId: order?.id,
      customerName: null,
      customerEmail: null,
      lines: null,
    });
    expect((await testDb.db.select().from(orderEvent)).map((event) => event.kind)).toEqual([
      'created',
    ]);
    expect((await outbox()).map((row) => row.kind).sort()).toEqual([
      'new-order',
      'order-confirmation',
    ]);
    expect(provider.disablePaymentPage).toHaveBeenCalledTimes(1);
  });

  it.each(['confirmed', 'switched_offline', 'mismatch'] as const)(
    'retry or switch on a %s checkout is refused and changes nothing',
    async (state) => {
      const { pendingId, pageId, token } = await startOnline();
      if (state === 'confirmed') {
        provider.pay(pageId);
        await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId);
      } else if (state === 'switched_offline') {
        await switchToOfflinePayment(token, {});
      } else {
        provider.pay(pageId, { amountMinor: 1 });
        await confirmOnlinePayment(await provider.fetchPaymentStatus(pageId), pageId);
      }
      expect((await pendingRow(pendingId))?.state).toBe(state);
      const pages = provider.createPaymentPage.mock.calls.length;
      await expectNothingWritten(async () => {
        for (const action of [retryOnlinePayment, switchToOfflinePayment]) {
          expect(await action(token, { acceptNewTotal: true })).toMatchObject({
            ok: false,
            formError: 'checkout.already_completed',
          });
        }
      });
      expect(provider.createPaymentPage.mock.calls.length).toBe(pages);
    },
  );

  it('completes retry and switch even when disablePaymentPage throws, and later payments follow the normal outcomes', async () => {
    provider.state.failDisable = true;
    const retried = await startOnline();
    expect(await retryOnlinePayment(retried.token, {})).toMatchObject({ ok: true });
    provider.pay(retried.pageId);
    expect(
      await confirmOnlinePayment(await provider.fetchPaymentStatus(retried.pageId), retried.pageId),
    ).toBe('confirmed');

    const switched = await startOnline({}, '203.0.113.50');
    const result = await switchToOfflinePayment(switched.token, {});
    expect(result).toMatchObject({ ok: true });
    provider.pay(switched.pageId);
    expect(
      await confirmOnlinePayment(
        await provider.fetchPaymentStatus(switched.pageId),
        switched.pageId,
      ),
    ).toBe('switched_offline');
    expect(await outbox('payment-attention')).toHaveLength(1);
  });

  it('refuses a retry when a line can no longer be ordered', async () => {
    const { token } = await startOnline();
    await testDb.db.delete(optionValue).where(eq(optionValue.id, fixture.doll.brown));
    await expectNothingWritten(async () => {
      expect(await retryOnlinePayment(token, {})).toMatchObject({
        ok: false,
        formError: 'checkout.lines_unavailable',
      });
    });
  });
});

describe('guard rails of the fixture itself', () => {
  it('has no order before anything is paid', async () => {
    await startOnline();
    expect(await allOrders()).toHaveLength(0);
    expect(await testDb.db.select().from(orderLine)).toHaveLength(0);
  });
});
