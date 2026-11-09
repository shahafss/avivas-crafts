import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/env', () => ({
  getEnv: () => ({ APP_ORIGIN: 'https://shop.example.com' }),
}));

import { assertSameOrigin, isSameOrigin } from '@/server/security/origin';

function req(method: string, origin?: string): Request {
  const headers = new Headers();
  if (origin !== undefined) headers.set('origin', origin);
  return new Request('https://shop.example.com/api/x', { method, headers });
}

beforeEach(() => vi.clearAllMocks());

describe('assertSameOrigin', () => {
  it('accepts a POST whose Origin equals APP_ORIGIN', () => {
    expect(() => {
      assertSameOrigin(req('POST', 'https://shop.example.com'));
    }).not.toThrow();
    expect(isSameOrigin(req('POST', 'https://shop.example.com'))).toBe(true);
  });

  it('rejects a POST without Origin', () => {
    expect(() => {
      assertSameOrigin(req('POST'));
    }).toThrow();
    expect(isSameOrigin(req('POST'))).toBe(false);
  });

  it('rejects another origin, another scheme, another port and "null"', () => {
    for (const origin of [
      'https://evil.example.com',
      'http://shop.example.com',
      'https://shop.example.com:8443',
      'https://shop.example.com.evil.test',
      'null',
    ]) {
      expect(isSameOrigin(req('POST', origin))).toBe(false);
    }
  });

  it('does not accept a trailing slash variant or path in Origin', () => {
    expect(isSameOrigin(req('POST', 'https://shop.example.com/'))).toBe(false);
  });
});
