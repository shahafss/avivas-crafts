import { createHash, randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, resetDb, signInAsAdmin, sql, test, waitForFormAge } from './fixtures';

// 002 US1 (tasks.md T007; contracts/routes.md; storefront.md §12.2, §12.3): the orders list and
// the read-only order page on the phone project. One order comes from the real storefront
// checkout (so its line has a snapshot photo); the rest are seeded with the SQL helper below
// (their lines have no photo).

test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Admin screens run on the phone project');
});

const FILLER_COUNT = 26;

interface Seeded {
  number: number;
  id: string;
}

const seeded: Partial<Record<'hat' | 'online' | 'shipped' | 'cancelled' | 'done', Seeded>> = {};
let placedId = '';
let zoneId = '';
let counter = 0;

async function setCart(page: Page, slug: string): Promise<void> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM product WHERE slug = ${slug}`;
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
}

/** Places an offline pickup order through the storefront: order 1001 with a snapshot photo. */
async function placeStorefrontOrder(page: Page): Promise<void> {
  await setCart(page, 'sample-clay-mug');
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
}

interface SeedOptions {
  name: string;
  status?: string;
  paymentState?: 'awaiting_payment' | 'paid' | 'refunded';
  paymentMethod?: 'online' | 'offline';
  delivery?: 'shipping' | 'pickup';
  note?: string | null;
  tracking?: string | null;
  withLine?: boolean;
}

/** An order with one photo-less line, `created_at` one minute after the previous one. */
async function seedOrder(options: SeedOptions): Promise<Seeded> {
  counter += 1;
  const {
    name,
    status = 'new',
    paymentState = 'awaiting_payment',
    paymentMethod = 'offline',
    delivery = 'shipping',
    note = null,
    tracking = null,
    withLine = true,
  } = options;
  const token = createHash('sha256')
    .update(`seed-token-${String(counter)}`)
    .digest();
  const [order] = await sql<{ id: string; order_number: number }[]>`
    INSERT INTO orders
      (public_token_hash, public_token_expires_at, locale, zone_id, currency, customer_name,
       customer_phone, customer_email, delivery_method, address_country, address_city,
       address_line1, note, payment_method, payment_state, paid_at, status, tracking_number,
       subtotal_minor, delivery_fee_minor, total_minor, terms_accepted_at, terms_version,
       privacy_version, created_at)
    VALUES
      (${token}, now() + interval '30 days', 'he', ${zoneId}, 'ILS', ${name},
       '+972501112233', ${`customer${String(counter)}@example.test`}, ${delivery},
       ${delivery === 'shipping' ? 'IL' : null}, ${delivery === 'shipping' ? 'חיפה' : null},
       ${delivery === 'shipping' ? 'הרצל 5' : null}, ${note}, ${paymentMethod}, ${paymentState},
       ${paymentState === 'paid' ? sql`now()` : null}, ${status}, ${tracking},
       10000, 2000, 12000, now(), 1, 1,
       now() - interval '2 days' + ${counter}::int * interval '1 minute')
    RETURNING id, order_number`;
  if (!order) throw new Error('seed order');
  await sql`
    INSERT INTO order_event (order_id, kind, data, created_at)
    VALUES (${order.id}, 'created', '{}'::jsonb,
            now() - interval '2 days' + ${counter}::int * interval '1 minute')`;
  if (withLine) {
    await sql`
      INSERT INTO order_line
        (order_id, product_name_he, product_name_en, options, prep_time_he, unit_price_minor,
         quantity, line_total_minor)
      VALUES
        (${order.id}, 'כובע סרוג', 'Knitted hat',
         ${sql.json([{ group_he: 'צבע', group_en: 'Colour', value_he: 'כחול', value_en: 'Blue' }])},
         'כשבוע', 5000, 2, 10000)`;
  }
  return { number: order.order_number, id: order.id };
}

test.beforeAll(async ({ browser }, testInfo) => {
  if (testInfo.project.name !== 'chromium-mobile') return;
  await resetDb();
  const [zone] = await sql<{ id: string }[]>`SELECT id FROM shipping_zone LIMIT 1`;
  zoneId = zone?.id ?? '';

  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL),
  });
  const page = await context.newPage();
  await placeStorefrontOrder(page);
  await context.close();
  const [placed] = await sql<{ id: string }[]>`SELECT id FROM orders WHERE order_number = 1001`;
  placedId = placed?.id ?? '';
  // The order photo is copied right after the order is committed.
  await expect
    .poll(
      async () =>
        (await sql`SELECT 1 FROM order_line WHERE order_id = ${placedId} AND image_key IS NOT NULL`)
          .length,
      { timeout: 20_000 },
    )
    .toBe(1);

  // The storefront order is the oldest: seeded orders are newer, one minute apart.
  await sql`UPDATE orders SET created_at = now() - interval '2 days' WHERE id = ${placedId}`;
  await sql`UPDATE order_event SET created_at = now() - interval '2 days' WHERE order_id = ${placedId}`;

  seeded.hat = await seedOrder({
    name: 'יעל לוי',
    note: 'להוסיף כרטיס ברכה',
  });
  seeded.online = await seedOrder({
    name: 'רונית אבני',
    status: 'in_preparation',
    paymentState: 'paid',
    paymentMethod: 'online',
  });
  seeded.shipped = await seedOrder({
    name: 'נועה ברק',
    status: 'shipped',
    paymentState: 'paid',
    tracking: 'RR123456789IL',
  });
  seeded.cancelled = await seedOrder({ name: 'מיכל דגן', status: 'cancelled' });
  seeded.done = await seedOrder({ name: 'שרה מזרחי', status: 'completed', paymentState: 'paid' });
  for (let i = 0; i < FILLER_COUNT; i += 1) {
    await seedOrder({
      name: `לקוחה ${String(i + 1)}`,
      status: 'completed',
      paymentState: 'paid',
      withLine: false,
    });
  }

  // Failed emails, as the outbox sender records them (research R5).
  const onlineId = seeded.online.id;
  await sql`
    INSERT INTO email_outbox (kind, to_address, locale, subject, html, text_body, order_id,
                              dedupe_key, status, attempts)
    VALUES ('order-confirmation', 'customer2@example.test', 'he', 'Order', '<p>x</p>', 'x',
            ${onlineId}, ${`order-confirmation:${onlineId}`}, 'failed', 3)`;
  await sql`
    INSERT INTO order_event (order_id, kind, data)
    VALUES (${onlineId}, 'email_failed', ${sql.json({ emailKind: 'order-confirmation' })})`;
  const shippedId = seeded.shipped.id;
  await sql`
    INSERT INTO order_event (order_id, kind, data)
    VALUES (${shippedId}, 'email_failed', ${sql.json({ emailKind: 'order-cancelled' })}),
           (${shippedId}, 'email_failed', ${sql.json({ emailKind: 'order-refunded' })})`;
});

const cards = (page: Page) => page.getByTestId('order-card');
const statusChips = (page: Page) => page.getByRole('navigation', { name: 'סינון לפי סטטוס' });
const paymentChips = (page: Page) => page.getByRole('navigation', { name: 'סינון לפי תשלום' });

async function noAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

test('a signed-out visitor is sent to sign-in', async ({ page }) => {
  await page.goto('/admin/orders');
  await expect(page).toHaveURL(/\/admin\/sign-in/);
});

test('the list shows the orders newest first with number, date, name, total, payment and status', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto('/admin/orders');
  await expect(page.getByRole('heading', { level: 1, name: 'הזמנות' })).toBeVisible();

  // 1 storefront + 5 seeded + 26 fillers = 32 orders; the filler made last is the newest.
  await expect(cards(page)).toHaveCount(25);
  await expect(cards(page).first()).toContainText(`#${String(1006 + FILLER_COUNT)}`);
  await expect(page.getByTestId('orders-paging')).toContainText('עמוד 1 מתוך 2');

  await page.goto('/admin/orders?page=2');
  await expect(cards(page)).toHaveCount(7);
  await expect(cards(page).last()).toContainText('#1001');

  const hat = cards(page).filter({ hasText: '#1002' });
  await expect(hat).toHaveCount(1);
  await expect(hat).toContainText('יעל לוי');
  await expect(hat).toContainText('120.00');
  await expect(hat).toContainText('ממתין לתשלום');
  await expect(hat).toContainText('חדשה');
  await expect(hat).toContainText(/\d{1,2}\.\d{1,2}\.\d{4}, \d{2}:\d{2}/);
  await expect(cards(page).filter({ hasText: '#1001' })).toContainText('דנה כהן');
});

