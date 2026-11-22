import type { Locator, Page } from '@playwright/test';
import { expect, resetDb, sql, test } from './fixtures';
import {
  boxOf,
  ensureCartDrawerWithLines,
  expectDrawerGeometry,
  hydrated,
  nothingLeftOpen,
  openCartDrawer,
  pageIsInert,
  reachableOutside,
  runningTransitionsOn,
  transitionsDone,
} from './shop-helpers';

// US2 cart scenarios (tasks.md T068) on the mobile projects, rewritten for the cart drawer
// (007 T093, FR-044, FR-046-FR-048, research D21; the cart page is gone). Test ids used:
//   product page   buy-price, option-chip, add-to-cart, add-to-cart-message, buy-row,
//                  added-to-cart-row, go-to-cart (a button that opens the drawer),
//                  quantity-increase/-decrease/-value, unavailable-notice, option-readonly
//   header         cart-link (opens the drawer), cart-badge
//   cart drawer    cart-drawer, cart-close, cart-line (data-flag), cart-line-name,
//                  cart-line-options, cart-line-unit, cart-line-total, cart-flag, cart-remove,
//                  cart-subtotal, cart-continue ("to checkout"), cart-keep-shopping, cart-errors,
//                  cart-empty
// Data: the three sample products of resetDb(): a soy candle (colour options: cream +0, pink +10,
// green +10), a clay mug without options, and a not orderable bowl.

test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-desktop', 'Cart flows run on the mobile projects');
});

const CANDLE = '/he/product/sample-soy-candle';
const MUG = '/he/product/sample-clay-mug';

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
  // FR-047: a successful add opens the cart drawer by itself.
  await expect(drawerOf(page)).toBeVisible();
}

/** Closes the open cart drawer with its X. */
async function closeCart(page: Page): Promise<void> {
  await page.getByTestId('cart-close').click();
  await expect(drawerOf(page)).toBeHidden();
}

/** Puts lines straight into localStorage (every test has its own browser context). */
async function setCart(
  page: Page,
  items: { slug: string; colour?: string; quantity: number }[],
  locale: 'he' | 'en' = 'he',
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
  await page.goto(`/${locale}/contact`);
  await page.evaluate((payload) => {
    localStorage.setItem(
      'ac_cart_v1',
      JSON.stringify({ v: 1, updatedAt: new Date().toISOString(), items: payload }),
    );
  }, lines);
  // The cart store reads the device once per page load: reload so the page (and the drawer) see it.
  await page.reload();
}

/** Opens the cart drawer (unless open) and waits for its lines; the drawer's own locator. */
async function openCart(page: Page): Promise<Locator> {
  return ensureCartDrawerWithLines(page);
}

const drawerOf = (page: Page): Locator => page.getByTestId('cart-drawer');

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

