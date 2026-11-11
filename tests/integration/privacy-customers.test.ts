// 003 US3 (tasks.md T023): the customer data-request tools of src/server/privacy/* (research
// R8-R10, contracts/server-actions.md > Customers, data-model.md; user decisions Q1 and Q5).
// Orders are created through `insertOrder()` as the checkout does.
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { makeActor } from '../helpers/catalog';
import {
  adminActivity,
  emailOutbox,
  orderEvent,
  orders,
  pendingCheckout,
  shippingZone,
} from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import type { Actor } from '@/server/catalog/result';
import { insertOrder, randomToken } from '@/server/orders/create-order';
import type { LineSnapshot } from '@/server/orders/snapshots';
import { findCustomer, searchCustomers } from '@/server/privacy/customers';
import { exportCustomer } from '@/server/privacy/export';
import { withdrawMarketingConsent } from '@/server/privacy/consent';
import { anonymizePerson } from '@/server/privacy/anonymize';
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
    SECRET_HMAC_KEY: Buffer.from('privacy-customers-test-hmac-key-0123456789ab').toString('base64'),
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

const PHONE_A = '+972502345678'; // written 050-234-5678 / +972 50 234 5678
const PHONE_B = '+972522345678';
const PHONE_C = '+972533456789';

function line(): LineSnapshot {
  return {
    product_id: null,
    option_value_ids: [],
    product_name_he: 'בובה סרוגה',
    product_name_en: 'Crocheted doll',
    prep_time_he: 'כשבועיים',
    prep_time_en: 'about two weeks',
    options: [{ group_he: 'צבע', group_en: 'Colour', value_he: 'חום', value_en: 'Brown' }],
    unit_price_minor: 10000,
    quantity: 1,
    line_total_minor: 10000,
    sourceImageKey: null,
  };
}

interface MakeOptions {
  name?: string;
  email?: string;
  phone?: string;
  status?: OrderStatus;
  marketing?: boolean;
  pickup?: boolean;
  note?: string | null;
}

async function makeOrder({
  name = 'דנה כהן',
  email = 'dana@example.test',
  phone = PHONE_A,
  status,
  marketing = false,
  pickup = false,
  note = null,
}: MakeOptions = {}) {
  const created = await insertOrder(testDb.db, {
    locale: 'he',
    zoneId,
    currency: 'ILS',
    customer: { name, phone, email },
    deliveryMethod: pickup ? 'pickup' : 'shipping',
    address: pickup
      ? null
      : { country: 'IL', city: 'חיפה', line1: 'הרצל 5', line2: 'דירה 3', postalCode: '3100000' },
    note,
    paymentMethod: 'offline',
    paid: null,
    subtotalMinor: 10000,
    deliveryFeeMinor: pickup ? 0 : 3000,
    totalMinor: pickup ? 10000 : 13000,
    termsAcceptedAt: new Date('2026-11-01T10:00:00Z'),
    termsVersion: 2,
    privacyVersion: 1,
    marketingOptIn: marketing,
    marketingOptInAt: marketing ? new Date('2026-11-01T10:00:00Z') : null,
    lines: [line()],
    token: randomToken(),
    now: new Date(),
  });
  // The checkout's own path queues its emails; each test seeds the outbox rows it needs.
  await testDb.db.delete(emailOutbox).where(eq(emailOutbox.orderId, created.orderId));
  const patch: Partial<typeof orders.$inferInsert> = {
    trackingNumber: 'RR123456789IL',
    pickupNote: 'ליד הדלת',
  };
  if (status !== undefined) patch.status = status;
  await testDb.db.update(orders).set(patch).where(eq(orders.id, created.orderId));
  return created;
}

async function makeCheckout(
  state: (typeof pendingCheckout.$inferSelect)['state'],
  { email, phone, marketing = true }: { email: string; phone: string; marketing?: boolean },
) {
  const [row] = await testDb.db
    .insert(pendingCheckout)
    .values({
      resumeTokenHash: Buffer.from(randomToken()),
      locale: 'he',
      zoneId,
      currency: 'ILS',
      customerName: 'דנה כהן',
      customerPhone: phone,
      customerEmail: email,
      deliveryMethod: 'pickup',
      termsAcceptedAt: new Date(),
      termsVersion: 2,
      privacyVersion: 1,
      marketingOptIn: marketing,
      marketingOptInAt: marketing ? new Date() : null,
      subtotalMinor: 10000,
      totalMinor: 10000,
      provider: 'fake',
      state,
      expiresAt: new Date(Date.now() + 48 * 3_600_000),
    })
    .returning({ id: pendingCheckout.id });
  return row?.id ?? '';
}

