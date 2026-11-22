import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIResponse, Page } from '@playwright/test';
import { E2E_PORT, OIDC_PORT } from './env';
import { expect, resetDb, test } from './fixtures';
import { putCartItem } from './shop-helpers';

// 006 T018 (research D5, 001 T123 adjusted): security headers on the pages and the API route a
// visitor reaches. The E2E origin is http, so HSTS and `upgrade-insecure-requests` must be absent
// here (their https values are covered by tests/unit/headers.test.ts; the live check is in the
// launch checklist). The fake provider's page is same-origin and no payment host is set, so
// `form-action` is exactly 'self' on the storefront and adds only the mock OIDC issuer on the
// admin sign-in.

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Headers are checked once, on desktop');
});

test.beforeAll(async () => {
  await resetDb();
});

interface Target {
  name: string;
  path: string;
  /** The exact `form-action` directive. */
  formAction: string;
  /** Pages carry a per-request nonce; the JSON route is only checked for the directives. */
  page: boolean;
  /** Only the console check below needs it (the page needs a cart to render the form); the header check uses plain requests. */
  prepare?: (page: Page) => Promise<void>;
}

const targets: Target[] = [
  { name: 'home', path: '/he', formAction: "form-action 'self'", page: true },
  {
    name: 'product',
    path: '/he/product/sample-clay-mug',
    formAction: "form-action 'self'",
    page: true,
  },
  {
    name: 'checkout',
    path: '/he/checkout',
    formAction: "form-action 'self'",
    page: true,
    prepare: (page) => putCartItem(page, 'sample-clay-mug'),
  },
  {
    name: 'admin sign-in',
    path: '/admin/sign-in',
    formAction: `form-action 'self' http://localhost:${String(OIDC_PORT)}`,
    page: true,
  },
  { name: 'health', path: '/api/health', formAction: "form-action 'self'", page: false },
];

function directive(csp: string, name: string): string | undefined {
  return csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
}

function nonceOf(csp: string): string {
  const match = /'nonce-([^']+)'/.exec(csp);
  if (!match?.[1]) throw new Error(`No nonce in: ${csp}`);
  return match[1];
}

function expectCommonHeaders(response: APIResponse, label: string): string {
  const headers = response.headers();
  const csp = headers['content-security-policy'] ?? '';
  expect(csp, `${label}: CSP present`).not.toBe('');
  expect(directive(csp, 'frame-ancestors'), label).toBe("frame-ancestors 'none'");
  expect(directive(csp, 'object-src'), label).toBe("object-src 'none'");
  expect(directive(csp, 'base-uri'), label).toBe("base-uri 'none'");
  expect(csp, label).not.toContain('upgrade-insecure-requests');
  expect(headers['x-content-type-options'], label).toBe('nosniff');
  expect(headers['referrer-policy'], label).toBeTruthy();
  expect(headers['permissions-policy'], label).toBeTruthy();
  expect(headers['cross-origin-opener-policy'], label).toBeTruthy();
  expect(headers['strict-transport-security'], label).toBeUndefined();
  expect(headers['x-powered-by'], label).toBeUndefined();
  return csp;
}

for (const target of targets) {
  test(`${target.name}: the security headers are present`, async ({ page }) => {
    await target.prepare?.(page);

    const first = await page.request.get(target.path);
    expect(first.status()).toBe(200);
    const csp = expectCommonHeaders(first, target.name);
    expect(directive(csp, 'form-action'), target.name).toBe(target.formAction);

    if (target.page) {
      expect(csp).toContain("'strict-dynamic'");
      const second = await page.request.get(target.path);
      expect(nonceOf(second.headers()['content-security-policy'] ?? '')).not.toBe(nonceOf(csp));
    }
  });
}

test('no page logs a Content Security Policy violation while loading', async ({ page }) => {
  for (const target of targets.filter((entry) => entry.page)) {
    const messages: string[] = [];
    const onConsole = (message: { text: () => string }): void => {
      messages.push(message.text());
    };
    await target.prepare?.(page);
    page.on('console', onConsole);
    await page.goto(target.path, { waitUntil: 'networkidle' });
    page.off('console', onConsole);
    expect(
      messages.filter((text) => text.includes('Content Security Policy')),
      target.name,
    ).toEqual([]);
  }
});

test('/api/health answers exactly {"ok":true}', async ({ page }) => {
  const response = await page.request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.text()).toBe('{"ok":true}');
});

// 007 T021 (contracts/home-photos.md "Serving"): the fingerprinted home photos are cached for a
// year, are served as WebP with `nosniff`, and the storefront CSP did not change for them.
test('a home photo is served as WebP with a one-year immutable cache and nosniff', async ({
  page,
}) => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'src/lib/home-photos/manifest.json'), 'utf8'),
  ) as Record<string, { phone: { file: string; width: number }[] }>;
  const file = manifest.hero?.phone.find((entry) => entry.width === 565)?.file;
  if (file === undefined) throw new Error('No hero p565 file in the manifest');

  const response = await page.request.get(`/site-photos/${file}`);
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers['content-type']).toBe('image/webp');
  expect(headers['cache-control']).toBe('public, max-age=31536000, immutable');
  expect(headers['x-content-type-options']).toBe('nosniff');

  // The storefront CSP still allows images from the shop's own origins only (no new host).
  const home = await page.request.get('/he');
  const csp = home.headers()['content-security-policy'] ?? '';
  expect(directive(csp, 'img-src')).toBe(
    `img-src 'self' http://localhost:${String(E2E_PORT)} data: blob:`,
  );
});
