import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, resetDb, signInAsAdmin, sql, test, waitForFormAge } from './fixtures';

// 003 US3 (tasks.md T024; storefront.md §12.7, §12.3 block 8a): Aviva handles a customer's
// request about their data. Phone project only; one offline order with marketing consent is
// placed through the storefront, then found, exported (after the passkey re-check), its marketing
// consent withdrawn and its details erased. Tests run in order on shared state.

test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Admin screens run on the phone project');
});

const EMAIL = 'privacy-dana@example.com';
const PHONE_INPUT = '052-234-5678';
const STREET = 'הרצל 5';

let orderId = '';
let orderNumber = 0;
let adminId = '';

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

/** Places an offline order with marketing consent through the storefront checkout. */
async function placeOrder(page: Page): Promise<void> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM product WHERE slug = 'sample-clay-mug'`;
  await page.goto('/he/contact');
  await page.evaluate(
    ({ productId }) => {
      localStorage.setItem(
        'ac_cart_v1',
        JSON.stringify({
          v: 1,
          updatedAt: new Date().toISOString(),
          items: [
            { productId, optionValueIds: [], quantity: 1, addedAt: new Date().toISOString() },
          ],
        }),
      );
    },
    { productId: row?.id },
  );
  await page.goto('/he/checkout');
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('field-fullName').fill('דנה כהן');
  await page.getByTestId('field-phone').fill(PHONE_INPUT);
  await page.getByTestId('field-email').fill(EMAIL);
  await page.getByTestId('delivery-shipping').check();
  await page.getByTestId('field-city').fill('חיפה');
  await page.getByTestId('field-line1').fill(STREET);
  await page.getByTestId('payment-offline').check();
  await page.getByTestId('marketing-opt-in').check();
  await page.getByTestId('accept-terms').check();
  await waitForFormAge(page);
  await page.getByTestId('place-order').click();
  await page.waitForURL(/\/he\/order\//, { timeout: 30_000 });
  orderNumber = Number(
    (await page.getByTestId('order-number').textContent())?.replace(/\D/g, '') ?? '0',
  );
  const [order] = await sql<
    { id: string }[]
  >`SELECT id FROM orders WHERE order_number = ${orderNumber}`;
  if (!order) throw new Error('order not found');
  orderId = order.id;
}

async function search(page: Page, text: string): Promise<void> {
  await page.getByTestId('customer-search-input').fill(text);
  await page.getByTestId('customer-search-submit').click();
}

async function openCustomers(page: Page): Promise<void> {
  await page.goto('/admin/customers');
  await expect(page.getByTestId('customer-search-input')).toBeVisible({ timeout: 20_000 });
}

/** Israel date as the admin screens show it. */
function today(): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date());
}

test.beforeAll(async ({ browser }, testInfo) => {
  if (testInfo.project.name !== 'chromium-mobile') return;
  await resetDb();
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL) });
  const page = await context.newPage();
  await placeOrder(page);
  await context.close();
});

test('the email in capitals finds the order, the address stays /admin/customers, axe is clean', async ({
  page,
}) => {
  adminId = await signInAsAdmin(page);
  await openCustomers(page);
  await expect(page.getByRole('heading', { level: 1, name: 'לקוחות' })).toBeVisible();
  await search(page, EMAIL.toUpperCase());

  const cards = page.getByTestId('customer-order-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText(String(orderNumber));
  await expect(page.getByTestId('customer-summary')).toContainText('נמצאה הזמנה אחת');
  // The result never shows the name or the address.
  await expect(page.getByTestId('customer-results')).not.toContainText('דנה');
  await expect(page.getByTestId('customer-results')).not.toContainText(STREET);
  expect(new URL(page.url()).pathname).toBe('/admin/customers');
  await expect(page.getByTestId('customer-search-form')).toHaveAttribute('method', 'post');
  expect(new URL(page.url()).search).toBe('');
  await expect(page.getByTestId('customer-withdraw')).toBeVisible();
  await expectNoViolations(page);

  const [searched] = await sql<{ details: unknown }[]>`
    SELECT details FROM admin_activity WHERE action = 'customer.searched'`;
  expect(searched?.details).toEqual({ field: 'email', count: 1 });
});

test('a phone written another way finds the same order', async ({ page }) => {
  await signInAsAdmin(page);
  await openCustomers(page);
  await search(page, '+972 52 234 5678');
  await expect(page.getByTestId('customer-order-card')).toHaveCount(1);
  await search(page, 'nobody@example.com');
  await expect(page.getByTestId('customer-empty')).toBeVisible();
  await expect(page.getByTestId('customer-empty')).toContainText('לא נמצאו לקוחות');
  await search(page, 'not an email');
  await expect(page.getByText('נא להזין מייל או מספר טלפון')).toBeVisible();
});

test('"הורדת הנתונים" asks for the passkey again when it is older than 5 minutes, then downloads a .json with the email', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await openCustomers(page);
  await search(page, EMAIL);
  await expect(page.getByTestId('customer-order-card')).toHaveCount(1);

  await sql`UPDATE admin_session SET reauth_at = now() - interval '10 minutes'
            WHERE admin_id = ${adminId}`;
  const downloading = page.waitForEvent('download');
  await page.getByTestId('customer-export').click();
  await expect(page.getByTestId('admin-reauth-confirm')).toBeVisible();
  await page.getByTestId('admin-reauth-confirm').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^customer-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const content = await readFile(path, 'utf8');
  expect(content).toContain(EMAIL);
  const file = JSON.parse(content) as { orders: { orderNumber: number }[] };
  expect(file.orders.map((order) => order.orderNumber)).toEqual([orderNumber]);

  const [exported] = await sql<{ details: unknown }[]>`
    SELECT details FROM admin_activity WHERE action = 'customer.exported'`;
  expect(exported?.details).toEqual({ count: 1 });
});

test('the order link opens the order with the correction form (002) and the consent block', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await openCustomers(page);
  await search(page, EMAIL);
  await page.getByTestId('customer-order-card').first().click();
  await page.waitForURL(`**/admin/orders/${orderId}`);
  await expect(page.getByText('תיקון פרטי הלקוח')).toBeVisible();
  const consent = page.getByTestId('order-consent');
  await expect(consent).toContainText('הסכמות');
  await expect(consent).toContainText('תקנון גרסה');
  await expect(consent).toContainText('מדיניות פרטיות גרסה');
  await expect(consent).toContainText(`דיוור: אושר ב-${today()}`);
  await expectNoViolations(page);
});

test('"הפסקת דיוור" explains itself, and after the confirmation the order shows the withdrawal date', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await openCustomers(page);
  await search(page, EMAIL);
  await page.getByTestId('customer-withdraw').click();
  const dialog = page.getByRole('dialog', { name: 'להפסיק דיוור ללקוח?' });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('confirm-dialog-cancel')).toBeFocused();
  await expectNoViolations(page);
  await page.getByTestId('confirm-dialog-confirm').click();
  await expect(dialog).toBeHidden();
  // Nothing left to withdraw.
  await expect(page.getByTestId('customer-withdraw')).toHaveCount(0);

  await page.goto(`/admin/orders/${orderId}`);
  await expect(page.getByTestId('order-consent')).toContainText(`בוטל ב-${today()}`);
  const [withdrawn] = await sql<{ details: unknown }[]>`
    SELECT details FROM admin_activity WHERE action = 'customer.marketing_withdrawn'`;
  expect(withdrawn?.details).toEqual({ count: 1 });
});

test('"מחיקת הפרטים" warns the order is open; after the confirmation the order shows "נמחק" and no contact data, and a new search finds nothing', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await openCustomers(page);
  await search(page, EMAIL);
  await expect(page.getByTestId('customer-order-card')).toHaveCount(1);

  await page.getByTestId('customer-erase').click();
  const dialog = page.getByRole('dialog', { name: 'למחוק את פרטי הלקוח?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('יש כאן הזמנה שעוד לא הושלמה');
  await expect(page.getByTestId('confirm-dialog-cancel')).toBeFocused();
  await expectNoViolations(page);

  // The passkey was confirmed by the export; age it again so the erase asks too.
  await sql`UPDATE admin_session SET reauth_at = now() - interval '10 minutes'
            WHERE admin_id = ${adminId}`;
  await page.getByTestId('confirm-dialog-confirm').click();
  await expect(page.getByTestId('admin-reauth-confirm')).toBeVisible();
  await page.getByTestId('admin-reauth-confirm').click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  await page.goto(`/admin/orders/${orderId}`);
  await expect(page.getByTestId('admin-order-customer-name')).toHaveText('נמחק');
  const body = page.locator('body');
  await expect(body).not.toContainText(EMAIL);
  await expect(body).not.toContainText('052-234-5678');
  await expect(body).not.toContainText('+972522345678');
  await expect(body).not.toContainText(STREET);
  await expect(page.getByTestId('order-history')).toContainText('פרטי הלקוח נמחקו');

  await openCustomers(page);
  await search(page, EMAIL);
  await expect(page.getByTestId('customer-empty')).toBeVisible();
  await search(page, PHONE_INPUT);
  await expect(page.getByTestId('customer-empty')).toBeVisible();

  const [erased] = await sql<{ details: unknown }[]>`
    SELECT details FROM admin_activity WHERE action = 'customer.anonymized'`;
  expect(erased?.details).toEqual({ count: 1 });
});

test('erasing stored emails alone (no order found) confirms with the toast', async ({ page }) => {
  await signInAsAdmin(page);
  await sql`
    INSERT INTO email_outbox (kind, to_address, locale, subject, status, dedupe_key)
    VALUES ('contact-message', 'emails-only@example.com', 'he', 'נושא', 'sent', 'e2e:emails-only')`;
  await openCustomers(page);
  await search(page, 'emails-only@example.com');
  await expect(page.getByTestId('customer-order-card')).toHaveCount(0);
  await page.getByTestId('customer-erase').click();
  await page.getByTestId('confirm-dialog-confirm').click();
  // The passkey was confirmed by the previous test and is still recent; if it is asked, confirm.
  const reauth = page.getByTestId('admin-reauth-confirm');
  if (await reauth.isVisible({ timeout: 1500 }).catch(() => false)) await reauth.click();
  await expect(page.getByText('פרטי הלקוח נמחקו', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const [left] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM email_outbox WHERE to_address = 'emails-only@example.com'`;
  expect(left?.n).toBe(0);
});

