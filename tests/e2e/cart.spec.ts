import type { Page } from '@playwright/test';
import { expect, resetDb, sql, test } from './fixtures';

// US2 cart scenarios (tasks.md T068) on the mobile projects. Test ids used:
//   product page   buy-price, option-chip, add-to-cart, add-to-cart-message, buy-row,
//                  added-to-cart-row, go-to-cart, quantity-increase/-decrease/-value,
//                  unavailable-notice, option-readonly
//   header         cart-link, cart-badge
//   /he/cart       cart-line (data-flag), cart-line-name, cart-line-options, cart-line-unit,
//                  cart-line-total, cart-flag, cart-remove, cart-subtotal, cart-continue,
//                  cart-errors, cart-empty
// Data: the three sample products of resetDb(): a soy candle (colour options: cream +0, pink +10,
// green +10), a clay mug without options, and a not orderable bowl.

test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-desktop', 'Cart flows run on the mobile projects');
});

const CANDLE = '/he/p/sample-soy-candle';
const MUG = '/he/p/sample-clay-mug';

/** Waits until React has attached its handlers to the element (a click before that is lost). */
async function hydrated(page: Page, testId: string): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      return element !== null && Object.keys(element).some((key) => key.startsWith('__reactProps'));
    },
    testId,
    { timeout: 20_000 },
  );
}

async function openProduct(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await hydrated(page, 'add-to-cart');
}

async function addCandle(page: Page, colour: string, quantity: number): Promise<void> {
  await openProduct(page, CANDLE);
  await page.getByTestId('option-chip').filter({ hasText: colour }).click();
  for (let index = 1; index < quantity; index += 1) {
    await page.getByTestId('quantity-increase').click();
  }
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('added-to-cart-row')).toBeVisible();
}

/** Puts lines straight into localStorage (every test has its own browser context). */
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

async function openCart(page: Page): Promise<void> {
  await page.goto('/he/cart');
  await expect(page.getByTestId('cart-line').first()).toBeVisible({ timeout: 20_000 });
  await hydrated(page, 'cart-continue');
}

const line = (page: Page, name: string) => page.getByTestId('cart-line').filter({ hasText: name });

test.beforeAll(async () => {
  await resetDb();
});

test('a product with options cannot be added before choosing', async ({ page }) => {
  await openProduct(page, CANDLE);
  await page.getByTestId('add-to-cart').click();

  await expect(page.getByTestId('add-to-cart-message')).toHaveText('יש לבחור צבע לפני ההוספה לסל');
  await expect(page.locator('fieldset[aria-invalid="true"]')).toHaveCount(1);
  await expect(page.locator('fieldset input[type="radio"]').first()).toBeFocused();
  await expect(page.getByTestId('cart-badge')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('ac_cart_v1'))).toBeNull();

  // Choosing clears the message and the marking.
  await page.getByTestId('option-chip').filter({ hasText: 'ורוד' }).click();
  await expect(page.getByTestId('add-to-cart-message')).toHaveText('');
  await expect(page.locator('fieldset[aria-invalid="true"]')).toHaveCount(0);
});

test('adding updates the badge and shows the go-to-cart row', async ({ page }) => {
  await addCandle(page, 'ורוד', 2);
  await expect(page.getByTestId('add-to-cart')).toContainText('נוסף לסל');
  await expect(page.getByTestId('cart-badge')).toHaveText('2');
  await expect(page.getByTestId('added-to-cart-row')).toContainText('נר סויה בעבודת יד');
  await expect(page.getByTestId('go-to-cart')).toBeVisible();
  // After a moment the button returns to its normal label; the row stays.
  await expect(page.getByTestId('add-to-cart')).toContainText('הוספה לסל', { timeout: 5000 });
  await expect(page.getByTestId('added-to-cart-row')).toBeVisible();

  await openProduct(page, MUG);
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-badge')).toHaveText('3');
});

