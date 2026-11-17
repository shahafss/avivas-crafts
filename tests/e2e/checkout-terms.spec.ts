import type { Page } from '@playwright/test';
import { expect, resetDb, sql, test } from './fixtures';

// 003 FR-028 / SC-009 (tasks.md T010; research R15): the Terms checkbox on the checkout.
// Ticking it (by the API or by a tap at its centre) never opens the Terms; the link opens them in
// a new tab and leaves the box alone; the label text toggles the box. All storefront projects.

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await resetDb();
});

/** Scrolls an element to the middle of the screen at once (the page scrolls smoothly otherwise). */
async function centre(page: Page, selector: string): Promise<void> {
  await page.locator(selector).evaluate((element) => {
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
}

async function openCheckout(page: Page, locale: 'he' | 'en'): Promise<void> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM product WHERE slug = 'sample-clay-mug'`;
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
  await page.goto(`/${locale}/checkout`);
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
}

for (const locale of ['he', 'en'] as const) {
  test.describe(`checkout in ${locale}`, () => {
    test('check() leaves the box ticked and opens no page', async ({ page, context }) => {
      await openCheckout(page, locale);
      let opened = 0;
      context.on('page', () => {
        opened += 1;
      });
      const box = page.getByTestId('accept-terms');
      await box.check();
      await expect(box).toBeChecked();
      await page.waitForTimeout(500);
      expect(opened).toBe(0);
    });

    test('a tap at the centre of the box toggles it', async ({ page }) => {
      await openCheckout(page, locale);
      const box = page.getByTestId('accept-terms');
      await centre(page, '[data-testid="accept-terms"]');
      const area = await box.boundingBox();
      if (area === null) throw new Error('the checkbox has no box');
      const x = area.x + area.width / 2;
      const y = area.y + area.height / 2;
      await page.mouse.click(x, y);
      await expect(box).toBeChecked();
      await page.mouse.click(x, y);
      await expect(box).not.toBeChecked();
    });

    test('the link opens the Terms in a new tab and the box stays as it was', async ({
      page,
      context,
    }) => {
      await openCheckout(page, locale);
      const box = page.getByTestId('accept-terms');
      const link = page.locator('label[for="checkout-acceptTerms"] a');
      const [terms] = await Promise.all([context.waitForEvent('page'), link.click()]);
      await terms.waitForLoadState('domcontentloaded');
      expect(new URL(terms.url()).pathname).toMatch(/\/pages\/terms$/);
      await terms.close();
      await expect(box).not.toBeChecked();
      await box.check();
      const [again] = await Promise.all([context.waitForEvent('page'), link.click()]);
      await again.close();
      await expect(box).toBeChecked();
    });

    test('clicking the label text outside the link toggles the box', async ({ page }) => {
      await openCheckout(page, locale);
      const box = page.getByTestId('accept-terms');
      const label = page.locator('label[for="checkout-acceptTerms"]');
      // The sentence starts with plain words (not the link): click 4 px inside its start edge,
      // on the first line, then again to untick.
      await centre(page, 'label[for="checkout-acceptTerms"]');
      const sentence = await label.locator('span.text-base').boundingBox();
      if (sentence === null) throw new Error('the label text has no box');
      const x = locale === 'he' ? sentence.x + sentence.width - 4 : sentence.x + 4;
      const y = sentence.y + 8;
      await page.mouse.click(x, y);
      await expect(box).toBeChecked();
      await page.mouse.click(x, y);
      await expect(box).not.toBeChecked();
    });
  });
}
