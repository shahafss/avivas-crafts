// Storefront helpers shared by the headers, a11y and storefront-layout specs (006 T018-T020).
import type { Browser, Page, TestInfo } from '@playwright/test';
import { expect, sql, waitForFormAge } from './fixtures';

/** Puts one unit of the product into this browser's cart (same storage as the real cart). */
export async function putCartItem(page: Page, slug: string): Promise<void> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM product WHERE slug = ${slug}`;
  if (row === undefined) throw new Error(`No product ${slug}`);
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
  }, row.id);
}

/** Places an offline pickup order in a throw-away context and returns the order page's path
 * without the locale prefix (`/order/<token>`). */
export async function placeOfflineOrder(browser: Browser, testInfo: TestInfo): Promise<string> {
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL) });
  try {
    const page = await context.newPage();
    await putCartItem(page, 'sample-clay-mug');
    await page.goto('/he/checkout');
    await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('field-fullName').fill('דנה כהן');
    await page.getByTestId('field-phone').fill('052-234-5678');
    await page.getByTestId('field-email').fill('dana@example.com');
    await page.getByTestId('delivery-pickup').check();
    await page.getByTestId('payment-offline').check();
    await page.getByTestId('accept-terms').check();
    await waitForFormAge(page);
    await page.getByTestId('place-order').click();
    await page.waitForURL(/\/he\/order\//, { timeout: 30_000 });
    return new URL(page.url()).pathname.replace(/^\/he/, '');
  } finally {
    await context.close();
  }
}

/** Waits until React has attached its handlers to the element (a click before that is lost). */
export async function hydrated(page: Page, testId: string): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      return element !== null && Object.keys(element).some((key) => key.startsWith('__reactProps'));
    },
    testId,
    { timeout: 20_000 },
  );
}