test('a search that finds only unfinished checkouts explains why there is nothing to erase', async ({
  page,
}) => {
  await signInAsAdmin(page);
  const email = 'checkout-only@example.com';
  const [zone] = await sql<{ id: string }[]>`SELECT id FROM shipping_zone LIMIT 1`;
  if (!zone) throw new Error('no shipping zone');
  await sql`
    INSERT INTO pending_checkout (
      resume_token_hash, locale, zone_id, currency, customer_name, customer_phone, customer_email,
      delivery_method, terms_accepted_at, terms_version, privacy_version, subtotal_minor,
      total_minor, provider, state, expires_at
    ) VALUES (
      decode(md5(random()::text), 'hex'), 'he', ${zone.id},
      (SELECT currency FROM shipping_zone WHERE id = ${zone.id}), 'לקוח', '0521112233', ${email},
      'pickup', now(), 1, 1, 1000, 1000, 'fake', 'awaiting_provider', now() + interval '1 hour')`;
  await openCustomers(page);
  await search(page, email);
  await expect(page.getByTestId('customer-results')).toBeVisible();
  await expect(page.getByTestId('customer-order-card')).toHaveCount(0);
  await expect(page.getByTestId('customer-erase')).toHaveCount(0);
  const notice = page.locator('#customer-kept-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('אוטומטית תוך 48 שעות, או עד 24 שעות מאוחר יותר');
  await expect(notice).toContainText('לא נמחק תשלום אחד שעדיין בתהליך');
  await expect(notice).toContainText('כדאי לחפש שוב בעוד שלושה ימים');
});
