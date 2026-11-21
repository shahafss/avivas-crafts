// US2: placing an order (tasks.md T065, and the email content checks of T081).
//
// API of the implementation (T078):
//   placeOrder(input, ctx: { ip: string; now?: Date }) from '@/server/checkout/place-order'
//     -> { ok: true, redirect: string }
//      | { ok: false, formError?: MessageKey, fieldErrors?: Record<string, MessageKey> }
//   getProvider(id?) from '@/server/payments' (mocked here with a controllable stub)
// `input` is the placeOrder input of contracts/server-actions.md.
import { createHash } from 'node:crypto';
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
  shippingZone,
  shippingZoneCountry,
  shopSettings,
} from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { formatMoney } from '@/lib/money';
import { issueFormToken } from '@/server/checkout/form-token';
import { renderPaymentAttention } from '@/server/email/templates/payment-attention';
import { renderPaymentMismatch } from '@/server/email/templates/payment-mismatch';
import { placeOrder } from '@/server/checkout/place-order';

let testDb: TestDbHandle;
let files: TestStorage;
let fixture: CheckoutFixture;
let provider: StubProvider;

const env = vi.hoisted(() => ({ APP_ENV: 'test' }));
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
    APP_ENV: env.APP_ENV,
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
  provider = createStubProvider();
  holder.provider = provider;
  env.APP_ENV = 'test';
});

const IP = '203.0.113.7';
const ctx = { ip: IP };

