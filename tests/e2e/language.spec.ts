import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, readOutbox, resetDb, signInAsAdmin, sql, test, waitForFormAge } from './fixtures';

// 005 English version and language switch (tasks.md T005 and later): the switch on every public
// page, its keep-the-page behaviour with and without JavaScript, the admin without a switch, and
// the narrow-screen header (storefront.md §7.19, §11). Runs on chromium-desktop and
// chromium-mobile unless a test skips one of them.

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await resetDb();
});

const SMOKE = 'smoke: the switch and the root redirect';

test.beforeEach(({}, testInfo) => {
  // Only the smoke test also runs in mobile WebKit (Safari cookie handling).
  test.skip(
    testInfo.project.name === 'webkit-mobile'
      ? !testInfo.title.startsWith(SMOKE)
      : !['chromium-desktop', 'chromium-mobile'].includes(testInfo.project.name),
    'language switch: chromium projects',
  );
});

/** Paths without the locale prefix, as in contracts/seo.md. */
const PUBLIC_ROUTES = [
  '',
  '/c/sample-ceramics',
  '/p/sample-ceramic-bowl',
  '/search?q=bowl',
  '/cart',
  '/pages/about',
  '/pages/shipping-returns',
  '/pages/terms',
  '/pages/privacy',
  '/pages/cookies',
  '/pages/accessibility',
  '/contact',
];

const SWITCH_HREF = 'header a[href^="/api/locale"]';

/** The header's compact switch. */
const headerSwitch = (page: Page) => page.locator(SWITCH_HREF);

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

async function expectLocale(page: Page, locale: 'he' | 'en'): Promise<void> {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', locale);
  await expect(html).toHaveAttribute('dir', locale === 'he' ? 'rtl' : 'ltr');
}

function pathOf(page: Page): string {
  const url = new URL(page.url());
  return url.pathname + url.search;
}

/** Canonical and hreflang links of the page head (contracts/seo.md). */
async function expectAlternates(page: Page, locale: 'he' | 'en', path: string): Promise<void> {
  const origin = new URL(page.url()).origin;
  const head = await page.evaluate(() => ({
    canonical: [...document.querySelectorAll('link[rel="canonical"]')].map((link) =>
      link.getAttribute('href'),
    ),
    alternates: Object.fromEntries(
      [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((link) => [
        link.getAttribute('hreflang'),
        link.getAttribute('href'),
      ]),
    ) as Record<string, string>,
  }));
  expect(head.canonical).toEqual([`${origin}/${locale}${path}`]);
  expect(head.alternates).toEqual({
    he: `${origin}/he${path}`,
    en: `${origin}/en${path}`,
    'x-default': `${origin}/he${path}`,
  });
}

test('the header switch on /he reads EN, links to /api/locale and lands on /en and back', async ({
  page,
}) => {
  await page.goto('/he');
  const toEnglish = headerSwitch(page);
  await expect(toEnglish).toHaveText('EN');
  await expect(toEnglish).toHaveAttribute('aria-label', 'EN – English');
  await expect(toEnglish).toHaveAttribute('lang', 'en');
  await expect(toEnglish).toHaveAttribute('rel', /nofollow/);
  expect(await toEnglish.evaluate((element) => element.tagName)).toBe('A');
  expect(await toEnglish.getAttribute('href')).toMatch(/^\/api\/locale\?to=en&path=/);

  await toEnglish.click();
  await expect(page).toHaveURL(/\/en$/);
  expect(pathOf(page)).toBe('/en');
  await expectLocale(page, 'en');

  const toHebrew = headerSwitch(page);
  await expect(toHebrew).toHaveText('עב');
  await expect(toHebrew).toHaveAttribute('aria-label', 'עב – עברית');
  await toHebrew.click();
  await expect(page).toHaveURL(/\/he$/);
  expect(pathOf(page)).toBe('/he');
  await expectLocale(page, 'he');
});

test('the switch keeps the page, the sort and the search across a client navigation', async ({
  page,
}) => {
  await page.goto('/he');
  await hydrated(page, 'product-card');
  // A marker on window proves the next two steps are client navigations, not full loads.
  await page.evaluate(() => {
    (window as unknown as { __clientNav: boolean }).__clientNav = true;
  });
  await page.getByRole('link', { name: 'קרמיקה' }).first().click();
  await expect(page).toHaveURL(/\/he\/c\/sample-ceramics$/);
  await expect(headerSwitch(page)).toHaveAttribute(
    'href',
    `/api/locale?to=en&path=${encodeURIComponent('/en/c/sample-ceramics')}`,
  );

  await page.locator('a[href="/he/c/sample-ceramics?sort=price-asc"]').click();
  await expect(page).toHaveURL(/\/he\/c\/sample-ceramics\?sort=price-asc$/);
  await expect(headerSwitch(page)).toHaveAttribute(
    'href',
    `/api/locale?to=en&path=${encodeURIComponent('/en/c/sample-ceramics?sort=price-asc')}`,
  );
  expect(
    await page.evaluate(() => (window as unknown as { __clientNav?: boolean }).__clientNav),
  ).toBe(true);

  await headerSwitch(page).click();
  await expect(page).toHaveURL(/\/en\/c\/sample-ceramics\?sort=price-asc$/);
  expect(pathOf(page)).toBe('/en/c/sample-ceramics?sort=price-asc');
  await expectLocale(page, 'en');

  await page.goto('/he/search?q=%D7%A7%D7%A2%D7%A8%D7%94');
  await headerSwitch(page).click();
  await expect(page).toHaveURL(/\/en\/search\?q=/);
  expect(new URL(page.url()).searchParams.get('q')).toBe('קערה');
});

test('the cart survives the switch (phones)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-desktop', 'cart flows run on the phone projects');
  await page.goto('/he/c/sample-ceramics?sort=price-asc');
  await hydrated(page, 'product-card');
  await page.getByTestId('product-card').filter({ hasText: 'ספל חרס' }).click();
  await expect(page).toHaveURL(/\/he\/p\/sample-clay-mug$/);
  await hydrated(page, 'add-to-cart');
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-badge')).toHaveText('1');

  await headerSwitch(page).click();
  await expect(page).toHaveURL(/\/en\/p\/sample-clay-mug$/);
  await expectLocale(page, 'en');
  await expect(page.getByTestId('cart-badge')).toHaveText('1');
  await headerSwitch(page).click();
  await expect(page).toHaveURL(/\/he\/p\/sample-clay-mug$/);
  await expect(page.getByTestId('cart-badge')).toHaveText('1');
});