test('the status chip and the payment chip filter, together too, and "ניקוי הסינון" clears', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto('/admin/orders');

  await statusChips(page).getByRole('link', { name: 'בהכנה' }).click();
  await expect(page).toHaveURL(/status=in_preparation/);
  await expect(statusChips(page).getByRole('link', { name: 'בהכנה' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('#1003');

  await paymentChips(page).getByRole('link', { name: 'ממתין לתשלום' }).click();
  await expect(page).toHaveURL(/status=in_preparation&payment=awaiting_payment/);
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByTestId('orders-empty')).toContainText('אין הזמנות שמתאימות לסינון');

  await page.getByTestId('orders-empty').getByRole('link', { name: 'ניקוי הסינון' }).click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
  await expect(cards(page)).toHaveCount(25);

  await paymentChips(page).getByRole('link', { name: 'שולם' }).click();
  await expect(page).toHaveURL(/payment=paid/);
  await page.getByTestId('orders-clear-filters').click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
});

test('paging keeps the filter, and "בלי הזמנות שבוטלו" is a removable chip', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/orders?status=completed&payment=paid');
  // 1 seeded + 26 fillers are completed and paid.
  await expect(cards(page)).toHaveCount(25);
  await expect(page.getByTestId('orders-paging')).toContainText('עמוד 1 מתוך 2');
  await page.getByTestId('orders-paging').getByRole('link', { name: 'הבא' }).click();
  await expect(page).toHaveURL(/status=completed&payment=paid&page=2/);
  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByTestId('orders-paging')).toContainText('עמוד 2 מתוך 2');
  await expect(statusChips(page).getByRole('link', { name: 'הושלמה' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByTestId('orders-paging').getByRole('link', { name: 'הקודם' }).click();
  await expect(cards(page)).toHaveCount(25);

  await page.goto('/admin/orders?status=cancelled&open=1');
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByTestId('orders-open-chip')).toContainText('בלי הזמנות שבוטלו');
  await page.goto('/admin/orders?open=1&page=2');
  await expect(page.getByTestId('orders-open-chip')).toBeVisible();
  await expect(page.getByTestId('orders-list')).not.toContainText('#1005');
  await page.getByTestId('orders-open-chip').click();
  await expect(page).not.toHaveURL(/open=/);
  await expect(page.getByTestId('orders-open-chip')).toHaveCount(0);
});

test('a filter with no match shows the empty state with a clear link', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/orders?status=cancelled&payment=refunded');
  await expect(page.getByTestId('orders-empty')).toContainText('אין הזמנות שמתאימות לסינון');
  await page.getByTestId('orders-empty').getByRole('link', { name: 'ניקוי הסינון' }).click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
  await expect(cards(page).first()).toBeVisible();
});

