// 003 US7 (tasks.md T044; research R11, FR-026, FR-027): the four daily retention tasks. Each cut-off
// comes from the `now` the task is given; a second run finds nothing; nothing here deletes an
// unfinished checkout (SC-007).
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import {
  adminActivity,
  consentRecord,
  contentPageVersion,
  emailOutbox,
  orderEvent,
  orders,
  pendingCheckout,
  shippingZone,
} from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { dailyTasks } from '@/server/jobs/daily-maintenance';
import {
  anonymizeOldOrders,
  deleteOldActivity,
  deleteOldConsent,
  deleteOldOutbox,
} from '@/server/privacy/retention';

let testDb: TestDbHandle;
let zoneId = '';

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
  const [zone] = await testDb.db.select({ id: shippingZone.id }).from(shippingZone).limit(1);
  zoneId = zone?.id ?? '';
});

const NOW = new Date('2026-11-11T03:00:00Z');
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const at = (iso: string) => new Date(iso);

async function makeOrder(createdAt: Date) {
  const [row] = await testDb.db
    .insert(orders)
    .values({
      publicTokenHash: createHash('sha256').update(randomBytes(16)).digest(),
      publicTokenExpiresAt: new Date(NOW.getTime() + 30 * DAY),
      locale: 'he',
      zoneId,
      currency: 'ILS',
      customerName: 'דנה כהן',
      customerPhone: '+972502345678',
      customerEmail: 'dana@example.test',
      deliveryMethod: 'shipping',
      addressCountry: 'IL',
      addressCity: 'חיפה',
      addressLine1: 'הרצל 5',
      addressLine2: 'דירה 3',
      addressPostalCode: '3100000',
      note: 'הערה',
      trackingNumber: 'RR123456789IL',
      pickupNote: 'לאסוף בשער',
      paymentMethod: 'offline',
      subtotalMinor: 10000,
      totalMinor: 10000,
      marketingOptIn: true,
      marketingOptInAt: createdAt,
      marketingWithdrawnAt: createdAt,
      termsAcceptedAt: createdAt,
      termsVersion: 1,
      privacyVersion: 1,
      status: 'completed',
      createdAt,
    })
    .returning({ id: orders.id });
  return row?.id ?? '';
}

let seq = 0;
async function makeEmail(
  values: Partial<typeof emailOutbox.$inferInsert> & { orderId?: string | null },
) {
  seq += 1;
  const [row] = await testDb.db
    .insert(emailOutbox)
    .values({
      kind: 'order-confirmation',
      toAddress: 'dana@example.test',
      locale: 'he',
      subject: 'נושא',
      html: '<p>x</p>',
      textBody: 'x',
      dedupeKey: `retention:${String(seq)}`,
      ...values,
    })
    .returning({ id: emailOutbox.id });
  return row?.id ?? '';
}

const outboxIds = async () =>
  (await testDb.db.select({ id: emailOutbox.id }).from(emailOutbox)).map((r) => r.id);
const getOrder = async (id: string) => {
  const [row] = await testDb.db.select().from(orders).where(eq(orders.id, id));
  if (!row) throw new Error('no order');
  return row;
};
const activity = () => testDb.db.select().from(adminActivity);

