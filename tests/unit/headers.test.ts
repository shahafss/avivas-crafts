import { describe, expect, it } from 'vitest';
import { staticSecurityHeaders } from '@/lib/security-headers';
import {
  sameSiteNavigationPage,
  shouldBounceAdminRequest,
  type BounceRequest,
} from '@/server/security/admin-bounce';
import { buildCsp, securityHeaders } from '@/server/security/headers';

const base = {
  paymentHost: 'payments.example.com',
  imageOrigin: 'https://img.example.com',
  optionalScriptHosts: [],
};

function directive(csp: string, name: string): string[] {
  const found = csp.split('; ').find((part) => part.startsWith(`${name} `) || part === name);
  return found === undefined ? [] : found.split(' ').slice(1);
}

describe('buildCsp', () => {
  const csp = buildCsp('abc123', base);

  it('produces the directives of R14', () => {
    expect(directive(csp, 'default-src')).toEqual(["'self'"]);
    expect(directive(csp, 'script-src')).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(directive(csp, 'style-src')).toEqual(["'self'", "'nonce-abc123'"]);
    expect(directive(csp, 'img-src')).toEqual([
      "'self'",
      'https://img.example.com',
      'data:',
      'blob:',
    ]);
    expect(directive(csp, 'font-src')).toEqual(["'self'"]);
    expect(directive(csp, 'connect-src')).toEqual(["'self'"]);
    expect(directive(csp, 'frame-src')).toEqual(["'none'"]);
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(csp, 'base-uri')).toEqual(["'none'"]);
    expect(directive(csp, 'object-src')).toEqual(["'none'"]);
    expect(directive(csp, 'form-action')).toEqual(["'self'", 'https://payments.example.com']);
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toContain('unsafe-inline');
  });

  it('leaves the payment host out when unset', () => {
    expect(directive(buildCsp('n', { ...base, paymentHost: undefined }), 'form-action')).toEqual([
      "'self'",
    ]);
    expect(directive(buildCsp('n', { ...base, paymentHost: '' }), 'form-action')).toEqual([
      "'self'",
    ]);
  });

  it('adds the OIDC origin to form-action only when given', () => {
    const withOidc = buildCsp('n', { ...base, oidcOrigin: 'https://accounts.google.com' });
    expect(directive(withOidc, 'form-action')).toContain('https://accounts.google.com');
    expect(directive(csp, 'form-action')).not.toContain('https://accounts.google.com');
  });

  it("adds 'unsafe-eval' only in dev, and only to script-src", () => {
    const dev = buildCsp('n', { ...base, dev: true });
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(dev.replace(/script-src[^;]*/, '')).not.toContain('unsafe-eval');
    expect(csp).not.toContain('unsafe-eval');
    expect(buildCsp('n', { ...base, dev: false })).not.toContain('unsafe-eval');
  });

  it('adds optional script hosts and can drop upgrade-insecure-requests', () => {
    const custom = buildCsp('n', {
      ...base,
      optionalScriptHosts: ['https://stats.example.com'],
      upgradeInsecureRequests: false,
    });
    expect(directive(custom, 'script-src')).toContain('https://stats.example.com');
    expect(custom).not.toContain('upgrade-insecure-requests');
  });
});

describe('security headers', () => {
  it('sends the static headers, HSTS only over https', () => {
    const https = securityHeaders({ https: true });
    expect(https['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains');
    expect(https['X-Content-Type-Options']).toBe('nosniff');
    expect(https['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(https['Permissions-Policy']).toBe(
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    expect(https['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(securityHeaders({ https: false })['Strict-Transport-Security']).toBeUndefined();
    expect(staticSecurityHeaders({ https: false }).map((h) => h.key)).not.toContain(
      'Strict-Transport-Security',
    );
  });
});

describe('admin bounce', () => {
  const crossSite: BounceRequest = {
    method: 'GET',
    pathname: '/admin/orders/x',
    secFetchSite: 'cross-site',
    secFetchMode: 'navigate',
  };

  it('bounces a cross-site navigating GET of an admin page', () => {
    expect(shouldBounceAdminRequest(crossSite)).toBe(true);
    expect(shouldBounceAdminRequest({ ...crossSite, pathname: '/admin' })).toBe(true);
  });

  it.each([
    ['same-origin', { secFetchSite: 'same-origin' }],
    ['missing Sec-Fetch-Site', { secFetchSite: null }],
    ['POST', { method: 'POST' }],
    ['sign-in', { pathname: '/admin/sign-in' }],
    ['sign-in subpath', { pathname: '/admin/sign-in/extra' }],
    ['non-navigation fetch', { secFetchMode: 'cors' }],
    ['a public page', { pathname: '/he/cart' }],
  ])('does not bounce: %s', (_name, override) => {
    expect(shouldBounceAdminRequest({ ...crossSite, ...override })).toBe(false);
  });

  it('answers with a no-store page that re-navigates to the same path and query', async () => {
    const response = sameSiteNavigationPage('/admin/orders/x?a=1&b="2"', 'N0nce');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const html = await response.text();
    expect(html).toContain('<script nonce="N0nce">');
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain('/admin/orders/x?a=1&amp;b=&quot;2&quot;');
  });

  it('refuses a target outside this site', () => {
    expect(() => sameSiteNavigationPage('//evil.example', 'n')).toThrow();
    expect(() => sameSiteNavigationPage('https://evil.example', 'n')).toThrow();
  });
});