test('the number box opens an order for 1002 and #1002, and explains an unknown or invalid number', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto('/admin/orders');
  const box = page.getByLabel('מעבר להזמנה לפי מספר');
  await expect(box).toHaveAttribute('inputmode', 'numeric');
  const hatId = seeded.hat?.id ?? '';

  await box.fill('1002');
  await page.getByTestId('order-number-go').click();
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${hatId}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('#1002');

  await page.goto('/admin/orders');
  await page.getByLabel('מעבר להזמנה לפי מספר').fill('#1002');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${hatId}$`));

  await page.goto('/admin/orders?status=completed');
  await page.getByLabel('מעבר להזמנה לפי מספר').fill('99999');
  await page.getByTestId('order-number-go').click();
  await expect(page).toHaveURL(/\/admin\/orders\?/);
  await expect(page.locator('#order-number-notice')).toContainText('לא מצאתי הזמנה מספר 99999');
  // The filters are kept.
  await expect(page).toHaveURL(/status=completed/);
  await expect(statusChips(page).getByRole('link', { name: 'הושלמה' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByLabel('מעבר להזמנה לפי מספר').fill('abc');
  await page.getByTestId('order-number-go').click();
  await expect(page.locator('#order-number-notice')).toContainText(
    'מספר הזמנה הוא רק ספרות, למשל 1023',
  );
  await expect(page).toHaveURL(/\/admin\/orders\?/);
});

test('the order page shows the snapshot photo of a storefront order and the empty well for a seeded line', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto(`/admin/orders/${placedId}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('#1001');
  const photo = page.getByTestId('order-line-photo').locator('img');
  await photo.scrollIntoViewIfNeeded();
  await expect(photo).toHaveAttribute('src', /^\/api\/admin\/media\/orders\//);
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
  // Pickup: no address, "איסוף עצמי".
  await expect(page.getByText('איסוף עצמי').first()).toBeVisible();
  await expect(page.getByTestId('order-address')).toHaveCount(0);
  await expect(page.getByTestId('order-phone-link')).toHaveAttribute('href', 'tel:+972522345678');
  await expect(page.getByTestId('order-email-link')).toHaveAttribute(
    'href',
    'mailto:dana@example.com',
  );
  await noAxeViolations(page);

  await page.goto(`/admin/orders/${seeded.hat?.id ?? ''}`);
  await expect(page.getByTestId('order-line-photo-empty')).toHaveCount(1);
  await expect(page.getByTestId('order-line-photo')).toHaveCount(0);
});

