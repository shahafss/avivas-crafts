// 003 US2 (tasks.md T019; contracts/server-actions.md > submitContact; contracts/emails.md;
// research R13; user decision Q3): the contact form's data layer.
//
// API of the implementation (T021):
//   submitContact(input, ctx: { ip: string | null; now?: Date }) from '@/server/contact/submit'
//     -> { ok: true, data: undefined }
//      | { ok: false, formError?: MessageKey, fieldErrors?: Record<string, MessageKey>,
//          retryAfterMinutes?: number }
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { issueFormToken } from '@/server/checkout/form-token';
import { submitContact } from '@/server/contact/submit';
import { emailOutbox, rateLimitBucket, shopSettings } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import type { EmailDriver, EmailMessage } from '@/server/email/drivers/types';
import { drainOutbox } from '@/server/email/sender';

let testDb: TestDbHandle;

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
vi.mock('@/server/env', () => ({
  getEnv: () => ({
    APP_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3100',
    SECRET_HMAC_KEY: Buffer.from('contact-test-hmac-key-0123456789abcdef-xx').toString('base64'),
    TRUSTED_PROXY_HOPS: 0,
    EMAIL_DRIVER: 'outbox',
    EMAIL_FROM: 'shop@example.test',
  }),
}));
// `submitContact` kicks the outbox after commit; the test drains it by hand with a fake driver.
vi.mock('@/server/security/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/server/email/sender', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/email/sender')>()),
  kickOutbox: vi.fn(),
}));

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
  await testDb.db
    .update(shopSettings)
    .set({ notificationEmails: ['notify@example.invalid'], shopNameHe: 'היצירות של אביבה' });
});

const NOW = new Date('2026-11-09T10:20:00Z');
const ctx = { ip: '203.0.113.7', now: NOW };

function input(overrides: Record<string, unknown> = {}) {
  return {
    name: 'דנה כהן',
    email: 'dana@Example.COM',
    message: 'שלום, רציתי לשאול על כובע בצבע ורוד.',
    honeypot: '',
    formToken: issueFormToken(NOW.getTime() - 5000),
    locale: 'he',
    ...overrides,
  };
}

const rows = () =>
  testDb.db.select().from(emailOutbox).where(eq(emailOutbox.kind, 'contact-message'));
const buckets = () => testDb.db.select().from(rateLimitBucket);

describe('submitContact: bot checks', () => {
  it.each([
    ['a filled honeypot', { honeypot: 'http://spam.example' }],
    ['a token that was not issued here', { formToken: 'garbage' }],
    ['a form that is too young', { formToken: issueFormToken(NOW.getTime() - 1000) }],
    ['a form that is too old', { formToken: issueFormToken(NOW.getTime() - 3 * 60 * 60 * 1000) }],
  ])('%s -> contact.errors.expired, nothing queued, nothing counted', async (_label, overrides) => {
    const result = await submitContact(input(overrides), ctx);
    expect(result).toMatchObject({ ok: false, formError: 'contact.errors.expired' });
    expect(await rows()).toHaveLength(0);
    expect(await buckets()).toHaveLength(0);
  });

  it('checks the bot signals before the fields', async () => {
    const result = await submitContact(input({ honeypot: 'x', name: '', email: 'bad' }), ctx);
    expect(result).toMatchObject({ ok: false, formError: 'contact.errors.expired' });
    expect((result as { fieldErrors?: unknown }).fieldErrors).toBeUndefined();
  });
});

describe('submitContact: fields', () => {
  it('reports every bad field at once', async () => {
    const result = await submitContact(
      input({ name: ' a ', email: 'nope', message: ' short ' }),
      ctx,
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        name: 'contact.errors.name',
        email: 'contact.errors.email',
        message: 'contact.errors.message_short',
      },
    });
    expect(await rows()).toHaveLength(0);
  });

  it('trims the name and the message before measuring them', async () => {
    expect(
      await submitContact(input({ name: '  ab  ', message: `  ${'x'.repeat(10)}  ` }), ctx),
    ).toMatchObject({
      ok: true,
    });
    expect(await submitContact(input({ name: ' a ' }), ctx)).toMatchObject({
      ok: false,
      fieldErrors: { name: 'contact.errors.name' },
    });
  });

  it('limits the name to 100, the message to 5,000 and the email to 254 characters', async () => {
    const tooLong = await submitContact(
      input({
        name: 'n'.repeat(101),
        message: 'm'.repeat(5001),
        email: `${'e'.repeat(250)}@example.com`,
      }),
      ctx,
    );
    expect(tooLong).toEqual({
      ok: false,
      fieldErrors: {
        name: 'contact.errors.name',
        email: 'contact.errors.email',
        message: 'contact.errors.message_long',
      },
    });
    expect(
      await submitContact(input({ name: 'n'.repeat(100), message: 'm'.repeat(5000) }), ctx),
    ).toMatchObject({ ok: true });
  });

  it('none of the refusals counts toward the limit (Q3)', async () => {
    const refusals = [
      { honeypot: 'x' },
      { formToken: 'garbage' },
      { name: 'x' },
      { email: 'bad' },
      { message: 'short' },
      { message: 'm'.repeat(5001) },
    ];
    for (const overrides of refusals) {
      expect(await submitContact(input(overrides), ctx)).toMatchObject({ ok: false });
    }
    expect(await buckets()).toHaveLength(0);
    // All five valid messages of the hour still go through.
    for (let i = 0; i < 5; i += 1) {
      expect(await submitContact(input(), ctx)).toMatchObject({ ok: true });
    }
    expect(await rows()).toHaveLength(5);
  });
});

