import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import type { Browser, Page, TestInfo } from '@playwright/test';
import { expect, resetDb, signInAsAdmin, sql, test, waitForFormAge } from './fixtures';
import {
  hydrated,
  openCartDrawer,
  placeOfflineOrder,
  putCartItem,
  transitionsDone,
} from './shop-helpers';

// 006 T026 (research D10), extended by 007 T064: full-page screenshots of every screen and state of
// docs/design/storefront.md §8-§9 (he and en) and the admin screens of §12 (he only), at 375, 768,
// 1024 and 1280 px (admin: 375, 768 and 1280 px; the "All pieces" page `/shop` at every width but 768 px), into test-results/design-review/<locale>-<width>-<screen>.png. The coordinator
// reviews them against the design doc and the owner's home example
// (docs/design/home-example.src.html, the reference for the home page) and
// docs/design/storefront.md (the reference for everything else). 007 adds: the home page with its
// row of pieces, `/shop`, the header after scrolling past the hero (`home-scrolled`), a product
// page with "You may also like" (`product-also-like`), the footer with three social links (set by
// SQL, restored after: `footer-social`), and the settings and piece-editor screens with the
// social, home-row and category-checkbox parts. Skipped unless DESIGN_REVIEW=1:
//
//   DESIGN_REVIEW=1 pnpm exec playwright test tests/e2e/design-review.spec.ts --project=chromium-desktop
//
// Test data: the sample products of resetDb() cover the three product cases (sample-soy-candle has
// an option group with colour swatches, sample-ceramic-bowl is not orderable, sample-clay-mug has
// no English text). The spec adds by SQL: an empty category, `shipping-returns` without English
// text, and order status changes on the seeded order. Two online payments are started through the
// fake provider (one left pending, one set to "mismatch"). A screen that cannot be reached is
// listed as a gap at the end of the run instead of failing it.
//
// Known gaps (states that cannot be reached cheaply or safely; "gaps: none" does not mean these
// were captured): the consent banner (§8.13, dormant on this server; reviewed through
// consent.spec.ts); the cart skeleton while loading and the cart pricing-error notice (§8.5, both
// last a moment and need a failing request); the payment-return "checking" spinner (§8.7, gone
// when the status answer arrives); `error.tsx` (§8.12, no safe way to trigger it); an empty catalog
// (§8.1, the review keeps the sample products); the contact rate-limit and expired-form notices
// (§8.10); the header menu at 1280 px (the menu button is hidden from 1024 px by design, so `menu-open` has no 1024 or 1280 px shot).

test.skip(!process.env.DESIGN_REVIEW, 'Set DESIGN_REVIEW=1 to capture the design-review screens');
test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Run once, in desktop Chromium');
});

const OUT = 'test-results/design-review';
const WIDTHS = [375, 768, 1280] as const;
// 007 (FR-008): the full header row starts at 1024 px, so the storefront screens are also shot at
// 1024 px, the narrowest width of the new header. The admin screens keep WIDTHS.
const STORE_WIDTHS = [375, 768, 1024, 1280] as const;
const HEIGHT = 900;
type Locale = 'he' | 'en';
const LOCALES: Locale[] = ['he', 'en'];

const gaps: string[] = [];
let captured = 0;
let orderPath = '';
let failedToken = '';
let pendingToken = '';
let mismatchToken = '';
let candleId = '';
let adminOrderId = '';

test.beforeAll(async ({ browser }, testInfo) => {
  if (testInfo.project.name !== 'chromium-desktop' || !process.env.DESIGN_REVIEW) return;
  mkdirSync(OUT, { recursive: true });
  await resetDb();
  orderPath = await placeOfflineOrder(browser, testInfo);
  const [order] = await sql<{ id: string }[]>`SELECT id FROM orders ORDER BY created_at LIMIT 1`;
  adminOrderId = order?.id ?? '';
  const [candle] = await sql<{ id: string }[]>`
    SELECT id FROM product WHERE slug = 'sample-soy-candle'`;
  candleId = candle?.id ?? '';

  await sql`
    INSERT INTO category (slug, name_he, name_en, sort_order)
    VALUES ('empty-category', 'קטגוריה ריקה', 'Empty category',
            (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM category))`;
  await sql`UPDATE content_page SET title_en = NULL, body_en = NULL WHERE slug = 'shipping-returns'`;

  failedToken = await startOnlinePayment(browser, testInfo, 'fail');
  pendingToken = await startOnlinePayment(browser, testInfo, 'leave');
  mismatchToken = await startOnlinePayment(browser, testInfo, 'leave');
  await sql`
    UPDATE pending_checkout SET state = 'mismatch'
    WHERE resume_token_hash = ${createHash('sha256').update(mismatchToken).digest()}`;
});