test('the menu and the footer carry the full-word switch', async ({ page }) => {
  for (const [locale, word, other] of [
    ['he', 'English', 'en'],
    ['en', 'עברית', 'he'],
  ] as const) {
    await page.goto(`/${locale}`);
    const inFooter = page.locator(`footer a[href^="/api/locale?to=${other}"]`);
    await expect(inFooter).toHaveText(word);
    await expect(inFooter).toHaveAttribute('lang', other);

    // The menu button is hidden on desktop widths unless the shop has many categories.
    const menuButton = page.locator('[popovertarget="site-menu"]:visible');
    if ((await menuButton.count()) === 0) continue;
    await menuButton.click();
    const inMenu = page.locator(`#site-menu a[href^="/api/locale?to=${other}"]`);
    await expect(inMenu).toBeVisible();
    await expect(inMenu).toHaveText(word);
  }
});

test('a 404 page keeps its address in the other language', async ({ page }) => {
  await page.goto('/he/no-such-page');
  await expect(headerSwitch(page)).toHaveAttribute(
    'href',
    `/api/locale?to=en&path=${encodeURIComponent('/en/no-such-page')}`,
  );
  await headerSwitch(page).click();
  await expect(page).toHaveURL(/\/en\/no-such-page$/);
  await expectLocale(page, 'en');
});

test('the admin has no language switch (phones)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-desktop', 'admin flows run on the phone projects');
  await signInAsAdmin(page);
  await page.goto('/admin');
  await expect(page.locator('a[href^="/api/locale"]')).toHaveCount(0);
});

test('no horizontal overflow at 320 and 375 px and the switch stays visible', async ({ page }) => {
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/he', '/en', '/he/p/sample-ceramic-bowl', '/en/p/sample-ceramic-bowl']) {
      await page.goto(path);
      await expect(headerSwitch(page)).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow, `${path} at ${String(width)} px`).toBe(false);
    }
  }
});

test('without JavaScript the switch still carries the page and the query', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL ?? '' });
  const page = await context.newPage();
  await page.goto('/he/c/sample-ceramics?sort=price-asc');
  const href = (await headerSwitch(page).getAttribute('href')) ?? '';
  // If the build had to fall back to a Suspense boundary the query would be missing here.
  expect(decodeURIComponent(href)).toContain('path=/en/c/sample-ceramics?sort=price-asc');
  await context.close();
});

test('every public page shows the header switch in both languages', async ({ page }) => {
  for (const locale of ['he', 'en'] as const) {
    for (const route of PUBLIC_ROUTES) {
      await page.goto(`/${locale}${route}`);
      await expect(headerSwitch(page), `/${locale}${route}`).toBeVisible();
    }
  }
});

