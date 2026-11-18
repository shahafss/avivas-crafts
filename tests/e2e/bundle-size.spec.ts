import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import { expect, resetDb, sql, test } from './fixtures';

// First-load JavaScript budget of the storefront (storefront.md §10, tasks.md T087): every route
// stays at or under 150 KB gzipped, except checkout at 155 KB (user decision 2026-11-09) and the product page at 152 KB, 157 KB with the cart
// drawer opened (owner answer 2026-11-17). It measures what the browser really loads: a fresh context
// with the cache disabled, the bodies of all same-origin `.js` responses, gzipped. (Next 16 no
// longer prints per-route sizes.) T131 adds the routes built after the US2 checkpoint.

const DEFAULT_LIMIT_KB = 150;
const limitBytes = (kb: number): number => kb * 1024;

// Strings that must not be in any script the storefront loads. The libphonenumber marker is the
// source text of the Ascension Island (AC) number pattern in its metadata, found in the built
// server chunk with `grep -lF '[2-467])\\d{4}' .next/server/chunks/*.js` (two backslashes in the
// file); no other code has it. Pinned by `libphonenumber-js` 1.13.x.
const FORBIDDEN_IN_SCRIPTS: { name: string; text: string }[] = [
  { name: 'the consent banner', text: 'consent-banner' },
  { name: 'libphonenumber metadata', text: String.raw`(?:[01589]\\d|[2-467])\\d{4}` },
  // A second marker without backslashes, in case the minifier changes how the first is escaped:
  // the metadata object's key, in libphonenumber's code and data only (server chunk only today).
  { name: 'libphonenumber metadata (key)', text: 'country_calling_codes' },
];

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Measured once, in desktop Chromium');
});

let productSlug = '';
let categorySlug = '';
let orderToken = '';

test.beforeAll(async () => {
  await resetDb();
  const [item] = await sql<{ slug: string; id: string }[]>`
    SELECT slug, id FROM product WHERE state = 'published' ORDER BY created_at LIMIT 1`;
  const [category] = await sql<
    { slug: string }[]
  >`SELECT slug FROM category ORDER BY sort_order LIMIT 1`;
  productSlug = item?.slug ?? '';
  categorySlug = category?.slug ?? '';

  // An order the page can show: inserted directly, with the hash of a token this spec knows.
  orderToken = randomBytes(32).toString('base64url');
  const [zone] = await sql<{ id: string }[]>`SELECT id FROM shipping_zone WHERE code = 'IL'`;
  const [order] = await sql<{ id: string }[]>`
    INSERT INTO orders
      (public_token_hash, public_token_expires_at, locale, zone_id, currency, customer_name,
       customer_phone, customer_email, delivery_method, payment_method, subtotal_minor,
       total_minor, terms_accepted_at, terms_version, privacy_version)
    VALUES
      (${createHash('sha256').update(orderToken).digest()}, now() + interval '30 days', 'he',
       ${zone?.id ?? ''}, 'ILS', 'Bundle Size', '+972522345678', 'bundle@example.test', 'pickup',
       'offline', 6500, 6500, now(), 1, 1)
    RETURNING id`;
  await sql`
    INSERT INTO order_line
      (order_id, product_id, product_name_he, unit_price_minor, quantity, line_total_minor)
    VALUES (${order?.id ?? ''}, ${item?.id ?? ''}, 'פריט', 6500, 1, 6500)`;
});

interface FirstLoad {
  /** Gzipped size of every distinct same-origin script. */
  bytes: number;
  /** The text of those scripts. */
  scripts: string[];
}

/** Every distinct same-origin script the route loads in a fresh context. */
async function firstLoad(
  browserPage: Page,
  path: string,
  prepare?: (page: Page) => Promise<void>,
  afterLoad?: (page: Page) => Promise<void>,
): Promise<FirstLoad> {
  const context = await browserPage
    .context()
    .browser()
    ?.newContext({
      baseURL: String(test.info().project.use.baseURL),
      serviceWorkers: 'block',
    });
  if (!context) throw new Error('No browser');
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (prepare) await prepare(page);

    const sizes = new Map<string, number>();
    const texts = new Map<string, string>();
    const pending: Promise<void>[] = [];
    const origin = new URL(String(test.info().project.use.baseURL)).origin;
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.origin !== origin || !url.pathname.endsWith('.js')) return;
      pending.push(
        response.body().then(
          (body) => {
            sizes.set(url.pathname, gzipSync(body).length);
            texts.set(url.pathname, body.toString('utf8'));
          },
          () => undefined,
        ),
      );
    });
    await page.goto(path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    if (afterLoad) {
      // Everything loaded by an action after the first load counts too (the cart drawer's body).
      await afterLoad(page);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
    }
    await Promise.all(pending);
    return {
      bytes: [...sizes.values()].reduce((sum, size) => sum + size, 0),
      scripts: [...texts.values()],
    };
  } finally {
    await context.close();
  }
}