test('adding opens the cart drawer with the new line, focus on its close button', async ({
  page,
}) => {
  await addCandle(page, 'ורוד', 2);
  const drawer = drawerOf(page);
  await expect(drawer.getByTestId('cart-line')).toHaveCount(1, { timeout: 20_000 });
  await expect(drawer.getByTestId('cart-line-name')).toContainText('נר סויה');
  await expect(drawer.getByTestId('cart-line-options')).toContainText('ורוד');
  await expect(drawer.getByTestId('quantity-value')).toHaveText('2');
  await expect(page.getByTestId('cart-close')).toBeFocused();
  await expect(page.getByTestId('add-to-cart')).toContainText('נוסף לסל');
  await expect(page.getByTestId('cart-badge')).toHaveText('2');
  await expect(page.getByTestId('added-to-cart-row')).toContainText('נר סויה בעבודת יד');

  // "In your cart" is a button now (no cart page): it opens the drawer again, and closing the
  // drawer returns focus to it.
  await closeCart(page);
  const goToCart = page.getByTestId('go-to-cart');
  await expect(goToCart).toBeVisible();
  expect(await goToCart.evaluate((element) => element.tagName)).toBe('BUTTON');
  // After a moment the add button returns to its normal label; the row stays.
  await expect(page.getByTestId('add-to-cart')).toContainText('הוספה לסל', { timeout: 5000 });
  await goToCart.click();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId('cart-line')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(goToCart).toBeFocused();

  await openProduct(page, MUG);
  await page.getByTestId('add-to-cart').click();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId('cart-line')).toHaveCount(2, { timeout: 20_000 });
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

test('the cart drawer shows options, quantity and the running total, and survives reload and a new tab', async ({
  page,
}) => {
  await setCart(page, [
    { slug: 'sample-soy-candle', colour: 'ורוד', quantity: 2 },
    { slug: 'sample-clay-mug', quantity: 1 },
  ]);
  const drawer = await openCart(page);
  await expect(drawer.getByTestId('cart-line')).toHaveCount(2);
  await expect(drawer.getByRole('heading', { name: 'הסל שלי' })).toBeVisible();

  const candle = line(page, 'נר סויה');
  await expect(candle.getByTestId('cart-line-options')).toContainText('צבע');
  await expect(candle.getByTestId('cart-line-options')).toContainText('ורוד');
  await expect(candle.getByTestId('cart-line-unit')).toContainText('55.00');
  await expect(candle.getByTestId('quantity-value')).toHaveText('2');
  await expect(candle.getByTestId('cart-line-total')).toContainText('110.00');
  await expect(line(page, 'ספל חרס').getByTestId('cart-line-total')).toContainText('65.00');
  await expect(drawer.getByTestId('cart-subtotal')).toContainText('175.00');
  await expect(drawer.getByText('דמי משלוח יחושבו בקופה')).toBeVisible();
  // "To checkout" is a link to the checkout; "continue shopping" is a control that closes.
  await expect(drawer.getByTestId('cart-continue')).toHaveAttribute('href', '/he/checkout');
  await expect(drawer.getByTestId('cart-keep-shopping')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('cart-badge')).toHaveText('3');
  // The drawer is closed after a reload; open it again.
  await expect(drawerOf(page)).toBeHidden();
  await openCart(page);
  await expect(page.getByTestId('cart-line')).toHaveCount(2);

  const other = await page.context().newPage();
  await other.goto('/he/contact');
  await ensureCartDrawerWithLines(other);
  await expect(other.getByTestId('cart-line')).toHaveCount(2);
  await other.close();
});

test('changing the quantity and removing a line work in the drawer', async ({ page }) => {
  await setCart(page, [
    { slug: 'sample-soy-candle', colour: 'ורוד', quantity: 2 },
    { slug: 'sample-clay-mug', quantity: 1 },
  ]);
  const drawer = await openCart(page);
  const mug = line(page, 'ספל חרס');
  await mug.getByTestId('quantity-increase').click();
  await expect(mug.getByTestId('quantity-value')).toHaveText('2');
  await expect(mug.getByTestId('cart-line-total')).toContainText('130.00');
  await expect(drawer.getByTestId('cart-subtotal')).toContainText('240.00');
  await expect(page.getByTestId('cart-badge')).toHaveText('4');
  await page.reload();
  await openCart(page);
  await expect(line(page, 'ספל חרס').getByTestId('quantity-value')).toHaveText('2');

  await line(page, 'נר סויה').getByTestId('cart-remove').click();
  await expect(drawer.getByTestId('cart-line')).toHaveCount(1);
  await expect(drawer.getByTestId('cart-subtotal')).toContainText('130.00');
  await line(page, 'ספל חרס').getByTestId('cart-remove').click();
  // The empty state, inside the open drawer.
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId('cart-empty')).toBeVisible();
  await expect(drawer.getByText('הסל ריק')).toBeVisible();
  // FR-038 (amended by FR-046): the empty state's action leads to All pieces.
  await expect(drawer.getByTestId('cart-empty').getByRole('link')).toHaveAttribute(
    'href',
    '/he/shop',
  );
  expect(await page.evaluate(() => localStorage.getItem('ac_cart_v1'))).toBeNull();
  await expect(page.getByTestId('cart-badge')).toHaveCount(0);

  // Following that link goes to /he/shop and leaves no drawer or scroll lock behind.
  await drawer.getByTestId('cart-empty').getByRole('link').click();
  await expect(page).toHaveURL(/\/he\/shop$/);
  await nothingLeftOpen(page);
});

