import type { Page } from '@playwright/test';
import { expect, resetDb, sql, test } from './fixtures';

// 008 US8 and US9 (tasks.md T030, T032; contracts/metadata.md): link previews and icons. Desktop
// project only: the tags do not depend on the viewport.

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Run once, in desktop Chromium');
});
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await resetDb();
});

async function meta(page: Page, selector: string): Promise<string | null> {
  const locator = page.locator(selector).first();
  await expect(locator, selector).toHaveAttribute('content', /.+/, { timeout: 5000 });
  return locator.getAttribute('content');
}

async function expectMeta(page: Page, selector: string, value: string | RegExp): Promise<void> {
  await expect(page.locator(selector).first(), selector).toHaveAttribute('content', value, {
    timeout: 5000,
  });
}

async function expectOk(page: Page, url: string, type?: RegExp): Promise<void> {
  const response = await page.request.get(url);
  expect(response.status(), url).toBe(200);
  if (type !== undefined) expect(response.headers()['content-type'], url).toMatch(type);
}

for (const path of ['/he', '/en/contact']) {
  test(`${path}: link preview tags with the brand image`, async ({ page, baseURL }) => {
    await page.goto(path);
    const locale = path.startsWith('/he') ? 'he_IL' : 'en_US';
    expect(await meta(page, 'meta[property="og:title"]')).toBeTruthy();
    expect(await meta(page, 'meta[property="og:description"]')).toBeTruthy();
    expect(await meta(page, 'meta[name="description"]')).toBeTruthy();
    expect(await meta(page, 'meta[property="og:locale"]')).toBe(locale);
    expect(await meta(page, 'meta[property="og:url"]')).toBe(`${baseURL ?? ''}${path}`);
    expect(await meta(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');
    const image = await meta(page, 'meta[property="og:image"]');
    expect(image).toMatch(/^https?:\/\/.+\/brand\/og\.[0-9a-f]+\.jpg$/);
    await expectOk(page, image ?? '', /image\/jpeg/);
    const imageResponse = await page.request.get(image ?? '');
    const cacheControl = imageResponse.headers()['cache-control'] ?? '';
    expect(cacheControl).toContain('max-age=31536000');
    expect(cacheControl).toContain('immutable');
    await expectMeta(page, 'meta[name="twitter:image"]', image ?? '');
    await expectMeta(page, 'meta[property="og:site_name"]', /.+/);
    await expectMeta(page, 'meta[property="og:type"]', 'website');
  });
}

for (const path of ['/he', '/en']) {
  test(`${path}: the title and og:title are the shop name alone`, async ({ page }) => {
    await page.goto(path);
    const ogTitle = await meta(page, 'meta[property="og:title"]');
    expect(ogTitle).not.toContain(' · ');
    const title = await page.title();
    expect(title).not.toContain(' · ');
    expect(title).toBe(ogTitle);
    await expectMeta(page, 'meta[property="og:site_name"]', ogTitle ?? '');
  });
}

test('/en/contact: og:title is the page title without the shop-name suffix', async ({ page }) => {
  await page.goto('/en/contact');
  const siteName = await meta(page, 'meta[property="og:site_name"]');
  const ogTitle = await meta(page, 'meta[property="og:title"]');
  expect(ogTitle).toBeTruthy();
  expect(ogTitle).not.toContain(' · ');
  expect(ogTitle).not.toBe(siteName);
  expect(await page.title()).toBe(`${ogTitle ?? ''} · ${siteName ?? ''}`);
});

for (const path of ['/he', '/en/contact']) {
  test(`${path}: crawlers get the og tags inside <head> of the raw HTML`, async ({ page }) => {
    const response = await page.request.get(path, { headers: { 'user-agent': 'WhatsApp/2.23' } });
    expect(response.status()).toBe(200);
    const html = await response.text();
    const headEnd = html.indexOf('</head>');
    expect(headEnd).toBeGreaterThan(0);
    const head = html.slice(0, headEnd);
    for (const tag of ['og:title', 'og:image', 'og:description', 'og:url']) {
      expect(head, tag).toContain(`property="${tag}"`);
    }
  });
}

test('the home page description is the new default message', async ({ page }) => {
  await page.goto('/he');
  expect(await meta(page, 'meta[name="description"]')).toBe(
    'יצירות סרוגות בעבודת יד, בסבלנות ובאהבה. משלוחים לכל הארץ.',
  );
  await page.goto('/en');
  expect(await meta(page, 'meta[name="description"]')).toBe(
    'Handmade crochet pieces, made with patience and love. Shipping across Israel.',
  );
});

test('a product page keeps its product image', async ({ page }) => {
  await page.goto('/he/product/sample-clay-mug');
  const [row] = await sql<{ storage_key: string }[]>`
    SELECT i.storage_key FROM product_image i JOIN product p ON p.id = i.product_id
    WHERE p.slug = 'sample-clay-mug' AND i.deleted_at IS NULL ORDER BY i.position LIMIT 1`;
  const image = await meta(page, 'meta[property="og:image"]');
  expect(row).toBeDefined();
  expect(image).toContain(row?.storage_key);
  expect(image).not.toContain('/brand/');
  expect(await meta(page, 'meta[property="og:locale"]')).toBe('he_IL');
  expect(await meta(page, 'meta[property="og:site_name"]')).toBeTruthy();
});

test('a page without its own metadata (not found) does not claim an address', async ({ page }) => {
  await page.goto('/he/no-such-page');
  await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
});

for (const path of ['/he', '/admin/sign-in']) {
  test(`${path}: icon, apple touch icon and manifest links resolve`, async ({ page }) => {
    await page.goto(path);
    const hrefs = await page
      .locator('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')
      .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
    expect(hrefs.some((h) => h.endsWith('/favicon.ico'))).toBe(true);
    expect(hrefs.some((h) => /\/brand\/icon-32\.[0-9a-f]+\.png$/.test(h))).toBe(true);
    expect(hrefs.some((h) => /\/brand\/apple-touch-icon\.[0-9a-f]+\.png$/.test(h))).toBe(true);
    expect(hrefs.some((h) => h.endsWith('/site.webmanifest'))).toBe(true);
    for (const href of hrefs) await expectOk(page, href);
    if (path === '/he') {
      expect(await meta(page, 'meta[name="theme-color"]')).toBe('#ffffff');
    }
  });
}

test('/favicon.ico and the web manifest with its icons', async ({ page, baseURL }) => {
  await expectOk(page, '/favicon.ico');
  const response = await page.request.get('/site.webmanifest');
  expect(response.status()).toBe(200);
  const manifest = (await response.json()) as { icons: { src: string }[] };
  expect(manifest.icons.length).toBeGreaterThan(0);
  for (const icon of manifest.icons) {
    await expectOk(page, new URL(icon.src, baseURL).toString(), /image\/png/);
  }
});