// ---------------------------------------------------------------- US2: the choice is remembered

const LOCALE_COOKIE = 'NEXT_LOCALE';

async function localeCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === LOCALE_COOKIE);
}

test('a fresh visit to / lands on /he, whatever the browser language', async ({
  browser,
  baseURL,
}) => {
  for (const options of [{}, { locale: 'en-US', extraHTTPHeaders: { 'Accept-Language': 'en' } }]) {
    const context = await browser.newContext({ baseURL: baseURL ?? '', ...options });
    const page = await context.newPage();
    await page.goto('/');
    expect(pathOf(page)).toBe('/he');
    await expectLocale(page, 'he');
    await context.close();
  }
});

test('browsing and hovering the switch never set the cookie; pressing it does, for a year', async ({
  page,
}) => {
  await page.goto('/he');
  await page.goto('/he/p/sample-ceramic-bowl');
  await page.goto('/he/cart');
  await headerSwitch(page).hover();
  await headerSwitch(page).focus();
  expect(await localeCookie(page)).toBeUndefined();

  await headerSwitch(page).click();
  await expect(page).toHaveURL(/\/en\/cart$/);
  const cookie = await localeCookie(page);
  expect(cookie?.value).toBe('en');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  const yearAhead = Date.now() / 1000 + 365 * 24 * 3600;
  expect(Math.abs((cookie?.expires ?? 0) - yearAhead)).toBeLessThan(2 * 24 * 3600);

  await page.goto('/');
  expect(pathOf(page)).toBe('/en');
  await expectLocale(page, 'en');

  // An address with a language wins over the cookie, and does not change it.
  await page.goto('/he/p/sample-ceramic-bowl');
  await expectLocale(page, 'he');
  expect((await localeCookie(page))?.value).toBe('en');
});

test('a shared /en link opens in English and stores nothing', async ({ page }) => {
  await page.goto('/en/p/sample-ceramic-bowl');
  await expectLocale(page, 'en');
  expect(await localeCookie(page)).toBeUndefined();
});

test('an unknown cookie value is ignored at /', async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: LOCALE_COOKIE, value: 'fr', url: baseURL ?? '' }]);
  await page.goto('/');
  expect(pathOf(page)).toBe('/he');
  await expectLocale(page, 'he');
});

test(SMOKE, async ({ page }) => {
  await page.goto('/he');
  await headerSwitch(page).click();
  await expect(page).toHaveURL(/\/en$/);
  await page.goto('/');
  expect(pathOf(page)).toBe('/en');
});

// ---------------------------------------------------------------- US3: the English checkout

/** Visible text outside `lang="he"` elements that holds Hebrew letters (research R8). */
async function strayHebrew(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      const parent = node.parentElement;
      if (parent === null || !/[\u0590-\u05ff]/.test(text)) continue;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue;
      if (!parent.checkVisibility()) continue;
      const lang = parent.closest('[lang]')?.getAttribute('lang');
      if (lang !== 'he') found.push(text.trim());
    }
    return found;
  });
}