describe('submitContact: rate limit (5 sent messages per clock hour)', () => {
  it('sends 5, refuses the 6th with the minutes left in the hour, queues nothing for it', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect(await submitContact(input(), ctx)).toEqual({ ok: true, data: undefined });
    }
    expect(await rows()).toHaveLength(5);

    const sixth = await submitContact(input(), ctx);
    // 10:20 -> the window ends at 11:00: 40 minutes.
    expect(sixth).toEqual({
      ok: false,
      formError: 'contact.errors.rate_limited',
      retryAfterMinutes: 40,
    });
    expect(await rows()).toHaveLength(5);
  });

  it('rounds the wait up to whole minutes', async () => {
    for (let i = 0; i < 5; i += 1) await submitContact(input(), ctx);
    const late = new Date('2026-11-09T10:59:30Z');
    const result = await submitContact(
      input({ formToken: issueFormToken(late.getTime() - 5000) }),
      {
        ...ctx,
        now: late,
      },
    );
    expect(result).toMatchObject({ ok: false, retryAfterMinutes: 1 });
  });

  it('accepts again in the next clock hour', async () => {
    for (let i = 0; i < 6; i += 1) await submitContact(input(), ctx);
    const next = new Date('2026-11-09T11:00:01Z');
    const result = await submitContact(
      input({ formToken: issueFormToken(next.getTime() - 5000) }),
      {
        ...ctx,
        now: next,
      },
    );
    expect(result).toEqual({ ok: true, data: undefined });
    expect(await rows()).toHaveLength(6);
  });

  it('counts each visitor (IP) on its own', async () => {
    for (let i = 0; i < 5; i += 1) await submitContact(input(), ctx);
    expect(await submitContact(input(), { ...ctx, ip: '198.51.100.9' })).toMatchObject({
      ok: true,
    });
  });
});

describe('submitContact: the queued email', () => {
  it('queues one contact-message row per notification address, reply-to the visitor', async () => {
    await testDb.db
      .update(shopSettings)
      .set({
        notificationEmails: ['Owner@Example.test', 'second@example.test', 'owner@example.test'],
      });
    expect(await submitContact(input(), ctx)).toMatchObject({ ok: true });

    const queued = await rows();
    expect(queued.map((row) => row.toAddress).sort()).toEqual([
      'owner@example.test',
      'second@example.test',
    ]);
    for (const row of queued) {
      expect(row).toMatchObject({
        kind: 'contact-message',
        locale: 'he',
        replyTo: 'dana@example.com',
        status: 'pending',
        orderId: null,
      });
      expect(row.dedupeKey).toMatch(/^contact:[0-9a-f-]{36}:\d$/);
    }
    // One message, one uuid: the rows share it and differ by index.
    expect(new Set(queued.map((row) => row.dedupeKey.split(':')[1])).size).toBe(1);
    expect(new Set(queued.map((row) => row.dedupeKey)).size).toBe(2);
  });

  it('has a subject with the shop name and neither the visitor name nor email', async () => {
    await submitContact(input({ name: 'SentinelName', email: 'sentinel@example.com' }), ctx);
    const [row] = await rows();
    expect(row?.subject).toBe('הודעה חדשה מהאתר · היצירות של אביבה');
    expect(row?.subject).not.toContain('SentinelName');
    expect(row?.subject).not.toContain('sentinel');
  });

  it('escapes the message in the HTML and keeps line breaks; the text part is plain', async () => {
    const message = '<script>alert("x")</script> & more\nsecond line';
    await submitContact(input({ name: '<b>Eve</b>', message }), ctx);
    const [row] = await rows();
    expect(row?.html).not.toContain('<script>');
    expect(row?.html).not.toContain('<b>Eve</b>');
    expect(row?.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more');
    expect(row?.html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
    expect(row?.html).toMatch(/more<br\s*\/?>\s*second line/);
    expect(row?.html).toContain('lang="he"');
    expect(row?.html).toContain('dana@example.com');
    expect(row?.html).not.toMatch(/href="mailto:/);
    expect(row?.textBody).toContain(message);
    expect(row?.textBody).toContain('dana@example.com');
  });

  it('shows the site language the visitor used', async () => {
    await submitContact(input({ locale: 'en' }), ctx);
    const [row] = await rows();
    expect(row?.locale).toBe('he');
    expect(row?.textBody).toContain('English');
  });

  it('after sending, the rows are sent with empty bodies and no reply-to (FR-015)', async () => {
    await testDb.db
      .update(shopSettings)
      .set({ notificationEmails: ['one@example.test', 'two@example.test'] });
    await submitContact(input(), ctx);

    const messages: EmailMessage[] = [];
    const driver: EmailDriver = {
      keepBodies: false,
      send: (message) => {
        messages.push(message);
        return Promise.resolve();
      },
    };
    expect(await drainOutbox({ driver })).toBe(2);
    expect(messages.map((m) => m.replyTo)).toEqual(['dana@example.com', 'dana@example.com']);
    expect(messages[0]?.html).toContain('דנה כהן');

    const sent = await rows();
    expect(sent).toHaveLength(2);
    for (const row of sent) {
      expect(row).toMatchObject({ status: 'sent', html: '', textBody: '', replyTo: null });
    }
  });
});
