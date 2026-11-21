import { createHash, randomBytes } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { Page, Response } from '@playwright/test';
import { itemsFor } from '../../src/lib/consent/registry';
import { serverEnv } from './env';
import { expect, resetDb, sql, test, waitForFormAge } from './fixtures';

// 003 US1 (tasks.md T009; storefront.md §8.9, §7.20; contracts/routes.md): the content pages,
// the footer, the Cookie Policy table, and that a launch-day visit stores nothing that is not in
// the registry and loads nothing from another origin. All three storefront projects.

test.describe.configure({ mode: 'serial' });

const LAUNCH = { required: false, categories: [], test: false };
const LAUNCH_NAMES = itemsFor(LAUNCH).map((item) => item.name);
const SIX_PAGES = [
  'about',
  'shipping-returns',
  'terms',
  'privacy',
  'cookies',
  'accessibility',
] as const;
const LEGAL_PAGES = SIX_PAGES.filter((slug) => slug !== 'about');
const NOTICE = { he: 'טיוטה — נדרשת בדיקה משפטית', en: 'Draft — requires legal review' } as const;
const IMAGE_PUBLIC_ORIGIN = serverEnv().IMAGE_PUBLIC_ORIGIN;
const MARKER = 'ac-consent-banner-v1';

test.beforeAll(async () => {
  await resetDb();
});

/** Waits until React has attached its handlers to the element (a click before that is lost). */
async function hydrated(page: Page, testId: string): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      return element !== null && Object.keys(element).some((key) => key.startsWith('__reactProps'));
    },
    testId,
    { timeout: 20_000 },
  );
}

async function storageNames(page: Page): Promise<string[]> {
  const cookies = (await page.context().cookies()).map((cookie) => cookie.name);
  const stored = await page.evaluate(() => [
    ...Object.keys(localStorage),
    ...Object.keys(sessionStorage),
  ]);
  return [...cookies, ...stored];
}

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

test('a launch-day visit stores only registry items and loads nothing from another origin', async ({
  page,
  baseURL,
}) => {
  const appOrigin = new URL(baseURL ?? '').origin;
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    if (url.origin !== appOrigin && url.origin !== IMAGE_PUBLIC_ORIGIN) foreign.push(request.url());
  });
  const scripts: Promise<string>[] = [];
  page.on('response', (response: Response) => {
    const url = new URL(response.url());
    if (url.origin === appOrigin && url.pathname.endsWith('.js')) {
      scripts.push(response.text().catch(() => ''));
    }
  });

  await page.goto('/he');
  await expect(page.getByTestId('consent-banner')).toHaveCount(0);
  await expect(page.getByTestId('footer-cookie-settings')).toHaveCount(0);

  await page.locator('a[href="/he/p/sample-clay-mug"]').first().click();
  await hydrated(page, 'add-to-cart');
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('added-to-cart-row')).toBeVisible();

  // Header and product page links reach real pages (spec US1 #6).
  const aboutHref = await page.locator('a[href$="/pages/about"]').first().getAttribute('href');
  // The product page's own Shipping & Returns links (the two disclosures), not the header or
  // footer ones.
  const productShipping = page.locator('main a[href$="/pages/shipping-returns"]');
  await expect(productShipping).toHaveCount(2);
  const shippingHrefs = await productShipping.evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')),
  );
  for (const href of [aboutHref, ...shippingHrefs]) {
    expect(href).not.toBeNull();
    expect((await page.request.get(href ?? '')).status()).toBe(200);
  }

  await page.goto('/he/checkout');
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  for (const suffix of ['terms', 'privacy']) {
    const href = await page.locator(`a[href$="/pages/${suffix}"]`).first().getAttribute('href');
    expect(href).not.toBeNull();
    expect((await page.request.get(href ?? '')).status()).toBe(200);
  }
  await page.getByTestId('field-fullName').fill('דנה כהן');
  await page.getByTestId('field-phone').fill('052-234-5678');
  await page.getByTestId('field-email').fill('dana@example.com');
  await page.getByTestId('delivery-pickup').check();
  await page.getByTestId('payment-offline').check();
  await page.getByTestId('accept-terms').check();
  const during = await storageNames(page);
  await waitForFormAge(page);
  await page.getByTestId('place-order').click();
  await page.waitForURL(/\/he\/order\//, { timeout: 30_000 });
  await expect(page.getByTestId('order-number')).toBeVisible();
  const after = await storageNames(page);

  for (const name of new Set([...during, ...after])) {
    expect(LAUNCH_NAMES, `"${name}" is stored but is not in the registry`).toContain(name);
  }
  // The cart item exists while the form is filled in (a sanity check of the probe).
  expect(during).toContain('ac_cart_v1');
  expect(foreign).toEqual([]);

  // FR-020: the banner's code is not downloaded at launch.
  for (const body of await Promise.all(scripts)) expect(body).not.toContain(MARKER);
});