describe('anonymize-old-orders', () => {
  it('is named and registered as a daily task', () => {
    expect(anonymizeOldOrders.name).toBe('anonymize-old-orders');
    expect(deleteOldActivity.name).toBe('delete-old-activity');
    expect(deleteOldConsent.name).toBe('delete-old-consent');
    expect(deleteOldOutbox.name).toBe('delete-old-outbox');
    for (const task of [anonymizeOldOrders, deleteOldActivity, deleteOldConsent, deleteOldOutbox]) {
      expect(dailyTasks).toContain(task);
    }
  });

  it('anonymises an order 7 years + 1 day old, deletes its outbox rows, and leaves a younger one', async () => {
    const old = await makeOrder(at('2019-11-10T02:00:00Z'));
    const young = await makeOrder(at('2019-12-11T03:00:00Z')); // 6 years 11 months old
    const oldMail = await makeEmail({
      orderId: old,
      kind: 'new-order',
      toAddress: 'owner@example.test',
    });
    const youngMail = await makeEmail({ orderId: young });

    const summary = await anonymizeOldOrders.run(testDb.db, NOW);
    expect(summary).toBe('anonymised 1');

    expect(await getOrder(old)).toMatchObject({
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
      marketingOptIn: false,
      marketingOptInAt: null,
      marketingWithdrawnAt: null,
      addressCountry: 'IL',
      totalMinor: 10000,
      status: 'completed',
    });
    expect((await getOrder(old)).anonymizedAt).toBeInstanceOf(Date);
    expect((await getOrder(young)).anonymizedAt).toBeNull();
    expect((await getOrder(young)).customerEmail).toBe('dana@example.test');

    const events = (await testDb.db.select().from(orderEvent)).filter(
      (e) => e.kind === 'anonymized',
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ orderId: old, adminId: null, data: { system: true } });

    expect(await outboxIds()).toEqual([youngMail]);
    expect(await outboxIds()).not.toContain(oldMail);

    const rows = await activity();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorKind: 'system',
      adminId: null,
      actorLabel: null,
      action: 'customer.anonymized',
      details: { count: 1 },
    });
    expect(JSON.stringify(rows[0])).not.toMatch(/dana|נמחק/);
  });

  it('uses calendar years, not 7 x 365 days: one hour either side of the calendar cut-off', async () => {
    // NOW - 7 calendar years = 2019-11-11T03:00Z. Two leap days (2020, 2024) lie in between, so a
    // 7 x 365-day cut-off would sit on 2019-11-13T03:00Z and also anonymise the "under" order (created 2019-11-11T04:00Z).
    const over = await makeOrder(at('2019-11-11T02:00:00Z'));
    const under = await makeOrder(at('2019-11-11T04:00:00Z'));

    expect(await anonymizeOldOrders.run(testDb.db, NOW)).toBe('anonymised 1');
    expect((await getOrder(over)).anonymizedAt).toBeInstanceOf(Date);
    expect((await getOrder(under)).anonymizedAt).toBeNull();
    expect((await getOrder(under)).customerEmail).toBe('dana@example.test');
  });

  it('a second run changes nothing and writes no activity row', async () => {
    await makeOrder(at('2019-11-10T02:00:00Z'));
    await anonymizeOldOrders.run(testDb.db, NOW);
    const before = await testDb.db.select().from(orderEvent);
    expect(await anonymizeOldOrders.run(testDb.db, NOW)).toBe('anonymised 0');
    expect(await testDb.db.select().from(orderEvent)).toHaveLength(before.length);
    expect(await activity()).toHaveLength(1);
  });

  it('writes no activity row when nothing is old enough', async () => {
    await makeOrder(daysAgo(30));
    expect(await anonymizeOldOrders.run(testDb.db, NOW)).toBe('anonymised 0');
    expect(await activity()).toEqual([]);
  });

  it('never deletes an unfinished checkout, however old', async () => {
    const [checkout] = await testDb.db
      .insert(pendingCheckout)
      .values({
        resumeTokenHash: randomBytes(16),
        locale: 'he',
        zoneId,
        currency: 'ILS',
        customerName: 'דנה כהן',
        customerPhone: '+972502345678',
        customerEmail: 'dana@example.test',
        deliveryMethod: 'pickup',
        termsAcceptedAt: at('2019-01-01T00:00:00Z'),
        termsVersion: 1,
        privacyVersion: 1,
        subtotalMinor: 10000,
        totalMinor: 10000,
        provider: 'fake',
        state: 'awaiting_provider',
        expiresAt: at('2019-01-03T00:00:00Z'),
        createdAt: at('2019-01-01T00:00:00Z'),
      })
      .returning({ id: pendingCheckout.id });
    await makeOrder(at('2019-01-01T00:00:00Z'));
    await anonymizeOldOrders.run(testDb.db, NOW);
    const rows = await testDb.db.select().from(pendingCheckout);
    expect(rows.map((r) => r.id)).toEqual([checkout?.id]);
    expect(rows[0]?.customerEmail).toBe('dana@example.test');
  });

  it('handles at most 500 orders per run, oldest first; the next run takes the rest', async () => {
    const values = Array.from({ length: 502 }, (_, i) => ({
      publicTokenHash: createHash('sha256')
        .update(`token-${String(i)}`)
        .digest(),
      publicTokenExpiresAt: new Date(NOW.getTime() + 30 * DAY),
      locale: 'he' as const,
      zoneId,
      currency: 'ILS' as const,
      customerName: 'דנה כהן',
      customerPhone: '+972502345678',
      customerEmail: 'dana@example.test',
      deliveryMethod: 'pickup' as const,
      paymentMethod: 'offline' as const,
      subtotalMinor: 100,
      totalMinor: 100,
      termsAcceptedAt: new Date('2018-01-01T00:00:00Z'),
      termsVersion: 1,
      privacyVersion: 1,
      createdAt: new Date(Date.UTC(2018, 0, 1) + i * 1000),
    }));
    await testDb.db.insert(orders).values(values);

    expect(await anonymizeOldOrders.run(testDb.db, NOW)).toBe('anonymised 500');
    const left = (await testDb.db.select().from(orders)).filter((o) => o.anonymizedAt === null);
    expect(left).toHaveLength(2);
    expect(left.map((o) => o.createdAt.getTime()).sort()).toEqual([
      Date.UTC(2018, 0, 1) + 500_000,
      Date.UTC(2018, 0, 1) + 501_000,
    ]);
    expect(await anonymizeOldOrders.run(testDb.db, NOW)).toBe('anonymised 2');
    expect(await activity()).toHaveLength(2);
  });
});

