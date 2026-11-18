import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, resetDb, signInAsAdmin, sql, test, waitForFormAge } from './fixtures';

// 003 US4 (tasks.md T029; storefront.md §12.5, §12.6, §12.3 block 8a): Aviva edits the shop's
// pages. Phone project only. About is edited with the toolbar and shown on both public pages;
// Terms gets a second version; an order placed afterwards links to the version it recorded.
// Tests run in order on shared state.

test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Admin screens run on the phone project');
});

const DRAFT_BADGE = 'טיוטה שסופקה עם האתר';
const EDITED_BADGE = 'נערך';
const TERMS_ADDITION = 'סעיף שנוסף בגרסה השנייה';

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== 'chromium-mobile') return;
  await resetDb();
});

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function openEditor(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/content/${slug}`);
  await expect(page.getByTestId('content-save')).toBeVisible({ timeout: 20_000 });
}

/** Puts the caret at the end of a textarea (the End-of-document key differs per platform). */
async function caretToEnd(area: Locator): Promise<void> {
  await area.evaluate((element) => {
    if (element instanceof HTMLTextAreaElement) {
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    }
  });
}

async function save(page: Page): Promise<void> {
  await page.getByTestId('content-save').click();
  await expect(page.getByText('הדף נשמר')).toBeVisible();
}

test('the list shows the seven pages as supplied drafts, and axe is clean', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/content');
  await expect(page.getByRole('heading', { level: 1, name: 'דפי תוכן' })).toBeVisible();
  await expect(page.getByTestId('content-card')).toHaveCount(7);
  await expect(page.getByText(DRAFT_BADGE, { exact: true })).toHaveCount(7);
  await expect(page.getByTestId('content-versions-terms')).toBeVisible();
  await expect(page.getByTestId('content-versions-privacy')).toBeVisible();
  await expect(page.getByTestId('content-versions-about')).toHaveCount(0);
  await expectNoViolations(page);
});

test('About: toolbar, preview, save, both public pages, and the list badge', async ({ page }) => {
  await signInAsAdmin(page);
  await openEditor(page, 'about');

  // Hebrew: bold on a selection, then a list item on a new line.
  const bodyHe = page.getByTestId('content-body-he');
  await bodyHe.fill('שלום עולם');
  await bodyHe.selectText();
  await page.getByTestId('content-tool-he-bold').click();
  await expect(bodyHe).toHaveValue('**שלום עולם**');
  await expect(bodyHe).toBeFocused();
  await caretToEnd(bodyHe);
  await page.keyboard.type('\n\nפריט ברשימה');
  await page.getByTestId('content-tool-he-list').click();
  await expect(bodyHe).toHaveValue('**שלום עולם**\n\n- פריט ברשימה');

  // English, through the second tab.
  await page.getByTestId('content-tab-en').click();
  await expect(page.getByTestId('content-tab-en')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('content-title-en').fill('About Aviva');
  const bodyEn = page.getByTestId('content-body-en');
  await bodyEn.fill('Hello there');
  await bodyEn.selectText();
  await page.getByTestId('content-tool-en-bold').click();
  await expect(bodyEn).toHaveValue('**Hello there**');
  await caretToEnd(bodyEn);
  await page.keyboard.type('\n\nOne item');
  await page.getByTestId('content-tool-en-list').click();

  // Preview of the English tab, then of the Hebrew one.
  await page.getByTestId('content-preview-toggle').click();
  const preview = page.getByTestId('content-preview');
  await expect(preview.locator('strong')).toHaveText('Hello there');
  await expect(preview.locator('ul > li')).toHaveText('One item');
  await expectNoViolations(page);
  await page.getByTestId('content-tab-he').click();
  await expect(preview.locator('strong')).toHaveText('שלום עולם');
  await expect(preview.locator('ul > li')).toHaveText('פריט ברשימה');

  await save(page);

  await page.goto('/he/pages/about');
  await expect(page.getByRole('main')).toContainText('שלום עולם');
  await expect(page.getByRole('main')).toContainText('פריט ברשימה');
  await page.goto('/en/pages/about');
  await expect(page.getByRole('heading', { level: 1, name: 'About Aviva' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Hello there');

  await page.goto('/admin/content');
  await expect(page.getByTestId('content-badge-about')).toHaveText(EDITED_BADGE);
  await expect(page.getByText(DRAFT_BADGE, { exact: true })).toHaveCount(6);
});

test('a stale editor is refused with a reload button', async ({ page }) => {
  await signInAsAdmin(page);
  await openEditor(page, 'accessibility');
  await sql`UPDATE content_page SET version = version + 1 WHERE slug = 'accessibility'`;
  await page.getByTestId('content-tab-he').click();
  await page.getByTestId('content-body-he').fill('נוסח אחר לגמרי');
  await page.getByTestId('content-save').click();
  await expect(page.getByTestId('content-stale')).toBeVisible();
  await expect(page.getByTestId('content-stale')).toContainText('הדף השתנה');
  await expect(page.getByTestId('content-reload')).toBeVisible();
  await sql`UPDATE content_page SET version = version - 1 WHERE slug = 'accessibility'`;
});

test('an empty Hebrew title and body show field errors', async ({ page }) => {
  await signInAsAdmin(page);
  await openEditor(page, 'cookies');
  await page.getByTestId('content-title-he').fill('');
  await page.getByTestId('content-body-he').fill('');
  await page.getByTestId('content-save').click();
  await expect(page.getByText('צריך לכתוב כותרת').first()).toBeVisible();
  await expect(page.getByText('צריך לכתוב את תוכן הדף').first()).toBeVisible();
  await expect(page.getByTestId('content-error-summary')).toBeVisible();
  await expectNoViolations(page);
});

test('the tabs follow the keyboard: Home, End and the arrows', async ({ page }) => {
  await signInAsAdmin(page);
  await openEditor(page, 'cookies');
  const he = page.getByTestId('content-tab-he');
  const en = page.getByTestId('content-tab-en');
  await he.focus();
  await page.keyboard.press('End');
  await expect(en).toHaveAttribute('aria-selected', 'true');
  await expect(en).toBeFocused();
  await page.keyboard.press('End');
  await expect(en).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(he).toHaveAttribute('aria-selected', 'true');
  await expect(he).toBeFocused();
  await page.keyboard.press('Home');
  await expect(he).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(en).toHaveAttribute('aria-selected', 'true');
});

test('an error in each language: the summary names the language and its link opens the tab', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await openEditor(page, 'cookies');
  await page.getByTestId('content-title-he').fill('');
  await page.getByTestId('content-tab-en').click();
  await page.getByTestId('content-title-en').fill('x'.repeat(121));
  await page.getByTestId('content-save').click();
  const summary = page.getByTestId('content-error-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('עברית: צריך לכתוב כותרת');
  await expect(summary).toContainText('English: הכותרת ארוכה מדי');
  // The failed save shows the first language with an error; the link to the other one opens it.
  await expect(page.getByTestId('content-tab-he')).toHaveAttribute('aria-selected', 'true');
  await summary.getByRole('link', { name: /^English:/ }).click();
  await expect(page.getByTestId('content-tab-en')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('content-title-en')).toBeFocused();
  await summary.getByRole('link', { name: /^עברית:/ }).click();
  await expect(page.getByTestId('content-title-he')).toBeFocused();
});

test('Terms: a second version is listed, the first still shows the draft text', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await openEditor(page, 'terms');
  const bodyHe = page.getByTestId('content-body-he');
  await caretToEnd(bodyHe);
  await page.keyboard.type(`\n\n${TERMS_ADDITION}`);
  await save(page);

  await page.goto('/admin/content/terms/versions');
  await expect(page.getByTestId('content-version-link')).toHaveCount(2);
  await expectNoViolations(page);
  await page.locator('[data-testid="content-version-link"][data-version="1"]').click();
  await expect(page.getByTestId('content-version-meta')).toContainText('גרסה 1, בתוקף מ-');
  await expect(page.getByTestId('content-version-body')).toContainText('טיוטה — נדרשת בדיקה');
  await expect(page.getByTestId('content-version-body')).not.toContainText(TERMS_ADDITION);
  await expectNoViolations(page);

  // Pages without a history, and unknown versions, are an admin 404.
  const noHistory = await page.goto('/admin/content/about/versions');
  expect(noHistory?.status()).toBe(404);
  const unknown = await page.goto('/admin/content/terms/versions/99');
  expect(unknown?.status()).toBe(404);
  const unknownSlug = await page.goto('/admin/content/nope');
  expect(unknownSlug?.status()).toBe(404);
});

test('an order placed now links to the Terms and Privacy versions it recorded', async ({
  page,
  browser,
}, testInfo) => {
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL) });
  const shop = await context.newPage();
  const [row] = await sql<{ id: string }[]>`SELECT id FROM product WHERE slug = 'sample-clay-mug'`;
  await shop.goto('/he/contact');
  await shop.evaluate(
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
  await shop.goto('/he/checkout');
  await expect(shop.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  await shop.getByTestId('field-fullName').fill('דנה כהן');
  await shop.getByTestId('field-phone').fill('052-234-5678');
  await shop.getByTestId('field-email').fill('content-dana@example.com');
  await shop.getByTestId('delivery-shipping').check();
  await shop.getByTestId('field-city').fill('חיפה');
  await shop.getByTestId('field-line1').fill('הרצל 5');
  await shop.getByTestId('payment-offline').check();
  await shop.getByTestId('accept-terms').check();
  await waitForFormAge(shop);
  await shop.getByTestId('place-order').click();
  await shop.waitForURL(/\/he\/order\//, { timeout: 30_000 });
  const orderNumber = Number(
    (await shop.getByTestId('order-number').textContent())?.replace(/\D/g, '') ?? '0',
  );
  await context.close();
  const [order] = await sql<
    { id: string; terms_version: number; privacy_version: number }[]
  >`SELECT id, terms_version, privacy_version FROM orders WHERE order_number = ${orderNumber}`;
  if (!order) throw new Error('order not found');
  expect(order.terms_version).toBe(2);

  await signInAsAdmin(page);
  await page.goto(`/admin/orders/${order.id}`);
  await page.getByTestId('order-terms-link').click();
  await expect(page).toHaveURL(/\/admin\/content\/terms\/versions\/2$/);
  await expect(page.getByTestId('content-version-body')).toContainText(TERMS_ADDITION);

  await page.goto(`/admin/orders/${order.id}`);
  await page.getByTestId('order-privacy-link').click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/content/privacy/versions/${String(order.privacy_version)}$`),
  );
  await expect(page.getByTestId('content-version-meta')).toContainText(
    `גרסה ${String(order.privacy_version)}, בתוקף מ-`,
  );
});