function form(overrides: Record<string, unknown> = {}) {
  return {
    items: [{ productId: fixture.doll.id, optionValueIds: [fixture.doll.brown], quantity: 2 }],
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

async function counts() {
  return {
    orders: (await testDb.db.select().from(orders)).length,
    pending: (await testDb.db.select().from(pendingCheckout)).length,
    outbox: (await testDb.db.select().from(emailOutbox)).length,
  };
}

async function expectRejected(input: unknown, formError?: string) {
  const result = (await placeOrder(input, ctx)) as {
    ok: boolean;
    formError?: string;
  };
  expect(result.ok).toBe(false);
  if (formError !== undefined) expect(result.formError).toBe(formError);
  expect(await counts()).toEqual({ orders: 0, pending: 0, outbox: 0 });
  expect(provider.createPaymentPage).not.toHaveBeenCalled();
}

describe('placeOrder: offline payment', () => {
  it('creates a new order awaiting payment with numbered, snapshotted lines', async () => {
    const result = await placeOrder(form(), ctx);
    expect(result).toMatchObject({ ok: true });
    const redirect = (result as { redirect: string }).redirect;
    expect(redirect).toMatch(/^\/he\/order\/[A-Za-z0-9_-]{43}$/);

    const [order] = await testDb.db.select().from(orders);
    expect(order).toMatchObject({
      orderNumber: 1001,
      status: 'new',
      paymentState: 'awaiting_payment',
      paymentMethod: 'offline',
      currency: 'ILS',
      subtotalMinor: 20000,
      deliveryFeeMinor: 3000,
      totalMinor: 23000,
      customerPhone: '+972522345678',
      customerEmail: 'dana@example.com',
      addressCountry: 'IL',
      locale: 'he',
      marketingOptIn: false,
      marketingOptInAt: null,
    });
    expect(order?.termsAcceptedAt).toBeInstanceOf(Date);
    expect(order?.termsVersion).toBeGreaterThanOrEqual(1);
    expect(order?.privacyVersion).toBeGreaterThanOrEqual(1);
    // The link token is random; only its hash is stored.
    const token = redirect.split('/').at(-1) ?? '';
    expect(order?.publicTokenHash.equals(createHash('sha256').update(token).digest())).toBe(true);

    const [line] = await testDb.db.select().from(orderLine);
    expect(line).toMatchObject({
      productNameHe: 'בובה סרוגה',
      productNameEn: 'Crocheted doll',
      unitPriceMinor: 10000,
      quantity: 2,
      lineTotalMinor: 20000,
      prepTimeHe: 'כשבועיים',
      prepTimeEn: 'about two weeks',
      options: [
        { group_he: 'צבע שיער', group_en: 'Hair colour', value_he: 'חום', value_en: 'Brown' },
      ],
    });
    expect(line?.imageKey).toMatch(new RegExp(`^orders/${order?.id ?? ''}/`));
    expect(await exists(files.storage, 'private', line?.imageKey ?? '')).toBe(true);

    expect((await testDb.db.select().from(orderEvent)).map((event) => event.kind)).toEqual([
      'created',
    ]);
    const outbox = await testDb.db.select().from(emailOutbox);
    expect(outbox.map((row) => row.dedupeKey).sort()).toEqual(
      [`new-order:${order?.id ?? ''}`, `order-confirmation:${order?.id ?? ''}`].sort(),
    );
    expect(provider.createPaymentPage).not.toHaveBeenCalled();
  });

  it('numbers orders 1001, then 1002, and records marketing consent only when ticked', async () => {
    await placeOrder(form(), ctx);
    await placeOrder(form({ marketingOptIn: true }), ctx);
    const rows = await testDb.db.select().from(orders).orderBy(orders.orderNumber);
    expect(rows.map((row) => row.orderNumber)).toEqual([1001, 1002]);
    expect(rows[0]?.marketingOptInAt).toBeNull();
    expect(rows[1]).toMatchObject({ marketingOptIn: true });
    expect(rows[1]?.marketingOptInAt).toBeInstanceOf(Date);
  });

  it('charges no delivery fee for pickup', async () => {
    const result = await placeOrder(form({ deliveryMethod: 'pickup', address: undefined }), ctx);
    expect(result).toMatchObject({ ok: true });
    const [order] = await testDb.db.select().from(orders);
    expect(order).toMatchObject({
      deliveryMethod: 'pickup',
      deliveryFeeMinor: 0,
      totalMinor: 20000,
    });
    expect(order?.addressCity).toBeNull();
  });

  it('does not charge delivery from the free-shipping threshold up', async () => {
    await placeOrder(
      form({
        items: [{ productId: fixture.doll.id, optionValueIds: [fixture.doll.blond], quantity: 3 }],
      }),
      ctx,
    );
    const [order] = await testDb.db.select().from(orders);
    expect(order).toMatchObject({ subtotalMinor: 36000, deliveryFeeMinor: 0, totalMinor: 36000 });
  });

  it('in production an order succeeds with every seed placeholder in place, and once the details are filled in', async () => {
    env.APP_ENV = 'production';
    expect(await placeOrder(form() as never, ctx)).toMatchObject({ ok: true });
    await testDb.db.update(shopSettings).set({
      businessNameHe: 'אביבה בע״מ',
      businessNameEn: 'Aviva Ltd',
      businessRegNumber: '515151515',
      businessEmail: 'hello@aviva.example',
      businessPhone: '+972521234567',
      businessAddressHe: 'הרצל 1, חיפה',
      businessAddressEn: '1 Herzl St, Haifa',
      notificationEmails: ['aviva@aviva.example'],
    });
    expect(await placeOrder(form() as never, ctx)).toMatchObject({ ok: true });
  });
});

describe('placeOrder: online payment', () => {
  it('creates a pending checkout with frozen totals and no order or email', async () => {
    const before = Date.now();
    const result = await placeOrder(form({ paymentMethod: 'online', marketingOptIn: true }), ctx);
    expect(result).toEqual({ ok: true, redirect: 'https://pay.test/page-1' });
    expect(await counts()).toEqual({ orders: 0, pending: 1, outbox: 0 });

    const [pending] = await testDb.db.select().from(pendingCheckout);
    expect(pending).toMatchObject({
      state: 'awaiting_provider',
      currency: 'ILS',
      subtotalMinor: 20000,
      deliveryFeeMinor: 3000,
      totalMinor: 23000,
      providerPageId: 'page-1',
      marketingOptIn: true,
      locale: 'he',
      customerName: 'דנה כהן',
    });
    expect(pending?.termsAcceptedAt).toBeInstanceOf(Date);
    expect(pending?.marketingOptInAt).toBeInstanceOf(Date);
    expect(pending?.termsVersion).toBeGreaterThanOrEqual(1);
    expect(pending?.privacyVersion).toBeGreaterThanOrEqual(1);
    const hours = ((pending?.expiresAt.getTime() ?? 0) - before) / 3_600_000;
    expect(hours).toBeGreaterThan(47.9);
    expect(hours).toBeLessThan(48.1);

    // The priced lines are frozen with the preparation time and the photo to copy later.
    const lines = pending?.lines as Record<string, unknown>[];
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      prep_time_he: 'כשבועיים',
      prep_time_en: 'about two weeks',
      quantity: 2,
      unit_price_minor: 10000,
    });
    expect(typeof lines[0]?.sourceImageKey).toBe('string');

    // The provider got the pending row's id, the frozen total and return URLs with the token.
    expect(provider.createPaymentPage).toHaveBeenCalledTimes(1);
    const page = provider.createPaymentPage.mock.calls[0]?.[0];
    expect(page).toMatchObject({
      reference: pending?.id,
      amountMinor: 23000,
      currency: 'ILS',
      locale: 'he',
    });
    const token = provider.resumeToken('page-1');
    expect(token).not.toBe('');
    expect(page?.failureUrl).toContain(`c=${token}`);
    expect(page?.successUrl).toContain('r=success');
    expect(page?.failureUrl).toContain('r=failure');
    expect(pending?.resumeTokenHash.equals(createHash('sha256').update(token).digest())).toBe(true);
  });

  it('records no marketing consent for an online checkout without the tick', async () => {
    await placeOrder(form({ paymentMethod: 'online', marketingOptIn: false }), ctx);
    const [pending] = await testDb.db.select().from(pendingCheckout);
    expect(pending).toMatchObject({ marketingOptIn: false, marketingOptInAt: null });
    expect(pending?.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it('deletes the pending row and says so when the provider cannot create a page', async () => {
    provider.state.failCreate = true;
    const result = (await placeOrder(form({ paymentMethod: 'online' }), ctx)) as {
      ok: boolean;
      formError?: string;
    };
    expect(result.ok).toBe(false);
    expect(result.formError).toBeDefined();
    expect(await counts()).toEqual({ orders: 0, pending: 0, outbox: 0 });
  });

  it('stores a USD checkout and calls the provider with USD for an enabled USD zone (FR-015)', async () => {
    const [zone] = await testDb.db
      .insert(shippingZone)
      .values({
        code: 'WORLD',
        nameHe: 'העולם',
        currency: 'USD',
        enabled: true,
        shippingEnabled: true,
        pickupEnabled: false,
        shippingFeeMinor: 2500,
        freeShippingThresholdMinor: null,
      })
      .returning({ id: shippingZone.id });
    await testDb.db
      .insert(shippingZoneCountry)
      .values({ zoneId: zone?.id ?? '', countryCode: 'US' });
    await testDb.db.update(product).set({ priceUsdMinor: 3000 });
    await testDb.db
      .update(optionValue)
      .set({ deltaUsdMinor: 600 })
      .where(eq(optionValue.id, fixture.doll.blond));

    const result = await placeOrder(
      form({
        paymentMethod: 'online',
        phone: '(650) 253-0000',
        address: { country: 'US', city: 'Austin', line1: '1 Main St', postalCode: '78701' },
        items: [{ productId: fixture.doll.id, optionValueIds: [fixture.doll.blond], quantity: 2 }],
      }),
      ctx,
    );
    expect(result).toMatchObject({ ok: true });
    const [pending] = await testDb.db.select().from(pendingCheckout);
    expect(pending).toMatchObject({
      currency: 'USD',
      subtotalMinor: 7200,
      deliveryFeeMinor: 2500,
      totalMinor: 9700,
    });
    expect(provider.createPaymentPage.mock.calls[0]?.[0]).toMatchObject({
      amountMinor: 9700,
      currency: 'USD',
    });
  });
});

describe('placeOrder: rejected input leaves no rows', () => {
  it('a filled honeypot', async () => {
    await expectRejected(form({ honeypot: 'http://spam.example' }));
  });

  it('a form token younger than 3 seconds or older than 2 hours', async () => {
    await expectRejected(form({ formToken: issueFormToken(Date.now()) }));
    await expectRejected(form({ formToken: issueFormToken(Date.now() - 3 * 3600_000) }));
    await expectRejected(form({ formToken: 'not-a-token' }));
  });

  it('the 11th submission in 10 minutes from one IP', async () => {
    for (let index = 0; index < 10; index += 1) {
      await placeOrder(form({ honeypot: 'x' }), ctx);
    }
    await expectRejected(form());
    // Another IP is not affected.
    expect(await placeOrder(form() as never, { ip: '198.51.100.9' })).toMatchObject({ ok: true });
  });

  it('a disabled payment method or delivery method', async () => {
    await testDb.db.update(shopSettings).set({ onlinePaymentEnabled: false });
    await expectRejected(form({ paymentMethod: 'online' }));
    await testDb.db
      .update(shopSettings)
      .set({ onlinePaymentEnabled: true, offlinePaymentEnabled: false });
    await expectRejected(form({ paymentMethod: 'offline' }));
    await testDb.db.update(shopSettings).set({ offlinePaymentEnabled: true });
    await testDb.db.update(shippingZone).set({ shippingEnabled: false });
    await expectRejected(form());
    await testDb.db.update(shippingZone).set({ shippingEnabled: true, pickupEnabled: false });
    await expectRejected(form({ deliveryMethod: 'pickup', address: undefined }));
  });

  it('flagged lines (hidden, not orderable, removed option value)', async () => {
    await testDb.db
      .update(product)
      .set({ state: 'hidden' })
      .where(eq(product.id, fixture.candle.id));
    await expectRejected(
      form({ items: [{ productId: fixture.candle.id, optionValueIds: [], quantity: 1 }] }),
      'checkout.lines_unavailable',
    );
    await testDb.db
      .update(product)
      .set({ orderable: false })
      .where(eq(product.id, fixture.doll.id));
    await expectRejected(form(), 'checkout.lines_unavailable');
    await testDb.db.update(product).set({ orderable: true }).where(eq(product.id, fixture.doll.id));
    await testDb.db.delete(optionValue).where(eq(optionValue.id, fixture.doll.brown));
    await expectRejected(form(), 'checkout.lines_unavailable');
  });

  it('a country outside the enabled zones and the UI-only "other"', async () => {
    for (const country of ['FR', 'other']) {
      await expectRejected(
        form({ address: { country, city: 'Paris', line1: '1 Rue' } }),
        'checkout.ships_israel_only',
      );
    }
  });

  it('missing terms, invalid details and an empty cart', async () => {
    await expectRejected(form({ acceptTerms: false }));
    await expectRejected(form({ email: 'nope' }));
    await expectRejected(form({ phone: '123' }));
    await expectRejected(form({ items: [] }));
  });

  it('names every problem at once, a bad phone next to a bad email and unticked terms', async () => {
    const result = await placeOrder(form({ email: 'nope', phone: '123', acceptTerms: false }), ctx);
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        email: 'checkout.errors.email',
        phone: 'checkout.errors.phone',
        acceptTerms: 'checkout.errors.acceptTerms',
      },
    });
    expect(await counts()).toEqual({ orders: 0, pending: 0, outbox: 0 });
  });
});

