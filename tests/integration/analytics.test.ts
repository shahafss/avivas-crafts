// 003 US5 (tasks.md T034; contracts/routes.md > POST /api/v; research R12; FR-024, FR-025): the
// cookieless page-view beacon and the aggregates behind the statistics screen.
//
// API of the implementation (T036, T038):
//   recordView(input: unknown,
//              ctx: { origin: string | null; ip: string | null; userAgent: string | null; now?: Date })
//     from '@/server/analytics/beacon' -> Promise<void> (never throws for bad input)
//   POST(request: Request) from '@/app/api/v/route' -> always 204 + Cache-Control: no-store
//   getStats(days: 7 | 30 | 90, now?: Date) from '@/server/analytics/stats'
//     -> { days, visitsPerDay: { day: 'YYYY-MM-DD'; visits: number }[] (oldest first, zero-filled),
//          topProducts: { slug; name; views }[] (max 10), topReferrers: { host; visits }[] (max 10) }
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { isoDateInIsrael } from '@/lib/format-date';
import { POST } from '@/app/api/v/route';
import { recordView } from '@/server/analytics/beacon';
import { getStats } from '@/server/analytics/stats';
import {
  analyticsDailyPage,
  analyticsDailyReferrer,
  category,
  product,
  rateLimitBucket,
} from '@/server/db/schema';

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
    SECRET_HMAC_KEY: Buffer.from('analytics-test-hmac-key-0123456789abcdef').toString('base64'),
    TRUSTED_PROXY_HOPS: 1,
    PAYPLUS_PAYMENT_HOST: 'pay.example.test',
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
  await testDb.reset();
  await testDb.db.insert(category).values({ slug: 'dolls', nameHe: 'בובות', sortOrder: 1 });
  await testDb.db.insert(product).values([
    { slug: 'doll-1', nameHe: 'בובת בד', state: 'published' },
    { slug: 'doll-draft', nameHe: 'טיוטה', state: 'draft' },
  ]);
});

const ORIGIN = 'http://localhost:3100';
const IP = '203.0.113.7';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1';
const NOW = new Date('2026-03-10T10:00:00Z'); // 12:00 in Israel

const ctx = (over: Partial<Parameters<typeof recordView>[1]> = {}) => ({
  origin: ORIGIN,
  ip: IP,
  userAgent: UA,
  now: NOW,
  ...over,
});

const pages = () => testDb.db.select().from(analyticsDailyPage);
const referrers = () => testDb.db.select().from(analyticsDailyReferrer);

describe('recordView: counting', () => {
  it('counts a view per Israel calendar day and path', async () => {
    await recordView({ p: '/he' }, ctx());
    await recordView({ p: '/he/' }, ctx());
    await recordView({ p: '/he/cart' }, ctx());
    expect((await pages()).toSorted((a, b) => a.path.localeCompare(b.path))).toEqual([
      { day: '2026-03-10', path: '/he', views: 2 },
      { day: '2026-03-10', path: '/he/cart', views: 1 },
    ]);
    expect(await referrers()).toEqual([]);
  });

  it('a view at 23:30 UTC on 1 March counts on 2 March; in summer time the cut is 21:00 UTC', async () => {
    await recordView({ p: '/he' }, ctx({ now: new Date('2026-03-01T23:30:00Z') }));
    await recordView({ p: '/he' }, ctx({ now: new Date('2026-07-01T20:59:00Z') }));
    await recordView({ p: '/he' }, ctx({ now: new Date('2026-07-01T21:01:00Z') }));
    expect((await pages()).map((row) => row.day).toSorted((a, b) => a.localeCompare(b))).toEqual([
      '2026-03-02',
      '2026-07-01',
      '2026-07-02',
    ]);
  });

  it('counts a visit for an external or empty referrer, lower-cased', async () => {
    await recordView({ p: '/he', r: 'Instagram.com' }, ctx());
    await recordView({ p: '/he', r: 'instagram.com' }, ctx());
    await recordView({ p: '/he/cart', r: '' }, ctx());
    expect(
      (await referrers()).toSorted((a, b) => a.referrerHost.localeCompare(b.referrerHost)),
    ).toEqual([
      { day: '2026-03-10', referrerHost: '(direct)', visits: 1 },
      { day: '2026-03-10', referrerHost: 'instagram.com', visits: 2 },
    ]);
    expect((await pages()).reduce((sum, row) => sum + row.views, 0)).toBe(3);
  });

  it("the shop's own host, the payment host, or no r counts only the page view", async () => {
    await recordView({ p: '/he', r: 'localhost:3100' }, ctx());
    await recordView({ p: '/he', r: 'pay.example.test' }, ctx());
    await recordView({ p: '/he' }, ctx());
    expect(await referrers()).toEqual([]);
    expect(await pages()).toEqual([{ day: '2026-03-10', path: '/he', views: 3 }]);
  });
});

