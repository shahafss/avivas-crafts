import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/env', () => ({
  getEnv: () => ({ SECRET_HMAC_KEY: Buffer.alloc(32, 7).toString('base64') }),
}));

import { issueFormToken, verifyFormToken } from '@/server/checkout/form-token';

const T0 = 1_800_000_000_000;

describe('form token', () => {
  it('is refused before 3 seconds and accepted from 3 seconds to 2 hours', () => {
    const token = issueFormToken(T0);
    expect(verifyFormToken(token, T0 + 2999)).toBe(false);
    expect(verifyFormToken(token, T0 + 3000)).toBe(true);
    expect(verifyFormToken(token, T0 + 2 * 3600 * 1000)).toBe(true);
    expect(verifyFormToken(token, T0 + 2 * 3600 * 1000 + 1)).toBe(false);
  });

  it('is refused when tampered with or malformed', () => {
    const [timestamp, signature] = issueFormToken(T0).split('.') as [string, string];
    expect(verifyFormToken(`${String(T0 - 60_000)}.${signature}`, T0 + 5000)).toBe(false);
    expect(verifyFormToken(`${timestamp}.${'0'.repeat(signature.length)}`, T0 + 5000)).toBe(false);
    expect(verifyFormToken(`${timestamp}.abc`, T0 + 5000)).toBe(false);
    for (const bad of ['', 'x', '.', timestamp, `${timestamp}.${signature}.extra`]) {
      expect(verifyFormToken(bad, T0 + 5000)).toBe(false);
    }
  });
});