test.afterAll(() => {
  if (!process.env.DESIGN_REVIEW) return;
  console.log(`design-review: ${String(captured)} screenshots in ${OUT}`);
  console.log(`design-review gaps: ${gaps.length === 0 ? 'none' : gaps.join('; ')}`);
});

/** Scrolls through the page so lazy images load, then waits for every image and the fonts. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(200, window.innerHeight / 2);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    // The page uses smooth scrolling: scroll back instantly, or the screenshot is taken mid-way.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await document.fonts.ready;
  });
  await page.waitForFunction(() => window.scrollY === 0, undefined, { timeout: 5000 });
  await page
    .waitForFunction(() => [...document.images].every((image) => image.complete), undefined, {
      timeout: 10_000,
    })
    .catch(() => undefined);
}

async function shoot(page: Page, locale: Locale, width: number, screen: string): Promise<void> {
  await settle(page);
  await page.screenshot({
    path: `${OUT}/${locale}-${String(width)}-${screen}.png`,
    fullPage: true,
  });
  captured += 1;
}

/** Runs one capture; a failure is recorded as a gap and the run goes on. */
async function attempt(label: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    gaps.push(
      `${label}: ${error instanceof Error ? (error.message.split('\n')[0] ?? 'failed') : 'failed'}`,
    );
  }
}

async function open(page: Page, path: string): Promise<void> {
  const response = await page.goto(path, { waitUntil: 'networkidle' });
  expect(response).not.toBeNull();
  await expect(page.locator('body')).toBeVisible();
}

async function emptyCart(page: Page): Promise<void> {
  await page.goto('/he/contact');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

/**
 * Starts an online payment through the fake provider in a throw-away context and returns its
 * resume token: `fail` presses "fail" on the fake page, `leave` stops at the fake page (pending).
 */
async function startOnlinePayment(
  browser: Browser,
  testInfo: TestInfo,
  outcome: 'fail' | 'leave',
): Promise<string> {
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL) });
  try {
    const page = await context.newPage();
    await putCartItem(page, 'sample-clay-mug');
    await page.goto('/he/checkout');
    await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
    await hydrated(page, 'place-order');
    await page.getByTestId('field-fullName').fill('דנה כהן');
    await page.getByTestId('field-phone').fill('052-234-5678');
    await page.getByTestId('field-email').fill('dana@example.com');
    await page.getByTestId('delivery-pickup').check();
    await page.getByTestId('payment-online').check();
    await page.getByTestId('accept-terms').check();
    await waitForFormAge(page);
    await page.getByTestId('place-order').click();
    await page.waitForURL(/\/checkout\/fake-pay/, { timeout: 30_000 });
    if (outcome === 'leave') {
      // The fake page does not carry the resume token (only the return URL does), so give the
      // newest pending checkout a token this spec knows.
      const token = randomBytes(32).toString('base64url');
      await sql`
        UPDATE pending_checkout SET resume_token_hash = ${createHash('sha256').update(token).digest()}
        WHERE id = (SELECT id FROM pending_checkout ORDER BY created_at DESC LIMIT 1)`;
      return token;
    }
    await page.getByTestId('fake-pay-fail').click();
    await page.waitForURL(/\/checkout\/return/);
    return new URL(page.url()).searchParams.get('c') ?? '';
  } finally {
    await context.close();
  }
}