let outboxSeq = 0;
async function makeEmail(values: {
  kind: string;
  to: string;
  replyTo?: string | null;
  orderId?: string | null;
  status?: 'pending' | 'sending' | 'sent' | 'failed';
}) {
  outboxSeq += 1;
  const [row] = await testDb.db
    .insert(emailOutbox)
    .values({
      kind: values.kind,
      toAddress: values.to,
      locale: 'he',
      subject: 'נושא',
      replyTo: values.replyTo ?? null,
      html: '<p>x</p>',
      textBody: 'x',
      orderId: values.orderId ?? null,
      dedupeKey: `test:${String(outboxSeq)}`,
      status: values.status ?? 'pending',
    })
    .returning({ id: emailOutbox.id });
  return row?.id ?? '';
}

const outboxIds = async () =>
  (await testDb.db.select({ id: emailOutbox.id }).from(emailOutbox)).map((row) => row.id);
const checkoutIds = async () =>
  (await testDb.db.select({ id: pendingCheckout.id }).from(pendingCheckout)).map((r) => r.id);

async function getOrder(id: string) {
  const [row] = await testDb.db.select().from(orders).where(eq(orders.id, id));
  if (!row) throw new Error('no order');
  return row;
}

async function activity() {
  return testDb.db.select().from(adminActivity).orderBy(asc(adminActivity.at));
}

function dataOf<T>(result: { ok: boolean; data?: T }): T {
  if (!result.ok || result.data === undefined) throw new Error(`not ok: ${JSON.stringify(result)}`);
  return result.data;
}