test('a hidden product is flagged and checkout is blocked until it is removed', async ({
  page,
}) => {
  await addCandle(page, 'ורוד', 1);
  await closeCart(page);
  await openProduct(page, MUG);
  await page.getByTestId('add-to-cart').click();
  await expect(drawerOf(page)).toBeVisible();
  await expect(page.getByTestId('cart-badge')).toHaveText('2');
  await page.keyboard.press('Escape');

  await sql`UPDATE product SET state = 'hidden' WHERE slug = 'sample-clay-mug'`;
  await page.reload();
  const drawer = await openCart(page);
  const mug = line(page, 'ספל חרס');
  await expect(mug).toHaveAttribute('data-flag', 'unavailable');
  await expect(mug.getByTestId('cart-flag')).toContainText('המוצר הזה כבר לא זמין להזמנה.');

  // "To checkout" is blocked: the drawer stays open, on the same page, and the summary has focus.
  const here = page.url();
  await drawer.getByTestId('cart-continue').click();
  await expect(drawer).toBeVisible();
  expect(page.url()).toBe(here);
  const summary = page.getByTestId('cart-errors').or(page.locator('#cart-errors'));
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(summary).toContainText('יש בסל פריטים שלא אפשר להזמין');
  await expect(summary).toContainText('ספל חרס');

  // The summary's links move focus to the line inside the drawer (they do not close it).
  await summary.getByRole('link', { name: /ספל חרס/ }).click();
  await expect(drawer).toBeVisible();
  expect(
    await page.evaluate(
      () => document.activeElement?.closest('[data-testid="cart-line"]') !== null,
    ),
    'focus is on the flagged line',
  ).toBe(true);

  await mug.getByTestId('cart-remove').click();
  await expect(drawer.getByTestId('cart-line')).toHaveCount(1);
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
  await openCart(page);
  await expect(line(page, 'נר סויה').getByTestId('cart-line-unit')).toContainText('60.00');
  await expect(line(page, 'נר סויה')).not.toHaveAttribute('data-flag', /.+/);

  // The same option value with a new adjustment (as upsertOptionGroup keeps ids).
  await sql`UPDATE option_value SET delta_ils_minor = 2000 WHERE label_he = 'ורוד'`;
  await page.reload();
  await openCart(page);
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
    '/he/product/sample-soy-candle',
  );
  // Following the link closes the drawer and leaves no lock behind.
  await candle.getByRole('link', { name: 'בחירה מחדש' }).click();
  await expect(page).toHaveURL(/\/he\/product\/sample-soy-candle$/);
  await expect(drawerOf(page)).toBeHidden();
  await nothingLeftOpen(page);
  await openCart(page);

  // Blocked "to checkout": the drawer stays open and the summary takes focus.
  await page.getByTestId('cart-continue').click();
  await expect(drawerOf(page)).toBeVisible();
  await expect(page).toHaveURL(/\/he\/product\/sample-soy-candle$/);
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

// ---------------------------------------------------------------- the drawer itself (T093)

test('the cart drawer: reading-end side from the header top, modal, named by its heading', async ({
  page,
}, testInfo) => {
  for (const [locale, side, heading] of [
    ['he', 'left', 'הסל שלי'],
    ['en', 'right', 'My cart'],
  ] as const) {
    await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }], locale);
    for (const scroll of [0, 300]) {
      const label = `${locale} at scroll ${String(scroll)}`;
      await page.goto(`/${locale}/product/sample-ceramic-bowl`);
      await hydrated(page, 'cart-link');
      await page.evaluate((y) => {
        window.scrollTo({ top: y, left: 0, behavior: 'instant' });
      }, scroll);
      expect(await page.evaluate(() => window.scrollY), `${label}: scrolled`).toBe(scroll);
      const cartButton = await boxOf(page.getByTestId('cart-link'));
      const drawer = await openCartDrawer(page);
      // Normal motion: right after the click the slide is still running (Chromium).
      if (
        testInfo.project.name === 'chromium-mobile' &&
        !(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))
      ) {
        expect(
          await runningTransitionsOn(page, '#cart-drawer'),
          `${label}: the slide transition runs`,
        ).toBeGreaterThan(0);
      }
      await expect(drawer.getByTestId('cart-line')).toHaveCount(1, { timeout: 20_000 });
      await expectDrawerGeometry(page, 'cart-drawer', side, label);
      expect(
        await reachableOutside(page, 'cart-drawer'),
        `${label}: nothing reachable outside`,
      ).toEqual([]);

      // A named modal dialog.
      await expect(drawer).toHaveAttribute('role', 'dialog');
      await expect(drawer).toHaveAttribute('aria-modal', 'true');
      await expect(page.getByRole('dialog', { name: heading })).toBeVisible();

      // The close X is at the cart button's place (within 1 px) and has focus.
      const close = page.getByTestId('cart-close');
      await expect(close).toBeFocused();
      const closeBox = await boxOf(close);
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(
          Math.abs(closeBox[key] - cartButton[key]),
          `${label}: close button ${key} = cart button ${key}`,
        ).toBeLessThanOrEqual(1);
      }

      // The page behind is inert and does not scroll.
      expect(await pageIsInert(page), `${label}: header, main, footer, strip inert`).toEqual([
        true,
        true,
        true,
        true,
      ]);
      // Mobile WebKit has no mouse wheel (see catalog.spec.ts); the overflow check below covers it.
      if (testInfo.project.name !== 'webkit-mobile') await page.mouse.wheel(0, 400);
      await transitionsDone(page);
      expect(await page.evaluate(() => window.scrollY), `${label}: no scroll while open`).toBe(
        scroll,
      );
      expect(
        await page.evaluate(() => getComputedStyle(document.documentElement).overflow),
        `${label}: scroll lock`,
      ).toBe('hidden');
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
      await nothingLeftOpen(page);
    }
  }
});