for (const locale of LOCALES) {
  test(`storefront screens in ${locale}`, async ({ page, browser }, testInfo) => {
    test.setTimeout(600_000);

    for (const width of STORE_WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT });
      const at = (what: string): string => `${locale} ${String(width)} ${what}`;
      const visit = async (screen: string, path: string, ready?: () => Promise<void>) =>
        attempt(at(screen), async () => {
          await open(page, `/${locale}${path}`);
          await ready?.();
          await shoot(page, locale, width, screen);
        });

      await emptyCart(page);
      await visit('home', '', () => expect(page.getByTestId('home-row')).toBeVisible());
      if (width !== 768) {
        await visit('shop', '/shop');
      }
      await attempt(at('home-scrolled'), async () => {
        // The header after scrolling past the hero (it is see-through only at the very top).
        await open(page, `/${locale}`);
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        await page.evaluate(() => {
          window.scrollTo({ top: window.innerHeight * 1.5, left: 0, behavior: 'instant' });
        });
        await page.waitForFunction(() => window.scrollY > 0, undefined, { timeout: 5000 });
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `${OUT}/${locale}-${String(width)}-home-scrolled.png`,
          fullPage: false,
        });
        captured += 1;
      });
      await visit('category', '/category/sample-ceramics');
      await visit('search', '/search?q=bowl');
      await visit('search-empty-query', '/search');
      await visit('search-no-results', '/search?q=zzzzzz');
      await visit('search-too-long', `/search?q=${'a'.repeat(81)}`);
      await visit('category-empty', '/category/empty-category');
      await visit('product-options', '/product/sample-soy-candle');
      await visit('product-also-like', '/product/sample-soy-candle', () =>
        expect(page.getByTestId('also-like')).toBeVisible(),
      );
      await visit('product-not-orderable', '/product/sample-ceramic-bowl');
      await visit('product-no-english', '/product/sample-clay-mug');
      await visit('product-not-available', '/product/no-such-product');
      await attempt(at('cart-empty'), async () => {
        // The cart is a drawer (007 D21): open it on the home page with an empty cart.
        await open(page, `/${locale}`);
        await openCartDrawer(page);
        await expect(page.getByTestId('cart-empty')).toBeVisible({ timeout: 20_000 });
        await transitionsDone(page);
        await shoot(page, locale, width, 'cart-empty');
      });
      await visit('about', '/pages/about');
      await visit('page-legal-draft', '/pages/terms');
      await visit('page-no-english', '/pages/shipping-returns');
      await visit('contact', '/contact');
      await visit('404', '/no-such-page');
      await visit('order', orderPath);
      await visit('order-unknown', `/order/${randomBytes(32).toString('base64url')}`);
      await visit('return-failed', `/checkout/return?c=${failedToken}&r=failure`, () =>
        expect(page.getByTestId('retry-payment')).toBeVisible({ timeout: 15_000 }),
      );
      await visit('return-expired', '/checkout/return?c=unknown');
      await visit('return-mismatch', `/checkout/return?c=${mismatchToken}&r=success`, () =>
        expect(page.getByTestId('return-mismatch')).toBeVisible({ timeout: 15_000 }),
      );
      await attempt(at('return-timeout'), async () => {
        // The page gives up after 60 s of polling; a fake clock in a throw-away context skips the wait.
        const context = await browser.newContext({
          baseURL: String(testInfo.project.use.baseURL),
          viewport: { width, height: HEIGHT },
        });
        try {
          await context.clock.install();
          const later = await context.newPage();
          await later.goto(`/${locale}/checkout/return?c=${pendingToken}&r=success`, {
            waitUntil: 'domcontentloaded',
          });
          await expect(later.getByTestId('return-status')).toBeVisible({ timeout: 20_000 });
          await later.waitForTimeout(500);
          await context.clock.fastForward(65_000);
          await expect(later.getByTestId('return-timeout')).toBeVisible({ timeout: 15_000 });
          await shoot(later, locale, width, 'return-timeout');
        } finally {
          await context.close();
        }
      });

      await attempt(at('cart'), async () => {
        await putCartItem(page, 'sample-soy-candle');
        await open(page, `/${locale}`);
        await openCartDrawer(page);
        await expect(page.getByTestId('cart-line')).toHaveCount(1, { timeout: 20_000 });
        await transitionsDone(page);
        await shoot(page, locale, width, 'cart');
      });
      await attempt(at('cart-flagged'), async () => {
        await putCartItem(page, 'sample-ceramic-bowl');
        await open(page, `/${locale}`);
        await openCartDrawer(page);
        await expect(page.getByTestId('cart-flag')).toBeVisible({ timeout: 20_000 });
        await hydrated(page, 'cart-continue');
        await page.getByTestId('cart-continue').click();
        await page.waitForTimeout(400);
        await shoot(page, locale, width, 'cart-flagged');
      });
      await attempt(at('checkout'), async () => {
        await putCartItem(page, 'sample-clay-mug');
        await open(page, `/${locale}/checkout`);
        await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
        await shoot(page, locale, width, 'checkout');
        await hydrated(page, 'place-order');
        await page.getByTestId('place-order').click();
        await expect(page.getByTestId('checkout-errors')).toBeVisible({ timeout: 10_000 });
        await shoot(page, locale, width, 'checkout-errors');
      });
      await attempt(at('checkout-other-country'), async () => {
        await open(page, `/${locale}/checkout`);
        await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
        await hydrated(page, 'place-order');
        await page.getByTestId('delivery-shipping').check();
        await page.getByTestId('field-country').selectOption('other');
        await expect(page.getByTestId('country-other-message')).toBeVisible();
        await shoot(page, locale, width, 'checkout-other-country');
      });
      await attempt(at('contact-errors'), async () => {
        await open(page, `/${locale}/contact`);
        await hydrated(page, 'contact-submit');
        await page.getByTestId('contact-submit').click();
        await expect(page.getByTestId('contact-errors')).toBeVisible({ timeout: 10_000 });
        await shoot(page, locale, width, 'contact-errors');
      });
      await attempt(at('contact-sent'), async () => {
        await sql`TRUNCATE rate_limit_bucket, notification_throttle`;
        await open(page, `/${locale}/contact`);
        await hydrated(page, 'contact-submit');
        await page.getByTestId('field-name').fill('Dana Cohen');
        await page.getByTestId('field-email').fill('dana-contact@example.com');
        await page
          .getByTestId('field-message')
          .fill('Hello, a question about a pink hat in the design review.');
        await waitForFormAge(page);
        await page.getByTestId('contact-submit').click();
        await expect(page.getByTestId('contact-sent')).toBeVisible({ timeout: 15_000 });
        await shoot(page, locale, width, 'contact-sent');
      });
      await attempt(at('menu-open'), async () => {
        await open(page, `/${locale}`);
        const menuButton = page.locator('#site-header button[popovertarget="site-menu"]');
        // From 1024 px the menu button is hidden by design (a known gap in the header comment).
        if (!(await menuButton.isVisible())) return;
        await hydrated(page, 'cart-link');
        await menuButton.click();
        await expect(page.locator('#site-menu')).toBeVisible();
        await transitionsDone(page);
        await page.screenshot({
          path: `${OUT}/${locale}-${String(width)}-menu-open.png`,
          fullPage: false,
        });
        captured += 1;
        await page.keyboard.press('Escape');
      });
    }
  });
}