describe('findCustomer / searchCustomers (R8)', () => {
  it('matches by email in any case and by phone in any format, never another person', async () => {
    const dana = await makeOrder({ email: 'Dana@Example.test', phone: PHONE_A });
    const other = await makeOrder({ name: 'רון לוי', email: 'ron@example.test', phone: PHONE_B });

    for (const q of ['dana@example.test', ' DANA@EXAMPLE.TEST ', 'dana@EXAMPLE.test']) {
      const found = dataOf(await searchCustomers(actor, q));
      expect(found.field).toBe('email');
      expect(found.orders.map((o) => o.id)).toEqual([dana.orderId]);
    }
    for (const q of ['050-234-5678', '+972 50 234 5678', '0502345678', '+972502345678']) {
      const found = dataOf(await searchCustomers(actor, q));
      expect(found.field).toBe('phone');
      expect(found.orders.map((o) => o.id)).toEqual([dana.orderId]);
    }
    expect(dataOf(await searchCustomers(actor, 'ron@example.test')).orders[0]?.id).toBe(
      other.orderId,
    );
  });

  it('returns the order facts the screen needs and never a name or an address', async () => {
    const created = await makeOrder({ marketing: true, status: 'shipped' });
    const found = dataOf(await searchCustomers(actor, 'dana@example.test'));
    expect(found.orders).toHaveLength(1);
    const row = found.orders[0];
    expect(row).toMatchObject({
      id: created.orderId,
      orderNumber: created.orderNumber,
      status: 'shipped',
      paymentState: 'awaiting_payment',
      totalMinor: 13000,
      currency: 'ILS',
      marketingOptIn: true,
      open: true,
    });
    expect(typeof row?.createdAt).toBe('string');
    expect(JSON.stringify(found)).not.toContain('דנה');
    expect(JSON.stringify(found)).not.toContain('הרצל');
  });

  it('marks completed and cancelled orders as not open', async () => {
    await makeOrder({ status: 'completed' });
    await makeOrder({ status: 'cancelled' });
    await makeOrder({ status: 'new' });
    const found = dataOf(await searchCustomers(actor, 'dana@example.test'));
    expect(found.orders.map((o) => o.open).sort()).toEqual([false, false, true]);
  });

  it('never matches an anonymised order (its email and phone are gone)', async () => {
    const created = await makeOrder();
    await testDb.db
      .update(orders)
      .set({
        customerName: 'נמחק',
        customerEmail: null,
        customerPhone: null,
        anonymizedAt: new Date(),
      })
      .where(eq(orders.id, created.orderId));
    expect(dataOf(await searchCustomers(actor, 'dana@example.test')).orders).toEqual([]);
    expect(dataOf(await searchCustomers(actor, '050-234-5678')).orders).toEqual([]);
  });

  it('a phone search returns both orders with the other emails, a second search narrows to one', async () => {
    const x = await makeOrder({ email: 'x@example.test', phone: PHONE_A });
    const y = await makeOrder({ email: 'y@example.test', phone: PHONE_A });
    await makeOrder({ email: 'x@example.test', phone: PHONE_B });
    const byPhone = dataOf(await searchCustomers(actor, '050-234-5678'));
    expect(byPhone.orders.map((o) => o.id).sort()).toEqual([x.orderId, y.orderId].sort());
    expect(byPhone.otherIdentifiers.emails).toEqual(['x@example.test', 'y@example.test']);
    expect(byPhone.otherIdentifiers.phones).toEqual([]);

    const byEmail = dataOf(await searchCustomers(actor, 'x@example.test'));
    expect(byEmail.orders).toHaveLength(2);
    expect(byEmail.otherIdentifiers.emails).toEqual([]);
    expect(byEmail.otherIdentifiers.phones).toEqual([PHONE_A, PHONE_B]);
  });

  it('rejects text that is neither an email nor a phone, and writes no activity', async () => {
    for (const q of ['hello', 'abc', '@', 'a@', '123']) {
      expect(await searchCustomers(actor, q)).toEqual({
        ok: false,
        fieldErrors: { q: 'admin.customers.errors.query' },
      });
    }
    expect(await activity()).toEqual([]);
  });

  it('counts unfinished checkouts and stored emails the search finds', async () => {
    const created = await makeOrder();
    await makeCheckout('awaiting_provider', { email: 'dana@example.test', phone: PHONE_A });
    await makeCheckout('failed', { email: 'other@example.test', phone: PHONE_A });
    await makeCheckout('failed', { email: 'nobody@example.test', phone: PHONE_C });
    await makeEmail({
      kind: 'order-confirmation',
      to: 'dana@example.test',
      orderId: created.orderId,
    });
    await makeEmail({ kind: 'new-order', to: 'owner@example.test', orderId: created.orderId });
    await makeEmail({ kind: 'order-confirmation', to: 'unrelated@example.test' });

    const byEmail = dataOf(await searchCustomers(actor, 'dana@example.test'));
    expect(byEmail.pendingCheckouts).toBe(1);
    expect(byEmail.emails).toBe(2);
    const byPhone = dataOf(await searchCustomers(actor, PHONE_A));
    expect(byPhone.pendingCheckouts).toBe(2);
    expect(byPhone.emails).toBe(2);
  });

  it('a stored contact email alone (reply_to = the email) finds zero orders and one email', async () => {
    await makeEmail({
      kind: 'contact-message',
      to: 'owner@example.test',
      replyTo: 'visitor@example.test',
    });
    const found = dataOf(await searchCustomers(actor, 'Visitor@Example.test'));
    expect(found.orders).toEqual([]);
    expect(found.emails).toBe(1);
    expect(found.pendingCheckouts).toBe(0);
  });

  it('writes customer.searched {field, count}, also for zero, with no personal data', async () => {
    await makeOrder();
    await makeOrder();
    await searchCustomers(actor, 'dana@example.test');
    await searchCustomers(actor, '052-000-0000');
    const rows = await activity();
    expect(rows.map((r) => [r.action, r.details])).toEqual([
      ['customer.searched', { field: 'email', count: 2 }],
      ['customer.searched', { field: 'phone', count: 0 }],
    ]);
    expect(rows[0]).toMatchObject({ adminId: actor.adminId, actorKind: 'admin' });
    expect(JSON.stringify(rows)).not.toContain('dana');
  });

  it('findCustomer is a plain read: no activity, null for invalid text', async () => {
    await makeOrder();
    expect(await findCustomer('nonsense')).toBeNull();
    const found = await findCustomer('dana@example.test');
    expect(found?.orders).toHaveLength(1);
    expect(await activity()).toEqual([]);
  });
});

