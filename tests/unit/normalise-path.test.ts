// 003 US5 (tasks.md T033; research R12): the pure rules of the cookieless page-view beacon.
//
// API of the implementation (T036), src/lib/analytics/normalise-path.ts:
//   parseCountablePath(raw: unknown): { path: string; kind: 'home' | 'shop' | 'search' | 'contact'
//     | 'category' | 'product' | 'page'; slug?: string } | null
//   normalisePath(raw: unknown): string | null          (= parseCountablePath(raw)?.path ?? null)
//   normaliseReferrer(raw: unknown, { ownHost, paymentHost? }): string | null
//     null = no visit is counted; a string = the referrer host to count a visit for.
import { describe, expect, it } from 'vitest';
import {
  normalisePath,
  normaliseReferrer,
  parseCountablePath,
} from '@/lib/analytics/normalise-path';

describe('normalisePath: accepted paths', () => {
  it.each([
    ['/he', '/he'],
    ['/en', '/en'],
    ['/en/', '/en'],
    ['/he/category/dolls', '/he/category/dolls'],
    ['/he/category/dolls/', '/he/category/dolls'],
    ['/he/product/doll-1?x=1#y', '/he/product/doll-1'],
    ['/he/product/doll-1#y', '/he/product/doll-1'],
    ['/en/search?q=a', '/en/search'],
    ['/he/shop', '/he/shop'],
    ['/en/shop?sort=price-asc', '/en/shop'],
    ['/he/pages/terms', '/he/pages/terms'],
    ['/he/pages/about', '/he/pages/about'],
    ['/he/pages/shipping-returns', '/he/pages/shipping-returns'],
    ['/en/contact', '/en/contact'],
    ['/he/product/%64oll-1', '/he/product/doll-1'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalisePath(raw)).toBe(expected);
  });

  it('a slug of exactly 80 characters is accepted', () => {
    const slug = 'a'.repeat(80);
    expect(normalisePath(`/he/product/${slug}`)).toBe(`/he/product/${slug}`);
  });
});

describe('normalisePath: rejected paths', () => {
  it.each([
    '/he/checkout',
    '/he/checkout/return',
    '/he/checkout/',
    '/he/order/abc123token',
    '/en/order/abc123token/',
    '/admin',
    '/admin/orders',
    '/api/v',
    '/fr',
    '/',
    '',
    '/he/cart',
    'he/cart',
    '//he/cart',
    '/he/pages/unknown',
    '/he/pages/contact',
    '/he/pages',
    '/he/product',
    '/he/product/',
    '/he/product/Doll',
    '/he/product/do ll',
    '/he/product/doll_1',
    '/he/product/doll/extra',
    '/he/category/dolls/extra',
    '/he/shop/x',
    '/he/shop/doll-1',
    '/HE/cart',
    '/he/p/doll-1',
    '/en/c/dolls',
    '/he/product/%zz',
    '/he/product/%2e%2e',
    '/he/product/a%2fb',
  ])('%j -> null', (raw) => {
    expect(normalisePath(raw)).toBeNull();
  });

  it('rejects slugs over 80 characters and paths over 300 characters', () => {
    expect(normalisePath(`/he/product/${'a'.repeat(81)}`)).toBeNull();
    expect(normalisePath(`/he/product/doll?${'x'.repeat(300)}`)).toBeNull();
    expect(normalisePath(`/he/${'a'.repeat(301)}`)).toBeNull();
  });

  it.each([undefined, null, 5, {}, ['/he']])('rejects a non-string (%j)', (raw) => {
    expect(normalisePath(raw)).toBeNull();
  });
});

describe('parseCountablePath', () => {
  it('names the kind and the slug the database check needs', () => {
    expect(parseCountablePath('/he/product/doll-1?x=1')).toEqual({
      path: '/he/product/doll-1',
      kind: 'product',
      slug: 'doll-1',
    });
    expect(parseCountablePath('/en/category/dolls')).toEqual({
      path: '/en/category/dolls',
      kind: 'category',
      slug: 'dolls',
    });
    expect(parseCountablePath('/he/pages/terms')).toEqual({
      path: '/he/pages/terms',
      kind: 'page',
      slug: 'terms',
    });
    expect(parseCountablePath('/he')).toEqual({ path: '/he', kind: 'home' });
    expect(parseCountablePath('/he/shop')).toEqual({ path: '/he/shop', kind: 'shop' });
    expect(parseCountablePath('/en/shop')?.kind).toBe('shop');
    expect(parseCountablePath('/he/search')?.kind).toBe('search');
    expect(parseCountablePath('/en/contact')?.kind).toBe('contact');
  });
});

describe('normaliseReferrer', () => {
  const opts = { ownHost: 'localhost:3100', paymentHost: 'pay.example.test' };

  it('an empty referrer is a direct visit', () => {
    expect(normaliseReferrer('', opts)).toBe('(direct)');
  });

  it('a missing referrer counts no visit', () => {
    expect(normaliseReferrer(undefined, opts)).toBeNull();
    expect(normaliseReferrer(null, opts)).toBeNull();
    expect(normaliseReferrer(42, opts)).toBeNull();
  });

  it('the shop itself and the payment page count no visit', () => {
    expect(normaliseReferrer('localhost:3100', opts)).toBeNull();
    expect(normaliseReferrer('LOCALHOST:3100', opts)).toBeNull();
    expect(normaliseReferrer('pay.example.test', opts)).toBeNull();
    expect(normaliseReferrer('pay.example.test', { ownHost: 'localhost:3100' })).toBe(
      'pay.example.test',
    );
  });

  it('a host is lower-cased', () => {
    expect(normaliseReferrer('Instagram.com', opts)).toBe('instagram.com');
    expect(normaliseReferrer('l.facebook.com', opts)).toBe('l.facebook.com');
  });

  it('a host over 255 characters, or not a host, is ignored', () => {
    expect(normaliseReferrer(`${'a'.repeat(252)}.com`, opts)).toBeNull();
    expect(normaliseReferrer('a'.repeat(255), opts)).toBe('a'.repeat(255));
    expect(normaliseReferrer('evil.com/path?x=1', opts)).toBeNull();
    expect(normaliseReferrer('two words', opts)).toBeNull();
    expect(normaliseReferrer('(direct)', opts)).toBeNull();
  });
});
