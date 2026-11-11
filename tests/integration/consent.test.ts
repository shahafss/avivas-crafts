// 003 US6 (tasks.md T040; contracts/server-actions.md > saveConsent; contracts/consent.md; user
// decision Q2): saving a consent choice, the `ac_consent` cookie, and what a changed Cookie
// Policy version does to a stored choice.
//
// API of the implementation (T042), from '@/server/consent/consent':
//   saveConsent(input: unknown, ctx: { ip: string | null; now?: Date })
//     -> ActionResult<{ choices: Record<string, boolean> }>
//   consentState(cookieValue, cookiesVersion, categoryIds)
//     -> { choices, needsChoice, effectiveChoices }
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { setCookieCalls, setRequestCookie } from '../setup/request-state';
import { consentRecord, contentPage } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import {
  consentState,
  expireOptionalCookiesIfUndecided,
  parseConsentCookie,
  saveConsent,
  serializeConsentCookie,
} from '@/server/consent/consent';

let testDb: TestDbHandle;
let testCategory: string | undefined;

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
vi.mock('@/server/env', () => ({
  getEnv: () => ({
    APP_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3101',
    SECRET_HMAC_KEY: Buffer.from('consent-test-hmac-key-0123456789abcdef-xx').toString('base64'),
    TRUSTED_PROXY_HOPS: 0,
    CONSENT_TEST_CATEGORY: testCategory,
  }),
}));
vi.mock('@/server/security/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  testCategory = undefined;
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
});

const NOW = new Date('2026-11-09T10:20:00Z');
const ctx = { ip: '203.0.113.7', now: NOW };
const TWELVE_MONTHS = 365 * 24 * 60 * 60;

const records = () => testDb.db.select().from(consentRecord);
const consentCookie = () => setCookieCalls.find((call) => call.name === 'ac_consent');
const testCookieExpiry = () => setCookieCalls.find((call) => call.name === 'ac_test_optional');

async function cookiesVersion(): Promise<number> {
  const [row] = await testDb.db
    .select({ version: contentPage.version })
    .from(contentPage)
    .where(eq(contentPage.slug, 'cookies'));
  return row?.version ?? 0;
}

describe('saveConsent: consent not required (launch)', () => {
  it('answers consent.errors.unavailable and writes nothing', async () => {
    const result = await saveConsent({ choices: { analytics: true } }, ctx);
    expect(result).toEqual({ ok: false, formError: 'consent.errors.unavailable' });
    expect(await records()).toHaveLength(0);
    expect(setCookieCalls).toHaveLength(0);
  });
});

describe('saveConsent: with CONSENT_TEST_CATEGORY=analytics', () => {
  beforeEach(() => {
    testCategory = 'analytics';
  });

  it('accepting inserts a record (choices + cookies page version only) and sets ac_consent', async () => {
    const result = await saveConsent({ choices: { analytics: true } }, ctx);
    expect(result).toEqual({ ok: true, data: { choices: { analytics: true } } });

    const rows = await records();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      choices: { analytics: true },
      policyVersion: await cookiesVersion(),
    });
    // No other data is stored: exactly these columns.
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
      ['choices', 'decidedAt', 'id', 'policyVersion'].sort(),
    );

    const cookie = consentCookie();
    expect(cookie).toBeDefined();
    expect(cookie?.options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: TWELVE_MONTHS,
      secure: false,
    });
    expect(parseConsentCookie(cookie?.value)).toEqual({
      recordId: rows[0]?.id,
      policyVersion: await cookiesVersion(),
      choices: { analytics: true },
    });
    // Accepting does not expire the optional cookie.
    expect(testCookieExpiry()).toBeUndefined();
  });

  it('rejecting inserts a new record and expires ac_test_optional', async () => {
    await saveConsent({ choices: { analytics: true } }, ctx);
    setCookieCalls.length = 0;
    const result = await saveConsent({ choices: { analytics: false } }, ctx);
    expect(result).toEqual({ ok: true, data: { choices: { analytics: false } } });

    const rows = await records();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.choices)).toContainEqual({ analytics: false });
    expect(parseConsentCookie(consentCookie()?.value)?.choices).toEqual({ analytics: false });
    expect(testCookieExpiry()?.options).toMatchObject({ path: '/', maxAge: 0 });
  });

  it('ignores unknown keys and counts a missing category as false', async () => {
    const result = await saveConsent({ choices: { marketing: true, bogus: true } }, ctx);
    expect(result).toEqual({ ok: true, data: { choices: { analytics: false } } });
    expect((await records())[0]?.choices).toEqual({ analytics: false });
    expect(testCookieExpiry()?.options).toMatchObject({ maxAge: 0 });
  });

  it.each([
    ['null', null],
    ['no choices', {}],
    ['choices that are not an object', { choices: 'yes' }],
    ['choices that are an array', { choices: [true] }],
    ['a non-boolean value', { choices: { analytics: 'yes' } }],
  ])('refuses %s without writing anything', async (_label, input) => {
    const result = await saveConsent(input, ctx);
    expect(result.ok).toBe(false);
    expect(await records()).toHaveLength(0);
    expect(setCookieCalls).toHaveLength(0);
  });

  it('over the limit (30 per 60 s) the 31st insert is skipped but the choice still takes effect', async () => {
    for (let i = 0; i < 30; i += 1) {
      await saveConsent({ choices: { analytics: true } }, ctx);
    }
    expect(await records()).toHaveLength(30);

    setCookieCalls.length = 0;
    const result = await saveConsent({ choices: { analytics: false } }, ctx);
    expect(result).toEqual({ ok: true, data: { choices: { analytics: false } } });
    expect(await records()).toHaveLength(30);
    expect(parseConsentCookie(consentCookie()?.value)?.choices).toEqual({ analytics: false });
    expect(testCookieExpiry()?.options).toMatchObject({ maxAge: 0 });
  });

  it('counts per visitor: another IP is not limited by the first', async () => {
    for (let i = 0; i < 31; i += 1) {
      await saveConsent({ choices: { analytics: true } }, ctx);
    }
    await saveConsent({ choices: { analytics: true } }, { ...ctx, ip: '198.51.100.9' });
    expect(await records()).toHaveLength(31);
  });
});

