import type { Page } from '@playwright/test';
import { expect, readOutbox, resetDb, sql, test, waitForFormAge } from './fixtures';

// US2 scenarios 3-9, offline payment and form validation (tasks.md T069), mobile, Hebrew.
// Written before the checkout and order screens exist (T082, T084); the test ids it needs are
// listed at the top of checkout-online.spec.ts.

test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name === 'chromium-desktop',
    'Checkout flows run on the mobile projects',
  );
});

const INSTRUCTIONS = 'העברה בנקאית: בנק 12, סניף 345, חשבון 678901.';

async function setCart(page: Page, slug: string, quantity: number): Promise<void> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM product WHERE slug = ${slug}`;
  await page.goto('/he/contact');
  await page.evaluate(
    ({ productId, count }) => {
      localStorage.setItem(
        'ac_cart_v1',
        JSON.stringify({
          v: 1,
          updatedAt: new Date().toISOString(),
          items: [
            { productId, optionValueIds: [], quantity: count, addedAt: new Date().toISOString() },
          ],
        }),
      );
    },
    { productId: row?.id, count: quantity },
  );
}

async function openCheckout(page: Page): Promise<void> {
  await page.goto('/he/checkout');
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
}

async function fillContact(page: Page): Promise<void> {
  await page.getByTestId('field-fullName').fill('דנה כהן');
  await page.getByTestId('field-phone').fill('052-234-5678');
  await page.getByTestId('field-email').fill('dana@example.com');
}

test.beforeAll(async () => {
  await resetDb();
  await sql`UPDATE shop_settings SET offline_instructions_he = ${INSTRUCTIONS}`;
});

test('offline with pickup: awaiting payment, instructions on the page and in the email, no delivery fee', async ({
  page,
}) => {
  await setCart(page, 'sample-clay-mug', 1);
  await openCheckout(page);
  await fillContact(page);
  await page.getByTestId('delivery-pickup').check();
  await page.getByTestId('payment-offline').check();
  await expect(page.getByTestId('summary-delivery')).toContainText('חינם');
  await page.getByTestId('accept-terms').check();
  await waitForFormAge(page);
  await page.getByTestId('place-order').click();

  await page.waitForURL(/\/he\/order\//, { timeout: 30_000 });
  await expect(page.getByTestId('order-number')).toContainText('1001');
  await expect(page.getByTestId('order-payment-state')).toBeVisible();
  await expect(page.getByTestId('offline-instructions')).toContainText('העברה בנקאית');
  // The order page lists each item with its preparation time.
  await expect(page.getByTestId('order-line')).toHaveCount(1);
  await expect(page.getByTestId('order-prep-time')).toContainText('כעשרה ימים');

  const [order] = await sql<
    { payment_state: string; status: string; delivery_fee_minor: string; total_minor: string }[]
  >`SELECT payment_state, status, delivery_fee_minor, total_minor FROM orders`;
  expect(order).toMatchObject({ payment_state: 'awaiting_payment', status: 'new' });
  expect(Number(order?.delivery_fee_minor)).toBe(0);
  expect(Number(order?.total_minor)).toBe(6500);

  const [mail] = await readOutbox('order-confirmation');
  expect(mail?.text_body).toContain('העברה בנקאית');
  expect(await readOutbox('new-order')).toHaveLength(1);

  // The cart and the saved form are gone from this device.
  expect(await page.evaluate(() => localStorage.getItem('ac_cart_v1'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('ac_checkout'))).toBeNull();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test('"Other country" shows the Israel-only message and submitting is refused', async ({
  page,
}) => {
  const before = (await sql`SELECT 1 FROM orders`).length;
  await setCart(page, 'sample-clay-mug', 1);
  await openCheckout(page);
  await fillContact(page);
  await page.getByTestId('delivery-shipping').check();
  await page.getByTestId('field-country').selectOption('other');
  await expect(page.getByTestId('country-other-message')).toBeVisible();
  await expect(page.getByTestId('country-other-message')).toContainText('בתוך ישראל');
  await page.getByTestId('field-city').fill('Paris');
  await page.getByTestId('field-line1').fill('1 Rue de Rivoli');
  await page.getByTestId('payment-offline').check();
  await page.getByTestId('accept-terms').check();
  await waitForFormAge(page);
  await page.getByTestId('place-order').click();
  await expect(page).toHaveURL(/\/he\/checkout$/);
  expect((await sql`SELECT 1 FROM orders`).length).toBe(before);
});

test('invalid email and phone and missing terms show messages next to the fields and make no order', async ({
  page,
}) => {
  const before = (await sql`SELECT 1 FROM orders`).length;
  await setCart(page, 'sample-clay-mug', 1);
  await openCheckout(page);
  await page.getByTestId('field-fullName').fill('דנה כהן');
  await page.getByTestId('field-phone').fill('123');
  await page.getByTestId('field-email').fill('not-an-email');
  await page.getByTestId('delivery-pickup').check();
  await page.getByTestId('payment-offline').check();
  await waitForFormAge(page);
  await page.getByTestId('place-order').click();

  await expect(page.getByTestId('checkout-errors')).toBeVisible();
  await expect(page.getByTestId('checkout-errors')).toBeFocused();
  await expect(page.locator('#field-email-error, [id$="email-error"]').first()).toBeVisible();
  await expect(page.getByTestId('field-email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('field-phone')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('accept-terms')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/he\/checkout$/);
  expect((await sql`SELECT 1 FROM orders`).length).toBe(before);
});

test('the terms link opens the Terms of Sale in a new tab and does not tick the box', async ({
  page,
}) => {
  await setCart(page, 'sample-clay-mug', 1);
  await openCheckout(page);
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByTestId('checkout-form').locator('a[href$="/pages/terms"]').click(),
  ]);
  await expect.poll(() => popup.url()).toMatch(/\/he\/pages\/terms$/);
  await popup.close();
  await expect(page.getByTestId('accept-terms')).not.toBeChecked();
});

test('opening the checkout with an empty cart redirects to All pieces (there is no cart page)', async ({
  page,
}) => {
  await page.goto('/he/contact');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/he/checkout');
  await page.waitForURL(/\/he\/shop$/, { timeout: 20_000 });
});

test('no account, login or password prompt appears anywhere in the checkout', async ({ page }) => {
  await setCart(page, 'sample-clay-mug', 1);
  await page.goto('/he/shop');
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await openCheckout(page);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByText(/הרשמה|התחברות|סיסמה/)).toHaveCount(0);
});
