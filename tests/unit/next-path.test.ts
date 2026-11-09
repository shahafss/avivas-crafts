import { describe, expect, it } from 'vitest';
import { safeAdminNext } from '@/server/auth/next-path';

describe('safeAdminNext', () => {
  it('accepts same-origin admin paths with query strings', () => {
    expect(safeAdminNext('/admin/orders/abc?x=1')).toBe('/admin/orders/abc?x=1');
    expect(safeAdminNext('/admin')).toBe('/admin');
    expect(safeAdminNext('/admin/products?page=2&q=%D7%A9')).toBe(
      '/admin/products?page=2&q=%D7%A9',
    );
  });

  it.each([
    ['//evil.test', 'protocol-relative URL'],
    ['https://evil.test', 'absolute URL'],
    ['/\\evil', 'backslash'],
    ['/admin\\evil', 'backslash inside'],
    ['/admin/sign-in', 'sign-in page'],
    ['/admin/sign-in/passkey', 'sign-in sub page'],
    ['/admin/setup', 'setup page'],
    ['/admin/setup#t=abc', 'setup page with fragment'],
    ['/he/cart', 'storefront path'],
    ['/administrator', 'prefix lookalike'],
    ['/admin//evil.test', 'double slash'],
    ['/admin/x\nSet-Cookie: a=b', 'control character'],
    ['/admin/x\u0000', 'NUL'],
    [`/admin/${'a'.repeat(520)}`, 'over-long'],
    ['javascript:alert(1)', 'scheme'],
    ['/admin/../he/cart', 'dot segments leaving /admin'],
    ['/admin/x/../sign-in', 'dot segments reaching sign-in'],
    ['/admin/%2e%2e/he/cart', 'encoded dot segments leaving /admin'],
    ['/admin/x/%2E%2E/setup', 'encoded dot segments reaching setup'],
    ['/admin/..', 'bare dot segment'],
    ['', 'empty'],
  ])('rejects %s (%s)', (input) => {
    expect(safeAdminNext(input)).toBeNull();
  });

  it('normalises harmless dot segments', () => {
    expect(safeAdminNext('/admin/a/../orders?x=1')).toBe('/admin/orders?x=1');
  });

  it('rejects non-strings', () => {
    expect(safeAdminNext(undefined)).toBeNull();
    expect(safeAdminNext(null)).toBeNull();
    expect(safeAdminNext(42)).toBeNull();
  });
});