describe('expireOptionalCookiesIfUndecided (Q2)', () => {
  const ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
  const value = (version: number) =>
    serializeConsentCookie({ recordId: ID, policyVersion: version, choices: { analytics: true } });

  it('does nothing at launch', async () => {
    await expireOptionalCookiesIfUndecided();
    expect(setCookieCalls).toHaveLength(0);
  });

  describe('with the test category', () => {
    beforeEach(() => {
      testCategory = 'analytics';
    });

    it('expires the optional cookie when there is no choice', async () => {
      await expireOptionalCookiesIfUndecided();
      expect(testCookieExpiry()?.options).toMatchObject({ path: '/', maxAge: 0 });
    });

    it('expires it when the choice was made under an older Cookie Policy version', async () => {
      await testDb.db
        .update(contentPage)
        .set({ version: 2 })
        .where(eq(contentPage.slug, 'cookies'));
      expect(await cookiesVersion()).toBe(2);
      setRequestCookie('ac_consent', value(1));
      await expireOptionalCookiesIfUndecided();
      expect(testCookieExpiry()?.options).toMatchObject({ maxAge: 0 });
      // The old choice itself is kept: it pre-sets the dialog's switches.
      expect(consentCookie()).toBeUndefined();
    });

    it('leaves everything alone when the choice is current', async () => {
      setRequestCookie('ac_consent', value(await cookiesVersion()));
      await expireOptionalCookiesIfUndecided();
      expect(setCookieCalls).toHaveLength(0);
    });
  });
});

describe('consentState', () => {
  const ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
  const cookie = (version: number, choices: Record<string, boolean>) =>
    serializeConsentCookie({ recordId: ID, policyVersion: version, choices });

  it('has to ask when there is no (valid) cookie; nothing is effective', () => {
    for (const value of [undefined, '', 'garbage']) {
      expect(consentState(value, 2, ['analytics'])).toEqual({
        choices: {},
        needsChoice: true,
        effectiveChoices: { analytics: false },
      });
    }
  });

  it('uses the cookie choices when its policy version is the current one', () => {
    expect(consentState(cookie(2, { analytics: true }), 2, ['analytics'])).toEqual({
      choices: { analytics: true },
      needsChoice: false,
      effectiveChoices: { analytics: true },
    });
    expect(consentState(cookie(2, { analytics: false }), 2, ['analytics'])).toMatchObject({
      needsChoice: false,
      effectiveChoices: { analytics: false },
    });
  });

  it('after a Cookie Policy change: asks again, nothing optional is effective, old choices pre-set the switches (Q2)', () => {
    expect(consentState(cookie(2, { analytics: true }), 3, ['analytics'])).toEqual({
      choices: { analytics: true },
      needsChoice: true,
      effectiveChoices: { analytics: false },
    });
  });

  it('a category missing from the cookie is not accepted', () => {
    expect(consentState(cookie(2, {}), 2, ['analytics'])).toMatchObject({
      needsChoice: false,
      effectiveChoices: { analytics: false },
    });
  });
});
