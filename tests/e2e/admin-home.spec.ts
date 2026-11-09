import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, resetDb, signInAsAdmin, sql, test } from './fixtures';

// 002 US7 (tasks.md T043; research R13; storefront.md §12.4): the admin home on the phone project.

test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Admin screens run on the phone project');
});

let zoneId = '';
let counter = 0;

async function seedOrder(status: string, paymentState: 'awaiting_payment' | 'paid'): Promise<void> {
  counter += 1;
  const token = createHash('sha256')
    .update(`home-token-${String(counter)}`)
    .digest();
  await sql`
    INSERT INTO orders
      (public_token_hash, public_token_expires_at, locale, zone_id, currency, customer_name,
       customer_phone, customer_email, delivery_method, address_country, address_city,
       address_line1, payment_method, payment_state, status, subtotal_minor, delivery_fee_minor,
       total_minor, terms_accepted_at, terms_version, privacy_version)
    VALUES
      (${token}, now() + interval '30 days', 'he', ${zoneId}, 'ILS', ${`לקוחה ${String(counter)}`},
       '+972501112233', ${`home${String(counter)}@example.test`}, 'shipping', 'IL', 'חיפה',
       'הרצל 5', 'offline', ${paymentState}, ${status}, 10000, 2000, 12000, now(), 1, 1)`;
}

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== 'chromium-mobile') return;
  await resetDb();
  const [zone] = await sql<{ id: string }[]>`SELECT id FROM shipping_zone LIMIT 1`;
  zoneId = zone?.id ?? '';
});

async function noAxeViolations(page: import('@playwright/test').Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

test('with no orders the plain sentence shows instead of zero counts', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'לוח בקרה' })).toBeVisible();
  await expect(page.getByText('אין כרגע הזמנות שמחכות לך')).toBeVisible();
  await expect(page.getByTestId('count-new')).toHaveCount(0);
  await expect(page.getByTestId('count-awaiting')).toHaveCount(0);
});

test('the placeholder settings are listed with a link to the settings page', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin');
  const notice = page.getByTestId('settings-attention');
  await expect(notice).toContainText('כדאי להשלים בהגדרות:');
  await expect(notice).toContainText('שם העסק בעברית');
  await expect(notice).toContainText('אימיילים להתראות');
  await notice.getByRole('link', { name: 'להגדרות' }).click();
  await expect(page).toHaveURL(/\/admin\/settings$/);
});

test('the cards count New and awaiting-payment orders (not Cancelled) and open the lists', async ({
  page,
}) => {
  await seedOrder('new', 'paid');
  await seedOrder('new', 'awaiting_payment');
  await seedOrder('in_preparation', 'awaiting_payment');
  await seedOrder('cancelled', 'awaiting_payment');
  await seedOrder('completed', 'paid');
  await signInAsAdmin(page);
  await page.goto('/admin');

  const newCard = page.getByTestId('count-new');
  const awaitingCard = page.getByTestId('count-awaiting');
  await expect(newCard).toContainText('הזמנות חדשות');
  await expect(page.getByTestId('number-new')).toHaveText('2');
  await expect(awaitingCard).toContainText('ממתינות לתשלום');
  await expect(page.getByTestId('number-awaiting')).toHaveText('2');
  await expect(page.getByText('אין כרגע הזמנות שמחכות לך')).toHaveCount(0);
  await noAxeViolations(page);

  await newCard.click();
  await expect(page).toHaveURL(/\/admin\/orders\?status=new$/);
  await expect(page.getByTestId('order-card')).toHaveCount(2);

  await page.goto('/admin');
  await page.getByTestId('count-awaiting').click();
  await expect(page).toHaveURL(/payment=awaiting_payment&open=1/);
  await expect(page.getByTestId('order-card')).toHaveCount(2);
  const chip = page.getByTestId('orders-open-chip');
  await expect(chip).toContainText('בלי הזמנות שבוטלו');
  await chip.click();
  await expect(page).not.toHaveURL(/open=1/);
  await expect(page.getByTestId('order-card')).toHaveCount(3);
});