test('the quantity stepper stays focusable at its limits and announces them', async ({ page }) => {
  await openProduct(page, MUG);
  // At the limits the buttons are marked aria-disabled (not disabled): they stay focusable.
  const decrease = page.getByTestId('quantity-decrease');
  const increase = page.getByTestId('quantity-increase');
  await decrease.click({ force: true });
  await expect(page.getByTestId('quantity-value')).toHaveText('1');
  await expect(page.getByRole('status').filter({ hasText: 'פחות מיחידה אחת' })).toBeVisible();
  for (let index = 0; index < 19; index += 1) await increase.click();
  await expect(page.getByTestId('quantity-value')).toHaveText('20');
  await increase.click({ force: true });
  await expect(page.getByTestId('quantity-value')).toHaveText('20');
  await expect(page.getByRole('status').filter({ hasText: 'עד 20 יחידות' })).toBeVisible();
  await expect(increase).toHaveAttribute('aria-disabled', 'true');
  await expect(increase).not.toHaveAttribute('disabled', /.*/);
  await increase.focus();
  await expect(increase).toBeFocused();
});

test('the cart shows options, quantity and the running total, and survives reload and a new tab', async ({
  page,
}) => {
  await setCart(page, [
    { slug: 'sample-soy-candle', colour: 'ורוד', quantity: 2 },
    { slug: 'sample-clay-mug', quantity: 1 },
  ]);
  await openCart(page);
  await expect(page.getByTestId('cart-line')).toHaveCount(2);

  const candle = line(page, 'נר סויה');
  await expect(candle.getByTestId('cart-line-options')).toContainText('צבע');
  await expect(candle.getByTestId('cart-line-options')).toContainText('ורוד');
  await expect(candle.getByTestId('cart-line-unit')).toContainText('55.00');
  await expect(candle.getByTestId('quantity-value')).toHaveText('2');
  await expect(candle.getByTestId('cart-line-total')).toContainText('110.00');
  await expect(line(page, 'ספל חרס').getByTestId('cart-line-total')).toContainText('65.00');
  await expect(page.getByTestId('cart-subtotal')).toContainText('175.00');
  await expect(page.getByTestId('cart-subtotal')).toBeVisible();
  await expect(page.getByText('דמי משלוח יחושבו בקופה')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('cart-line')).toHaveCount(2);
  await expect(page.getByTestId('cart-badge')).toHaveText('3');

  const other = await page.context().newPage();
  await other.goto('/he/cart');
  await expect(other.getByTestId('cart-line')).toHaveCount(2, { timeout: 20_000 });
  await other.close();
});

