import type { Page } from '@playwright/test';
import { expect, readOutbox, resetDb, sql, test, waitForFormAge } from './fixtures';

// US2 scenarios 3-9, online payment through the fake provider (tasks.md T069), mobile, Hebrew.
// Written before the checkout, fake-pay, return and order screens exist (T077, T082-T084), so
// it drives them through the test ids below, which those screens must expose:
//
//   /he/checkout        checkout-form, field-fullName, field-phone, field-email,
//                       field-country (select; values "IL" and "other"), field-city, field-line1,
//                       field-line2, field-postalCode, delivery-shipping / delivery-pickup (radios),
//                       payment-online / payment-offline (radios), accept-terms, marketing-opt-in,
//                       place-order (submit), order-summary, order-summary-line (each shows
//                       "זמן הכנה: <prep time>"), summary-delivery, summary-total, checkout-errors
//   /he/checkout/fake-pay   fake-pay-pay, fake-pay-fail, fake-pay-pay-close
//   /he/checkout/return     return-status (role=status text), retry-payment ("נסו שוב"),
//                           switch-offline ("תשלום ישיר אליי במקום"), return-switched (the
//                           "continues as direct payment" panel), return-mismatch, return-total-changed
//                           with accept-new-total
//   /he/order/<token>       order-number, order-line (each with order-prep-time), order-payment-state,
//                           offline-instructions
// The cart is put into localStorage directly; the sample products of resetDb() are used.

test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name === 'chromium-desktop',
    'Checkout flows run on the mobile projects',
  );
});

const SHIPPING_FEE = '30.00';

async function setCart(
  page: Page,
  items: { slug: string; colour?: string; quantity: number }[],
): Promise<void> {
  const lines = [];
  for (const item of items) {
    const [row] = await sql<{ id: string }[]>`SELECT id FROM product WHERE slug = ${item.slug}`;
    const options =
      item.colour === undefined
        ? []
        : await sql<{ id: string }[]>`SELECT id FROM option_value WHERE label_he = ${item.colour}`;
    lines.push({
      productId: row?.id,
      optionValueIds: options.map((option) => option.id),
      quantity: item.quantity,
      addedAt: new Date().toISOString(),
    });
  }
  await page.goto('/he/contact');
  await page.evaluate((payload) => {
    localStorage.setItem(
      'ac_cart_v1',
      JSON.stringify({ v: 1, updatedAt: new Date().toISOString(), items: payload }),
    );
  }, lines);
}

async function fillDetails(
  page: Page,
  delivery: 'shipping' | 'pickup' = 'shipping',
): Promise<void> {
  await page.getByTestId('field-fullName').fill('דנה כהן');
  await page.getByTestId('field-phone').fill('052-234-5678');
  await page.getByTestId('field-email').fill('dana@example.com');
  if (delivery === 'shipping') {
    await page.getByTestId('delivery-shipping').check();
    await page.getByTestId('field-country').selectOption('IL');
    await page.getByTestId('field-city').fill('חיפה');
    await page.getByTestId('field-line1').fill('הרצל 5');
  } else {
    await page.getByTestId('delivery-pickup').check();
  }
}

async function submit(page: Page): Promise<void> {
  await page.getByTestId('accept-terms').check();
  await waitForFormAge(page);
  await page.getByTestId('place-order').click();
}

async function openCheckout(page: Page): Promise<void> {
  await page.goto('/he/checkout');
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
}

async function orderCount(): Promise<number> {
  const [row] = await sql<{ count: string }[]>`SELECT count(*) FROM orders`;
  return Number(row?.count ?? 0);
}

test.beforeAll(async () => {
  await resetDb();
});

test('free shipping starts at the threshold, and the summary shows each item preparation time', async ({
  page,
}) => {
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  await openCheckout(page);
  await page.getByTestId('delivery-shipping').check();
  await expect(page.getByTestId('summary-delivery')).toContainText(SHIPPING_FEE);
  const line = page.getByTestId('order-summary-line');
  await expect(line).toHaveCount(1);
  await expect(line).toContainText('זמן הכנה: כעשרה ימים');

  // 5 mugs are ₪325: above the ₪300 threshold, delivery is free.
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 5 }]);
  await openCheckout(page);
  await page.getByTestId('delivery-shipping').check();
  await expect(page.getByTestId('summary-delivery')).toContainText('חינם');
  await page.getByTestId('delivery-pickup').check();
  await expect(page.getByTestId('summary-delivery')).toContainText('חינם');
});

