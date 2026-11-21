// 002 (tasks.md T008, later T022/T028): the order emails of contracts/emails.md. This file holds
// the owner email `order-email-failed` and (T020) the customer email `order-refunded`; the
// cancelled template is added by its own task.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { emailOutbox, orders, shippingZone, shopSettings } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { insertOrder, randomToken, type NewOrder } from '@/server/orders/create-order';
import {
  enqueueOrderCancelledEmail,
  enqueueOrderEmailFailed,
  enqueueOrderRefundedEmail,
} from '@/server/orders/order-emails';
import type { LineSnapshot } from '@/server/orders/snapshots';
import { formatMoney } from '@/lib/money';

let testDb: TestDbHandle;

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
    SECRET_HMAC_KEY: Buffer.from('order-emails-test-hmac-key-0123456789abcdef').toString('base64'),
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
});

const SENTINELS = {
  name: 'SENTINEL-NAME Cohen',
  phone: '+972501234567',
  email: 'sentinel-customer@example.test',
  city: 'SENTINEL-CITY',
  line1: 'SENTINEL-STREET 12',
};

async function sentinelOrder(overrides: Partial<NewOrder> = {}) {
  const [zone] = await testDb.db.select({ id: shippingZone.id }).from(shippingZone).limit(1);
  return insertOrder(testDb.db, {
    locale: 'he',
    zoneId: zone?.id ?? '',
    currency: 'ILS',
    customer: { name: SENTINELS.name, phone: SENTINELS.phone, email: SENTINELS.email },
    deliveryMethod: 'shipping',
    address: {
      country: 'IL',
      city: SENTINELS.city,
      line1: SENTINELS.line1,
      line2: null,
      postalCode: null,
    },
    note: null,
    paymentMethod: 'offline',
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
    ...overrides,
  });
}

describe('order-email-failed (owner, Hebrew)', () => {
  it('queues one Hebrew email per notification address, with the order number and admin link', async () => {
    await testDb.db
      .update(shopSettings)
      .set({ notificationEmails: ['owner-a@example.test', 'owner-b@example.test'] });
    const created = await sentinelOrder();
    await testDb.db.transaction((tx) => enqueueOrderEmailFailed(tx, created.orderId));

    const rows = await testDb.db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.kind, 'order-email-failed'));
    expect(rows.map((row) => row.toAddress).sort()).toEqual([
      'owner-a@example.test',
      'owner-b@example.test',
    ]);
    for (const row of rows) {
      expect(row.locale).toBe('he');
      expect(row.orderId).toBe(created.orderId);
      expect(row.html).toContain('dir="rtl"');
      expect(row.html).toContain('lang="he"');
      expect(row.html).toContain(String(created.orderNumber));
      expect(row.textBody).toContain(String(created.orderNumber));
      const link = `http://localhost:3100/admin/orders/${created.orderId}`;
      expect(row.html).toContain(link);
      expect(row.textBody).toContain(link);
      expect(row.subject).toContain(String(created.orderNumber));
      expect(row.subject).toContain('היצירות של אביבה');
      expect(row.html).toContain('לפתיחת ההזמנה');
    }
    expect(rows.find((row) => row.toAddress === 'owner-a@example.test')?.dedupeKey).toBe(
      `order-email-failed:${created.orderId}`,
    );
  });

  it('never holds the customer name, phone, email or address, in the subject or the bodies', async () => {
    const created = await sentinelOrder();
    await testDb.db.transaction((tx) => enqueueOrderEmailFailed(tx, created.orderId));
    const [row] = await testDb.db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.kind, 'order-email-failed'));
    expect(row).toBeDefined();
    for (const sentinel of Object.values(SENTINELS)) {
      expect(row?.subject).not.toContain(sentinel);
      expect(row?.html).not.toContain(sentinel);
      expect(row?.textBody).not.toContain(sentinel);
    }
  });

  it('queues the owner email once, however often it is asked', async () => {
    const created = await sentinelOrder();
    await testDb.db.transaction((tx) => enqueueOrderEmailFailed(tx, created.orderId));
    await testDb.db.transaction((tx) => enqueueOrderEmailFailed(tx, created.orderId));
    const rows = await testDb.db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.kind, 'order-email-failed'));
    expect(rows).toHaveLength(1);
  });

  it('refuses an unknown order', async () => {
    await expect(
      testDb.db.transaction((tx) =>
        enqueueOrderEmailFailed(tx, '00000000-0000-4000-8000-000000000000'),
      ),
    ).rejects.toThrow();
    expect(await testDb.db.select().from(orders)).toHaveLength(0);
  });
});

