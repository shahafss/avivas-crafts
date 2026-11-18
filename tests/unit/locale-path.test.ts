import { describe, expect, it } from 'vitest';
import { otherLocale, parseSwitchTarget, switchPath } from '@/lib/locale-path';

const ORIGIN = 'https://shop.example';

describe('otherLocale', () => {
  it('flips between he and en', () => {
    expect(otherLocale('he')).toBe('en');
    expect(otherLocale('en')).toBe('he');
  });
});

describe('switchPath', () => {
  it('swaps the first segment and keeps the rest and the query', () => {
    expect(switchPath('/he', '')).toBe('/en');
    expect(switchPath('/he/p/x', '?a=1')).toBe('/en/p/x?a=1');
    expect(switchPath('/en/c/bowls', '?sort=price-asc')).toBe('/he/c/bowls?sort=price-asc');
    expect(switchPath('/en', '')).toBe('/he');
  });
});

describe('parseSwitchTarget: accepted', () => {
  const accepted: [string, string, string][] = [
    ['en', '/en', '/en'],
    ['he', '/he', '/he'],
    ['en', '/en/p/clay-bowl', '/en/p/clay-bowl'],
    ['en', '/en/c/bowls?sort=price-asc', '/en/c/bowls?sort=price-asc'],
    ['en', '/en/search?q=%D7%A7%D7%A2%D7%A8%D7%94', '/en/search?q=%D7%A7%D7%A2%D7%A8%D7%94'],
    ['he', '/he/order/abc123', '/he/order/abc123'],
    ['en', '/en?x=1', '/en?x=1'],
  ];
  it.each(accepted)('to=%s path=%s', (to, path, expected) => {
    expect(parseSwitchTarget(to, path, ORIGIN)).toEqual({ locale: to, path: expected });
  });

  it('keeps a Hebrew query as given', () => {
    const result = parseSwitchTarget('he', '/he/search?q=קערה', ORIGIN);
    expect(result?.locale).toBe('he');
    expect(decodeURIComponent(result?.path ?? '')).toBe('/he/search?q=קערה');
  });

  it('accepts a 2,048-character path', () => {
    const path = '/en/' + 'a'.repeat(2048 - 4);
    expect(path).toHaveLength(2048);
    expect(parseSwitchTarget('en', path, ORIGIN)).toEqual({ locale: 'en', path });
  });
});

describe('parseSwitchTarget: refused', () => {
  const refused: [string, string | null | undefined][] = [
    ['he', '/hex'],
    ['en', '/en-x/a'],
    ['en', '/admin'],
    ['en', '/api/locale'],
    ['en', 'https://evil.example/en'],
    ['en', '//evil.example/en'],
    ['en', '/en//evil.example'],
    ['en', '/en/%2F%2Fevil.example'],
    ['en', '/en/%2f'],
    ['en', '/en/%5c'],
    ['en', '/en\\evil'],
    ['en', '/\\evil'],
    ['en', '/en/../admin'],
    ['en', '/en/./p'],
    ['en', '/en/%2e%2e/admin'],
    ['en', '/en/.%2e/admin'],
    ['en', '/en/%2E%2e/api/locale'],
    ['en', '/en/%2E/p'],
    ['en', '/en/p%0d%0aSet-Cookie:x=1'],
    ['en', '/en/p%00'],
    ['en', '/en/p%7f'],
    ['en', '/en/p\r\nX: y'],
    ['en', '/en/p\u0000'],
    ['en', '/en/p?q=a\\b'],
    ['en', '/en/p?q=a\r\nX: y'],
    ['en', '/en/p?q=a\u007fb'],
    ['fr', '/fr'],
    ['fr', '/en'],
    ['en', '/he/p/x'],
    ['he', '/en'],
    ['en', undefined],
    ['en', null],
    ['en', ''],
    ['en', '/en/' + 'a'.repeat(2049 - 4)],
  ];
  it.each(refused)('to=%s path=%s', (to, path) => {
    expect(parseSwitchTarget(to, path, ORIGIN)).toBeNull();
  });

  it('refuses a missing or unknown locale', () => {
    expect(parseSwitchTarget(null, '/en', ORIGIN)).toBeNull();
    expect(parseSwitchTarget('', '/en', ORIGIN)).toBeNull();
    expect(parseSwitchTarget('EN', '/en', ORIGIN)).toBeNull();
  });

  it('has exactly 2,049 characters in the over-long case', () => {
    expect('/en/' + 'a'.repeat(2049 - 4)).toHaveLength(2049);
  });
});