test('an English order: every step in English, the order and the email stay English (phones)', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'chromium-desktop',
    'checkout flows run on the phone projects',
  );

  await page.goto('/en');
  await expectLocale(page, 'en');
  await expect(headerSwitch(page)).toBeVisible();
  await page.goto('/en/p/sample-soy-candle');
  await hydrated(page, 'add-to-cart');
  await expectLocale(page, 'en');
  await expect(headerSwitch(page)).toBeVisible();
  // The English price format: the shekel sign, then the amount with two decimals.
  await expect(page.getByTestId('buy-price')).toHaveText(/₪\s?45\.00/);
  await page.getByTestId('option-chip').filter({ hasText: 'Cream' }).click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('added-to-cart-row')).toBeVisible();

  await page.goto('/en/cart');
  await expectLocale(page, 'en');
  await expect(headerSwitch(page)).toBeVisible();
  await expect(page.getByTestId('cart-line')).toHaveCount(1);

  await page.goto('/en/checkout');
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  await expectLocale(page, 'en');
  await expect(headerSwitch(page)).toBeVisible();
  await page.getByTestId('field-fullName').fill('Dana Cohen');
  await page.getByTestId('field-phone').fill('052-234-5678');
  await page.getByTestId('field-email').fill('dana@example.com');
  await page.getByTestId('delivery-pickup').check();
  await page.getByTestId('payment-offline').check();
  await page.getByTestId('accept-terms').check();
  await waitForFormAge(page);
  await page.getByTestId('place-order').click();

  await page.waitForURL(/\/en\/order\//, { timeout: 30_000 });
  await expectLocale(page, 'en');
  await expect(headerSwitch(page)).toBeVisible();
  await expect(page.getByTestId('order-number')).toContainText('1001');
  expect(await strayHebrew(page)).toEqual([]);
  const token = new URL(page.url()).pathname.split('/').pop() ?? '';
  expect(token.length).toBeGreaterThan(10);
  await expectAlternates(page, 'en', `/order/${token}`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  // The switch on the order page opens the same order in Hebrew; the email language stays.
  await headerSwitch(page).click();
  await expect(page).toHaveURL(new RegExp(`/he/order/${token}$`));
  await expectLocale(page, 'he');
  await expectAlternates(page, 'he', `/order/${token}`);
  await page.goto(`/en/order/${token}`);

  const [mail] = await readOutbox('order-confirmation');
  expect(await readOutbox('order-confirmation')).toHaveLength(1);
  expect(mail?.locale).toBe('en');
  expect(mail?.text_body).toContain('This link shows where your order stands at any time.');
  expect(mail?.text_body).toContain('/en/order/');
  expect(mail?.text_body).toMatch(/₪\s?45\.00/);
  expect(mail?.html).toContain('lang="en"');

  // The payment return page (reachable directly) in English.
  await page.goto(`/en/checkout/return?c=${token}`);
  await expectLocale(page, 'en');
  await expect(headerSwitch(page)).toBeVisible();
  // Wait for the status polling to reach its final state before reading the text.
  const status = page.getByTestId('return-status');
  await expect(status.filter({ hasText: 'Checking your payment' })).toHaveCount(0, {
    timeout: 30_000,
  });
  const settled = page.locator('main');
  await expect(settled).toContainText(/[A-Za-z]{3,}/);
  expect(await strayHebrew(page)).toEqual([]);
  await expectAlternates(page, 'en', '/checkout/return');
});

// ---------------------------------------------------------------- US4: Hebrew fallback

test('an English page shows Hebrew owner text marked as Hebrew, with no "not translated" note', async ({
  page,
}) => {
  await page.goto('/en/p/sample-clay-mug');
  await expectLocale(page, 'en');
  const name = page.locator('h1[lang="he"][dir="auto"]');
  await expect(name).toHaveText('ספל חרס');
  const description = page
    .locator('p[lang="he"][dir="auto"]')
    .filter({ hasText: 'ספל חרס עם ידית' });
  await expect(description).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText(/not translated|no English|untranslated/i);
});

test('the admin product list marks products without English (phones)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'admin flows run on chromium-mobile');
  await signInAsAdmin(page);
  await page.goto('/admin/products');
  const rows = page.getByTestId('admin-product-row');
  await expect(rows.filter({ hasText: 'ספל חרס' }).getByText('אין אנגלית')).toBeVisible();
  await expect(rows.filter({ hasText: 'קערת קרמיקה' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'קערת קרמיקה' }).getByText('אין אנגלית')).toHaveCount(0);
  // Storefront §12.9: axe reports no violations on the list.
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

// ---------------------------------------------------------------- US5: search engines

test('every public page names its canonical and both language versions (desktop)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'head checks run once, on desktop');
  for (const locale of ['he', 'en'] as const) {
    for (const route of PUBLIC_ROUTES) {
      const [path = ''] = route.split('?');
      await page.goto(`/${locale}${route}`);
      await expectAlternates(page, locale, path);
    }
  }
});

test('the sitemap, robots file and noindex pages (desktop)', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'head checks run once, on desktop');
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain('/en/p/sample-ceramic-bowl');
  expect(xml).toContain('/he/p/sample-ceramic-bowl');
  expect(xml).not.toMatch(/\/(admin|api|cart|checkout|search|order)\b/);

  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  const text = await robots.text();
  expect(text).toContain('Disallow: /admin');
  expect(text).toContain('Disallow: /api/');
  expect(text).toContain('/sitemap.xml');

  for (const path of ['/en/search?q=bowl', '/en/cart', '/en/checkout']) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute('content', /noindex/);
  }

  // The middleware sends no hreflang `Link` header (research R4): the HTML tags are the only ones.
  const product = await request.get('/he/p/sample-ceramic-bowl');
  expect(product.headers()['link'] ?? '').not.toContain('hreflang');
});

// ---------------------------------------------------------------- US6: the English reads naturally

