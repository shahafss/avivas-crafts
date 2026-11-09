import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { Page, Route } from '@playwright/test';
import { expect, readOutbox, resetDb, signInAsAdmin, sql, test, waitForFormAge } from './fixtures';

// 002 US2 (tasks.md T017; storefront.md §12.3): the admin order workflow on the phone project.
// Tests run in order on shared state, one order per flow, each placed through the storefront
// offline checkout in beforeAll: A shipping (forward / back / complete and pay), B pickup (Ready
// with a note, complete without payment), C shipping (tracking number edit), D shipping (US3:
// mark paid, mark refunded), E shipping (US5: cancel unpaid), F pickup (US5: paid, cancel, refund
// reminder), G shipping (US6: customer details correction).

test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Admin screens run on the phone project');
});

const TRACKING = 'RR123456789IL';
const TRACKING_FIXED = 'RR987654321IL';

type Key = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
const ids: Record<Key, string> = { A: '', B: '', C: '', D: '', E: '', F: '', G: '' };

async function setCart(page: Page): Promise<void> {
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
}

/** Places an offline order through the storefront checkout and returns its order id. */
async function placeOrder(page: Page, delivery: 'shipping' | 'pickup'): Promise<string> {
  await setCart(page);
  await page.goto('/he/checkout');
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('field-fullName').fill('דנה כהן');
  await page.getByTestId('field-phone').fill('052-234-5678');
  await page.getByTestId('field-email').fill('dana@example.com');
  await page.getByTestId(`delivery-${delivery}`).check();
  if (delivery === 'shipping') {
    await page.getByTestId('field-city').fill('חיפה');
    await page.getByTestId('field-line1').fill('הרצל 5');
  }
  await page.getByTestId('payment-offline').check();
  await page.getByTestId('accept-terms').check();
  await waitForFormAge(page);
  await page.getByTestId('place-order').click();
  await page.waitForURL(/\/he\/order\//, { timeout: 30_000 });
  const number = Number(
    (await page.getByTestId('order-number').textContent())?.replace(/\D/g, '') ?? '0',
  );
  const [row] = await sql<{ id: string }[]>`SELECT id FROM orders WHERE order_number = ${number}`;
  if (!row) throw new Error('order not found');
  return row.id;
}

test.beforeAll(async ({ browser }, testInfo) => {
  if (testInfo.project.name !== 'chromium-mobile') return;
  await resetDb();
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL) });
  const page = await context.newPage();
  ids.A = await placeOrder(page, 'shipping');
  ids.B = await placeOrder(page, 'pickup');
  ids.C = await placeOrder(page, 'shipping');
  ids.D = await placeOrder(page, 'shipping');
  ids.E = await placeOrder(page, 'shipping');
  ids.F = await placeOrder(page, 'pickup');
  ids.G = await placeOrder(page, 'shipping');
  await context.close();
});

async function openOrder(page: Page, key: Key): Promise<void> {
  await signInAsAdmin(page);
  await page.goto(`/admin/orders/${ids[key]}`);
  await expect(page.getByTestId('order-actions')).toBeVisible({ timeout: 20_000 });
}

interface OrderState {
  status: string;
  payment_state: string;
  tracking_number: string | null;
  pickup_note: string | null;
}

async function orderState(key: Key): Promise<OrderState> {
  const [row] = await sql<OrderState[]>`
    SELECT status, payment_state, tracking_number, pickup_note FROM orders WHERE id = ${ids[key]}`;
  if (!row) throw new Error('no order');
  return row;
}