describe('order emails (contracts/emails.md)', () => {
  const SENTINELS = ['Sentinel Customer', 'sentinel@example.com', '0522345678', 'Sentinelstreet'];

  async function placeWithSentinels(overrides: Record<string, unknown> = {}) {
    await testDb.db.update(shopSettings).set({
      offlineInstructionsHe: 'העברה בנקאית: בנק 12, סניף 345',
      offlineInstructionsEn: 'Bank transfer: bank 12',
    });
    const result = await placeOrder(
      form({
        fullName: 'Sentinel Customer',
        email: 'sentinel@example.com',
        phone: '052-234-5678',
        address: { country: 'IL', city: 'חיפה', line1: 'Sentinelstreet 5' },
        ...overrides,
      }),
      ctx,
    );
    expect(result).toMatchObject({ ok: true });
    return testDb.db.select().from(emailOutbox);
  }

  it('the customer email has the number, totals, the preparation time of each line and the payment instructions', async () => {
    const rows = await placeWithSentinels();
    const mail = rows.find((row) => row.kind === 'order-confirmation');
    const body = `${mail?.html ?? ''}\n${mail?.textBody ?? ''}`;
    expect(mail?.toAddress).toBe('sentinel@example.com');
    expect(mail?.locale).toBe('he');
    expect(body).toContain('#1001');
    expect(body).toContain('230.00');
    expect(body).toContain('200.00');
    expect(body).toContain('30.00');
    expect(body).toContain('כשבועיים');
    expect(body).toContain('העברה בנקאית: בנק 12, סניף 345');
    expect(body).toContain('/pages/shipping-returns');
    expect(body).toContain('/he/order/');
    for (const part of [mail?.html, mail?.textBody]) {
      expect(part).toContain('בקישור הזה אפשר לראות בכל רגע איפה ההזמנה עומדת.');
      expect(part).toContain('למעקב אחרי ההזמנה');
    }
    // Seller identity (business details of the settings row).
    expect(body).not.toContain('000000000');
    expect(body).not.toContain('מספר עוסק:');
    expect(mail?.html).toContain('lang="he"');
    expect(mail?.html).toContain('dir="rtl"');
  });

  it('the confirmation email shows the business number only when there is a real one (008 FR-007)', async () => {
    for (const [number, shown] of [
      [null, false],
      ['123456789', true],
    ] as const) {
      await testDb.db.delete(emailOutbox);
      await testDb.db.update(shopSettings).set({ businessRegNumber: number });
      const rows = await placeWithSentinels();
      const mail = rows.find((row) => row.kind === 'order-confirmation');
      for (const part of [mail?.html, mail?.textBody]) {
        expect(part?.includes('מספר עוסק: 123456789')).toBe(shown);
        if (!shown) expect(part).not.toContain('מספר עוסק:');
        expect(part).not.toContain('000000000');
      }
    }
  });

  it('an English order gets an English email with the English texts', async () => {
    const rows = await placeWithSentinels({ locale: 'en' });
    const mail = rows.find((row) => row.kind === 'order-confirmation');
    const body = `${mail?.html ?? ''}\n${mail?.textBody ?? ''}`;
    expect(mail?.locale).toBe('en');
    expect(body).toContain('about two weeks');
    expect(body).toContain('Bank transfer: bank 12');
    expect(body).toContain('Crocheted doll');
    expect(body).toContain('/en/order/');
    for (const part of [mail?.html, mail?.textBody]) {
      expect(part).toContain('This link shows where your order stands at any time.');
      expect(part).toContain('Follow your order');
    }
    expect(mail?.html).toContain('dir="ltr"');
    expect(mail?.html).toContain('lang="en"');
    // 005: the total in the English money format, the English policy page, the owner's email in Hebrew.
    const [order] = await testDb.db.select().from(orders);
    expect(body).toContain(formatMoney(order?.totalMinor ?? 0, 'ILS', 'en'));
    expect(body).toContain('http://localhost:3100/en/pages/shipping-returns');
    const ownerMail = rows.find((row) => row.kind === 'new-order');
    expect(ownerMail?.orderId).toBe(order?.id);
    expect(ownerMail?.locale).toBe('he');
    expect(ownerMail?.html).toContain('lang="he"');
  });

  it('a pickup order shows the pickup instructions and no payment instructions once paid for online', async () => {
    await testDb.db.update(shopSettings).set({ pickupInstructionsHe: 'איסוף מהבית בתיאום' });
    const rows = await placeWithSentinels({ deliveryMethod: 'pickup', address: undefined });
    const mail = rows.find((row) => row.kind === 'order-confirmation');
    expect(`${mail?.html ?? ''}${mail?.textBody ?? ''}`).toContain('איסוף מהבית בתיאום');
  });

  it('the owner email has the customer details, the items and the admin link', async () => {
    const rows = await placeWithSentinels();
    const mail = rows.find((row) => row.kind === 'new-order');
    const body = `${mail?.html ?? ''}\n${mail?.textBody ?? ''}`;
    for (const sentinel of ['Sentinel Customer', 'sentinel@example.com', '+972522345678']) {
      expect(body).toContain(sentinel);
    }
    expect(body).toContain('#1001');
    expect(body).toContain('/admin/orders/');
    expect(mail?.locale).toBe('he');
  });

  it('no subject of the four templates holds a customer name, email, phone or address', async () => {
    const rows = await placeWithSentinels();
    const subjects = rows.map((row) => row.subject);
    const mismatch = renderPaymentMismatch({
      shopName: 'חנות',
      reference: 'ref',
      provider: 'fake',
      expectedMinor: 100,
      expectedCurrency: 'ILS',
      reportedMinor: 50,
      reportedCurrency: 'ILS',
      transactionId: 'tx',
      customer: {
        name: 'Sentinel Customer',
        phone: '+972522345678',
        email: 'sentinel@example.com',
      },
    });
    expect(`${mismatch.html}${mismatch.text}`).toContain('Sentinel Customer');
    subjects.push(mismatch.subject);
    for (const caseName of [
      'second_payment',
      'orphan_payment',
      'switched_offline',
      'unverified_expiry',
    ] as const) {
      const attention = renderPaymentAttention({
        case: caseName,
        shopName: 'חנות',
        reference: 'ref',
        provider: 'fake',
        amountMinor: 100,
        currency: 'ILS',
        transactionId: 'tx',
        orderNumber: 1001,
      });
      expect(`${attention.html}${attention.text}`).toContain('tx');
      subjects.push(attention.subject);
    }
    expect(subjects.length).toBeGreaterThanOrEqual(6);
    for (const subject of subjects) {
      for (const sentinel of SENTINELS) expect(subject).not.toContain(sentinel);
      expect(subject).not.toContain('דנה');
    }
    // Order emails carry the number and the shop name.
    expect(subjects.find((subject) => subject.includes('#1001'))).toBeDefined();
  });

  it('the attention email of a paid-after-switch names the order and offers both choices', () => {
    const mail = renderPaymentAttention({
      case: 'switched_offline',
      shopName: 'חנות',
      reference: 'ref',
      provider: 'fake',
      amountMinor: 23000,
      currency: 'ILS',
      transactionId: 'tx-1',
      orderNumber: 1007,
    });
    const body = `${mail.html}${mail.text}`;
    expect(body).toContain('#1007');
    expect(body).toContain('להחזיר');
    expect(body).toContain('להשאיר');
  });
});