test('the pickup instructions are visible under the pickup option before ordering', async ({
  page,
}) => {
  await sql`UPDATE shop_settings SET pickup_instructions_he = 'האיסוף מהבית, בתיאום מראש בטלפון.'`;
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  await openCheckout(page);
  await expect(page.getByTestId('pickup-instructions')).toContainText('האיסוף מהבית');
});

test('online success through the fake provider: confirmation page, both emails, paid order', async ({
  page,
}) => {
  await setCart(page, [
    { slug: 'sample-soy-candle', colour: 'ורוד', quantity: 1 },
    { slug: 'sample-clay-mug', quantity: 1 },
  ]);
  await openCheckout(page);
  await fillDetails(page);
  await page.getByTestId('payment-online').check();
  await submit(page);

  await page.waitForURL(/\/he\/checkout\/fake-pay/, { timeout: 30_000 });
  expect(await orderCount()).toBe(0);
  expect(await readOutbox('order-confirmation')).toHaveLength(0);
  await page.getByTestId('fake-pay-pay').click();

  await page.waitForURL(/\/he\/order\//, { timeout: 60_000 });
  await expect(page.getByTestId('order-number')).toContainText('1001');
  await expect(page.getByTestId('order-prep-time').first()).toContainText('כשלושה ימים');
  await expect(page.getByTestId('order-prep-time').nth(1)).toContainText('כעשרה ימים');
  await expect(page.getByTestId('order-payment-state')).toBeVisible();

  const [order] = await sql<{ payment_state: string; total_minor: string; status: string }[]>`
    SELECT payment_state, total_minor, status FROM orders`;
  expect(order).toMatchObject({ payment_state: 'paid', status: 'new' });
  expect(Number(order?.total_minor)).toBe(5500 + 6500 + 3000);
  expect(await readOutbox('order-confirmation')).toHaveLength(1);
  expect(await readOutbox('new-order')).toHaveLength(1);
  // The cart and the saved form are cleared.
  expect(await page.evaluate(() => localStorage.getItem('ac_cart_v1'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('ac_checkout'))).toBeNull();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test('closing the tab after paying (callback only) still yields a paid order', async ({ page }) => {
  await resetDb();
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  await openCheckout(page);
  await fillDetails(page, 'pickup');
  await page.getByTestId('payment-online').check();
  await submit(page);
  await page.waitForURL(/\/he\/checkout\/fake-pay/, { timeout: 30_000 });
  await page.getByTestId('fake-pay-pay-close').click();
  await expect
    .poll(async () => (await sql`SELECT 1 FROM orders WHERE payment_state = 'paid'`).length, {
      timeout: 30_000,
    })
    .toBe(1);
});

test('the browser back button from the payment page restores the checkout form', async ({
  page,
}) => {
  await resetDb();
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  await openCheckout(page);
  await fillDetails(page);
  await page.getByTestId('payment-online').check();
  await submit(page);
  await page.waitForURL(/\/he\/checkout\/fake-pay/, { timeout: 30_000 });
  await page.goBack();
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('field-fullName')).toHaveValue('דנה כהן');
  await expect(page.getByTestId('field-email')).toHaveValue('dana@example.com');
  await expect(page.getByTestId('field-city')).toHaveValue('חיפה');
});

test('online failure: no order, no email; retry and switch keep the details', async ({ page }) => {
  await resetDb();
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  await openCheckout(page);
  await fillDetails(page);
  await page.getByTestId('payment-online').check();
  await submit(page);
  await page.waitForURL(/\/he\/checkout\/fake-pay/, { timeout: 30_000 });
  await page.getByTestId('fake-pay-fail').click();

  await page.waitForURL(/\/he\/checkout\/return/);
  await expect(page.getByTestId('retry-payment')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('switch-offline')).toBeVisible();
  expect(await orderCount()).toBe(0);
  expect(await readOutbox('order-confirmation')).toHaveLength(0);
  expect(await readOutbox('new-order')).toHaveLength(0);
  const returnUrl = page.url();

  // Retry opens a new payment page for the same details; paying it completes the order.
  await page.getByTestId('retry-payment').click();
  await page.waitForURL(/\/he\/checkout\/fake-pay/, { timeout: 30_000 });
  await page.getByTestId('fake-pay-pay').click();
  await page.waitForURL(/\/he\/order\//, { timeout: 60_000 });
  const [order] = await sql<{ customer_email: string; payment_state: string }[]>`
    SELECT customer_email, payment_state FROM orders`;
  expect(order).toMatchObject({ customer_email: 'dana@example.com', payment_state: 'paid' });

  // The old failure link no longer offers a retry for a finished checkout.
  await page.goto(returnUrl);
  await expect(page.getByTestId('retry-payment')).toHaveCount(0);
});

test('switching to offline lands on the new order with the payment instructions and an empty cart', async ({
  page,
}) => {
  await resetDb();
  await sql`UPDATE shop_settings SET offline_instructions_he = 'העברה בנקאית: בנק 12, סניף 345, חשבון 678901.'`;
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  await openCheckout(page);
  await fillDetails(page);
  await page.getByTestId('payment-online').check();
  await submit(page);
  await page.waitForURL(/\/he\/checkout\/fake-pay/, { timeout: 30_000 });
  await page.getByTestId('fake-pay-fail').click();
  await page.waitForURL(/\/he\/checkout\/return/);
  await page.getByTestId('switch-offline').click();

  await page.waitForURL(/\/he\/order\//, { timeout: 30_000 });
  await expect(page.getByTestId('offline-instructions')).toContainText('העברה בנקאית');
  await expect(page.getByTestId('order-payment-state')).toBeVisible();
  const [order] = await sql<{ payment_method: string; payment_state: string }[]>`
    SELECT payment_method, payment_state FROM orders`;
  expect(order).toMatchObject({ payment_method: 'offline', payment_state: 'awaiting_payment' });
  expect(await readOutbox('order-confirmation')).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('ac_cart_v1'))).toBeNull();

  // The browser's back button returns to the return page: the checkout continues as direct payment.
  await page.goBack();
  await expect(page.getByTestId('return-switched')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('retry-payment')).toHaveCount(0);
  await expect(page.getByTestId('switch-offline')).toHaveCount(0);
});

test('returning with r=failure while the provider still reports pending offers retry at once', async ({
  page,
}) => {
  await resetDb();
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  await openCheckout(page);
  await fillDetails(page);
  await page.getByTestId('payment-online').check();
  await submit(page);
  await page.waitForURL(/\/he\/checkout\/fake-pay/, { timeout: 30_000 });
  await page.getByTestId('fake-pay-fail').click();
  await page.waitForURL(/\/he\/checkout\/return/);
  const token = new URL(page.url()).searchParams.get('c') ?? '';
  await page.getByTestId('retry-payment').click();
  await page.waitForURL(/\/he\/checkout\/fake-pay/, { timeout: 30_000 });

  // The visitor cancelled on the provider's page: the new page is still pending.
  await page.goto(`/he/checkout/return?c=${token}&r=failure`);
  await expect(page.getByTestId('retry-payment')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('switch-offline')).toBeVisible();
});

test('a paid amount that differs from the checkout shows the "we will contact you" message', async ({
  page,
}) => {
  await resetDb();
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  await openCheckout(page);
  await fillDetails(page, 'pickup');
  await page.getByTestId('payment-online').check();
  await submit(page);
  await page.waitForURL(/\/he\/checkout\/fake-pay/, { timeout: 30_000 });
  await sql`UPDATE pending_checkout SET total_minor = total_minor + 100`;
  await page.getByTestId('fake-pay-pay').click();
  await page.waitForURL(/\/he\/checkout\/return/);
  await expect(page.getByTestId('return-mismatch')).toBeVisible({ timeout: 60_000 });
  expect(await orderCount()).toBe(0);
});
