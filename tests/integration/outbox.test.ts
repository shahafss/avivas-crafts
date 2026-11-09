import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { emailOutbox, shopSettings } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { createOutboxOnlyDriver } from '@/server/email/drivers/outbox-only';
import type { EmailDriver, EmailMessage } from '@/server/email/drivers/types';
import { enqueueEmail, type EnqueueEmail } from '@/server/email/outbox';
import { backoffMinutes, drainOutbox } from '@/server/email/sender';
import { getEnv } from '@/server/env';

let testDb: TestDbHandle;

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
const envState = vi.hoisted(() => ({ APP_ENV: 'test', EMAIL_DRIVER: 'outbox' }));
vi.mock('@/server/env', () => ({
  getEnv: () => ({ EMAIL_FROM: 'shop@example.test', RESEND_API_KEY: 'test-key', ...envState }),
}));
const sendSpy = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendSpy };
  },
}));

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(async () => {
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
});
afterAll(() => testDb.close());

const base: EnqueueEmail = {
  kind: 'order-confirmation',
  to: 'customer@example.test',
  locale: 'he',
  subject: 'Order 1001',
  html: '<p>secret body</p>',
  text: 'secret body',
  dedupeKey: 'order-confirmation:1',
};

function recordingDriver(
  options: { fail?: boolean } = {},
): EmailDriver & { messages: EmailMessage[] } {
  const messages: EmailMessage[] = [];
  return {
    keepBodies: false,
    messages,
    send: (message) => {
      messages.push(message);
      return options.fail === true ? Promise.reject(new Error('boom')) : Promise.resolve();
    },
  };
}

const allRows = () => testDb.db.select().from(emailOutbox);

