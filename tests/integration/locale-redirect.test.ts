import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/locale/route';

const env = vi.hoisted(() => ({ values: { APP_ORIGIN: 'http://localhost:3100' } }));
vi.mock('@/server/env', () => ({ getEnv: () => env.values }));

beforeEach(() => {
  env.values.APP_ORIGIN = 'http://localhost:3100';
});

function call(
  query: string,
  headers: Record<string, string> = {},
  origin = env.values.APP_ORIGIN,
): Promise<Response> {
  return Promise.resolve(GET(new NextRequest(`${origin}/api/locale?${query}`, { headers })));
}

const ok = (to: string, path: string): string => `to=${to}&path=${encodeURIComponent(path)}`;

/** Attribute names (lower-cased) and values of one Set-Cookie header. */
function cookieAttributes(
  response: Response,
): { value: string; attrs: Map<string, string> } | null {
  const header = response.headers.get('set-cookie');
  if (header === null) return null;
  const [pair = '', ...rest] = header.split(';').map((part) => part.trim());
  const attrs = new Map<string, string>();
  for (const part of rest) {
    const [name = '', ...value] = part.split('=');
    attrs.set(name.toLowerCase(), value.join('=').toLowerCase());
  }
  return { value: pair, attrs };
}

describe('GET /api/locale: valid request', () => {
  it('redirects with 303 to the origin plus the path, no-store, and sets the cookie (http)', async () => {
    const response = await call(ok('en', '/en'));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3100/en');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const cookie = cookieAttributes(response);
    expect(cookie?.value).toBe('NEXT_LOCALE=en');
    expect(cookie?.attrs.has('httponly')).toBe(true);
    expect(cookie?.attrs.get('samesite')).toBe('lax');
    expect(cookie?.attrs.get('path')).toBe('/');
    expect(cookie?.attrs.get('max-age')).toBe('31536000');
    expect(cookie?.attrs.has('secure')).toBe(false);
  });

  it('adds Secure exactly when APP_ORIGIN is https', async () => {
    env.values.APP_ORIGIN = 'https://shop.example';
    const response = await call(ok('he', '/he/p/x?sort=a'), {}, 'https://shop.example');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://shop.example/he/p/x?sort=a');
    const cookie = cookieAttributes(response);
    expect(cookie?.value).toBe('NEXT_LOCALE=he');
    expect(cookie?.attrs.has('secure')).toBe(true);
    expect(cookie?.attrs.has('httponly')).toBe(true);
  });

  it('keeps an encoded Hebrew query', async () => {
    const response = await call(ok('en', '/en/search?q=%D7%A7%D7%A2%D7%A8%D7%94'));
    expect(response.headers.get('location')).toBe(
      'http://localhost:3100/en/search?q=%D7%A7%D7%A2%D7%A8%D7%94',
    );
  });
});

describe('GET /api/locale: cross-site requests', () => {
  it.each(['cross-site', 'same-site'])(
    'Sec-Fetch-Site %s redirects without the cookie',
    async (site) => {
      const response = await call(ok('en', '/en'), { 'Sec-Fetch-Site': site });
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('http://localhost:3100/en');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('set-cookie')).toBeNull();
    },
  );

  it.each([['same-origin'], ['none'], [null]])(
    'Sec-Fetch-Site %s sets the cookie',
    async (site) => {
      const response = await call(ok('en', '/en'), site === null ? {} : { 'Sec-Fetch-Site': site });
      expect(response.status).toBe(303);
      expect(cookieAttributes(response)?.value).toBe('NEXT_LOCALE=en');
    },
  );

  it('without Sec-Fetch-Site, a foreign Referer gets no cookie', async () => {
    const response = await call(ok('en', '/en'), { Referer: 'https://evil.example/x' });
    expect(response.status).toBe(303);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('without Sec-Fetch-Site, a same-origin Referer sets the cookie', async () => {
    const response = await call(ok('en', '/en'), { Referer: 'http://localhost:3100/he/p/x' });
    expect(cookieAttributes(response)?.value).toBe('NEXT_LOCALE=en');
  });
});

describe('GET /api/locale: refused', () => {
  const refused: [string, string][] = [
    ['/hex', ok('he', '/hex')],
    ['/admin', ok('en', '/admin')],
    ['//host', ok('en', '//evil.example/en')],
    ['encoded //', ok('en', '/en/%2F%2Fevil.example')],
    ['backslash', ok('en', '/en\\evil')],
    ['backslash in the query', ok('en', '/en/p?q=a\\b')],
    ['control character in the query', ok('en', '/en/p?q=a\r\nX: y')],
    ['double-encoded dot segments', 'to=en&path=/en/%252e%252e/admin'],
    ['locale mismatch', ok('en', '/he/p/x')],
    ['to=fr', ok('fr', '/fr')],
    ['missing path', 'to=en'],
    ['missing to', `path=${encodeURIComponent('/en')}`],
  ];
  it.each(refused)('%s gives 400 with no cookie, no Location', async (_label, query) => {
    const response = await call(query);
    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });
});
