import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, resetDb, signInAsAdmin, sql, test, waitForFormAge } from './fixtures';

// 006 US2 (contracts/payment-mode.md; quickstart §1): the shop with PAYMENT_PROVIDER=none. Runs
// only in the `consent` project: the second web server has no card provider (and a stray
// PAYPLUS_PAYMENT_HOST that the proxy must ignore, FR-010) and CONSENT_TEST_CATEGORY=analytics, so
// the consent banner shows and is dismissed before the UI steps. Tests run in order on shared state.

test.describe.configure({ mode: 'serial' });

const INSTRUCTIONS = 'העברה בנקאית: בנק 12, סניף 345, חשבון 678901.';

test.beforeAll(async () => {
  await resetDb();
  await sql`UPDATE shop_settings SET offline_instructions_he = ${INSTRUCTIONS}`;
});

/** Dismisses the consent banner (the second server shows it), so it cannot cover the page. */
async function dismissConsent(page: Page): Promise<void> {
  const reject = page.getByTestId('consent-reject-all');
  try {
    await reject.waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    return;
  }
  await page.waitForFunction(
    () => {
      const element = document.querySelector('[data-testid="consent-reject-all"]');
      return element !== null && Object.keys(element).some((key) => key.startsWith('__reactProps'));
    },
    undefined,
    { timeout: 20_000 },
  );
  await reject.click();
  await expect(page.getByTestId('consent-banner')).toHaveCount(0);
}

async function noViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

test('the product page shows the offline payment line and no card line', async ({ page }) => {
  const response = await page.goto('/he/product/sample-clay-mug');
  expect(response?.status()).toBe(200);
  await dismissConsent(page);
  await expect(page.getByText('תשלום ישיר אליי')).toBeVisible();
  await expect(page.getByText('תשלום מאובטח בכרטיס אשראי')).toHaveCount(0);
});

test('checkout offers only offline payment and an order completes', async ({ page }) => {
  await page.goto('/he/product/sample-clay-mug');
  await dismissConsent(page);
  await page.waitForFunction(
    () => {
      const element = document.querySelector('[data-testid="add-to-cart"]');
      return element !== null && Object.keys(element).some((key) => key.startsWith('__reactProps'));
    },
    undefined,
    { timeout: 20_000 },
  );
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('added-to-cart-row')).toBeVisible();

  await page.goto('/he/checkout');
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('payment-online')).toHaveCount(0);
  await expect(page.getByTestId('payment-offline')).toBeChecked();
  await expect(page.getByTestId('checkout-form')).not.toContainText('כרטיס אשראי');

  await page.getByTestId('field-fullName').fill('דנה כהן');
  await page.getByTestId('field-phone').fill('052-234-5678');
  await page.getByTestId('field-email').fill('no-card-dana@example.com');
  await page.getByTestId('delivery-pickup').check();
  await page.getByTestId('accept-terms').check();
  await waitForFormAge(page);
  await page.getByTestId('place-order').click();

  await page.waitForURL(/\/he\/order\//, { timeout: 30_000 });
  await expect(page.getByTestId('order-number')).toBeVisible();
  await expect(page.getByTestId('offline-instructions')).toContainText('העברה בנקאית');
  const [order] = await sql<{ payment_method: string }[]>`SELECT payment_method FROM orders`;
  expect(order?.payment_method).toBe('offline');
});

test('admin settings: both payment checkboxes are disabled with the note, and instructions save', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto('/admin/settings');
  await expect(page.getByTestId('settings-ready')).toBeVisible({ timeout: 20_000 });

  const online = page.getByTestId('settings-online-payment');
  const offline = page.getByTestId('settings-offline-payment');
  await expect(online).not.toBeChecked();
  await expect(online).toBeDisabled();
  await expect(offline).toBeChecked();
  await expect(offline).toBeDisabled();
  await expect(page.getByTestId('settings-payment')).toContainText('תשלום בכרטיס עוד לא הוגדר');
  // Each disabled checkbox says why it is locked, through aria-describedby (storefront.md 7.10).
  await expect(online).toHaveAccessibleDescription('תשלום בכרטיס עוד לא הוגדר');
  await expect(offline).toHaveAccessibleDescription(
    'תשלום ישיר חייב להישאר פעיל כל עוד תשלום בכרטיס לא הוגדר.',
  );
  await noViolations(page);

  await page.getByTestId('settings-offline-instructions-he').fill('העברה לחשבון 12-345-678901');
  await page.getByTestId('settings-payment').getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ההגדרות נשמרו' })).toBeVisible();
  const [row] = await sql<
    { instructions: string; online: boolean; offline: boolean }[]
  >`SELECT offline_instructions_he AS instructions, online_payment_enabled AS online,
           offline_payment_enabled AS offline FROM shop_settings`;
  expect(row?.instructions).toBe('העברה לחשבון 12-345-678901');
  expect(row?.online).toBe(false);
  expect(row?.offline).toBe(true);
});

test('the CSP form-action is self only: the stray payment host is ignored', async ({ request }) => {
  const response = await request.get('/he/checkout');
  const csp = response.headers()['content-security-policy'] ?? '';
  const formAction = csp.split('; ').find((part) => part.startsWith('form-action'));
  expect(formAction).toBe("form-action 'self'");
  expect(csp).not.toContain('pay.example.test');
});

test('the payment callback answers 404 for every provider', async ({ request }) => {
  for (const provider of ['payplus', 'fake']) {
    const response = await request.post(`/api/payments/${provider}/callback`, { data: {} });
    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  }
});