async function putCartItem(page: Page): Promise<void> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM product WHERE slug = ${productSlug}`;
  await page.goto('/he/contact');
  await page.evaluate((productId) => {
    localStorage.setItem(
      'ac_cart_v1',
      JSON.stringify({
        v: 1,
        updatedAt: new Date().toISOString(),
        items: [{ productId, optionValueIds: [], quantity: 1, addedAt: new Date().toISOString() }],
      }),
    );
  }, row?.id);
}

const routes: {
  name: string;
  path: () => string;
  limitKb?: number;
  prepare?: (page: Page) => Promise<void>;
  afterLoad?: (page: Page) => Promise<void>;
}[] = [
  { name: 'home', path: () => '/he' },
  { name: 'all pieces', path: () => '/he/shop' },
  { name: 'category', path: () => `/he/c/${categorySlug}` },
  { name: 'search', path: () => '/he/search?q=%D7%A0%D7%A8' },
  { name: 'product', path: () => `/he/p/${productSlug}`, limitKb: 152 },
  // 007 D21: the cart page is gone; the cart is a drawer whose body loads on first open. Every
  // page is measured with the drawer closed (above); this one opens it and counts its chunk too,
  // on the product page (the plan's limit: first load plus the drawer chunk stays under 157 KB).
  // The product page itself is 152 KB.
  {
    name: 'product with the cart drawer opened',
    path: () => `/he/p/${productSlug}`,
    limitKb: 157,
    prepare: putCartItem,
    afterLoad: async (page) => {
      await page.getByTestId('cart-link').click();
      await expect(page.getByTestId('cart-line').first()).toBeVisible({ timeout: 20_000 });
    },
  },
  { name: 'checkout', path: () => '/he/checkout', limitKb: 155, prepare: putCartItem },
  {
    name: 'payment return',
    path: () => `/he/checkout/return?c=${randomBytes(32).toString('base64url')}&r=success`,
  },
  { name: 'order page', path: () => `/he/order/${orderToken}` },
  { name: 'terms page', path: () => '/he/pages/terms' },
  { name: 'contact page', path: () => '/he/contact' },
];

for (const route of routes) {
  const limitKb = route.limitKb ?? DEFAULT_LIMIT_KB;
  test(`first-load JavaScript of the ${route.name} route is at most ${String(limitKb)} KB gzipped`, async ({
    page,
  }) => {
    const { bytes, scripts } = await firstLoad(page, route.path(), route.prepare, route.afterLoad);
    test.info().annotations.push({ type: 'gzip', description: `${(bytes / 1024).toFixed(1)} KB` });
    console.log(`${route.name}: ${(bytes / 1024).toFixed(1)} KB gzipped`);
    // Checked first: a forbidden module is the more specific message than the size it adds.
    for (const { name, text } of FORBIDDEN_IN_SCRIPTS) {
      expect(
        scripts.some((script) => script.includes(text)),
        `${route.name} loads ${name} in the browser`,
      ).toBe(false);
    }
    expect(
      bytes,
      `${route.name} loads ${(bytes / 1024).toFixed(1)} KB of JavaScript (gzipped), limit ${String(limitKb)} KB`,
    ).toBeLessThanOrEqual(limitBytes(limitKb));
  });
}

// 007 (FR-043, D20): the header's search form is plain server markup, so it adds no client JavaScript
// to any route (the per-route budgets above keep holding with it). Two checks: its source is not a
// client component, and it submits to the search page with JavaScript switched off.
test('the header search form is server markup and works with JavaScript off', async ({
  browser,
  baseURL,
}) => {
  const source = readFileSync(join(process.cwd(), 'src/components/shop/HeaderSearch.tsx'), 'utf8');
  expect(source, 'HeaderSearch must stay a server component').not.toMatch(/['"]use client['"]/);

  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: baseURL ?? '',
    viewport: { width: 1280, height: 800 },
  });
  try {
    const page = await context.newPage();
    await page.goto('/he');
    await page.getByTestId('header-search-input').fill('נר');
    await page.getByTestId('header-search-input').press('Enter');
    await page.waitForURL(/\/he\/search\?q=/);
    expect(new URL(page.url()).searchParams.get('q')).toBe('נר');
  } finally {
    await context.close();
  }
});