describe('order-refunded (customer)', () => {
  const PAID = { at: new Date(), provider: 'fake', transactionId: 'tx-refund' };

  async function refundedRow(overrides: Partial<NewOrder>) {
    const created = await sentinelOrder(overrides);
    await testDb.db.transaction((tx) => enqueueOrderRefundedEmail(tx, created.orderId));
    const [row] = await testDb.db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.kind, 'order-refunded'));
    if (!row) throw new Error('no order-refunded row');
    return { created, row };
  }

  it('Hebrew, offline: lang/dir, number, amount, method sentence and seller block', async () => {
    const { created, row } = await refundedRow({});
    const [settings] = await testDb.db.select().from(shopSettings);
    expect(row.toAddress).toBe(SENTINELS.email);
    expect(row.locale).toBe('he');
    expect(row.orderId).toBe(created.orderId);
    expect(row.dedupeKey).toBe(`order-refunded:${created.orderId}`);
    expect(row.html).toContain('lang="he"');
    expect(row.html).toContain('dir="rtl"');
    for (const body of [row.html, row.textBody]) {
      expect(body).toContain(String(created.orderNumber));
      expect(body).toContain(formatMoney(10000, 'ILS', 'he'));
      expect(body).toContain('ההחזר נעשה באותה דרך שבה שילמתם.');
      expect(body).not.toContain('ההחזר יופיע בכרטיס האשראי');
      expect(body).toContain('החזרתי את הכסף על ההזמנה.');
      expect(body).toContain(settings?.businessNameHe ?? 'missing');
      expect(body).toContain(settings?.businessPhone ?? 'missing');
      expect(body).toContain(settings?.businessEmail ?? 'missing');
      expect(body).toContain(settings?.businessAddressHe ?? 'missing');
      expect(body).toContain('פרטי העוסק');
      expect(body).not.toContain('000000000');
      expect(body).not.toContain('מספר עוסק:');
    }
    expect(row.subject).toContain(String(created.orderNumber));
    expect(row.subject).toContain('היצירות של אביבה');
  });

  it('English, online: lang/dir ltr, amount in the order currency, card sentence', async () => {
    const [settings] = await testDb.db.select().from(shopSettings);
    const { created, row } = await refundedRow({
      locale: 'en',
      paymentMethod: 'online',
      paid: PAID,
    });
    expect(row.locale).toBe('en');
    expect(row.html).toContain('lang="en"');
    expect(row.html).toContain('dir="ltr"');
    for (const body of [row.html, row.textBody]) {
      expect(body).toContain(String(created.orderNumber));
      expect(body).toContain(formatMoney(10000, 'ILS', 'en'));
      expect(body).toContain(
        'It will show on your card within a few business days, depending on your card company.',
      );
      expect(body).not.toContain('The refund was made the same way you paid.');
      expect(body).toContain('refunded your order.');
      expect(body).toContain('Seller details');
      expect(body).toContain(settings?.businessNameEn ?? 'missing');
      expect(body).toContain(settings?.businessAddressEn ?? 'missing');
      expect(body).not.toContain('000000000');
      expect(body).not.toContain('Business no.');
      expect(body).not.toContain(settings?.businessNameHe ?? 'missing');
    }
    expect(row.subject).toContain(String(created.orderNumber));
  });

  it('shows the business number only when there is a real one (008 FR-007)', async () => {
    for (const [number, shown] of [
      [null, false],
      ['123456789', true],
    ] as const) {
      await testDb.db.delete(emailOutbox);
      await testDb.db.update(shopSettings).set({ businessRegNumber: number });
      const { row } = await refundedRow({});
      for (const body of [row.html, row.textBody]) {
        expect(body.includes('מספר עוסק: 123456789')).toBe(shown);
        expect(body).not.toContain('000000000');
      }
    }
  });

  it('English: the business number line reads "Business no.: 123456789"', async () => {
    await testDb.db.update(shopSettings).set({ businessRegNumber: '123456789' });
    const { row } = await refundedRow({ locale: 'en' });
    for (const body of [row.html, row.textBody]) {
      expect(body).toContain('Business no.: 123456789');
      expect(body).not.toContain('000000000');
    }
  });

  it('uses the order currency (USD) for the refunded amount', async () => {
    const { row } = await refundedRow({ locale: 'en', currency: 'USD' });
    expect(row.textBody).toContain(formatMoney(10000, 'USD', 'en'));
  });

  it('the subject holds only the shop name and the order number', async () => {
    for (const locale of ['he', 'en'] as const) {
      await testDb.reset();
      await runSeed(testDb.db, { samples: false });
      const { row } = await refundedRow({ locale });
      for (const sentinel of Object.values(SENTINELS)) {
        expect(row.subject).not.toContain(sentinel);
      }
      expect(row.subject).toMatch(/\d{4}/);
    }
  });

  it('carries no order-page link and no address, name or phone of the customer', async () => {
    const { row } = await refundedRow({});
    for (const sentinel of [SENTINELS.name, SENTINELS.phone, SENTINELS.city, SENTINELS.line1]) {
      expect(row.html).not.toContain(sentinel);
      expect(row.textBody).not.toContain(sentinel);
    }
    expect(row.html).not.toContain('/order/');
  });

  it('is queued once however often it is asked; none for an anonymised order', async () => {
    const created = await sentinelOrder();
    await testDb.db.transaction((tx) => enqueueOrderRefundedEmail(tx, created.orderId));
    await testDb.db.transaction((tx) => enqueueOrderRefundedEmail(tx, created.orderId));
    expect(
      await testDb.db.select().from(emailOutbox).where(eq(emailOutbox.kind, 'order-refunded')),
    ).toHaveLength(1);

    const anonymised = await sentinelOrder();
    await testDb.db
      .update(orders)
      .set({ customerEmail: null, customerPhone: null, anonymizedAt: new Date() })
      .where(eq(orders.id, anonymised.orderId));
    await testDb.db.transaction((tx) => enqueueOrderRefundedEmail(tx, anonymised.orderId));
    expect(
      await testDb.db.select().from(emailOutbox).where(eq(emailOutbox.kind, 'order-refunded')),
    ).toHaveLength(1);
  });

  it('refuses an unknown order', async () => {
    await expect(
      testDb.db.transaction((tx) =>
        enqueueOrderRefundedEmail(tx, '00000000-0000-4000-8000-000000000000'),
      ),
    ).rejects.toThrow();
  });
});

