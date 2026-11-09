import { describe, expect, it } from 'vitest';
import { getClientIp } from '@/server/security/client-ip';

const h = (xff?: string): Headers => {
  const headers = new Headers();
  if (xff !== undefined) headers.set('x-forwarded-for', xff);
  return headers;
};

describe('getClientIp', () => {
  it('takes the last entry with one trusted hop', () => {
    expect(getClientIp(h('203.0.113.7'), 1)).toBe('203.0.113.7');
    expect(getClientIp(h('10.0.0.1, 203.0.113.7'), 1)).toBe('203.0.113.7');
  });

  it('ignores spoofed left-most entries', () => {
    expect(getClientIp(h('1.2.3.4, 5.6.7.8, 203.0.113.7'), 1)).toBe('203.0.113.7');
  });

  it('counts hops from the right', () => {
    expect(getClientIp(h('198.51.100.9, 203.0.113.7, 10.0.0.2'), 2)).toBe('203.0.113.7');
    expect(getClientIp(h('198.51.100.9, 203.0.113.7, 10.0.0.2'), 3)).toBe('198.51.100.9');
  });

  it('trims whitespace', () => {
    expect(getClientIp(h('  1.1.1.1 ,   203.0.113.7  '), 1)).toBe('203.0.113.7');
  });

  it('returns null with zero trusted hops (header is untrusted)', () => {
    expect(getClientIp(h('203.0.113.7'), 0)).toBeNull();
  });

  it('returns null when the header is missing or shorter than the hop count', () => {
    expect(getClientIp(h(), 1)).toBeNull();
    expect(getClientIp(h('203.0.113.7'), 2)).toBeNull();
    expect(getClientIp(h(''), 1)).toBeNull();
  });
});
