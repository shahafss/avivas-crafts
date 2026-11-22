import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, resetDb, signInAsAdmin, sql, test } from './fixtures';

// 003 US5 (tasks.md T035b; storefront.md §12.8): Aviva sees how many people visited and which
// products they looked at. Phone project only. Tests run in order on shared state.

test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Admin screens run on the phone project');
});

const SLUG = 'sample-clay-mug';

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

/** Every text of the chart lies inside its viewBox (RTL pages must not push labels out of it). */
async function expectLabelsInside(page: Page): Promise<void> {
  const boxes = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="stats-chart"]') as SVGSVGElement;
    const view = svg.viewBox.baseVal;
    return [...svg.querySelectorAll('text')].map((text) => {
      const box = text.getBBox();
      return {
        text: text.textContent,
        inside:
          box.x >= view.x - 0.5 &&
          box.y >= view.y - 0.5 &&
          box.x + box.width <= view.x + view.width + 0.5 &&
          box.y + box.height <= view.y + view.height + 0.5,
      };
    });
  });
  expect(boxes).toHaveLength(3);
  for (const box of boxes) expect(box, `label "${box.text}"`).toMatchObject({ inside: true });
}

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== 'chromium-mobile') return;
  await resetDb();
});

test('with no visits yet the screen says there is no data, and axe is clean', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/stats');
  await expect(page.getByRole('heading', { level: 1, name: 'סטטיסטיקה' })).toBeVisible();
  await expect(page.getByText('עוד אין נתונים')).toBeVisible();
  await expect(page.getByTestId('stats-chart')).toHaveCount(0);
  await expectNoViolations(page);
});

test('after a storefront visit the page shows a visit today, the product, and the table toggle', async ({
  page,
  browser,
  baseURL,
}) => {
  const [row] = await sql<{ name_he: string }[]>`SELECT name_he FROM product WHERE slug = ${SLUG}`;
  const productName = row?.name_he ?? '';
  expect(productName).not.toBe('');

  const visitor = await browser.newContext({ baseURL: String(baseURL) });
  const shop = await visitor.newPage();
  await shop.goto(`/he/product/${SLUG}`);
  await expect
    .poll(
      async () => {
        const rows = await sql<{ n: number }[]>`
          SELECT coalesce(sum(visits), 0)::int AS n FROM analytics_daily_referrer`;
        return rows[0]?.n;
      },
      { timeout: 15_000 },
    )
    .toBe(1);
  await visitor.close();

  await signInAsAdmin(page);
  await page.goto('/admin/stats');
  await expect(page.getByTestId('stats-chart')).toBeVisible();
  await expect(page.getByTestId('stats-chart')).toHaveAttribute('role', 'img');
  await expect(page.getByTestId('stats-chart')).toHaveAttribute(
    'aria-label',
    'ביקורים ביום ב-30 הימים האחרונים: ביקור אחד בסך הכול, היום ביקור אחד.',
  );
  await expectLabelsInside(page);
  await expect(page.getByTestId('stats-top-products')).toContainText('צפייה אחת');
  await expect(page.getByTestId('stats-top-referrers')).toContainText('ביקור אחד');

  // The table behind "הצגה כטבלה" agrees with the chart: one visit today, 30 days listed.
  const toggle = page.getByText('הצגה כטבלה');
  await expect(toggle).toBeVisible();
  await toggle.click();
  const rows = page.getByTestId('stats-table').locator('tbody tr');
  await expect(rows).toHaveCount(30);
  // Newest day first; the numbers add up to the single visit.
  await expect(rows.first().locator('td').last()).toHaveText('1');
  const counts = await page
    .getByTestId('stats-table')
    .locator('tbody td:last-child')
    .allTextContents();
  expect(counts.reduce((sum, text) => sum + Number(text), 0)).toBe(1);

  const products = page.getByTestId('stats-top-products');
  await expect(products).toContainText('המוצרים הנצפים ביותר');
  await expect(products).toContainText(productName);
  const referrers = page.getByTestId('stats-top-referrers');
  await expect(referrers).toContainText('מאיפה הגיעו');
  await expect(referrers).toContainText('כניסה ישירה');
  await expect(referrers).not.toContainText('(direct)');
  await expectNoViolations(page);
});

test('the period chips change the range; an invalid period means 30 days', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/stats');
  const chips = page.getByRole('navigation', { name: 'תקופה' });
  await expect(chips.locator('[aria-current="page"]')).toHaveText('30 ימים');
  await chips.getByText('7 ימים').click();
  await page.waitForURL('**/admin/stats?days=7');
  await expect(chips.locator('[aria-current="page"]')).toHaveText('7 ימים');
  await page.getByText('הצגה כטבלה').click();
  await expect(page.getByTestId('stats-table').locator('tbody tr')).toHaveCount(7);
  await page.goto('/admin/stats?days=5');
  await expect(chips.locator('[aria-current="page"]')).toHaveText('30 ימים');
  await page.goto('/admin/stats?days=90');
  await expect(chips.locator('[aria-current="page"]')).toHaveText('90 ימים');
});
