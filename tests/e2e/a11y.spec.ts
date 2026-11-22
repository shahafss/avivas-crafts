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
import { hydrated, openCartDrawer, placeOfflineOrder, putCartItem } from './shop-helpers';

// 006 T019 (research D6, 001 T124 narrowed): axe (WCAG 2.1 A/AA, zero violations) on the storefront
// in both locales at 375, 1024 and 1280 px, on the admin at 375 (phone first, storefront.md §12) and
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
const LAPTOP = { width: 1024, height: 800 }; // the narrowest width of the full header row (007)
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
  for (const viewport of [PHONE, LAPTOP, DESKTOP]) {
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

      await check('/shop');
      await check('/category/sample-ceramics');
      await check('/search?q=bowl');
      for (const slug of CONTENT_PAGES) await check(`/pages/${slug}`);
      await check('/contact');
      await check('/no-such-page');
      await check(orderPath);

      await putCartItem(page, 'sample-clay-mug');
      // The cart is a drawer now (FR-046): open it on the product page and check the open dialog.
      await check('/product/sample-clay-mug');
      await openCartDrawer(page);
      await expect(page.getByTestId('cart-line')).toHaveCount(1, { timeout: 20_000 });
      await expectNoViolations(page, `${locale} cart drawer with a line`);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('cart-drawer')).toBeHidden();
      await check('/checkout');
      await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
      await expectNoViolations(page, `${locale} checkout with a line`);
    });
  }
}

test('the storefront with all three social links has no axe violations', async ({ page }) => {
  await sql`UPDATE shop_settings SET
    social_instagram_url = 'https://www.instagram.com/aviva',
    social_facebook_url = 'https://www.facebook.com/aviva',
    social_tiktok_url = 'https://www.tiktok.com/@aviva'`;
  try {
    for (const viewport of [PHONE, LAPTOP, DESKTOP]) {
      await page.setViewportSize(viewport);
      await page.goto('/he');
      await expect(page.getByTestId('footer-social').getByRole('link')).toHaveCount(3);
      await expectNoViolations(page, `/he with social links ${String(viewport.width)}`);
    }
  } finally {
    await sql`UPDATE shop_settings SET social_instagram_url = NULL, social_facebook_url = NULL, social_tiktok_url = NULL`;
  }
});

test('the admin has no axe violations at 375 and 1280 px', async ({ page }) => {
  // Signed out first: the sign-in page.
  for (const viewport of [PHONE, DESKTOP]) {
    await page.setViewportSize(viewport);
    await page.goto('/admin/sign-in');
    await expect(page.getByTestId('admin-sign-in-google')).toBeVisible();
    await expectNoViolations(page, `/admin/sign-in ${String(viewport.width)}`);
  }

  await signInAsAdmin(page);
  // Every admin screen (007 SC-003): the piece editor holds the category checkboxes, the content
  // pages include a version list and one stored version.
  const paths = [
    '/admin',
    '/admin/products',
    `/admin/products/${productId}`,
    '/admin/categories',
    '/admin/orders',
    `/admin/orders/${orderId}`,
    '/admin/stats',
    '/admin/settings',
    '/admin/content',
    '/admin/content/terms',
    '/admin/content/terms/versions',
    '/admin/content/terms/versions/1',
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

test('the admin settings screen with the two-error social summary has no axe violations', async ({
  page,
}) => {
  await signInAsAdmin(page);
  try {
    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      await page.goto('/admin/settings');
      await expect(page.getByTestId('settings-ready')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('settings-socialFacebookUrl').fill('https://example.com/a');
      await page.getByTestId('settings-socialTiktokUrl').fill('https://example.com/b');
      await page.getByTestId('settings-social').getByRole('button', { name: 'שמירה' }).click();
      const summary = page.getByTestId('settings-social-error-summary');
      await expect(summary).toBeVisible();
      await expect(summary.getByRole('listitem')).toHaveCount(2);
      await expectNoViolations(
        page,
        `/admin/settings with two social errors ${String(viewport.width)}`,
      );
    }
  } finally {
    await sql`UPDATE shop_settings SET social_instagram_url = NULL, social_facebook_url = NULL, social_tiktok_url = NULL`;
  }
});

test('keyboard only: add to cart and complete an offline checkout (375 px, he)', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto('/he/product/sample-clay-mug');
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
  // The add opened the cart drawer and moved focus to its close button (FR-047).
  await expect(page.getByTestId('cart-drawer')).toBeVisible();
  await expect(page.getByTestId('cart-close')).toBeFocused();
  await expect(page.getByTestId('cart-line')).toHaveCount(1, { timeout: 20_000 });
  // Close it with the keyboard and come back through "in your cart": focus returns to that button.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cart-drawer')).toBeHidden();
  await tabTo('go-to-cart');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cart-drawer')).toBeVisible();
  await expect(page.getByTestId('cart-line')).toHaveCount(1);
  await hydrated(page, 'cart-continue');

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
  // Following "to checkout" closed the drawer and left no lock behind.
  await expect(page.getByTestId('cart-drawer')).toBeHidden();
  await expect(page.locator('[inert]')).toHaveCount(0);
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
  await page.goto('/he/product/sample-soy-candle');
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