describe('delete-old-activity and delete-old-consent', () => {
  it('deletes admin_activity rows older than 2 years, keeps younger ones, and is idempotent', async () => {
    await testDb.db.insert(adminActivity).values([
      { at: at('2024-11-10T00:00:00Z'), actorKind: 'system', action: 'old.one' },
      { at: at('2024-11-12T00:00:00Z'), actorKind: 'system', action: 'young.one' },
    ]);
    expect(await deleteOldActivity.run(testDb.db, NOW)).toBe('deleted 1');
    expect((await activity()).map((r) => r.action)).toEqual(['young.one']);
    expect(await deleteOldActivity.run(testDb.db, NOW)).toBe('deleted 0');
    expect(await activity()).toHaveLength(1);
  });

  it('deletes consent_record rows older than 2 years, keeps younger ones, and is idempotent', async () => {
    await testDb.db.insert(consentRecord).values([
      { policyVersion: 1, decidedAt: at('2024-11-10T00:00:00Z') },
      { policyVersion: 2, decidedAt: at('2024-11-12T00:00:00Z') },
    ]);
    expect(await deleteOldConsent.run(testDb.db, NOW)).toBe('deleted 1');
    const rows = await testDb.db.select().from(consentRecord);
    expect(rows.map((r) => r.policyVersion)).toEqual([2]);
    expect(await deleteOldConsent.run(testDb.db, NOW)).toBe('deleted 0');
  });

  it('leaves content_page_version rows alone', async () => {
    await testDb.db.insert(contentPageVersion).values({
      slug: 'privacy',
      version: 99,
      titleHe: 'פרטיות',
      bodyHe: 'גוף',
      createdAt: at('2015-01-01T00:00:00Z'),
    });
    await anonymizeOldOrders.run(testDb.db, NOW);
    await deleteOldActivity.run(testDb.db, NOW);
    await deleteOldConsent.run(testDb.db, NOW);
    await deleteOldOutbox.run(testDb.db, NOW);
    const rows = await testDb.db.select().from(contentPageVersion);
    expect(rows.some((r) => r.version === 99)).toBe(true);
  });
});

describe('delete-old-outbox', () => {
  it('deletes sent rows 31 days after sending and keeps those sent 29 days ago', async () => {
    const old = await makeEmail({ status: 'sent', sentAt: daysAgo(31), createdAt: daysAgo(31) });
    const young = await makeEmail({ status: 'sent', sentAt: daysAgo(29), createdAt: daysAgo(40) });
    expect(await deleteOldOutbox.run(testDb.db, NOW)).toBe('deleted 1');
    expect(await outboxIds()).toEqual([young]);
    expect(await outboxIds()).not.toContain(old);
    expect(await deleteOldOutbox.run(testDb.db, NOW)).toBe('deleted 0');
  });

  it('judges failed rows by next_attempt_at (the final failure), whatever their created_at', async () => {
    const old = await makeEmail({
      status: 'failed',
      nextAttemptAt: daysAgo(31),
      createdAt: daysAgo(32),
    });
    const youngLateFailure = await makeEmail({
      status: 'failed',
      nextAttemptAt: daysAgo(29),
      createdAt: daysAgo(90),
    });
    const oldCreatedRecentFailure = await makeEmail({
      status: 'failed',
      nextAttemptAt: daysAgo(1),
      createdAt: daysAgo(200),
    });
    await deleteOldOutbox.run(testDb.db, NOW);
    const left = await outboxIds();
    expect(left.sort()).toEqual([youngLateFailure, oldCreatedRecentFailure].sort());
    expect(left).not.toContain(old);
  });

  it('never deletes pending or sending rows', async () => {
    const pending = await makeEmail({
      status: 'pending',
      nextAttemptAt: daysAgo(100),
      createdAt: daysAgo(100),
    });
    const sending = await makeEmail({
      status: 'sending',
      nextAttemptAt: daysAgo(100),
      createdAt: daysAgo(100),
    });
    expect(await deleteOldOutbox.run(testDb.db, NOW)).toBe('deleted 0');
    expect((await outboxIds()).sort()).toEqual([pending, sending].sort());
  });
});