async function statusEventCount(key: Key): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM order_event
    WHERE order_id = ${ids[key]} AND kind = 'status_changed'`;
  return row?.n ?? 0;
}

const action = (page: Page, status: string) => page.getByTestId(`order-action-${status}`);
const dialog = (page: Page) => page.getByRole('dialog');

test('order A (shipping, new): only "בהכנה" and "נשלחה" are offered; two quick taps record one change', async ({
  page,
}) => {
  await openOrder(page, 'A');
  await expect(action(page, 'in_preparation')).toBeVisible();
  await expect(action(page, 'shipped')).toBeVisible();
  await expect(action(page, 'ready_for_pickup')).toHaveCount(0);
  await expect(action(page, 'completed')).toHaveCount(0);
  await expect(page.getByTestId('order-action-back')).toHaveCount(0);
  // Cancelling sits next to the status steps (US2 #1).
  await expect(action(page, 'cancel')).toBeVisible();

  await action(page, 'in_preparation').dblclick();
  await expect.poll(async () => (await orderState('A')).status).toBe('in_preparation');
  await expect(action(page, 'shipped')).toBeVisible();
  await expect(page.getByTestId('order-action-back')).toBeVisible();
  // The created entry and one status entry.
  await expect(page.getByTestId('order-history-entry')).toHaveCount(2);
  expect(await statusEventCount('A')).toBe(1);
});

test('order A: Shipped with a tracking number, back one step, Shipped again pre-fills the number', async ({
  page,
}) => {
  await openOrder(page, 'A');
  await action(page, 'shipped').click();
  await page.getByTestId('order-tracking-input').fill(TRACKING);
  await page.getByTestId('order-fulfilment-save').click();
  await expect.poll(async () => (await orderState('A')).status).toBe('shipped');
  expect((await orderState('A')).tracking_number).toBe(TRACKING);
  await expect(page.getByTestId('order-tracking-number')).toHaveText(TRACKING);

  await page.getByTestId('order-action-back').click();
  await expect.poll(async () => (await orderState('A')).status).toBe('in_preparation');
  // The number is kept on the order.
  expect((await orderState('A')).tracking_number).toBe(TRACKING);

  await expect(action(page, 'shipped')).toBeVisible();
  await action(page, 'shipped').click();
  await expect(page.getByTestId('order-tracking-input')).toHaveValue(TRACKING);
  await page.getByTestId('order-fulfilment-save').click();
  await expect.poll(async () => (await orderState('A')).status).toBe('shipped');
  expect((await orderState('A')).tracking_number).toBe(TRACKING);
});

test('order A: "הושלמה" asks first; Cancel changes nothing; mark paid and complete does both', async ({
  page,
}) => {
  await openOrder(page, 'A');
  await action(page, 'completed').click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByTestId('confirm-dialog-cancel')).toBeFocused();
  await expect(dialog(page).getByRole('button', { name: 'סימון כשולם והשלמה' })).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'השלמה בלי תשלום' })).toBeVisible();
  await dialog(page).getByTestId('confirm-dialog-cancel').click();
  await expect(dialog(page)).toBeHidden();
  expect((await orderState('A')).status).toBe('shipped');

  await action(page, 'completed').click();
  await dialog(page).getByRole('button', { name: 'סימון כשולם והשלמה' }).click();
  await expect.poll(async () => (await orderState('A')).status).toBe('completed');
  expect((await orderState('A')).payment_state).toBe('paid');
  // No status button is left.
  await expect(page.getByTestId('order-actions')).toContainText('ההזמנה הושלמה');
  for (const status of ['in_preparation', 'shipped', 'ready_for_pickup', 'completed']) {
    await expect(action(page, status)).toHaveCount(0);
  }
  await expect(page.getByTestId('order-action-back')).toHaveCount(0);
  // created, in preparation, shipped, back, shipped, completed, paid.
  await expect(page.getByTestId('order-history-entry')).toHaveCount(7);
});

test('order B (pickup): Ready for pickup with a note, edit the note, complete without payment', async ({
  page,
}) => {
  await openOrder(page, 'B');
  await expect(action(page, 'shipped')).toHaveCount(0);
  await action(page, 'ready_for_pickup').click();
  await page.getByTestId('order-pickup-note-input').fill('אפשר לאסוף אחרי 17:00');
  await page.getByTestId('order-fulfilment-save').click();
  await expect.poll(async () => (await orderState('B')).status).toBe('ready_for_pickup');
  expect((await orderState('B')).pickup_note).toBe('אפשר לאסוף אחרי 17:00');
  await expect(action(page, 'shipped')).toHaveCount(0);

  await page.getByTestId('order-fulfilment-edit').click();
  await page.getByTestId('order-pickup-note-input').fill('אפשר לאסוף אחרי 18:00');
  await page.getByTestId('order-fulfilment-save').click();
  await expect.poll(async () => (await orderState('B')).pickup_note).toBe('אפשר לאסוף אחרי 18:00');
  expect((await orderState('B')).status).toBe('ready_for_pickup');

  await action(page, 'completed').click();
  await dialog(page).getByRole('button', { name: 'השלמה בלי תשלום' }).click();
  await expect.poll(async () => (await orderState('B')).status).toBe('completed');
  expect((await orderState('B')).payment_state).toBe('awaiting_payment');
  await expect(page.getByTestId('order-actions')).toContainText('ההזמנה הושלמה');
});

test('order C: the tracking number is corrected without a status change; the history leaves the number out', async ({
  page,
}) => {
  await openOrder(page, 'C');
  await action(page, 'shipped').click();
  await page.getByTestId('order-tracking-input').fill(TRACKING);
  await page.getByTestId('order-fulfilment-save').click();
  await expect.poll(async () => (await orderState('C')).status).toBe('shipped');

  await page.getByTestId('order-fulfilment-edit').click();
  // The field's own axe check while it is open.
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  await expect(page.getByTestId('order-tracking-input')).toHaveValue(TRACKING);
  await page.getByTestId('order-tracking-input').fill(TRACKING_FIXED);
  await page.getByTestId('order-fulfilment-save').click();
  await expect.poll(async () => (await orderState('C')).tracking_number).toBe(TRACKING_FIXED);
  expect((await orderState('C')).status).toBe('shipped');
  await expect(page.getByTestId('order-tracking-number')).toHaveText(TRACKING_FIXED);

  const history = page.getByTestId('order-history');
  await expect(history).toContainText('מספר המשלוח עודכן');
  await expect(history).not.toContainText(TRACKING);
  await expect(history).not.toContainText(TRACKING_FIXED);
});

test('every change is in the history, and no customer email besides the confirmations was queued', async ({
  page,
}) => {
  const rows = await sql<{ kind: string; data: Record<string, unknown> }[]>`
    SELECT kind, data FROM order_event WHERE kind <> 'created' ORDER BY created_at`;
  expect(JSON.stringify(rows)).not.toContain(TRACKING);
  expect(JSON.stringify(rows)).not.toContain('RR9876');
  const activity = await sql<{ details: unknown }[]>`SELECT details FROM admin_activity`;
  expect(JSON.stringify(activity)).not.toContain('RR');

  const confirmations = await readOutbox('order-confirmation');
  expect(confirmations).toHaveLength(7);
  expect(new Set(confirmations.map((row) => row.order_id))).toEqual(
    new Set([ids.A, ids.B, ids.C, ids.D, ids.E, ids.F, ids.G]),
  );
  const customerRows = await sql<{ kind: string }[]>`
    SELECT kind FROM email_outbox WHERE to_address = 'dana@example.com'`;
  expect(customerRows.every((row) => row.kind === 'order-confirmation')).toBe(true);

  // Every change shows in each order's history: created + the changes made above.
  await signInAsAdmin(page);
  for (const [key, count] of [
    ['B', 4],
    ['C', 3],
    ['D', 1],
  ] as const) {
    await page.goto(`/admin/orders/${ids[key]}`);
    await expect(page.getByTestId('order-history-entry')).toHaveCount(count);
  }
});

// ---------------------------------------------------------------- US3: payments (T021)

/** Delays every Server Action POST, so a busy button can be seen. */
async function slowActions(page: Page, ms: number): Promise<() => Promise<void>> {
  const handler = async (route: Route) => {
    if (route.request().method() === 'POST') await new Promise((done) => setTimeout(done, ms));
    await route.continue();
  };
  await page.route('**/admin/orders/**', handler);
  return () => page.unroute('**/admin/orders/**', handler);
}

/** An online order that was paid at checkout (seeded; the checkout itself is spec 001's). */
async function seedOnlinePaidOrder(): Promise<string> {
  const [zone] = await sql<{ id: string }[]>`SELECT id FROM shipping_zone LIMIT 1`;
  const token = createHash('sha256').update('online-paid-token').digest();
  const [order] = await sql<{ id: string }[]>`
    INSERT INTO orders
      (public_token_hash, public_token_expires_at, locale, zone_id, currency, customer_name,
       customer_phone, customer_email, delivery_method, address_country, address_city,
       address_line1, payment_method, payment_state, paid_at, status, subtotal_minor,
       delivery_fee_minor, total_minor, terms_accepted_at, terms_version, privacy_version)
    VALUES
      (${token}, now() + interval '30 days', 'he', ${zone?.id ?? ''}, 'ILS', 'רון לוי',
       '+972501112233', 'ron@example.test', 'shipping', 'IL', 'חיפה', 'הרצל 5', 'online', 'paid',
       now(), 'new', 10000, 2000, 12000, now(), 1, 1)
    RETURNING id`;
  if (!order) throw new Error('seed order');
  await sql`INSERT INTO order_event (order_id, kind, data) VALUES (${order.id}, 'payment_confirmed', '{}'::jsonb)`;
  return order.id;
}

const markPaid = (page: Page) => page.getByTestId('order-action-mark-paid');
const markRefunded = (page: Page) => page.getByTestId('order-action-mark-refunded');

test('order D (offline, awaiting payment): "סימון כהוחזר" is not offered; Cancel in the dialog changes nothing', async ({
  page,
}) => {
  await openOrder(page, 'D');
  await expect(markPaid(page)).toBeVisible();
  await expect(markRefunded(page)).toHaveCount(0);

  await markPaid(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByTestId('confirm-dialog-cancel')).toBeFocused();
  await expect(dialog(page)).toContainText('לסמן שהתשלום התקבל? אי אפשר לבטל את זה.');
  await dialog(page).getByTestId('confirm-dialog-cancel').click();
  await expect(dialog(page)).toBeHidden();
  expect((await orderState('D')).payment_state).toBe('awaiting_payment');
});

test('order D: confirming marks it paid, with date and time; the history says so', async ({
  page,
}) => {
  await openOrder(page, 'D');
  await markPaid(page).click();
  const restore = await slowActions(page, 700);
  await dialog(page).getByTestId('confirm-dialog-confirm').click();
  // The pressed button shows it is working.
  await expect(dialog(page).getByTestId('confirm-dialog-confirm')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await restore();
  await expect.poll(async () => (await orderState('D')).payment_state).toBe('paid');
  await expect(page.getByTestId('order-payment')).toContainText('שולם');
  await expect(page.getByTestId('order-paid-at')).toContainText(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/);
  await expect(page.getByTestId('order-paid-at')).toContainText(/\d{1,2}:\d{2}/);
  await expect(markPaid(page)).toHaveCount(0);
  await expect(markRefunded(page)).toBeVisible();
  await expect(page.getByTestId('order-history')).toContainText('סומן כשולם');
  // No customer email for a payment mark.
  expect(await readOutbox('order-refunded')).toHaveLength(0);
});

test('order D: a plain one-choice "הושלמה" confirm is busy while it runs', async ({ page }) => {
  await openOrder(page, 'D');
  await action(page, 'shipped').click();
  await page.getByTestId('order-fulfilment-save').click();
  await expect.poll(async () => (await orderState('D')).status).toBe('shipped');
  await action(page, 'completed').click();
  // Paid already: the dialog has one choice.
  await expect(dialog(page).getByTestId('confirm-dialog-secondary')).toHaveCount(0);
  const restore = await slowActions(page, 700);
  await dialog(page).getByTestId('confirm-dialog-confirm').click();
  await expect(dialog(page).getByTestId('confirm-dialog-confirm')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await restore();
  await expect.poll(async () => (await orderState('D')).status).toBe('completed');
  // The payment buttons still apply on a completed order.
  await expect(page.getByTestId('order-actions')).toContainText('ההזמנה הושלמה');
  await expect(markRefunded(page)).toBeVisible();
});

test('order D: marking it refunded says the customer gets an email; Cancel changes nothing', async ({
  page,
}) => {
  await openOrder(page, 'D');
  await markRefunded(page).click();
  await expect(dialog(page)).toContainText('הלקוח יקבל על כך מייל');
  await expect(dialog(page)).toContainText('לסמן שהכסף הוחזר ללקוח?');
  await expect(dialog(page).getByTestId('confirm-dialog-cancel')).toBeFocused();
  await dialog(page).getByTestId('confirm-dialog-cancel').click();
  await expect(dialog(page)).toBeHidden();
  expect((await orderState('D')).payment_state).toBe('paid');
  expect(await readOutbox('order-refunded')).toHaveLength(0);

  await markRefunded(page).click();
  await dialog(page).getByTestId('confirm-dialog-confirm').click();
  await expect.poll(async () => (await orderState('D')).payment_state).toBe('refunded');
  await expect(page.getByTestId('order-payment')).toContainText('הוחזר');
  await expect(page.getByTestId('order-refunded-at')).toContainText(
    /\d{1,2}[./]\d{1,2}[./]\d{2,4}/,
  );
  await expect(markRefunded(page)).toHaveCount(0);
  await expect(markPaid(page)).toHaveCount(0);
  await expect(page.getByTestId('order-history')).toContainText('סומן כהוחזר');

  const mails = await readOutbox('order-refunded');
  expect(mails).toHaveLength(1);
  expect(mails[0]).toMatchObject({ order_id: ids.D, to_address: 'dana@example.com', locale: 'he' });
  expect(mails[0]?.html).toContain('lang="he"');
});

test('an online paid order never shows "סימון כשולם"; refunding it queues the online method sentence', async ({
  page,
}) => {
  const onlineId = await seedOnlinePaidOrder();
  await signInAsAdmin(page);
  await page.goto(`/admin/orders/${onlineId}`);
  await expect(page.getByTestId('order-actions')).toBeVisible({ timeout: 20_000 });
  await expect(markPaid(page)).toHaveCount(0);
  await expect(markRefunded(page)).toBeVisible();
  await markRefunded(page).click();
  await dialog(page).getByTestId('confirm-dialog-confirm').click();
  await expect.poll(async () => (await readOutbox('order-refunded')).length).toBe(2);
  const mail = (await readOutbox('order-refunded')).find((row) => row.order_id === onlineId);
  expect(mail?.to_address).toBe('ron@example.test');
  expect(mail?.text_body).toContain('ההחזר יופיע בכרטיס האשראי');
  expect(mail?.text_body).not.toContain('ההחזר נעשה באותה דרך שבה שילמתם.');
});

// ---------------------------------------------------------------- US5: cancelling (T034)

const cancelButton = (page: Page) => page.getByTestId('order-action-cancel');
const reminder = (page: Page) => page.getByTestId('order-refund-reminder');

test('order E (unpaid): Cancel in the dialog changes nothing; confirming cancels it and removes the button', async ({
  page,
}) => {
  await openOrder(page, 'E');
  await cancelButton(page).click();
  await expect(dialog(page)).toContainText('לבטל את ההזמנה?');
  await expect(dialog(page)).toContainText('הלקוח יקבל מייל שההזמנה בוטלה.');
  await expect(dialog(page)).not.toContainText('ההזמנה שולמה');
  await expect(dialog(page).getByTestId('confirm-dialog-cancel')).toBeFocused();
  await expect(dialog(page).getByTestId('confirm-dialog-cancel')).toHaveText('חזרה');
  await dialog(page).getByTestId('confirm-dialog-cancel').click();
  await expect(dialog(page)).toBeHidden();
  expect((await orderState('E')).status).toBe('new');
  expect(await readOutbox('order-cancelled')).toHaveLength(0);

  await cancelButton(page).click();
  const restore = await slowActions(page, 700);
  await dialog(page).getByTestId('confirm-dialog-confirm').click();
  await expect(dialog(page).getByTestId('confirm-dialog-confirm')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await restore();
  await expect.poll(async () => (await orderState('E')).status).toBe('cancelled');
  await expect(page.getByRole('heading', { level: 1 }).locator('..')).toContainText('בוטלה');
  await expect(page.getByTestId('order-actions')).toContainText('ההזמנה בוטלה');
  await expect(cancelButton(page)).toHaveCount(0);
  await expect(action(page, 'in_preparation')).toHaveCount(0);
  // Nothing was paid, so nothing is owed back.
  await expect(reminder(page)).toHaveCount(0);
  await expect(markRefunded(page)).toHaveCount(0);
  await expect(page.getByTestId('order-history')).toContainText('בוטלה');

  const mails = await readOutbox('order-cancelled');
  expect(mails).toHaveLength(1);
  expect(mails[0]).toMatchObject({ order_id: ids.E, to_address: 'dana@example.com', locale: 'he' });
  expect(mails[0]?.text_body).toContain('לא נגבה תשלום.');
});

test('order F (paid): the dialog shows the refund reminder; after cancelling the Notice stays until "סימון כהוחזר"', async ({
  page,
}) => {
  await openOrder(page, 'F');
  await markPaid(page).click();
  await dialog(page).getByTestId('confirm-dialog-confirm').click();
  await expect.poll(async () => (await orderState('F')).payment_state).toBe('paid');
  await expect(markPaid(page)).toHaveCount(0);

  await cancelButton(page).click();
  await expect(dialog(page)).toContainText('הלקוח יקבל מייל שההזמנה בוטלה.');
  await expect(dialog(page)).toContainText('ההזמנה שולמה. אחרי הביטול צריך להחזיר את הכסף');
  // An offline order: the direct-payment sentence only.
  await expect(dialog(page)).toContainText('בתשלום ישיר — באותה דרך שבה שולם');
  await expect(dialog(page)).not.toContainText('בתשלום באתר');
  await dialog(page).getByTestId('confirm-dialog-confirm').click();
  await expect.poll(async () => (await orderState('F')).status).toBe('cancelled');

  // The persistent Notice holds the only "סימון כהוחזר"; the panel's own is gone.
  await expect(reminder(page)).toBeVisible();
  await expect(reminder(page)).toContainText('צריך להחזיר את הכסף');
  await expect(reminder(page)).toContainText('בתשלום ישיר — באותה דרך שבה שולם');
  await expect(reminder(page)).not.toContainText('בתשלום באתר');
  await expect(markRefunded(page)).toHaveCount(1);
  await expect(reminder(page).getByTestId('order-action-mark-refunded')).toBeVisible();
  await expect(page.getByTestId('order-actions-payment')).toHaveCount(0);
  // It stays after a reload.
  await page.reload();
  await expect(reminder(page)).toBeVisible();
  expect((await orderState('F')).payment_state).toBe('paid');

  await markRefunded(page).click();
  await expect(dialog(page)).toContainText('לסמן שהכסף הוחזר ללקוח?');
  await dialog(page).getByTestId('confirm-dialog-confirm').click();
  await expect.poll(async () => (await orderState('F')).payment_state).toBe('refunded');
  await expect(reminder(page)).toHaveCount(0);
  await expect(markRefunded(page)).toHaveCount(0);
  await expect(page.getByTestId('order-payment')).toContainText('הוחזר');

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test('each cancelled order has exactly one order-cancelled email, in its language', async () => {
  const mails = await readOutbox('order-cancelled');
  expect(mails.map((row) => row.order_id).sort()).toEqual([ids.E, ids.F].sort());
  for (const mail of mails) {
    expect(mail.locale).toBe('he');
    expect(mail.html).toContain('lang="he"');
    expect(mail.html).toContain('dir="rtl"');
  }
  const paid = mails.find((row) => row.order_id === ids.F);
  expect(paid?.text_body).toContain('אחזיר את הכסף באותה דרך שבה שילמתם.');
  expect(await readOutbox('order-refunded')).toHaveLength(3);
});

// ---------------------------------------------------------------- US6: customer details (T039)

test('order G: the customer details are corrected; the history says so without the values', async ({
  page,
}) => {
  await openOrder(page, 'G');
  await page.getByText('תיקון פרטי הלקוח').click();
  await expect(page.getByTestId('customer-form')).toBeVisible();
  await expect(page.getByTestId('customer-field-fullName')).toHaveValue('דנה כהן');
  await expect(page.getByTestId('customer-field-city')).toHaveValue('חיפה');
  await page.getByTestId('customer-field-phone').fill('050-234-5678');
  await page.getByTestId('customer-field-city').fill('באר שבע');
  await page.getByTestId('customer-save').click();

  await expect(page.getByText('הפרטים נשמרו')).toBeVisible();
  await expect(page.getByTestId('order-phone-link')).toContainText('+972502345678');
  await expect(page.getByTestId('order-address')).toContainText('באר שבע');
  const history = page.getByTestId('order-history');
  await expect(history).toContainText('פרטי הלקוח עודכנו');
  await expect(history).not.toContainText('באר שבע');
  await expect(history).not.toContainText('502345678');
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM order_event WHERE order_id = ${ids.G} AND kind = 'customer_edited'`;
  expect(row?.n).toBe(1);
});

test('order G: an invalid email shows the Hebrew message next to the field and saves nothing', async ({
  page,
}) => {
  await openOrder(page, 'G');
  await page.getByText('תיקון פרטי הלקוח').click();
  await page.getByTestId('customer-field-email').fill('not-an-email');
  await page.getByTestId('customer-save').click();

  await expect(page.getByTestId('customer-field-email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#customer-field-email-error')).toHaveText(
    'כתובת האימייל לא נראית תקינה',
  );
  await expect(page.getByTestId('customer-error-summary')).toBeFocused();
  // The open form with its error, checked by axe.
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  const [row] = await sql<{ customer_email: string }[]>`
    SELECT customer_email FROM orders WHERE id = ${ids.G}`;
  expect(row?.customer_email).toBe('dana@example.com');
  const [events] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM order_event WHERE order_id = ${ids.G} AND kind = 'customer_edited'`;
  expect(events?.n).toBe(1);
});