test('the order page shows items, totals, contact links, address, note, payment and history', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto(`/admin/orders/${seeded.hat?.id ?? ''}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('#1002');
  await expect(page.getByText('ממתין לתשלום').first()).toBeVisible();

  const line = page.getByTestId('admin-order-line');
  await expect(line).toHaveCount(1);
  await expect(line).toContainText('כובע סרוג');
  await expect(line).toContainText('צבע: כחול');
  await expect(line).toContainText('2 × ');
  await expect(line).toContainText('50.00');
  await expect(line).toContainText('100.00');
  await expect(line).toContainText('זמן הכנה: כשבוע');
  await expect(page.getByTestId('admin-order-total')).toContainText('120.00');
  await expect(page.getByText('סכום ביניים')).toBeVisible();
  await expect(page.getByText('משלוח', { exact: true }).first()).toBeVisible();

  await expect(page.getByTestId('admin-order-customer-name')).toHaveText('יעל לוי');
  await expect(page.getByTestId('order-phone-link')).toHaveAttribute('href', 'tel:+972501112233');
  await expect(page.getByTestId('order-email-link')).toHaveAttribute(
    'href',
    'mailto:customer1@example.test',
  );
  await expect(page.getByTestId('order-address')).toContainText('הרצל 5');
  await expect(page.getByTestId('order-address')).toContainText('חיפה');
  await expect(page.getByTestId('order-note')).toHaveText('להוסיף כרטיס ברכה');
  await expect(page.getByText('תשלום ישיר אליי')).toBeVisible();
  const history = page.getByTestId('order-history-entry');
  await expect(history).toHaveCount(1);
  await expect(history.first()).toContainText('ההזמנה התקבלה');
  await expect(history.first()).toContainText('המערכת');
  await noAxeViolations(page);
});

test('a shipped order shows its tracking number; an online paid order shows when it was paid', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto(`/admin/orders/${seeded.shipped?.id ?? ''}`);
  await expect(page.getByTestId('order-tracking-number')).toHaveText('RR123456789IL');
  await expect(page.getByText('מייל הביטול לא נשלח ללקוח').first()).toBeVisible();
  await expect(page.getByText('מייל ההחזר לא נשלח ללקוח').first()).toBeVisible();
  // The failures are history entries of the system.
  await expect(page.getByTestId('order-history')).toContainText('מייל הביטול לא נשלח ללקוח');

  await page.goto(`/admin/orders/${seeded.online?.id ?? ''}`);
  await expect(page.getByText(/שולם ב־\d/)).toBeVisible();
  await expect(page.getByText('תשלום מאובטח באתר')).toBeVisible();
});

test('an order whose confirmation email failed shows the call-the-customer alert', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto(`/admin/orders/${seeded.online?.id ?? ''}`);
  const alert = page.locator('#order-email-failed-alert');
  await expect(alert).toBeVisible();
  await expect(alert).toHaveAttribute('role', 'alert');
  await expect(alert).toContainText('הלקוח לא קיבל את מייל ההזמנה. כדאי להתקשר');
  await expect(alert.getByRole('link')).toHaveAttribute('href', 'tel:+972501112233');
  await noAxeViolations(page);

  // An order without a failure shows no alert.
  await page.goto(`/admin/orders/${seeded.hat?.id ?? ''}`);
  await expect(page.locator('#order-email-failed-alert')).toHaveCount(0);
});

test('an unknown or malformed order id shows the admin not-found page', async ({ page }) => {
  await signInAsAdmin(page);
  for (const id of [randomUUID(), 'not-a-uuid']) {
    await page.goto(`/admin/orders/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'הדף לא נמצא' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'חזרה ללוח הבקרה' })).toBeVisible();
  }
});

test('an owner-email link from another site opens the order, also through sign-in (FR-001)', async ({
  page,
  browser,
}, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const id = seeded.hat?.id ?? '';
  const mail = `http://127.0.0.1:4999/mail.html`;
  const serveMail = async (target: Page) => {
    await target.route(mail, (route) =>
      route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html><body><a id="open" href="${baseURL}/admin/orders/${id}">open</a></body></html>`,
      }),
    );
  };

  // Signed in: the click opens the order.
  await signInAsAdmin(page);
  await serveMail(page);
  await page.goto(mail);
  await page.locator('#open').click();
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('#1002');

  // Signed out: sign-in first, then the same order.
  const context = await browser.newContext({ baseURL });
  const signedOut = await context.newPage();
  await serveMail(signedOut);
  await signedOut.goto(mail);
  await signedOut.locator('#open').click();
  await expect(signedOut).toHaveURL(/\/admin\/sign-in\?next=/);
  expect(decodeURIComponent(new URL(signedOut.url()).searchParams.get('next') ?? '')).toBe(
    `/admin/orders/${id}`,
  );
  await signInAsAdmin(signedOut, { fromCurrentPage: true });
  await expect(signedOut).toHaveURL(new RegExp(`/admin/orders/${id}$`));
  await expect(signedOut.getByRole('heading', { level: 1 })).toContainText('#1002');
  await context.close();
});

test('the list passes axe and has no horizontal scroll at phone width', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/orders');
  await expect(cards(page).first()).toBeVisible();
  await noAxeViolations(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
