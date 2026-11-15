import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import {
  expect,
  MIN_FORM_AGE_MS,
  resetDb,
  signInAsAdmin,
  sql,
  test,
  waitForFormAge,
} from './fixtures';
import { hydrated, placeOfflineOrder, putCartItem } from './shop-helpers';

// 006 T019 (research D6, 001 T124 narrowed): axe (WCAG 2.1 A/AA, zero violations) on the storefront
// in both locales at 375 and 1280 px, on the admin at 375 (phone first, storefront.md §12) and
// 1280 px, and the keyboard-only paths.
//
// Existing specs also run axe, but on other viewports (the phone projects) or on single pages, so
// none of the pages below is left out; they stay as extra coverage:
// - home and product pages, both locales: language.spec.ts (not repeated here);
// - admin products list: language.spec.ts; admin orders list: admin-orders.spec.ts; order page
//   states: order-tracking.spec.ts; contact: contact.spec.ts; the six content pages: privacy.spec.ts;
// - admin sign-in: admin-auth.spec.ts; admin content list: admin-content.spec.ts; customers:
//   admin-privacy.spec.ts; admin home: admin-home.spec.ts; statistics: admin-stats.spec.ts.

test.describe.configure({ mode: 'serial' });

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Run once, in desktop Chromium');
});

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

async function expectNoViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(' | ')})`,
    ),
    label,
  ).toEqual([]);
}

let orderPath = '';
let productId = '';
let orderId = '';

test.beforeAll(async ({ browser }, testInfo) => {
  if (testInfo.project.name !== 'chromium-desktop') return;
  await resetDb();
  orderPath = await placeOfflineOrder(browser, testInfo);
  const [product] = await sql<
    { id: string }[]
  >`SELECT id FROM product WHERE slug = 'sample-clay-mug'`;
  const [order] = await sql<{ id: string }[]>`SELECT id FROM orders ORDER BY created_at LIMIT 1`;
  productId = product?.id ?? '';
  orderId = order?.id ?? '';
});

const CONTENT_PAGES = [
  'about',
  'shipping-returns',
  'terms',
  'privacy',
  'cookies',
  'accessibility',
] as const;

for (const locale of ['he', 'en'] as const) {
  for (const viewport of [PHONE, DESKTOP]) {
    test(`storefront ${locale} at ${String(viewport.width)} px has no axe violations`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const check = async (path: string): Promise<void> => {
        const response = await page.goto(`/${locale}${path}`);
        expect(response?.status(), path).toBe(path === '/no-such-page' ? 404 : 200);
        await expect(page.locator('main')).toBeVisible();
        await expectNoViolations(page, `${locale} ${path} ${String(viewport.width)}`);
      };

      await check('/c/sample-ceramics');
      await check('/search?q=bowl');
      for (const slug of CONTENT_PAGES) await check(`/pages/${slug}`);
      await check('/contact');
      await check('/no-such-page');
      await check(orderPath);

      await putCartItem(page, 'sample-clay-mug');
      await check('/cart');
      await expect(page.getByTestId('cart-line')).toHaveCount(1);
      await expectNoViolations(page, `${locale} cart with a line`);
      await check('/checkout');
      await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
      await expectNoViolations(page, `${locale} checkout with a line`);
    });
  }
}

test('the admin has no axe violations at 375 and 1280 px', async ({ page }) => {
  // Signed out first: the sign-in page.
  for (const viewport of [PHONE, DESKTOP]) {
    await page.setViewportSize(viewport);
    await page.goto('/admin/sign-in');
    await expect(page.getByTestId('admin-sign-in-google')).toBeVisible();
    await expectNoViolations(page, `/admin/sign-in ${String(viewport.width)}`);
  }

  await signInAsAdmin(page);
  const paths = [
    `/admin/products/${productId}`,
    '/admin/orders',
    `/admin/orders/${orderId}`,
    '/admin/settings',
    '/admin/content/terms',
    '/admin/customers',
  ];
  for (const viewport of [PHONE, DESKTOP]) {
    await page.setViewportSize(viewport);
    for (const path of paths) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expectNoViolations(page, `${path} ${String(viewport.width)}`);
    }
  }
});

test('keyboard only: add to cart and complete an offline checkout (375 px, he)', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto('/he/p/sample-clay-mug');
  await hydrated(page, 'add-to-cart');

  /** Presses Tab (or Shift+Tab) until the element is focused; never uses the mouse. */
  async function tabTo(testId: string, backwards = false): Promise<void> {
    const target = page.getByTestId(testId);
    for (let i = 0; i < 80; i += 1) {
      if (await target.evaluate((element) => element === document.activeElement)) return;
      await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab');
    }
    throw new Error(`Could not reach ${testId} with the keyboard`);
  }

  await tabTo('add-to-cart');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('added-to-cart-row')).toBeVisible();
  await tabTo('go-to-cart');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/he\/cart$/);
  await expect(page.getByTestId('cart-line')).toHaveCount(1);

  // Shift+Tab: from the continue link back to a control of the cart line and forward again.
  await tabTo('cart-continue');
  await page.keyboard.press('Shift+Tab');
  // The control before the continue link belongs to the cart line (stepper or remove).
  expect(
    await page.evaluate(
      () => document.activeElement?.closest('[data-testid="cart-line"]') !== null,
    ),
  ).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('cart-continue')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/he\/checkout$/);
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  // The server stamps the form token when it renders /checkout. This was a client-side
  // navigation, so the document's own age (what `waitForFormAge` measures) is that of the
  // product page and says nothing about the form. Time the form from here instead.
  const formShownAt = Date.now();
  await hydrated(page, 'place-order');

  await tabTo('field-fullName');
  await page.keyboard.type('דנה כהן');
  await tabTo('field-phone');
  await page.keyboard.type('052-234-5678');
  await tabTo('field-email');
  await page.keyboard.type('dana@example.com');

  // Radio groups have one Tab stop (the first option while none is chosen); arrow keys move the
  // choice inside the group, and Space chooses.
  await tabTo('delivery-shipping');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('delivery-shipping')).toBeChecked();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('delivery-pickup')).toBeChecked();
  await tabTo('payment-online');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('payment-offline')).toBeChecked();
  await tabTo('accept-terms');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('accept-terms')).toBeChecked();

  await waitForFormAge(page, MIN_FORM_AGE_MS, formShownAt);
  await tabTo('place-order');
  await page.keyboard.press('Enter');
  // Either the order page or a refusal notice: a refusal fails with its own message.
  const refusal = page.getByTestId('checkout-form').getByRole('alert');
  await expect(page.getByTestId('order-number').or(refusal.first())).toBeVisible({
    timeout: 30_000,
  });
  if (!/\/he\/order\//.test(page.url())) {
    throw new Error(`Checkout was refused: ${(await refusal.allInnerTexts()).join(' | ')}`);
  }
  await expect(page.getByTestId('order-number')).toBeVisible();
});

test('keyboard only: the zoom dialog opens with Enter, moves with arrows, closes with Escape', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto('/he/p/sample-soy-candle');
  await hydrated(page, 'gallery-zoom');
  const opener = page.getByTestId('gallery-zoom');
  await opener.focus();
  await expect(opener).toBeFocused();

  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('1 / 2')).toBeVisible();

  // Hebrew reads right to left: ArrowLeft goes on to the next photo.
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByText('2 / 2')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