test('Esc, the X and a tap outside close the cart drawer and focus returns to the cart button', async ({
  page,
}) => {
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  for (const how of ['escape', 'close button', 'tap outside'] as const) {
    await page.goto('/he/product/sample-ceramic-bowl');
    const drawer = await openCartDrawer(page);
    await expect(page.getByTestId('cart-close')).toBeFocused();
    if (how === 'escape') await page.keyboard.press('Escape');
    else if (how === 'close button') await page.getByTestId('cart-close').click();
    else {
      // The cart drawer is at the left in Hebrew: tap the page strip at the right edge.
      const width = await page.evaluate(() => document.documentElement.clientWidth);
      await page.mouse.click(width - 10, 500);
    }
    await expect(drawer, how).toBeHidden();
    await expect(page.getByTestId('cart-link'), `${how}: focus returns`).toBeFocused();
    await nothingLeftOpen(page);
  }
});

test('"continue shopping" closes the drawer and returns focus; "to checkout" goes to checkout with nothing left open', async ({
  page,
}) => {
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  const drawer = await openCart(page);
  await drawer.getByTestId('cart-keep-shopping').click();
  await expect(drawer).toBeHidden();
  await expect(page).toHaveURL(/\/he\/contact$/);
  await expect(page.getByTestId('cart-link')).toBeFocused();
  await nothingLeftOpen(page);

  await openCart(page);
  await drawer.getByTestId('cart-continue').click();
  await page.waitForURL(/\/he\/checkout$/);
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  await expect(drawer).toBeHidden();
  await nothingLeftOpen(page);
});

test('"to checkout" in the drawer opened on the checkout page closes it (same pathname)', async ({
  page,
}) => {
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  await page.goto('/he/checkout');
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  const drawer = await openCart(page);
  await drawer.getByTestId('cart-continue').click();
  await expect(drawer).toBeHidden();
  await expect(page).toHaveURL(/\/he\/checkout$/);
  await nothingLeftOpen(page);
});

test('the empty cart drawer shows the empty state and its button goes to All pieces', async ({
  page,
}) => {
  await page.goto('/en/contact');
  await page.evaluate(() => {
    localStorage.clear();
  });
  const drawer = await openCartDrawer(page);
  await expect(drawer.getByTestId('cart-empty')).toBeVisible({ timeout: 20_000 });
  await expect(drawer.getByText('Your cart is empty')).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'My cart' })).toBeVisible();
  const action = drawer.getByTestId('cart-empty').getByRole('link');
  await expect(action).toHaveAttribute('href', '/en/shop');
  await action.click();
  await expect(page).toHaveURL(/\/en\/shop$/);
  await nothingLeftOpen(page);
});