describe('enqueueEmail', () => {
  it('leaves nothing behind when the transaction rolls back', async () => {
    await expect(
      testDb.db.transaction(async (tx) => {
        await enqueueEmail(tx, base);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await allRows()).toHaveLength(0);
  });

  it('ignores a duplicate dedupe_key', async () => {
    expect(await enqueueEmail(testDb.db, base)).toBe(true);
    expect(await enqueueEmail(testDb.db, { ...base, subject: 'other' })).toBe(false);
    const rows = await allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject).toBe('Order 1001');
  });
});

describe('drainOutbox', () => {
  it('does not record the outcome after losing its claim', async () => {
    await enqueueEmail(testDb.db, base);
    const taken = new Date('2030-01-01T00:00:00Z');
    const driver: EmailDriver = {
      keepBodies: false,
      send: async () => {
        // Another sender reclaims the row while this send is in flight.
        await testDb.db.update(emailOutbox).set({ lockedUntil: taken });
      },
    };
    await drainOutbox({ driver });
    const [row] = await allRows();
    expect(row).toMatchObject({
      status: 'sending',
      lockedUntil: taken,
      html: '<p>secret body</p>',
    });
    expect(row?.sentAt).toBeNull();
  });

  it('treats a send that outlives the timeout as a retryable failure', async () => {
    await enqueueEmail(testDb.db, base);
    const driver: EmailDriver = {
      keepBodies: false,
      send: () => new Promise<void>(() => undefined),
    };
    await drainOutbox({ driver, sendTimeoutMs: 20 });
    const [row] = await allRows();
    expect(row).toMatchObject({ status: 'pending', attempts: 1, html: '<p>secret body</p>' });
  });

  it('picks the driver from the environment: resend erases bodies, outbox-only keeps them outside production', async () => {
    vi.resetModules();
    sendSpy.mockResolvedValue({ data: { id: 'x' }, error: null });
    const run = async (env: { APP_ENV: string; EMAIL_DRIVER: string }, key: string) => {
      Object.assign(envState, env);
      vi.resetModules();
      const sender = await import('@/server/email/sender');
      await enqueueEmail(testDb.db, { ...base, dedupeKey: key });
      await sender.drainOutbox();
      const [row] = await testDb.db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.dedupeKey, key));
      return row;
    };
    expect(getEnv().EMAIL_FROM).toBe('shop@example.test');
    expect(await run({ APP_ENV: 'production', EMAIL_DRIVER: 'resend' }, 'r')).toMatchObject({
      status: 'sent',
      html: '',
    });
    expect(sendSpy).toHaveBeenCalledOnce();
    expect(await run({ APP_ENV: 'development', EMAIL_DRIVER: 'outbox' }, 'o1')).toMatchObject({
      status: 'sent',
      html: '<p>secret body</p>',
    });
    expect(await run({ APP_ENV: 'production', EMAIL_DRIVER: 'outbox' }, 'o2')).toMatchObject({
      status: 'sent',
      html: '',
    });
    Object.assign(envState, { APP_ENV: 'test', EMAIL_DRIVER: 'outbox' });
  });

  it('with a sending driver: marks sent, erases bodies and reply_to, keeps the subject', async () => {
    await enqueueEmail(testDb.db, {
      ...base,
      kind: 'contact-message',
      replyTo: 'visitor@example.test',
    });
    const driver = recordingDriver();
    expect(await drainOutbox({ driver })).toBe(1);

    expect(driver.messages[0]?.replyTo).toBe('visitor@example.test');
    expect(driver.messages[0]?.html).toBe('<p>secret body</p>');
    const [row] = await allRows();
    expect(row).toMatchObject({
      status: 'sent',
      html: '',
      textBody: '',
      replyTo: null,
      subject: 'Order 1001',
    });
    expect(row?.sentAt).toBeInstanceOf(Date);
  });

  it('builds From from the shop name in the email locale (Hebrew fallback), not the business name', async () => {
    await enqueueEmail(testDb.db, { ...base, dedupeKey: 'a', locale: 'he' });
    await enqueueEmail(testDb.db, { ...base, dedupeKey: 'b', locale: 'en' });
    const driver = recordingDriver();
    await drainOutbox({ driver });
    const froms = driver.messages.map((m) => m.from).sort();
    expect(froms).toEqual(
      ['"Aviva\'s Crafts" <shop@example.test>', '"היצירות של אביבה" <shop@example.test>'].sort(),
    );

    await testDb.db.update(shopSettings).set({ shopNameEn: null, shopNameHe: 'A "quoted" name' });
    await enqueueEmail(testDb.db, { ...base, dedupeKey: 'c', locale: 'en' });
    const second = recordingDriver();
    await drainOutbox({ driver: second });
    expect(second.messages[0]?.from).toBe('"A \\"quoted\\" name" <shop@example.test>');
    expect(second.messages[0]?.from).not.toContain('Business name');
  });

  it('with the outbox-only driver outside production keeps the bodies', async () => {
    await enqueueEmail(testDb.db, base);
    await drainOutbox({ driver: createOutboxOnlyDriver({ keepBodies: true }) });
    const [row] = await allRows();
    expect(row).toMatchObject({
      status: 'sent',
      html: '<p>secret body</p>',
      textBody: 'secret body',
    });
  });

  it('retries at 1, 2, 5, 10, 30, 60 minutes', async () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(backoffMinutes)).toEqual([1, 2, 5, 10, 30, 60, 60, 60]);
    await enqueueEmail(testDb.db, base);
    const driver = recordingDriver({ fail: true });
    let now = new Date();
    const intervals: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      await drainOutbox({ driver, now });
      const [row] = await allRows();
      expect(row?.status).toBe('pending');
      intervals.push(Math.round(((row?.nextAttemptAt.getTime() ?? 0) - now.getTime()) / 60_000));
      now = row?.nextAttemptAt ?? now;
    }
    expect(intervals).toEqual([1, 2, 5, 10, 30, 60]);
  });

  it('does not retry before the due time', async () => {
    await enqueueEmail(testDb.db, base);
    const driver = recordingDriver({ fail: true });
    const now = new Date();
    await drainOutbox({ driver, now });
    await drainOutbox({ driver, now: new Date(now.getTime() + 30_000) });
    expect(driver.messages).toHaveLength(1);
  });

  it('becomes failed after 24 hours and keeps its bodies', async () => {
    await enqueueEmail(testDb.db, { ...base, replyTo: 'visitor@example.test' });
    const [created] = await allRows();
    const later = new Date((created?.createdAt.getTime() ?? 0) + 24 * 60 * 60_000 + 1000);
    await drainOutbox({ driver: recordingDriver({ fail: true }), now: later });
    const [row] = await allRows();
    expect(row).toMatchObject({
      status: 'failed',
      html: '<p>secret body</p>',
      textBody: 'secret body',
      replyTo: 'visitor@example.test',
    });
    // A failed row is not picked up again.
    const driver = recordingDriver();
    await drainOutbox({ driver, now: new Date(later.getTime() + 3_600_000) });
    expect(driver.messages).toHaveLength(0);
  });

  it('claims owner new-order and security-alert rows before other due rows', async () => {
    const earlier = new Date('2026-11-08T09:00:00Z');
    const later = new Date('2026-11-08T09:05:00Z');
    await testDb.db.insert(emailOutbox).values([
      { ...rowValues('customer', 'order-confirmation'), nextAttemptAt: earlier },
      { ...rowValues('alert', 'security-alert'), nextAttemptAt: later },
      { ...rowValues('owner', 'new-order'), nextAttemptAt: later },
    ]);
    const driver = recordingDriver();
    await drainOutbox({ driver, limit: 2, now: new Date('2026-11-08T10:00:00Z') });
    expect(driver.messages.map((m) => m.to).sort()).toEqual([
      'alert@example.test',
      'owner@example.test',
    ]);
  });

  it('takes over a row whose lease expired, but not one still leased', async () => {
    const now = new Date('2026-11-08T10:00:00Z');
    await testDb.db.insert(emailOutbox).values([
      {
        ...rowValues('stale', 'order-confirmation'),
        status: 'sending',
        lockedUntil: new Date(now.getTime() - 1000),
      },
      {
        ...rowValues('busy', 'order-confirmation'),
        status: 'sending',
        lockedUntil: new Date(now.getTime() + 60_000),
      },
    ]);
    const driver = recordingDriver();
    await drainOutbox({ driver, now });
    expect(driver.messages.map((m) => m.to)).toEqual(['stale@example.test']);
    const [busy] = await testDb.db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.dedupeKey, 'busy'));
    expect(busy?.status).toBe('sending');
  });
});

function rowValues(name: string, kind: string) {
  return {
    kind,
    toAddress: `${name}@example.test`,
    locale: 'he' as const,
    subject: 'Subject',
    html: '<p>x</p>',
    textBody: 'x',
    dedupeKey: name,
  };
}