test('no Hebrew shows on English pages outside elements marked lang="he"', async ({ page }) => {
  for (const route of PUBLIC_ROUTES) {
    await page.goto(`/en${route}`);
    await expectLocale(page, 'en');
    expect(await strayHebrew(page), `/en${route}`).toEqual([]);
  }
  await page.goto('/en/c/sample-ceramics');
  expect(await strayHebrew(page), 'category with the Hebrew clay mug').toEqual([]);
  await page.goto('/en/p/sample-clay-mug');
  expect(await strayHebrew(page), 'the Hebrew-only product').toEqual([]);
});

test('no stray Hebrew on the English cart and checkout (phones)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-desktop', 'cart flows run on the phone projects');
  await page.goto('/en/p/sample-soy-candle');
  await hydrated(page, 'add-to-cart');
  await page.getByTestId('option-chip').filter({ hasText: 'Cream' }).click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('added-to-cart-row')).toBeVisible();

  await page.goto('/en/cart');
  await expect(page.getByTestId('cart-line')).toHaveCount(1);
  expect(await strayHebrew(page), '/en/cart with an item').toEqual([]);

  await page.goto('/en/checkout');
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  expect(await strayHebrew(page), '/en/checkout').toEqual([]);
});

async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations, label).toEqual([]);
}

test('axe finds no violations on the home and product pages in both languages', async ({
  page,
}) => {
  for (const path of ['/he', '/en', '/he/p/sample-ceramic-bowl', '/en/p/sample-ceramic-bowl']) {
    await page.goto(path);
    await expect(headerSwitch(page)).toBeVisible();
    await expectNoAxeViolations(page, path);
  }
  // The photo strip is a keyboard stop with a visible 3 px ring (WCAG 2.4.7).
  await page.goto('/en/p/sample-ceramic-bowl');
  await hydrated(page, 'gallery-zoom');
  const track = page.getByTestId('gallery-track');
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab');
    if (await track.evaluate((element) => element === document.activeElement)) break;
  }
  await expect(track).toBeFocused();
  const ring = await page.getByTestId('gallery-focus-ring').evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(ring).toEqual({ style: 'solid', width: '3px' });
  // Once more with the menu popover open (when this width has a menu button).
  await page.goto('/en');
  const menuButton = page.locator('[popovertarget="site-menu"]:visible');
  if ((await menuButton.count()) > 0) {
    await menuButton.click();
    await expect(page.locator('#site-menu a[href^="/api/locale?to=he"]')).toBeVisible();
    await expectNoAxeViolations(page, '/en with the menu open');
  }
});

test('the compact switch has a 44 by 44 px hit area in both languages', async ({ page }) => {
  for (const path of ['/he', '/en']) {
    await page.goto(path);
    const link = headerSwitch(page);
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    if (box === null) throw new Error('no box');
    expect(box.width + 8, `${path} width`).toBeGreaterThanOrEqual(44);
    expect(box.height + 8, `${path} height`).toBeGreaterThanOrEqual(44);
    const midX = box.x + box.width / 2;
    const midY = box.y + box.height / 2;
    const outside: [string, number, number][] = [
      ['above', midX, box.y - 3],
      ['below', midX, box.y + box.height + 3],
      ['before', box.x - 3, midY],
      ['after', box.x + box.width + 3, midY],
    ];
    for (const [side, x, y] of outside) {
      const hit = await page.evaluate(
        ([px, py]) => {
          const element = document.elementFromPoint(px ?? 0, py ?? 0);
          return element?.closest('a')?.getAttribute('href') ?? null;
        },
        [x, y],
      );
      expect(hit, `${path} ${side} the box`).toMatch(/^\/api\/locale\?to=/);
    }
  }
});

test('owner text missing in English falls back to Hebrew, marked lang="he"', async ({ page }) => {
  const [settings] = await sql<{ shop_name_en: string | null }[]>`
    SELECT shop_name_en FROM shop_settings LIMIT 1`;
  const [categoryRow] = await sql<{ name_en: string | null }[]>`
    SELECT name_en FROM category WHERE slug = 'sample-ceramics'`;
  try {
    await sql`UPDATE shop_settings SET shop_name_en = NULL`;
    await sql`UPDATE category SET name_en = NULL WHERE slug = 'sample-ceramics'`;
    for (const path of ['/en', '/en/c/sample-ceramics']) {
      await page.goto(path);
      await expectLocale(page, 'en');
      expect(await strayHebrew(page), path).toEqual([]);
    }
    // The category heading itself is the Hebrew name, marked as Hebrew.
    await expect(page.locator('h1[lang="he"]')).toBeVisible();
  } finally {
    await sql`UPDATE shop_settings SET shop_name_en = ${settings?.shop_name_en ?? null}`;
    await sql`UPDATE category SET name_en = ${categoryRow?.name_en ?? null} WHERE slug = 'sample-ceramics'`;
  }
});
