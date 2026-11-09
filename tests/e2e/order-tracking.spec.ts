import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, readOutbox, resetDb, sql, test, waitForFormAge } from './fixtures';

// 002 US4 (tasks.md T026; storefront.md §8.8; contracts/routes.md): the customer order page as a
// status tracker, on the phone projects. A Hebrew shipping order and an English pickup order
// come from the real checkout; the spec moves them with SQL (as Aviva's actions would) and
// reloads the page.

test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-desktop', 'customer order page: phone projects');
});

const PHONE = '+972500000000';
const EMAIL = 'shop@example.invalid';
const PICKUP_SETTINGS_TEXT = 'האיסוף מהבית ברחוב הדוגמה';
const PICKUP_SETTINGS_TEXT_EN = 'Pickup is from my home';

interface Placed {
  id: string;
  number: number;
  url: string;
}
const heOrder: Partial<Placed> = {};
const enOrder: Partial<Placed> = {};

async function setCart(page: Page, locale: string, slug: string): Promise<void> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM product WHERE slug = ${slug}`;
  await page.goto(`/${locale}/contact`);
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

async function place(
  page: Page,
  locale: 'he' | 'en',
  delivery: 'shipping' | 'pickup',
  who: { name: string; email: string; city: string; street: string },
): Promise<Placed> {
  await setCart(page, locale, 'sample-clay-mug');
  await page.goto(`/${locale}/checkout`);
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('field-fullName').fill(who.name);
  await page.getByTestId('field-phone').fill('052-234-5678');
  await page.getByTestId('field-email').fill(who.email);
  await page.getByTestId(`delivery-${delivery}`).check();
  if (delivery === 'shipping') {
    await page.getByTestId('field-city').fill(who.city);
    await page.getByTestId('field-line1').fill(who.street);
  }
  await page.getByTestId('payment-offline').check();
  await page.getByTestId('accept-terms').check({ position: { x: 4, y: 4 } });
  await waitForFormAge(page);
  await page.getByTestId('place-order').click();
  await page.waitForURL(new RegExp(`/${locale}/order/`), { timeout: 30_000 });
  const [row] = await sql<{ id: string; order_number: number }[]>`
    SELECT id, order_number FROM orders WHERE customer_email = ${who.email}`;
  if (!row) throw new Error('order not stored');
  const mails = await readOutbox('order-confirmation');
  const mail = mails.find((m) => m.to_address === who.email);
  const match = /\/(?:he|en)\/order\/[A-Za-z0-9_-]{43}/.exec(mail?.text_body ?? '');
  if (!match) throw new Error('no order link in the email');
  return { id: row.id, number: row.order_number, url: match[0] };
}

async function move(
  order: Partial<Placed>,
  fields: {
    status: string;
    payment?: 'awaiting_payment' | 'paid' | 'refunded';
    tracking?: string | null;
    note?: string | null;
  },
): Promise<void> {
  await sql`
    UPDATE orders SET status = ${fields.status},
      payment_state = ${fields.payment ?? 'awaiting_payment'},
      paid_at = ${fields.payment === 'paid' || fields.payment === 'refunded' ? new Date() : null},
      refunded_at = ${fields.payment === 'refunded' ? new Date() : null},
      tracking_number = ${fields.tracking ?? null},
      pickup_note = ${fields.note ?? null},
      public_token_expires_at = now() + interval '30 days'
    WHERE id = ${order.id ?? ''}`;
  await sql`
    INSERT INTO order_event (order_id, kind, data)
    VALUES (${order.id ?? ''}, 'status_changed', ${sql.json({ to: fields.status })})`;
}

const steps = (page: Page) => page.getByTestId('order-step');

async function expectCurrent(page: Page, labels: string[], current: number): Promise<void> {
  await expect(steps(page)).toHaveCount(4);
  for (let i = 0; i < 4; i += 1) {
    await expect(steps(page).nth(i)).toContainText(labels[i] ?? '');
    const state = i < current ? 'done' : i === current ? 'current' : 'todo';
    await expect(steps(page).nth(i)).toHaveAttribute('data-state', state);
  }
  await expect(page.locator('[aria-current="step"]')).toHaveCount(1);
  await expect(steps(page).nth(current)).toHaveAttribute('aria-current', 'step');
}

const MADE_TEXTS = {
  madeAwaiting: 'קיבלתי את ההזמנה ואתחיל לעבוד עליה בקרוב.',
  madePaid: 'עכשיו אני מתחילה לסרוג.',
  madeInPreparation: 'אני סורגת את ההזמנה שלכם עכשיו.',
} as const;

/** Exactly the given `made` text (or none) is on the page (storefront.md §8.8 table). */
async function expectMade(page: Page, which: keyof typeof MADE_TEXTS | null): Promise<void> {
  for (const [key, text] of Object.entries(MADE_TEXTS)) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(key === which ? 1 : 0);
  }
  await expect(page.getByText('אתחיל לסרוג כשהתשלום יתקבל.')).toHaveCount(0);
}

const PHONE_FORMS = ['052-234-5678', '0522345678', '+972522345678', '522345678'];

async function expectNoPersonalData(page: Page, secrets: string[]): Promise<void> {
  const html = await page.content();
  for (const secret of [...secrets, ...PHONE_FORMS]) {
    expect(html).not.toContain(secret);
  }
}

test.beforeAll(async () => {
  await resetDb();
  await sql`UPDATE shop_settings SET
    offline_instructions_he = 'העברה בנקאית: בנק 12', offline_instructions_en = 'Bank transfer: bank 12',
    pickup_instructions_he = '', pickup_instructions_en = ''`;
});

test('place a Hebrew shipping order and an English pickup order', async ({ page }) => {
  Object.assign(
    heOrder,
    await place(page, 'he', 'shipping', {
      name: 'דנה כהן',
      email: 'dana@example.com',
      city: 'חיפה',
      street: 'הרצל 5',
    }),
  );
  Object.assign(
    enOrder,
    await place(page, 'en', 'pickup', {
      name: 'Sam Customer',
      email: 'sam@example.com',
      city: '',
      street: '',
    }),
  );
  const mails = await readOutbox('order-confirmation');
  expect(mails.find((m) => m.to_address === 'dana@example.com')?.html).toContain(
    'למעקב אחרי ההזמנה',
  );
  expect(mails.find((m) => m.to_address === 'sam@example.com')?.html).toContain(
    'Follow your order',
  );
});

test('Hebrew shipping order: every status shows the right step, payment and notices', async ({
  page,
}) => {
  const labels = ['התקבלה', 'בהכנה', 'נשלחה', 'הושלמה'];
  await page.goto(heOrder.url ?? '');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.getByTestId('order-number')).toContainText(String(heOrder.number));
  await expect(page.getByTestId('order-line')).toHaveCount(1);
  await expect(page.getByTestId('order-prep-time')).toBeVisible();
  await expect(page.getByTestId('order-summary')).toBeVisible();

  // New, awaiting payment.
  await expectCurrent(page, labels, 0);
  await expect(page.getByTestId('order-payment-state')).toContainText('ממתין לתשלום');
  await expect(page.getByTestId('offline-instructions')).toBeVisible();
  await expect(page.getByText('קיבלתי את ההזמנה ואתחיל לעבוד עליה בקרוב.')).toBeVisible();

  // New, paid.
  await move(heOrder, { status: 'new', payment: 'paid' });
  await page.reload();
  await expectCurrent(page, labels, 0);
  await expect(page.getByTestId('order-payment-state')).toContainText('שולם');
  await expect(page.getByTestId('offline-instructions')).toHaveCount(0);
  await expect(page.getByText('עכשיו אני מתחילה לסרוג.')).toBeVisible();

  // In preparation, still awaiting payment: the "being made" text, not "after payment arrives".
  await move(heOrder, { status: 'in_preparation' });
  await page.reload();
  await expectCurrent(page, labels, 1);
  await expect(page.getByText('אני סורגת את ההזמנה שלכם עכשיו.')).toBeVisible();
  await expect(page.getByText('אתחיל לסרוג כשהתשלום יתקבל.')).toHaveCount(0);
  await expect(page.getByText('קיבלתי את ההזמנה ואתחיל לעבוד עליה בקרוב.')).toHaveCount(0);
  await expect(page.getByTestId('offline-instructions')).toBeVisible();

  // Shipped with a tracking number; the made Notice is hidden.
  await move(heOrder, { status: 'shipped', payment: 'paid', tracking: 'RR123456789IL' });
  await page.reload();
  await expectCurrent(page, labels, 2);
  await expect(page.getByTestId('order-tracking-number')).toHaveText('RR123456789IL');
  await expect(page.getByTestId('order-tracking-number')).toHaveAttribute('dir', 'ltr');
  await expectNoPersonalData(page, ['דנה כהן', 'dana@example.com', 'חיפה', 'הרצל']);
  await expect(page.getByText('עכשיו אני מתחילה לסרוג.')).toHaveCount(0);
  await expect(page.getByText('אני סורגת את ההזמנה שלכם עכשיו.')).toHaveCount(0);

  // Shipped without a number.
  await move(heOrder, { status: 'shipped', payment: 'paid' });
  await page.reload();
  await expect(page.getByText('המשלוח בדרך')).toBeVisible();
  await expect(page.getByTestId('order-tracking-number')).toHaveCount(0);

  // Completed and still unpaid: no payment instructions any more.
  await move(heOrder, { status: 'completed' });
  await page.reload();
  await expectCurrent(page, labels, 3);
  await expect(page.getByTestId('offline-instructions')).toHaveCount(0);
  await expect(page.getByTestId('order-payment-state')).toContainText('ממתין לתשלום');

  // Stepped back: the page shows the current status.
  await move(heOrder, { status: 'in_preparation', payment: 'paid' });
  await page.reload();
  await expectCurrent(page, labels, 1);
});

test('the made note follows the status and payment table for every case', async ({ page }) => {
  const cases: [
    string,
    'awaiting_payment' | 'paid' | 'refunded',
    keyof typeof MADE_TEXTS | null,
  ][] = [
    ['new', 'awaiting_payment', 'madeAwaiting'],
    ['new', 'paid', 'madePaid'],
    ['new', 'refunded', null],
    ['in_preparation', 'awaiting_payment', 'madeInPreparation'],
    ['in_preparation', 'paid', 'madeInPreparation'],
    ['in_preparation', 'refunded', null],
    ['shipped', 'awaiting_payment', null],
    ['shipped', 'paid', null],
    ['ready_for_pickup', 'awaiting_payment', null],
    ['ready_for_pickup', 'paid', null],
    ['completed', 'awaiting_payment', null],
    ['completed', 'paid', null],
    ['cancelled', 'awaiting_payment', null],
    ['cancelled', 'paid', null],
    ['cancelled', 'refunded', null],
  ];
  for (const [status, payment, expected] of cases) {
    await move(heOrder, { status, payment });
    await page.goto(heOrder.url ?? '');
    await expect(page.getByTestId('order-number')).toBeVisible();
    await expectMade(page, expected);
  }
});

test('Hebrew shipping order: cancelled, refunded, and the page never shows personal data', async ({
  page,
}) => {
  // Cancelled and still awaiting payment: no progress, no check circle, no payment chip.
  await move(heOrder, { status: 'cancelled' });
  await page.goto(heOrder.url ?? '');
  await expect(page.getByTestId('order-cancelled')).toContainText('ההזמנה בוטלה');
  await expect(page.getByTestId('order-progress')).toHaveCount(0);
  await expect(page.getByTestId('order-payment-state')).toHaveCount(0);
  await expect(page.getByTestId('offline-instructions')).toHaveCount(0);
  await expect(page.getByText('קיבלתי את ההזמנה ואתחיל לעבוד עליה בקרוב.')).toHaveCount(0);
  await expect(page.getByTestId('order-cancelled').locator(`a[href="tel:${PHONE}"]`)).toBeVisible();
  await expect(
    page.getByTestId('order-cancelled').locator(`a[href="mailto:${EMAIL}"]`),
  ).toBeVisible();
  await expect(page.getByTestId('order-cancelled').locator('a[href="/he/contact"]')).toBeVisible();
  await expect(page.getByTestId('order-cancelled')).not.toContainText('הכסף');

  // Cancelled while paid: the money will be returned.
  await move(heOrder, { status: 'cancelled', payment: 'paid' });
  await page.reload();
  await expect(page.getByTestId('order-cancelled')).toContainText('הכסף יוחזר אליכם');
  await expect(page.getByTestId('order-payment-state')).toContainText('שולם');

  // Refunded.
  await move(heOrder, { status: 'cancelled', payment: 'refunded' });
  await page.reload();
  await expect(page.getByTestId('order-cancelled')).toContainText('הכסף הוחזר');
  await expect(page.getByTestId('order-payment-state')).toContainText('הוחזר');

  // SC-007: no name, phone, email, city or street in the page.
  await expectNoPersonalData(page, ['דנה כהן', 'dana@example.com', 'חיפה', 'הרצל']);
});

test('English pickup order: pickup note, settings instructions or the contact fallback', async ({
  page,
}) => {
  const labels = ['Received', 'Being made', 'Ready for pickup', 'Completed'];
  await page.goto(enOrder.url ?? '');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Thank you! Your order is in',
  );
  await expectCurrent(page, labels, 0);
  await expect(page.getByText('I got your order and will start on it soon.')).toBeVisible();
  await expect(page.getByTestId('order-payment-state')).toContainText('Awaiting payment');
  await expect(page.getByTestId('offline-instructions')).toContainText('Bank transfer');

  // Ready for pickup with Aviva's note.
  await move(enOrder, { status: 'ready_for_pickup', note: 'Ring the bell\nSecond floor' });
  await page.reload();
  await expectCurrent(page, labels, 2);
  await expect(page.getByTestId('order-pickup-note')).toContainText('Ring the bell');
  await expect(page.getByTestId('order-pickup-note')).toContainText('Second floor');

  // No note: the settings' pickup instructions (Hebrew text on /en when no English exists).
  await sql`UPDATE shop_settings SET pickup_instructions_he = ${PICKUP_SETTINGS_TEXT}`;
  await move(enOrder, { status: 'ready_for_pickup' });
  await page.reload();
  await expect(page.getByTestId('order-pickup-note')).toContainText(PICKUP_SETTINGS_TEXT);
  await expect(page.getByTestId('order-pickup-note').locator('[lang="he"]')).toHaveCount(1);
  await sql`UPDATE shop_settings SET pickup_instructions_en = ${PICKUP_SETTINGS_TEXT_EN}`;
  await page.reload();
  await expect(page.getByTestId('order-pickup-note')).toContainText(PICKUP_SETTINGS_TEXT_EN);

  // Neither: write-to-me fallback with phone, email and the Contact link, inside the same Notice.
  await sql`UPDATE shop_settings SET pickup_instructions_he = '', pickup_instructions_en = ''`;
  await page.reload();
  const note = page.getByTestId('order-pickup-note');
  await expect(note).toContainText('Write to me to arrange pickup');
  await expect(note.locator(`a[href="tel:${PHONE}"]`)).toBeVisible();
  await expect(note.locator(`a[href="mailto:${EMAIL}"]`)).toBeVisible();
  await expect(note.locator('a[href="/en/contact"]')).toBeVisible();

  // Pickup orders that are New or In preparation keep the shop's pickup instructions.
  await sql`UPDATE shop_settings SET pickup_instructions_en = ${PICKUP_SETTINGS_TEXT_EN}`;
  await move(enOrder, { status: 'in_preparation', payment: 'paid' });
  await page.reload();
  await expectCurrent(page, labels, 1);
  await expect(page.getByTestId('pickup-instructions')).toContainText(PICKUP_SETTINGS_TEXT_EN);
  await expect(page.getByTestId('order-pickup-note')).toHaveCount(0);
  await move(enOrder, { status: 'completed', payment: 'paid' });
  await page.reload();
  await expect(page.getByTestId('pickup-instructions')).toHaveCount(0);
  await expectCurrent(page, labels, 3);

  // Cancelled and refunded in English.
  await move(enOrder, { status: 'cancelled', payment: 'refunded' });
  await page.reload();
  await expect(page.getByTestId('order-cancelled')).toContainText('This order was cancelled');
  await expect(page.getByTestId('order-cancelled')).toContainText('Your money was refunded');
  await expect(page.getByTestId('order-progress')).toHaveCount(0);

  await expectNoPersonalData(page, ['Sam Customer', 'sam@example.com']);
});

test('link lifetime: an expired closed order says so, an old open order still opens', async ({
  page,
}) => {
  await move(heOrder, { status: 'completed', payment: 'paid' });
  await sql`UPDATE orders SET public_token_expires_at = now() - interval '1 day' WHERE id = ${heOrder.id ?? ''}`;
  await page.goto(heOrder.url ?? '');
  await expect(page.getByText('הקישור כבר לא פעיל')).toBeVisible();
  await expect(page.getByText('אם צריך משהו בקשר להזמנה, כתבו לי ואענה.')).toBeVisible();
  await expect(page.getByText(/30 יום/)).toHaveCount(0);
  await expect(page.getByRole('main').locator('a[href="/he/contact"]')).toBeVisible();

  await move(heOrder, { status: 'in_preparation', payment: 'paid' });
  await sql`UPDATE orders SET created_at = now() - interval '40 days',
    public_token_expires_at = now() - interval '10 days' WHERE id = ${heOrder.id ?? ''}`;
  await page.goto(heOrder.url ?? '');
  await expect(page.getByTestId('order-progress')).toBeVisible();
  await expect(page.getByTestId('order-number')).toContainText(String(heOrder.number));
  // Older than an hour: the "your order" heading.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ההזמנה שלכם');
});

test('the page passes axe and has no horizontal scroll at phone width', async ({ page }) => {
  for (const [order, status] of [
    [heOrder, 'in_preparation'],
    [heOrder, 'cancelled'],
    [enOrder, 'ready_for_pickup'],
  ] as const) {
    await move(order, { status, payment: 'paid' });
    await page.goto(order.url ?? '');
    await expect(page.getByTestId('order-number')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 800 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    }
  }
});