for (const locale of LOCALES) {
  test(`footer with three social links in ${locale}`, async ({ page }) => {
    test.setTimeout(300_000);
    await sql`UPDATE shop_settings SET
      social_instagram_url = 'https://www.instagram.com/aviva',
      social_facebook_url = 'https://www.facebook.com/aviva',
      social_tiktok_url = 'https://www.tiktok.com/@aviva'`;
    try {
      for (const width of STORE_WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        await attempt(`${locale} ${String(width)} footer-social`, async () => {
          await open(page, `/${locale}`);
          await expect(page.getByTestId('footer-social').getByRole('link')).toHaveCount(3);
          await shoot(page, locale, width, 'footer-social');
        });
      }
    } finally {
      await sql`UPDATE shop_settings SET social_instagram_url = NULL, social_facebook_url = NULL, social_tiktok_url = NULL`;
    }
  });
}

const ORDER_STATES: { name: string; set: () => Promise<unknown> }[] = [
  {
    name: 'order-shipped',
    set: () => sql`
      UPDATE orders SET status = 'shipped', delivery_method = 'shipping',
        tracking_number = 'RR123456789IL' WHERE true`,
  },
  {
    name: 'order-ready-for-pickup',
    set: () => sql`
      UPDATE orders SET status = 'ready_for_pickup', delivery_method = 'pickup',
        tracking_number = NULL, pickup_note = 'אפשר לאסוף מחר אחרי 16:00' WHERE true`,
  },
  {
    name: 'order-completed',
    set: () => sql`
      UPDATE orders SET status = 'completed', payment_state = 'paid', pickup_note = NULL
      WHERE true`,
  },
  {
    name: 'order-cancelled',
    set: () => sql`
      UPDATE orders SET status = 'cancelled', payment_state = 'awaiting_payment' WHERE true`,
  },
];

for (const locale of LOCALES) {
  test(`order page states in ${locale}`, async ({ page }) => {
    test.setTimeout(600_000);
    try {
      for (const state of ORDER_STATES) {
        await state.set();
        for (const width of STORE_WIDTHS) {
          await page.setViewportSize({ width, height: HEIGHT });
          await attempt(`${locale} ${String(width)} ${state.name}`, async () => {
            await open(page, `/${locale}${orderPath}`);
            await expect(page.getByTestId('order-number')).toBeVisible();
            await shoot(page, locale, width, state.name);
          });
        }
      }
    } finally {
      await sql`
        UPDATE orders SET status = 'new', payment_state = 'awaiting_payment',
          delivery_method = 'pickup', tracking_number = NULL, pickup_note = NULL WHERE true`;
    }
  });
}

test('admin screens in he', async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 375, height: HEIGHT });
  await signInAsAdmin(page);

  const screens: [string, string][] = [
    ['admin-orders', '/admin/orders'],
    ['admin-order', `/admin/orders/${adminOrderId}`],
    ['admin-home', '/admin'],
    ['admin-content', '/admin/content'],
    ['admin-content-editor', '/admin/content/terms'],
    ['admin-customers', '/admin/customers'],
    ['admin-stats', '/admin/stats'],
    ['admin-products', '/admin/products'],
    ['admin-product-editor', `/admin/products/${candleId}`],
    ['admin-settings', '/admin/settings'],
  ];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT });
    for (const [screen, path] of screens) {
      await attempt(`he ${String(width)} ${screen}`, async () => {
        await open(page, path);
        await expect(page.locator('main')).toBeVisible();
        await shoot(page, 'he', width, screen);
      });
    }
  }
});