describe('exportCustomer (R9)', () => {
  it('returns customer-YYYY-MM-DD.json with the contract shape and logs customer.exported', async () => {
    const created = await makeOrder({ marketing: true });
    await makeCheckout('awaiting_provider', { email: 'dana@example.test', phone: PHONE_A });
    await makeEmail({
      kind: 'order-confirmation',
      to: 'dana@example.test',
      orderId: created.orderId,
      status: 'sent',
    });
    const result = dataOf(
      await exportCustomer(actor, { q: 'dana@example.test', orderIds: [created.orderId] }),
    );
    expect(result.filename).toMatch(/^customer-\d{4}-\d{2}-\d{2}\.json$/);

    const file = JSON.parse(result.content) as Record<string, unknown>;
    expect(Object.keys(file).sort()).toEqual(
      ['emails', 'exportedAt', 'orders', 'pendingCheckouts', 'searchedBy', 'shop'].sort(),
    );
    expect(file.searchedBy).toBe('email');
    expect(file.shop).toMatchObject({
      legalName: expect.any(String) as string,
      email: expect.any(String) as string,
      phone: expect.any(String) as string,
    });
    const [order] = file.orders as Record<string, unknown>[];
    expect(order).toMatchObject({
      orderNumber: created.orderNumber,
      language: 'he',
      status: 'new',
      customer: { name: 'דנה כהן', email: 'dana@example.test', phone: PHONE_A },
      delivery: {
        method: 'shipping',
        country: 'IL',
        city: 'חיפה',
        line1: 'הרצל 5',
        line2: 'דירה 3',
        postalCode: '3100000',
      },
      note: null,
      trackingNumber: 'RR123456789IL',
      pickupNote: 'ליד הדלת',
      items: [
        {
          name: 'בובה סרוגה',
          options: [{ group: 'צבע', value: 'חום' }],
          unitPriceMinor: 10000,
          quantity: 1,
          lineTotalMinor: 10000,
        },
      ],
      currency: 'ILS',
      subtotalMinor: 10000,
      deliveryFeeMinor: 3000,
      totalMinor: 13000,
      payment: { method: 'offline', state: 'awaiting_payment', paidAt: null, refundedAt: null },
      terms: { acceptedAt: '2026-11-01T10:00:00.000Z', termsVersion: 2, privacyVersion: 1 },
      marketing: { optIn: true, optInAt: '2026-11-01T10:00:00.000Z', withdrawnAt: null },
    });
    expect(file.pendingCheckouts).toHaveLength(1);
    expect((file.pendingCheckouts as Record<string, unknown>[])[0]).toMatchObject({
      state: 'awaiting_provider',
      customer: { email: 'dana@example.test' },
    });
    expect(file.emails).toEqual([
      expect.objectContaining({
        kind: 'order-confirmation',
        to: 'dana@example.test',
        replyTo: null,
        status: 'sent',
      }),
    ]);
    // The mails' bodies are never exported.
    expect(result.content).not.toContain('<p>x</p>');

    const rows = await activity();
    expect(rows.map((r) => [r.action, r.details])).toEqual([['customer.exported', { count: 1 }]]);
  });

  it('exports only the orders shown that still match, and an English order in English', async () => {
    const mine = await makeOrder({ email: 'dana@example.test' });
    const other = await makeOrder({ email: 'ron@example.test', phone: PHONE_B });
    const result = dataOf(
      await exportCustomer(actor, {
        q: 'dana@example.test',
        orderIds: [mine.orderId, other.orderId],
      }),
    );
    const file = JSON.parse(result.content) as { orders: { orderNumber: number }[] };
    expect(file.orders.map((o) => o.orderNumber)).toEqual([mine.orderNumber]);
  });

  it('rejects an invalid q', async () => {
    expect(await exportCustomer(actor, { q: 'zzz', orderIds: [] })).toEqual({
      ok: false,
      fieldErrors: { q: 'admin.customers.errors.query' },
    });
  });
});