describe('order-cancelled (customer)', () => {
  const PAID = { at: new Date(), provider: 'fake', transactionId: 'tx-cancel' };
  const ITEM: LineSnapshot = {
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

  async function cancelledRow(
    overrides: Partial<NewOrder>,
    state?: 'refunded' | 'awaiting_payment',
  ) {
    // A delivery fee, so the total differs from the item's price.
    const created = await sentinelOrder({
      lines: [ITEM],
      deliveryFeeMinor: 2000,
      totalMinor: 12000,
      ...overrides,
    });
    if (state !== undefined) {
      await testDb.db
        .update(orders)
        .set({ paymentState: state })
        .where(eq(orders.id, created.orderId));
    }
    await testDb.db.transaction((tx) => enqueueOrderCancelledEmail(tx, created.orderId));
    const [row] = await testDb.db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.kind, 'order-cancelled'));
    if (!row) throw new Error('no order-cancelled row');
    return { created, row };
  }

  it('Hebrew, unpaid: lang/dir, number, items, total, no-payment sentence, seller block', async () => {
    const [settings] = await testDb.db.select().from(shopSettings);
    const { created, row } = await cancelledRow({});
    expect(row.toAddress).toBe(SENTINELS.email);
    expect(row.locale).toBe('he');
    expect(row.orderId).toBe(created.orderId);
    expect(row.dedupeKey).toBe(`order-cancelled:${created.orderId}`);
    expect(row.html).toContain('lang="he"');
    expect(row.html).toContain('dir="rtl"');
    for (const body of [row.html, row.textBody]) {
      expect(body).toContain('ההזמנה שלכם בוטלה.');
      expect(body).toContain(String(created.orderNumber));
      expect(body).toContain('בובה סרוגה');
      expect(body).toContain('סה״כ');
      expect(body).toContain(formatMoney(12000, 'ILS', 'he'));
      expect(body).toContain('לא נגבה תשלום.');
      expect(body).not.toContain('הכסף יוחזר');
      expect(body).toContain('יש שאלה? אפשר לכתוב או להתקשר אליי:');
      expect(body).toContain(settings?.businessNameHe ?? 'missing');
      expect(body).toContain(settings?.businessPhone ?? 'missing');
      expect(body).toContain(settings?.businessEmail ?? 'missing');
      expect(body).toContain('פרטי העוסק');
    }
    expect(row.subject).toContain(String(created.orderNumber));
    expect(row.subject).toContain('היצירות של אביבה');
    expect(row.subject).toContain('בוטלה');
    expect(row.textBody).toContain(`סה״כ: ${formatMoney(12000, 'ILS', 'he')}`);
  });

  it('Hebrew, paid online: the card sentence only', async () => {
    const { row } = await cancelledRow({ paymentMethod: 'online', paid: PAID });
    for (const body of [row.html, row.textBody]) {
      expect(body).toContain('הכסף יוחזר לכרטיס האשראי דרך חברת הסליקה.');
      expect(body).not.toContain('לא נגבה תשלום.');
      expect(body).not.toContain('אחזיר את הכסף');
    }
  });

  it('English, unpaid: the no-payment sentence only', async () => {
    const { row } = await cancelledRow({ locale: 'en' });
    for (const body of [row.html, row.textBody]) {
      expect(body).toContain('No payment was taken.');
      expect(body).not.toContain('will be returned');
      expect(body).not.toContain('same way you paid');
    }
  });

  it('English, paid online: lang/dir ltr, card sentence, English seller block', async () => {
    const [settings] = await testDb.db.select().from(shopSettings);
    const { row } = await cancelledRow({ locale: 'en', paymentMethod: 'online', paid: PAID });
    expect(row.locale).toBe('en');
    expect(row.html).toContain('lang="en"');
    expect(row.html).toContain('dir="ltr"');
    for (const body of [row.html, row.textBody]) {
      expect(body).toContain('Your order was cancelled.');
      expect(body).toContain('Crocheted doll');
      expect(body).toContain('Total');
      expect(body).toContain(formatMoney(12000, 'ILS', 'en'));
      expect(body).toContain(
        'The money will be returned to your card through the payment company.',
      );
      expect(body).not.toContain('No payment was taken.');
      expect(body).toContain(settings?.businessNameEn ?? 'missing');
      expect(body).not.toContain(settings?.businessNameHe ?? 'missing');
    }
    expect(row.subject).toContain('was cancelled');
  });

  it('shows the business number only when there is a real one (008 FR-007)', async () => {
    for (const [number, shown] of [
      [null, false],
      ['123456789', true],
    ] as const) {
      await testDb.db.delete(emailOutbox);
      await testDb.db.update(shopSettings).set({ businessRegNumber: number });
      const { row } = await cancelledRow({});
      for (const body of [row.html, row.textBody]) {
        expect(body.includes('מספר עוסק: 123456789')).toBe(shown);
        expect(body).not.toContain('000000000');
      }
    }
  });

  it('paid offline: the same-way sentence', async () => {
    const created = await sentinelOrder({ lines: [ITEM] });
    await testDb.db
      .update(orders)
      .set({ paymentState: 'paid' })
      .where(eq(orders.id, created.orderId));
    await testDb.db.transaction((tx) => enqueueOrderCancelledEmail(tx, created.orderId));
    const [row] = await testDb.db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.kind, 'order-cancelled'));
    expect(row?.textBody).toContain('אחזיר את הכסף באותה דרך שבה שילמתם.');
    const en = await cancelledRowEn();
    expect(en).toContain("I'll return the money the same way you paid.");
  });

  async function cancelledRowEn() {
    await testDb.reset();
    await runSeed(testDb.db, { samples: false });
    const created = await sentinelOrder({ lines: [ITEM], locale: 'en' });
    await testDb.db
      .update(orders)
      .set({ paymentState: 'paid' })
      .where(eq(orders.id, created.orderId));
    await testDb.db.transaction((tx) => enqueueOrderCancelledEmail(tx, created.orderId));
    const [row] = await testDb.db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.kind, 'order-cancelled'));
    return row?.textBody ?? '';
  }

  it('an already refunded order: the money was already returned', async () => {
    const { row } = await cancelledRow({}, 'refunded');
    expect(row.textBody).toContain('הכסף כבר הוחזר לכם.');
    expect(row.textBody).not.toContain('לא נגבה תשלום.');
    await testDb.reset();
    await runSeed(testDb.db, { samples: false });
    const en = await cancelledRow({ locale: 'en' }, 'refunded');
    expect(en.row.textBody).toContain('Your money has already been returned.');
  });

  it('the subject holds only the shop name and the order number', async () => {
    for (const locale of ['he', 'en'] as const) {
      await testDb.reset();
      await runSeed(testDb.db, { samples: false });
      const { row } = await cancelledRow({ locale });
      for (const sentinel of Object.values(SENTINELS)) {
        expect(row.subject).not.toContain(sentinel);
      }
      expect(row.subject).toMatch(/\d{4}/);
    }
  });

  it('carries no order-page link and no name, phone or address of the customer', async () => {
    const { row } = await cancelledRow({});
    for (const sentinel of [SENTINELS.name, SENTINELS.phone, SENTINELS.city, SENTINELS.line1]) {
      expect(row.html).not.toContain(sentinel);
      expect(row.textBody).not.toContain(sentinel);
    }
    expect(row.html).not.toContain('/order/');
  });

  it('is queued once however often it is asked; none for an anonymised order', async () => {
    const created = await sentinelOrder();
    await testDb.db.transaction((tx) => enqueueOrderCancelledEmail(tx, created.orderId));
    await testDb.db.transaction((tx) => enqueueOrderCancelledEmail(tx, created.orderId));
    const count = async () =>
      (await testDb.db.select().from(emailOutbox).where(eq(emailOutbox.kind, 'order-cancelled')))
        .length;
    expect(await count()).toBe(1);
    const anonymised = await sentinelOrder();
    await testDb.db
      .update(orders)
      .set({ customerEmail: null, customerPhone: null, anonymizedAt: new Date() })
      .where(eq(orders.id, anonymised.orderId));
    await testDb.db.transaction((tx) => enqueueOrderCancelledEmail(tx, anonymised.orderId));
    expect(await count()).toBe(1);
  });

  it('refuses an unknown order', async () => {
    await expect(
      testDb.db.transaction((tx) =>
        enqueueOrderCancelledEmail(tx, '00000000-0000-4000-8000-000000000000'),
      ),
    ).rejects.toThrow();
  });
});