test('changing the quantity and removing a line work', async ({ page }) => {
  await setCart(page, [
    { slug: 'sample-soy-candle', colour: 'ורוד', quantity: 2 },
    { slug: 'sample-clay-mug', quantity: 1 },
  ]);
  await openCart(page);
  const mug = line(page, 'ספל חרס');
  await mug.getByTestId('quantity-increase').click();
  await expect(mug.getByTestId('quantity-value')).toHaveText('2');
  await expect(mug.getByTestId('cart-line-total')).toContainText('130.00');
  await expect(page.getByTestId('cart-subtotal')).toContainText('240.00');
  await expect(page.getByTestId('cart-badge')).toHaveText('4');
  await page.reload();
  await expect(line(page, 'ספל חרס').getByTestId('quantity-value')).toHaveText('2');

  await line(page, 'נר סויה').getByTestId('cart-remove').click();
  await expect(page.getByTestId('cart-line')).toHaveCount(1);
  await expect(page.getByTestId('cart-subtotal')).toContainText('130.00');
  await line(page, 'ספל חרס').getByTestId('cart-remove').click();
  await expect(page.getByTestId('cart-empty')).toBeVisible();
  await expect(page.getByText('הסל ריק')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ac_cart_v1'))).toBeNull();
  await expect(page.getByTestId('cart-badge')).toHaveCount(0);
});

test('a hidden product is flagged and checkout is blocked until it is removed', async ({
  page,
}) => {
  await addCandle(page, 'ורוד', 1);
  await openProduct(page, MUG);
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-badge')).toHaveText('2');

  await sql`UPDATE product SET state = 'hidden' WHERE slug = 'sample-clay-mug'`;
  await openCart(page);
  const mug = line(page, 'ספל חרס');
  await expect(mug).toHaveAttribute('data-flag', 'unavailable');
  await expect(mug.getByTestId('cart-flag')).toContainText('המוצר הזה כבר לא זמין להזמנה.');

  await page.getByTestId('cart-continue').click();
  await expect(page).toHaveURL(/\/he\/cart$/);
  const summary = page.getByTestId('cart-errors').or(page.locator('#cart-errors'));
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(summary).toContainText('יש בסל פריטים שלא אפשר להזמין');
  await expect(summary).toContainText('ספל חרס');

  await mug.getByTestId('cart-remove').click();
  await expect(page.getByTestId('cart-line')).toHaveCount(1);
  await expect(page.locator('#cart-errors')).toHaveCount(0);
  await sql`UPDATE product SET state = 'published' WHERE slug = 'sample-clay-mug'`;
});

test('a changed price or option price shows the new price with no flag', async ({ page }) => {
  await setCart(page, [{ slug: 'sample-soy-candle', colour: 'ורוד', quantity: 1 }]);
  await openCart(page);
  const candle = line(page, 'נר סויה');
  await expect(candle.getByTestId('cart-line-unit')).toContainText('55.00');

  await sql`UPDATE product SET price_ils_minor = 5000 WHERE slug = 'sample-soy-candle'`;
  await page.reload();
  await expect(line(page, 'נר סויה').getByTestId('cart-line-unit')).toContainText('60.00');
  await expect(line(page, 'נר סויה')).not.toHaveAttribute('data-flag', /.+/);

  // The same option value with a new adjustment (as upsertOptionGroup keeps ids).
  await sql`UPDATE option_value SET delta_ils_minor = 2000 WHERE label_he = 'ורוד'`;
  await page.reload();
  await expect(line(page, 'נר סויה').getByTestId('cart-line-unit')).toContainText('70.00');
  await expect(line(page, 'נר סויה')).not.toHaveAttribute('data-flag', /.+/);
});

test('a removed option value flags the line "choose again"', async ({ page }) => {
  await setCart(page, [{ slug: 'sample-soy-candle', colour: 'ורוד', quantity: 1 }]);
  await sql`DELETE FROM option_value WHERE label_he = 'ורוד'`;
  await openCart(page);
  const candle = line(page, 'נר סויה');
  await expect(candle).toHaveAttribute('data-flag', 'choose_options_again');
  await expect(candle.getByTestId('cart-flag')).toContainText('האפשרות שבחרתם כבר לא קיימת.');
  await expect(candle.getByRole('link', { name: 'בחירה מחדש' })).toHaveAttribute(
    'href',
    '/he/p/sample-soy-candle',
  );
  await page.getByTestId('cart-continue').click();
  await expect(page).toHaveURL(/\/he\/cart$/);
  await expect(page.locator('#cart-errors')).toBeFocused();
  await candle.getByTestId('cart-remove').click();
  await expect(page.getByTestId('cart-empty')).toBeVisible();
});

test('the free-shipping line shows only while the subtotal is below the threshold', async ({
  page,
}) => {
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  await openCart(page);
  await expect(page.getByText('משלוח חינם מעל')).toBeVisible();
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 5 }]);
  await openCart(page);
  await expect(page.getByTestId('cart-subtotal')).toContainText('325.00');
  await expect(page.getByText('משלוח חינם מעל')).toHaveCount(0);
});

test('a deleted product shows a placeholder name on its line and in the error summary', async ({
  page,
}) => {
  await setCart(page, [
    { slug: 'sample-clay-mug', quantity: 1 },
    { slug: 'sample-soy-candle', colour: 'ירוק', quantity: 1 },
  ]);
  await sql`DELETE FROM product WHERE slug = 'sample-clay-mug'`;
  await openCart(page);
  const gone = page.getByTestId('cart-line').filter({ hasText: 'פריט שכבר לא זמין' });
  await expect(gone).toHaveAttribute('data-flag', 'unavailable');
  await expect(gone.getByTestId('cart-line-name')).toHaveText('פריט שכבר לא זמין');
  await page.getByTestId('cart-continue').click();
  await expect(page.locator('#cart-errors')).toContainText('פריט שכבר לא זמין');
  await gone.getByTestId('cart-remove').click();
  await expect(page.getByTestId('cart-line')).toHaveCount(1);
});

test('a product that is not available to order shows its options read-only and no add button', async ({
  page,
}) => {
  await resetDb();
  await sql`UPDATE product SET orderable = false WHERE slug = 'sample-soy-candle'`;
  await page.goto(CANDLE);
  await expect(page.getByTestId('unavailable-notice')).toContainText('לא זמין להזמנה כרגע');
  await expect(page.getByTestId('option-readonly')).toContainText('צבע');
  await expect(page.getByTestId('option-readonly')).toContainText('ורוד');
  await expect(page.getByTestId('add-to-cart')).toHaveCount(0);
  await expect(page.getByTestId('option-chip')).toHaveCount(0);
});