for (const locale of ['he', 'en'] as const) {
  test(`footer in ${locale}: business details, contact links and the seven page links`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);
    const footer = page.locator('footer');
    await expect(footer.getByTestId('footer-business-name')).toContainText(
      locale === 'he' ? 'שם העסק (להשלמה)' : 'Business name (to be completed)',
    );
    await expect(footer.getByTestId('footer-business-address')).toContainText(
      locale === 'he' ? 'כתובת העסק (להשלמה)' : 'Business address (to be completed)',
    );
    await expect(footer.getByTestId('footer-business-vat')).toHaveCount(0);
    await expect(footer).not.toContainText('000000000');
    await expect(footer.getByTestId('footer-email')).toHaveAttribute(
      'href',
      'mailto:shop@example.invalid',
    );
    await expect(footer.getByTestId('footer-phone')).toHaveAttribute('href', 'tel:+972500000000');
    for (const path of [...SIX_PAGES.map((slug) => `pages/${slug}`), 'contact']) {
      await expect(footer.locator(`a[href="/${locale}/${path}"]`)).toHaveCount(1);
    }
    await expect(footer.getByTestId('footer-cookie-settings')).toHaveCount(0);
    await expect(footer.getByTestId('footer-social')).toHaveCount(0);
    await expectNoViolations(page);
  });

  test(`the six pages in ${locale}: status 200, one h1, draft notice, axe clean`, async ({
    page,
  }) => {
    for (const slug of SIX_PAGES) {
      const response = await page.goto(`/${locale}/pages/${slug}`);
      expect(response?.status(), slug).toBe(200);
      await expect(page.locator('h1'), slug).toHaveCount(1);
      await expect(page.locator('h1'), slug).toBeVisible();
      if ((LEGAL_PAGES as readonly string[]).includes(slug)) {
        await expect(page.locator('main'), slug).toContainText(NOTICE[locale]);
      }
      await expectNoViolations(page);
    }
  });

  test(`the Cookie Policy in ${locale} lists every launch storage item`, async ({ page }) => {
    await page.goto(`/${locale}/pages/cookies`);
    const rows = page.getByTestId('storage-row');
    await expect(rows).toHaveCount(LAUNCH_NAMES.length);
    for (const name of LAUNCH_NAMES) {
      await expect(page.getByTestId('storage-table')).toContainText(name);
    }
    // Public rows first, then the admin ones, marked.
    const adminOnly = locale === 'he' ? 'באזור הניהול בלבד' : 'Admin area only';
    await expect(page.getByTestId('storage-table').getByText(adminOnly)).toHaveCount(2);
    await expect(rows.last()).toContainText(adminOnly);
  });

  test(`/${locale}/pages/contact is 404`, async ({ page }) => {
    const response = await page.goto(`/${locale}/pages/contact`);
    expect(response?.status()).toBe(404);
  });
}

// 003 US5 (tasks.md T035a; FR-024; research R12): visitors are counted without being tracked. The
// counters are read before and after one defined sequence and only the differences are asserted
// (earlier tests in this file also visit pages).
interface Counters {
  views: Map<string, number>;
  visits: number;
  direct: number;
}

async function readCounters(): Promise<Counters> {
  const pages = await sql<{ path: string; views: number }[]>`
    SELECT path, sum(views)::int AS views FROM analytics_daily_page GROUP BY path`;
  const referrers = await sql<{ referrer_host: string; visits: number }[]>`
    SELECT referrer_host, sum(visits)::int AS visits FROM analytics_daily_referrer
    GROUP BY referrer_host`;
  return {
    views: new Map(pages.map((row) => [row.path, row.views])),
    visits: referrers.reduce((sum, row) => sum + row.visits, 0),
    direct: referrers.find((row) => row.referrer_host === '(direct)')?.visits ?? 0,
  };
}

interface Delta {
  views: Record<string, number>;
  visits: number;
  direct: number;
}

function delta(before: Counters, after: Counters): Delta {
  const views: Record<string, number> = {};
  for (const path of new Set([...before.views.keys(), ...after.views.keys()])) {
    const change = (after.views.get(path) ?? 0) - (before.views.get(path) ?? 0);
    if (change !== 0) views[path] = change;
  }
  return { views, visits: after.visits - before.visits, direct: after.direct - before.direct };
}