describe('recordView: what is dropped', () => {
  async function nothingChanged(): Promise<void> {
    expect(await pages()).toEqual([]);
    expect(await referrers()).toEqual([]);
  }

  it.each([
    ['no Origin', null],
    ['a different origin', 'https://evil.example'],
    ['the origin with a path', `${ORIGIN}/`],
  ])('%s changes nothing', async (_name, origin) => {
    await recordView({ p: '/he', r: '' }, ctx({ origin }));
    await nothingChanged();
  });

  it.each([
    '/he/checkout',
    '/he/checkout/return',
    '/he/order/sometoken',
    '/admin',
    '/api/v',
    '/fr',
    '/he/pages/unknown',
    `/he/p/${'a'.repeat(81)}`,
    '/he/p/Doll-1',
    undefined,
    42,
  ])('the path %j changes nothing', async (p) => {
    await recordView({ p, r: '' }, ctx());
    await nothingChanged();
  });

  it('a path of a missing or unpublished product, or a missing category, changes nothing', async () => {
    await recordView({ p: '/he/p/no-such-product', r: '' }, ctx());
    await recordView({ p: '/en/p/doll-draft', r: '' }, ctx());
    await recordView({ p: '/he/c/no-such-category', r: '' }, ctx());
    await nothingChanged();
  });

  it('a published product, an existing category and the served pages count', async () => {
    await recordView({ p: '/he/p/doll-1?x=1' }, ctx());
    await recordView({ p: '/en/p/doll-1' }, ctx());
    await recordView({ p: '/he/c/dolls' }, ctx());
    await recordView({ p: '/he/pages/terms' }, ctx());
    await recordView({ p: '/en/contact' }, ctx());
    expect((await pages()).map((row) => row.path).toSorted((a, b) => a.localeCompare(b))).toEqual([
      '/en/contact',
      '/en/p/doll-1',
      '/he/c/dolls',
      '/he/p/doll-1',
      '/he/pages/terms',
    ]);
  });

  it.each([
    'Googlebot/2.1',
    'Mozilla/5.0 (compatible; bingbot/2.0) Crawler',
    'Mozilla/5.0 HeadlessChrome/120',
    'WhatsApp/2.23',
    'facebookexternalhit/1.1',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots) Preview',
    'Lighthouse',
    'Yahoo! Slurp',
    'SomeSpider',
  ])('the user agent %s changes nothing', async (userAgent) => {
    await recordView({ p: '/he', r: '' }, ctx({ userAgent }));
    await nothingChanged();
  });

  it('a missing user agent is counted (no signal either way)', async () => {
    await recordView({ p: '/he' }, ctx({ userAgent: null }));
    expect(await pages()).toHaveLength(1);
  });

  it('the 61st call within a minute from one IP is dropped; another IP and the next minute count', async () => {
    for (let i = 0; i < 61; i += 1) await recordView({ p: '/he' }, ctx());
    expect(await pages()).toEqual([{ day: '2026-03-10', path: '/he', views: 60 }]);
    await recordView({ p: '/he' }, ctx({ ip: '198.51.100.9' }));
    await recordView({ p: '/he' }, ctx({ now: new Date(NOW.getTime() + 61_000) }));
    expect((await pages())[0]?.views).toBe(62);
  });

  it('never throws, whatever the input', async () => {
    await expect(recordView(null, ctx())).resolves.toBeUndefined();
    await expect(recordView({ p: {}, r: [] }, ctx())).resolves.toBeUndefined();
  });
});