test('removing the last piece on the checkout shows the empty state; the shop opens only after the drawer is closed', async ({
  page,
}) => {
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  await page.goto('/he/checkout');
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  const drawer = await openCart(page);
  await line(page, 'ספל חרס').getByTestId('cart-remove').click();
  await expect(drawer.getByTestId('cart-empty')).toBeVisible();
  // The drawer stays open on the checkout; the redirect waits.
  await page.waitForTimeout(1500);
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(/\/he\/checkout$/);
  await closeCart(page);
  await page.waitForURL(/\/he\/shop$/, { timeout: 20_000 });
  await nothingLeftOpen(page);
});

test('an empty cart on the checkout goes to All pieces, not to a cart page', async ({ page }) => {
  await page.goto('/he/contact');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/he/checkout');
  await page.waitForURL(/\/he\/shop$/, { timeout: 20_000 });
});

test('the payment return page cart button opens the cart drawer', async ({ page }) => {
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  await page.goto('/he/checkout/return?c=unknown');
  const expired = page.getByTestId('return-expired');
  await expect(expired).toBeVisible({ timeout: 20_000 });
  await hydrated(page, 'cart-link');
  await expired.getByTestId('return-cart').click();
  await expect(drawerOf(page)).toBeVisible();
  await expect(drawerOf(page).getByTestId('cart-line')).toHaveCount(1, { timeout: 20_000 });
  await expect(page).toHaveURL(/\/he\/checkout\/return/);
});

test('closing the drawer that "add to cart" opened returns focus to the add button', async ({
  page,
}) => {
  for (const how of ['escape', 'close button'] as const) {
    await openProduct(page, MUG);
    await page.getByTestId('add-to-cart').click();
    const drawer = drawerOf(page);
    await expect(drawer).toBeVisible();
    await expect(page.getByTestId('cart-close')).toBeFocused();
    if (how === 'escape') await page.keyboard.press('Escape');
    else await page.getByTestId('cart-close').click();
    await expect(drawer).toBeHidden();
    await expect(page.getByTestId('add-to-cart'), how).toBeFocused();
    await nothingLeftOpen(page);
  }
});

test('the checkout "back to cart" is a button that opens the cart drawer on the same page', async ({
  page,
}) => {
  await setCart(page, [
    { slug: 'sample-clay-mug', quantity: 1 },
    { slug: 'sample-soy-candle', colour: 'ורוד', quantity: 1 },
  ]);
  await sql`UPDATE product SET state = 'hidden' WHERE slug = 'sample-clay-mug'`;
  try {
    await page.goto('/he/checkout');
    await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
    // The flagged line shows the alert with its way back to the cart.
    const back = page.getByTestId('checkout-back-to-cart');
    await expect(back).toBeVisible({ timeout: 20_000 });
    expect(await back.evaluate((element) => element.tagName)).toBe('BUTTON');
    await hydrated(page, 'checkout-back-to-cart');
    await back.click();
    const drawer = drawerOf(page);
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId('cart-line')).toHaveCount(2, { timeout: 20_000 });
    await expect(line(page, 'ספל חרס')).toHaveAttribute('data-flag', 'unavailable');
    await expect(page).toHaveURL(/\/he\/checkout$/);
    // Closing returns focus to the button that opened it.
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(back).toBeFocused();
  } finally {
    await sql`UPDATE product SET state = 'published' WHERE slug = 'sample-clay-mug'`;
  }
});

test('reduced motion: the drawer opens and closes with the same end states', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setCart(page, [{ slug: 'sample-clay-mug', quantity: 1 }]);
  await page.goto('/he/product/sample-ceramic-bowl');
  const drawer = await openCartDrawer(page);
  // No slide: it is in place at once, nothing is running.
  expect(
    await page.evaluate(
      () => document.getAnimations().filter((a) => a instanceof CSSTransition).length,
    ),
    'no transition runs',
  ).toBe(0);
  await expectDrawerGeometry(page, 'cart-drawer', 'left', 'reduced motion');
  await expect(page.getByTestId('cart-close')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('cart-link')).toBeFocused();
  await nothingLeftOpen(page);
});

test('the cart page is gone: /he/cart and /en/cart answer 404', async ({ page }) => {
  for (const path of ['/he/cart', '/en/cart']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});