describe('withdrawMarketingConsent (R10)', () => {
  it('refuses without confirm before any query (even an invalid q gets the confirm error)', async () => {
    const created = await makeOrder({ marketing: true });
    const ref = { q: 'dana@example.test', orderIds: [created.orderId] };
    expect(await withdrawMarketingConsent(actor, ref as never)).toEqual({
      ok: false,
      formError: 'admin.confirm_required',
    });
    expect(await withdrawMarketingConsent(actor, { q: 'x', orderIds: [], confirm: false })).toEqual(
      { ok: false, formError: 'admin.confirm_required' },
    );
    expect((await getOrder(created.orderId)).marketingOptIn).toBe(true);
    expect(await activity()).toEqual([]);
  });

  it('withdraws, keeps the original date, clears the checkouts and logs only a count', async () => {
    const consenting = await makeOrder({ marketing: true });
    const plain = await makeOrder({ marketing: false });
    const strangers = await makeOrder({
      email: 'ron@example.test',
      phone: PHONE_B,
      marketing: true,
    });
    const checkout = await makeCheckout('awaiting_provider', {
      email: 'dana@example.test',
      phone: PHONE_A,
    });
    const strangerCheckout = await makeCheckout('failed', {
      email: 'ron@example.test',
      phone: PHONE_B,
    });
    const result = await withdrawMarketingConsent(actor, {
      q: 'dana@example.test',
      orderIds: [consenting.orderId, plain.orderId, strangers.orderId],
      confirm: true,
    });
    expect(dataOf(result)).toEqual({ count: 1 });

    const after = await getOrder(consenting.orderId);
    expect(after.marketingOptIn).toBe(false);
    expect(after.marketingWithdrawnAt).toBeInstanceOf(Date);
    expect(after.marketingOptInAt?.toISOString()).toBe('2026-11-01T10:00:00.000Z');
    expect((await getOrder(plain.orderId)).marketingWithdrawnAt).toBeNull();
    // Not matched by the search: untouched.
    expect((await getOrder(strangers.orderId)).marketingOptIn).toBe(true);

    const [pending] = await testDb.db
      .select()
      .from(pendingCheckout)
      .where(eq(pendingCheckout.id, checkout));
    expect(pending).toMatchObject({ marketingOptIn: false, marketingOptInAt: null });
    const [strangerPending] = await testDb.db
      .select()
      .from(pendingCheckout)
      .where(eq(pendingCheckout.id, strangerCheckout));
    expect(strangerPending?.marketingOptIn).toBe(true);

    const rows = await activity();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'customer.marketing_withdrawn',
      details: { count: 1 },
      adminId: actor.adminId,
    });
    expect(JSON.stringify(rows[0])).not.toContain('dana');
  });
});

