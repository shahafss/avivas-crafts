import type { Page } from '@playwright/test';
import { expect, resetDb, sql, test } from './fixtures';

// US2 catalog, category, search and product-page metadata (tasks.md T070). The three sample
// products of resetDb(): soy candle (₪45, options +₪10 so the card says "from"), not orderable
// blue bowl (₪120, category "sample-ceramics"), clay mug (₪65, no English text).

test.describe.configure({ mode: 'serial' });

const CANDLE = 'נר סויה בעבודת יד';
const BOWL = 'קערת קרמיקה כחולה';
const MUG = 'ספל חרס';

async function cardNames(page: Page): Promise<string[]> {
  const names = await page
    .getByTestId('product-card')
    .evaluateAll((cards) => cards.map((card) => card.textContent.trim()));
  return names.map((text) => [CANDLE, BOWL, MUG].find((name) => text.includes(name)) ?? text);
}

test.beforeAll(async () => {
  await resetDb();
});

test('home lists every published product and sorts by newest, price ascending and descending', async ({
  page,
}) => {
  await page.goto('/he');
  await expect(page.getByTestId('product-card')).toHaveCount(3);
  // Newest first: the products were published in the order candle, bowl, mug.
  expect(await cardNames(page)).toEqual([MUG, BOWL, CANDLE]);
  await expect(page.getByRole('link', { name: 'החדשים ביותר' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByRole('link', { name: 'מחיר: מהנמוך' }).click();
  await expect(page).toHaveURL(/sort=price-asc/);
  expect(await cardNames(page)).toEqual([CANDLE, MUG, BOWL]);
  await expect(page.getByRole('link', { name: 'מחיר: מהנמוך' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('link', { name: 'החדשים ביותר' })).not.toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByRole('link', { name: 'מחיר: מהגבוה' }).click();
  await expect(page).toHaveURL(/sort=price-desc/);
  expect(await cardNames(page)).toEqual([BOWL, MUG, CANDLE]);
  await expect(page.getByRole('link', { name: 'מחיר: מהגבוה' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('cards show "from" for option prices and the not-available label', async ({ page }) => {
  await page.goto('/he');
  const candle = page.getByTestId('product-card').filter({ hasText: CANDLE });
  await expect(candle).toContainText('החל מ־');
  await expect(candle).toContainText('45.00');
  const mug = page.getByTestId('product-card').filter({ hasText: MUG });
  await expect(mug).not.toContainText('החל מ־');
  await expect(mug).toContainText('65.00');
  await expect(page.getByTestId('product-card').filter({ hasText: BOWL })).toContainText(
    'לא זמין להזמנה כרגע',
  );
});

test('a category page shows only its products, with the same sorts', async ({ page }) => {
  await page.goto('/he');
  // "All" is current on the catalog; the category chip leads to the category page.
  const chips = page.getByRole('navigation', { name: 'קטגוריות' });
  await expect(chips.getByRole('link', { name: 'הכול' })).toHaveAttribute('aria-current', 'page');
  await chips.getByRole('link', { name: 'קרמיקה' }).click();
  await expect(page).toHaveURL(/\/he\/c\/sample-ceramics$/);
  await expect(page.getByRole('heading', { level: 1, name: 'קרמיקה' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'קטגוריות' }).getByRole('link', { name: 'קרמיקה' }),
  ).toHaveAttribute('aria-current', 'page');

  await expect(page.getByTestId('product-card')).toHaveCount(2);
  expect(await cardNames(page)).toEqual([MUG, BOWL]);
  await expect(page.getByTestId('category-count')).toContainText('2');

  await page.getByRole('link', { name: 'מחיר: מהגבוה' }).click();
  await expect(page).toHaveURL(/\/he\/c\/sample-ceramics\?sort=price-desc/);
  expect(await cardNames(page)).toEqual([BOWL, MUG]);
  await page.getByRole('link', { name: 'מחיר: מהנמוך' }).click();
  await expect(page).toHaveURL(/\/he\/c\/sample-ceramics\?sort=price-asc/);
  expect(await cardNames(page)).toEqual([MUG, BOWL]);
  await expect(page.getByTestId('product-card').filter({ hasText: CANDLE })).toHaveCount(0);

  // The breadcrumb of a product page links to its category.
  await page.goto('/he/p/sample-clay-mug');
  await page
    .getByRole('navigation', { name: 'מיקום באתר' })
    .getByRole('link', { name: /.+/ })
    .nth(1)
    .click();
  await expect(page).toHaveURL(/\/he\/c\/sample-ceramics$/);
});

test('an unknown category is a 404', async ({ page }) => {
  const response = await page.goto('/he/c/does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'העמוד לא נמצא' })).toBeVisible();
});

test('search finds products by Hebrew and English name and description', async ({ page }) => {
  await page.goto('/he/search?q=נר');
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await expect(page.getByTestId('product-card')).toContainText(CANDLE);
  await expect(page.getByTestId('search-results-line')).toContainText('יצירה אחת');

  await page.goto('/he/search?q=bowl');
  await expect(page.getByTestId('product-card')).toContainText(BOWL);
  await page.goto('/he/search?q=GLAZE');
  await expect(page.getByTestId('product-card')).toContainText(BOWL);
  await page.goto('/he/search?q=זיגוג');
  await expect(page.getByTestId('product-card')).toContainText(BOWL);
  await page.goto('/he/search?q=ידית');
  await expect(page.getByTestId('product-card')).toContainText(MUG);

  await page.goto('/en/search?q=candle');
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await expect(page.getByTestId('search-results-line')).toContainText('1 piece');
});

test('search ignores draft and hidden products and treats % and _ literally', async ({ page }) => {
  await sql`UPDATE product SET state = 'hidden' WHERE slug = 'sample-clay-mug'`;
  await sql`UPDATE product SET state = 'draft' WHERE slug = 'sample-ceramic-bowl'`;
  try {
    await page.goto('/he/search?q=ספל');
    await expect(page.getByTestId('product-card')).toHaveCount(0);
    await expect(page.getByText('לא מצאתי יצירות')).toBeVisible();
    await page.goto('/he/search?q=bowl');
    await expect(page.getByTestId('product-card')).toHaveCount(0);
  } finally {
    await sql`UPDATE product SET state = 'published' WHERE slug IN ('sample-clay-mug', 'sample-ceramic-bowl')`;
  }
  for (const wildcard of ['%', '_', '\\']) {
    await page.goto(`/he/search?q=${encodeURIComponent(wildcard)}`);
    await expect(page.getByTestId('product-card')).toHaveCount(0);
  }
});

test('search without a query shows the form and category chips; a long query shows the field error', async ({
  page,
}) => {
  await page.goto('/he/search');
  await expect(page.getByTestId('search-input')).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'קטגוריות' })).toBeVisible();
  await expect(page.getByTestId('product-card')).toHaveCount(0);

  await page.goto(`/he/search?q=${'א'.repeat(81)}`);
  await expect(page.getByText('אפשר לחפש עד 80 תווים')).toBeVisible();
  await expect(page.getByTestId('search-input')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('product-card')).toHaveCount(0);
  await page.goto(`/he/search?q=${'א'.repeat(80)}`);
  await expect(page.getByText('אפשר לחפש עד 80 תווים')).toHaveCount(0);
});

test('the product page head carries Open Graph and price tags', async ({ page, baseURL }) => {
  await page.goto('/he/p/sample-clay-mug');
  const meta = async (name: string): Promise<string | null> =>
    page.locator(`meta[property="${name}"], meta[name="${name}"]`).first().getAttribute('content');
  expect(await meta('og:title')).toBe(MUG);
  const image = await meta('og:image');
  expect(image).toMatch(/-800\.webp$/);
  expect(image?.startsWith(baseURL ?? 'http')).toBe(true);
  const price = new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
  }).format(65);
  expect((await meta('og:description'))?.startsWith(price)).toBe(true);
  expect(await meta('product:price:amount')).toBe('65.00');
  expect(await meta('product:price:currency')).toBe('ILS');

  // A product whose options change the price leads its description with "from".
  await page.goto('/he/p/sample-soy-candle');
  expect(await meta('og:description')).toMatch(/^החל מ־/);
  expect(await meta('product:price:amount')).toBe('45.00');
});

test('an empty catalog and an empty category show friendly messages', async ({ page }) => {
  await resetDb({ samples: false });
  await sql`
    INSERT INTO category (id, slug, name_he, sort_order)
    VALUES (gen_random_uuid(), 'empty-one', 'קטגוריה ריקה',
            (SELECT coalesce(max(sort_order), -1) + 1 FROM category))`;
  await page.goto('/he');
  await expect(page.getByText('עוד אין כאן יצירות')).toBeVisible();
  await expect(page.getByTestId('product-card')).toHaveCount(0);

  await page.goto('/he/c/empty-one');
  await expect(page.getByText('בקטגוריה הזאת עוד אין יצירות')).toBeVisible();
  await expect(page.getByRole('link', { name: 'לכל היצירות' })).toBeVisible();
  await resetDb();
});