describe('no identifier is stored', () => {
  it('neither the IP nor the user agent reaches any column', async () => {
    await recordView({ p: '/he', r: 'instagram.com' }, ctx());
    const everything = JSON.stringify([
      await pages(),
      await referrers(),
      await testDb.db.select().from(rateLimitBucket),
    ]);
    expect(everything).not.toContain(IP);
    expect(everything).not.toContain('iPhone');
    expect(everything).not.toContain('Safari');
  });
});

describe('POST /api/v', () => {
  const request = (body: string, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}/api/v`, {
      method: 'POST',
      body,
      headers: {
        origin: ORIGIN,
        'content-type': 'text/plain;charset=UTF-8',
        'user-agent': UA,
        'x-forwarded-for': IP,
        ...headers,
      },
    });

  function expectEmpty204(response: Response): void {
    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
  }

  it('counts a text/plain JSON body and answers 204 without cookies', async () => {
    const response = await POST(request(JSON.stringify({ p: '/he/p/doll-1', r: 'instagram.com' })));
    expectEmpty204(response);
    expect(await response.text()).toBe('');
    expect(await pages()).toEqual([
      { day: isoDateInIsrael(new Date()), path: '/he/p/doll-1', views: 1 },
    ]);
    expect((await referrers())[0]?.referrerHost).toBe('instagram.com');
  });

  it('also reads application/json', async () => {
    const response = await POST(
      request(JSON.stringify({ p: '/he/cart' }), { 'content-type': 'application/json' }),
    );
    expectEmpty204(response);
    expect(await pages()).toHaveLength(1);
  });

  it('answers 204 and changes nothing for a cross-origin, missing-origin, oversized or malformed request', async () => {
    const good = JSON.stringify({ p: '/he', r: '' });
    expectEmpty204(await POST(request(good, { origin: 'https://evil.example' })));
    const noOrigin = new Request(`${ORIGIN}/api/v`, { method: 'POST', body: good });
    expectEmpty204(await POST(noOrigin));
    expectEmpty204(await POST(request(JSON.stringify({ p: '/he', r: '', pad: 'x'.repeat(1100) }))));
    expectEmpty204(await POST(request('{not json')));
    expectEmpty204(await POST(request('null')));
    expectEmpty204(await POST(request('[]')));
    expectEmpty204(await POST(request('')));
    expect(await pages()).toEqual([]);
    expect(await referrers()).toEqual([]);
  });

  it('stops reading a chunked body (no Content-Length) past 1 KB', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(600));
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(chunk);
      },
    });
    const streamed = new Request(`${ORIGIN}/api/v`, {
      method: 'POST',
      body,
      headers: { origin: ORIGIN, 'user-agent': UA },
      duplex: 'half',
    } as RequestInit);
    expectEmpty204(await POST(streamed));
    expect(pulls).toBeLessThan(10);
    expect(await pages()).toEqual([]);
  });

  it('answers 204 even when the database fails', async () => {
    const spy = vi.spyOn(testDb.db, 'insert').mockImplementation(() => {
      throw new Error('database down');
    });
    try {
      expectEmpty204(await POST(request(JSON.stringify({ p: '/he' }))));
    } finally {
      spy.mockRestore();
    }
  });
});

describe('getStats', () => {
  it('returns zero-filled visits per Israel day, oldest first', async () => {
    await testDb.db.insert(analyticsDailyReferrer).values([
      { day: '2026-03-10', referrerHost: '(direct)', visits: 3 },
      { day: '2026-03-10', referrerHost: 'instagram.com', visits: 2 },
      { day: '2026-03-08', referrerHost: '(direct)', visits: 4 },
      { day: '2025-01-01', referrerHost: '(direct)', visits: 99 },
    ]);
    const stats = await getStats(7, NOW);
    expect(stats.days).toBe(7);
    expect(stats.visitsPerDay.map((d) => d.day)).toEqual([
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
    expect(stats.visitsPerDay.map((d) => d.visits)).toEqual([0, 0, 0, 0, 4, 0, 5]);
    expect((await getStats(30, NOW)).visitsPerDay).toHaveLength(30);
    expect((await getStats(90, NOW)).visitsPerDay).toHaveLength(90);
    expect((await getStats(90, NOW)).visitsPerDay.reduce((sum, d) => sum + d.visits, 0)).toBe(9);
  });

  it('"today" is the Israel date', async () => {
    const late = new Date('2026-03-01T23:30:00Z'); // 2 March in Israel
    await testDb.db
      .insert(analyticsDailyReferrer)
      .values({ day: '2026-03-02', referrerHost: '(direct)', visits: 1 });
    const stats = await getStats(7, late);
    expect(stats.visitsPerDay.at(-1)).toEqual({ day: '2026-03-02', visits: 1 });
  });

  it('ranks the top 10 products by views summed over both languages, with the Hebrew name', async () => {
    await testDb.db.insert(product).values(
      Array.from({ length: 11 }, (_, i) => ({
        slug: `item-${String(i)}`,
        nameHe: `פריט ${String(i)}`,
        state: 'published' as const,
      })),
    );
    await testDb.db.insert(analyticsDailyPage).values([
      { day: '2026-03-10', path: '/he/p/doll-1', views: 5 },
      { day: '2026-03-09', path: '/en/p/doll-1', views: 4 },
      { day: '2026-03-10', path: '/he/p/gone-product', views: 6 },
      { day: '2026-03-10', path: '/he/cart', views: 50 },
      { day: '2026-03-10', path: '/he/c/dolls', views: 40 },
      { day: '2025-01-01', path: '/he/p/doll-1', views: 1000 },
      ...Array.from({ length: 11 }, (_, i) => ({
        day: '2026-03-10',
        path: `/he/p/item-${String(i)}`,
        views: 1,
      })),
    ]);
    const { topProducts } = await getStats(30, NOW);
    expect(topProducts).toHaveLength(10);
    expect(topProducts[0]).toEqual({ slug: 'doll-1', name: 'בובת בד', views: 9 });
    expect(topProducts[1]).toEqual({ slug: 'gone-product', name: 'gone-product', views: 6 });
    expect(topProducts.map((p) => p.views)).toEqual(
      [...topProducts.map((p) => p.views)].sort((a, b) => b - a),
    );
    expect(topProducts.some((p) => p.slug === 'item-9')).toBe(false);
  });

  it('ranks the top 10 referrers over the period', async () => {
    await testDb.db.insert(analyticsDailyReferrer).values([
      { day: '2026-03-10', referrerHost: '(direct)', visits: 7 },
      { day: '2026-03-09', referrerHost: '(direct)', visits: 1 },
      { day: '2026-03-10', referrerHost: 'instagram.com', visits: 9 },
      ...Array.from({ length: 11 }, (_, i) => ({
        day: '2026-03-10',
        referrerHost: `site-${String(i)}.example`,
        visits: 1,
      })),
    ]);
    const { topReferrers } = await getStats(7, NOW);
    expect(topReferrers).toHaveLength(10);
    expect(topReferrers[0]).toEqual({ host: 'instagram.com', visits: 9 });
    expect(topReferrers[1]).toEqual({ host: '(direct)', visits: 8 });
  });

  it('is empty on a fresh shop', async () => {
    const stats = await getStats(30, NOW);
    expect(stats.topProducts).toEqual([]);
    expect(stats.topReferrers).toEqual([]);
    expect(stats.visitsPerDay.every((d) => d.visits === 0)).toBe(true);
  });
});