describe('anonymizePerson (R10, FR-019, SC-007)', () => {
  it('refuses without confirm', async () => {
    const created = await makeOrder();
    expect(
      await anonymizePerson(actor, { q: 'dana@example.test', orderIds: [created.orderId] }),
    ).toEqual({ ok: false, formError: 'admin.confirm_required' });
    expect((await getOrder(created.orderId)).anonymizedAt).toBeNull();
    expect(await activity()).toEqual([]);
  });

  it('applies exactly the data-model columns, adds the event and keeps what must stay', async () => {
    const created = await makeOrder({
      marketing: true,
      status: 'completed',
      note: 'להשאיר אצל השכנה',
    });
    await testDb.db
      .update(orders)
      .set({ marketingWithdrawnAt: new Date('2026-11-05T10:00:00Z') })
      .where(eq(orders.id, created.orderId));
    const before = await getOrder(created.orderId);

    const result = await anonymizePerson(actor, {
      q: 'DANA@example.test',
      orderIds: [created.orderId],
      confirm: true,
    });
    expect(dataOf(result)).toEqual({ count: 1, skipped: 0, keptCheckouts: 0 });

    const after = await getOrder(created.orderId);
    expect(after).toMatchObject({
      customerName: 'נמחק',
      customerPhone: null,
      customerEmail: null,
      addressCity: null,
      addressLine1: null,
      addressLine2: null,
      addressPostalCode: null,
      note: null,
      trackingNumber: null,
      pickupNote: null,
      marketingOptInAt: null,
      marketingWithdrawnAt: null,
      marketingOptIn: false,
    });
    expect(after.anonymizedAt).toBeInstanceOf(Date);
    // Kept: country, amounts, status, payment, versions, locale, token.
    expect(after).toMatchObject({
      addressCountry: before.addressCountry,
      subtotalMinor: before.subtotalMinor,
      deliveryFeeMinor: before.deliveryFeeMinor,
      totalMinor: before.totalMinor,
      status: 'completed',
      paymentMethod: before.paymentMethod,
      paymentState: before.paymentState,
      termsVersion: 2,
      privacyVersion: 1,
      locale: 'he',
      orderNumber: before.orderNumber,
    });
    expect(after.termsAcceptedAt).toEqual(before.termsAcceptedAt);
    expect(Buffer.from(after.publicTokenHash)).toEqual(Buffer.from(before.publicTokenHash));

    const events = (
      await testDb.db.select().from(orderEvent).where(eq(orderEvent.orderId, created.orderId))
    ).filter((e) => e.kind === 'anonymized');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ adminId: actor.adminId, data: {} });

    const rows = await activity();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'customer.anonymized', details: { count: 1 } });
    expect(JSON.stringify(rows[0])).not.toMatch(/dana|נמחק/);
  });

  it('deletes no pending_checkout row: awaiting_provider, failed and mismatch all stay and are counted', async () => {
    const created = await makeOrder();
    const kept = [
      await makeCheckout('awaiting_provider', { email: 'dana@example.test', phone: PHONE_A }),
      await makeCheckout('failed', { email: 'Dana@Example.test', phone: PHONE_C }),
      await makeCheckout('mismatch', { email: 'dana@example.test', phone: PHONE_A }),
    ];
    const unrelated = await makeCheckout('failed', {
      email: 'ron@example.test',
      phone: PHONE_B,
    });
    const mismatchMail = await makeEmail({
      kind: 'payment-mismatch',
      to: 'owner@example.test',
      orderId: null,
    });

    const result = await anonymizePerson(actor, {
      q: 'dana@example.test',
      orderIds: [created.orderId],
      confirm: true,
    });
    expect(dataOf(result)).toEqual({ count: 1, skipped: 0, keptCheckouts: 3 });
    expect((await checkoutIds()).sort()).toEqual([...kept, unrelated].sort());
    expect(await outboxIds()).toEqual([mismatchMail]);
  });

  it('deletes the outbox rows of the anonymised orders (any status, owner mail too) and of the searched email', async () => {
    const created = await makeOrder();
    const unrelatedOrder = await makeOrder({ email: 'ron@example.test', phone: PHONE_B });
    const gone = [
      await makeEmail({
        kind: 'order-confirmation',
        to: 'dana@example.test',
        orderId: created.orderId,
        status: 'sent',
      }),
      await makeEmail({
        kind: 'order-cancelled',
        to: 'dana@example.test',
        orderId: created.orderId,
        status: 'failed',
      }),
      await makeEmail({ kind: 'new-order', to: 'owner@example.test', orderId: created.orderId }),
      // Matched by the searched email only (no order): a contact message and a stray row.
      await makeEmail({
        kind: 'contact-message',
        to: 'owner@example.test',
        replyTo: 'DANA@example.test',
      }),
      await makeEmail({ kind: 'order-confirmation', to: 'Dana@example.test' }),
    ];
    const kept = [
      await makeEmail({
        kind: 'order-confirmation',
        to: 'ron@example.test',
        orderId: unrelatedOrder.orderId,
      }),
      await makeEmail({ kind: 'contact-message', to: 'owner@example.test', replyTo: 'x@y.test' }),
    ];
    expect(gone).toHaveLength(5);
    await anonymizePerson(actor, {
      q: 'dana@example.test',
      orderIds: [created.orderId],
      confirm: true,
    });
    expect((await outboxIds()).sort()).toEqual(kept.sort());
  });

  it('a phone search touches only the rows of the orders it anonymises', async () => {
    const x = await makeOrder({ email: 'x@example.test', phone: PHONE_A });
    const y = await makeOrder({ email: 'y@example.test', phone: PHONE_A });
    const notShown = await makeOrder({ email: 'y@example.test', phone: PHONE_B });
    const own = [
      await makeEmail({ kind: 'order-confirmation', to: 'x@example.test', orderId: x.orderId }),
      await makeEmail({ kind: 'order-confirmation', to: 'y@example.test', orderId: y.orderId }),
    ];
    const pendingToY = await makeEmail({
      kind: 'order-confirmation',
      to: 'y@example.test',
      orderId: notShown.orderId,
      status: 'pending',
    });
    expect(own).toHaveLength(2);
    const result = await anonymizePerson(actor, {
      q: '050-234-5678',
      orderIds: [x.orderId, y.orderId],
      confirm: true,
    });
    expect(dataOf(result)).toMatchObject({ count: 2 });
    expect(await outboxIds()).toEqual([pendingToY]);
    expect((await getOrder(notShown.orderId)).anonymizedAt).toBeNull();
    expect((await getOrder(notShown.orderId)).customerEmail).toBe('y@example.test');
  });

  it('skips and counts orderIds that do not match q, and anonymises nothing for them', async () => {
    const mine = await makeOrder();
    const other = await makeOrder({ email: 'ron@example.test', phone: PHONE_B });
    const result = await anonymizePerson(actor, {
      q: 'dana@example.test',
      orderIds: [mine.orderId, other.orderId, '00000000-0000-4000-8000-000000000000'],
      confirm: true,
    });
    expect(dataOf(result)).toEqual({ count: 1, skipped: 2, keptCheckouts: 0 });
    expect((await getOrder(other.orderId)).anonymizedAt).toBeNull();
  });

  it('only the orders shown are touched: a newer order of the same person stays', async () => {
    const shown = await makeOrder();
    const arrivedLater = await makeOrder();
    const result = await anonymizePerson(actor, {
      q: 'dana@example.test',
      orderIds: [shown.orderId],
      confirm: true,
    });
    expect(dataOf(result)).toMatchObject({ count: 1, skipped: 0 });
    expect((await getOrder(arrivedLater.orderId)).anonymizedAt).toBeNull();
  });

  it('with no orders but stored emails it deletes the emails', async () => {
    const mail = await makeEmail({
      kind: 'contact-message',
      to: 'owner@example.test',
      replyTo: 'visitor@example.test',
    });
    expect(mail).not.toBe('');
    const result = await anonymizePerson(actor, {
      q: 'visitor@example.test',
      orderIds: [],
      confirm: true,
    });
    expect(dataOf(result)).toEqual({ count: 0, skipped: 0, keptCheckouts: 0 });
    expect(await outboxIds()).toEqual([]);
    expect((await activity()).map((r) => r.action)).toEqual(['customer.anonymized']);
  });

  it('a second run changes nothing', async () => {
    const created = await makeOrder();
    await makeEmail({
      kind: 'order-confirmation',
      to: 'dana@example.test',
      orderId: created.orderId,
    });
    const ref = { q: 'dana@example.test', orderIds: [created.orderId], confirm: true as const };
    await anonymizePerson(actor, ref);
    const snapshot = JSON.stringify([
      await getOrder(created.orderId),
      await testDb.db.select().from(orderEvent),
      await outboxIds(),
    ]);
    const again = await anonymizePerson(actor, ref);
    expect(dataOf(again)).toEqual({ count: 0, skipped: 1, keptCheckouts: 0 });
    expect(
      JSON.stringify([
        await getOrder(created.orderId),
        await testDb.db.select().from(orderEvent),
        await outboxIds(),
      ]),
    ).toBe(snapshot);
    // The erase is always logged, so the second run adds a `{count: 0}` row.
    const rows = (await activity()).filter((r) => r.action === 'customer.anonymized');
    expect(rows).toHaveLength(2);
    expect(rows[1]?.details).toEqual({ count: 0 });
  });

  it('rejects an invalid q without writing', async () => {
    expect(await anonymizePerson(actor, { q: 'nope', orderIds: [], confirm: true })).toEqual({
      ok: false,
      fieldErrors: { q: 'admin.customers.errors.query' },
    });
    expect(await activity()).toEqual([]);
  });
});