/** Waits until the database differs from `before` by exactly `expected`, then confirms it holds. */
async function expectDelta(before: Counters, expected: Delta): Promise<void> {
  await expect
    .poll(async () => delta(before, await readCounters()), { timeout: 15_000 })
    .toEqual(expected);
  // Nothing late arrives afterwards (the beacon is asynchronous).
  await new Promise((resolve) => setTimeout(resolve, 800));
  expect(delta(before, await readCounters())).toEqual(expected);
}

test('visitors are counted by page view and arrival, with no cookie and nothing stored', async ({
  browser,
  baseURL,
}) => {
  const base = String(baseURL);
  const slug = 'sample-clay-mug';
  const [zone] = await sql<{ id: string }[]>`SELECT id FROM shipping_zone WHERE code = 'IL'`;
  const [item] = await sql<{ id: string }[]>`SELECT id FROM product WHERE slug = ${slug}`;
  const token = randomBytes(32).toString('base64url');
  const [order] = await sql<{ id: string }[]>`
    INSERT INTO orders
      (public_token_hash, public_token_expires_at, locale, zone_id, currency, customer_name,
       customer_phone, customer_email, delivery_method, payment_method, subtotal_minor,
       total_minor, terms_accepted_at, terms_version, privacy_version)
    VALUES
      (${createHash('sha256').update(token).digest()}, now() + interval '30 days', 'he',
       ${zone?.id ?? ''}, 'ILS', 'Counted', '+972522345678', 'counted@example.test', 'pickup',
       'offline', 6500, 6500, now(), 1, 1)
    RETURNING id`;
  await sql`
    INSERT INTO order_line
      (order_id, product_id, product_name_he, unit_price_minor, quantity, line_total_minor)
    VALUES (${order?.id ?? ''}, ${item?.id ?? ''}, 'פריט', 6500, 1, 6500)`;

  // (1) a fresh visitor lands on the home page, (2) clicks a product card, (3) follows a full
  // page load inside the shop.
  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  const beacons: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v') {
      beacons.push(request.postData() ?? '');
    }
  });
  let before = await readCounters();
  await page.goto('/he');
  await expectDelta(before, { views: { '/he': 1 }, visits: 1, direct: 1 });
  expect(beacons).toEqual([JSON.stringify({ p: '/he', r: '' })]);

  before = await readCounters();
  await page.evaluate(() => {
    (window as unknown as { __kept: boolean }).__kept = true;
  });
  await page.waitForFunction(() => {
    const link = document.querySelector('a[href="/he/p/sample-clay-mug"]');
    return link !== null && Object.keys(link).some((key) => key.startsWith('__reactProps'));
  });
  await page.locator(`a[href="/he/p/${slug}"]`).first().click();
  await page.waitForURL(`**/he/p/${slug}`);
  // A client-side navigation: the page was not reloaded.
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
  await expectDelta(before, { views: { [`/he/p/${slug}`]: 1 }, visits: 0, direct: 0 });
  expect(beacons.at(-1)).toBe(JSON.stringify({ p: `/he/p/${slug}` }));

  before = await readCounters();
  await page.evaluate(() => {
    // A full page load whose referrer is the shop itself (a plain link, not a client navigation).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    location.assign('/he/pages/about');
  });
  await page.waitForURL('**/he/pages/about');
  await expectDelta(before, { views: { '/he/pages/about': 1 }, visits: 0, direct: 0 });
  expect(await storageNames(page)).toEqual([]);
  await context.close();

  // (4) an order page opened directly sends nothing; the first beacon after it is an arrival.
  const second = await browser.newContext({ baseURL: base });
  const orderPage = await second.newPage();
  const orderBeacons: string[] = [];
  orderPage.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v') {
      orderBeacons.push(request.postData() ?? '');
    }
  });
  before = await readCounters();
  await orderPage.goto(`/he/order/${token}`);
  await expect(orderPage.getByTestId('order-number')).toBeVisible();
  await orderPage.waitForFunction(() => {
    const link = document.querySelector('a[href="/he"]');
    return link !== null && Object.keys(link).some((key) => key.startsWith('__reactProps'));
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect(orderBeacons).toEqual([]);
  await expectDelta(before, { views: {}, visits: 0, direct: 0 });

  await orderPage.locator('header a[href="/he"]').first().click();
  await orderPage.waitForURL('**/he');
  await expectDelta(before, { views: { '/he': 1 }, visits: 1, direct: 1 });
  expect(orderBeacons).toEqual([JSON.stringify({ p: '/he', r: '' })]);
  expect(orderBeacons.join('')).not.toContain(token);
  expect(await storageNames(orderPage)).toEqual([]);
  await second.close();
});
