import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import exifr from 'exifr';
import sharp from 'sharp';
import type { Page } from '@playwright/test';
import { expect, resetDb, signInAsAdmin, sql, test } from './fixtures';

// US1 acceptance scenarios 1-9 on the mobile project (tasks.md T047). The admin and storefront
// screens are built by T054-T062, so this spec drives them through the test ids below; the
// screens must expose exactly these (and the Hebrew texts quoted here):
//
//   /admin/products            product-new                       "מוצר חדש" button (creates a draft, opens the editor)
//   /admin/products/[id]       field-nameHe, field-nameEn, field-descriptionHe, field-priceIls,
//                              field-priceUsd, field-categories (fieldset of checkboxes, label = category name),
//                              field-prepTimeHe                 form fields
//                              photo-input                      the file input (multiple). PhotoManager detects HEIC by
//                                                               file.type AND the .heic/.heif extension (Android browsers
//                                                               sometimes send an empty or generic MIME type), to pick
//                                                               admin.images.errors.too_many_pixels_heic

//                              photo-item                       one per photo, in order; data-image-id,
//                                                               contains an <img>; the main photo has data-main="true"
//                              photo-main / photo-up / photo-down / photo-remove   buttons inside a photo-item
//                              save-product (saves the form without changing the state; NOT "move to draft"),
//                              publish, hide, unhide, set-draft (moves to draft)   PublishBar buttons
//                              orderable-toggle                 checkbox "לא זמין להזמנה כרגע"
//                              delete-product                   delete button (opens the ConfirmDialog)
//                              confirm-dialog-confirm           the dialog's confirm button
//                              publish-errors                   the list of missing fields (Hebrew labels)
//                              option-group-add, option-group-name, option-value-add, option-value-label,
//                              option-value-delta, option-swatch-<name>, option-group-save
//   /he/shop, /he/p/[slug]    product-card (link; contains an <img>, the name, the price, the
//                              "לא זמין להזמנה כרגע" label), option-chip (radio chips; .swatch-<name> dot),
//                              buy-price (live price), unavailable-notice
//                              (007: a new piece is on "All pieces" at /he/shop; the home page's row only
//                              shows the pieces of the home-row category)

const here = dirname(fileURLToPath(import.meta.url));
const heicSample = readFileSync(resolve(here, '../fixtures/images/sample.heic'));

test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'US1 flows run on the mobile project');
});

const NAME = 'בובת בד אדומה';
const NAME_EN_SLUG_SOURCE = 'Red Doll';
const NOT_AVAILABLE = 'המוצר הזה כבר לא זמין';

let productId = '';
let slug = '';

async function jpegWithGps(red: number): Promise<Buffer> {
  return sharp({
    create: { width: 1200, height: 900, channels: 3, background: { r: red, g: 90, b: 60 } },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: 'SecretCam', Model: 'Model X' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '32/1 4/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '34/1 46/1 0/1',
      },
    })
    .toBuffer();
}

async function plainPng(green: number): Promise<Buffer> {
  return sharp({
    create: { width: 900, height: 900, channels: 3, background: { r: 40, g: green, b: 160 } },
  })
    .png()
    .toBuffer();
}

/** First column of the first row (postgres.js rows are untyped). */
async function scalar<T>(rows: Promise<Record<string, unknown>[]>): Promise<T | undefined> {
  const first = (await rows)[0];
  return first === undefined ? undefined : (Object.values(first)[0] as T);
}

async function openEditor(page: Page): Promise<void> {
  await page.goto(`/admin/products/${productId}`);
  await expect(page.getByTestId('field-nameHe')).toBeVisible();
}

async function storefrontStatus(page: Page, path: string): Promise<number> {
  const response = await page.goto(path);
  return response?.status() ?? 0;
}

async function mainKeyFromDb(): Promise<string> {
  const [row] = await sql<{ storage_key: string }[]>`
    SELECT storage_key FROM product_image
    WHERE product_id = ${productId} AND deleted_at IS NULL AND position = 0`;
  return row?.storage_key ?? '';
}

test.beforeAll(async () => {
  await resetDb();
});

test('1. create a product with three photos, category and prep time, publish it, and see it on /he', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto('/admin/products');
  await page.getByTestId('product-new').click();
  await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}/);
  productId = /\/admin\/products\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
  expect(productId).not.toBe('');

  await page.getByTestId('field-nameHe').fill(NAME);
  await page.getByTestId('field-descriptionHe').fill('בובה סרוגה בעבודת יד, עם שיער מצמר.');
  await page.getByTestId('field-priceIls').fill('180');
  await page.getByTestId('field-categories').getByLabel('נרות', { exact: true }).check();
  await page.getByTestId('field-prepTimeHe').fill('כשבועיים');
  await page.getByTestId('save-product').click();

  // Scenario 9 input: a phone photo with GPS, plus the HEIC fixture (HEIC in the built app).
  await page.getByTestId('photo-input').setInputFiles([
    { name: 'phone.jpg', mimeType: 'image/jpeg', buffer: await jpegWithGps(210) },
    { name: 'sample.heic', mimeType: 'image/heic', buffer: heicSample },
    { name: 'third.png', mimeType: 'image/png', buffer: await plainPng(120) },
  ]);
  await expect(page.getByTestId('photo-item')).toHaveCount(3, { timeout: 45_000 });

  await page.getByTestId('publish').click();
  await expect(page.getByTestId('publish-errors')).toHaveCount(0);
  await expect
    .poll(async () => await scalar<string>(sql`SELECT state FROM product WHERE id = ${productId}`))
    .toBe('published');
  slug =
    (await sql<{ slug: string }[]>`SELECT slug FROM product WHERE id = ${productId}`)[0]?.slug ??
    '';

  await page.goto('/he/shop');
  const card = page.getByTestId('product-card').filter({ hasText: NAME });
  await expect(card).toBeVisible();
  await expect(card).toContainText('180');
  await expect(card.locator('img')).toHaveAttribute(
    'src',
    new RegExp(`/dev-images/${await mainKeyFromDb()}`),
  );
  await expect(card.locator('img')).toBeVisible();
});

test('9. the public images carry no EXIF or GPS, and a draft image is not on the public origin', async ({
  page,
}) => {
  const rows = await sql<{ storage_key: string }[]>`
    SELECT storage_key FROM product_image WHERE product_id = ${productId} ORDER BY position`;
  expect(rows).toHaveLength(3);
  for (const { storage_key: key } of rows) {
    for (const width of [400, 800, 1600]) {
      const response = await page.request.get(`/dev-images/${key}-${String(width)}.webp`);
      expect(response.status()).toBe(200);
      const body = await response.body();
      const tags = (await exifr.parse(body, true).catch(() => undefined)) as
        Record<string, unknown> | undefined;
      expect(tags?.latitude).toBeUndefined();
      expect(tags?.Make).toBeUndefined();
      expect((await sharp(body).metadata()).exif).toBeUndefined();
    }
  }

  // A draft product's photos exist only in the private bucket.
  await signInAsAdmin(page);
  await page.goto('/admin/products');
  await page.getByTestId('product-new').click();
  await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}/);
  const draftId = /\/admin\/products\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
  await page.getByTestId('field-nameHe').fill('טיוטה בלי פרסום');
  await page.getByTestId('save-product').click();
  await page
    .getByTestId('photo-input')
    .setInputFiles([{ name: 'draft.png', mimeType: 'image/png', buffer: await plainPng(200) }]);
  await expect(page.getByTestId('photo-item')).toHaveCount(1, { timeout: 30_000 });
  const [draftImage] = await sql<{ storage_key: string }[]>`
    SELECT storage_key FROM product_image WHERE product_id = ${draftId}`;
  const draftSlug =
    (await sql<{ slug: string }[]>`SELECT slug FROM product WHERE id = ${draftId}`)[0]?.slug ?? '';
  expect(
    (await page.request.get(`/dev-images/${draftImage?.storage_key ?? ''}-800.webp`)).status(),
  ).toBe(404);
  expect(await storefrontStatus(page, `/he/p/${draftSlug}`)).toBe(404);

  // Publishing without a photo names the photo field.
  await page.goto(`/admin/products/${draftId}`);
  await page.getByTestId('photo-remove').first().click();
  await page.getByTestId('confirm-dialog-confirm').click();
  await expect(page.getByTestId('photo-item')).toHaveCount(0);
  await page.getByTestId('publish').click();
  await expect(page.getByTestId('publish-errors')).toContainText('תמונה');
});

test('2. editing the price shows the new price on the product page', async ({ page }) => {
  await signInAsAdmin(page);
  await openEditor(page);
  await page.getByTestId('field-priceIls').fill('195');
  await page.getByTestId('save-product').click();
  await expect
    .poll(
      async () =>
        await scalar<string>(sql`SELECT price_ils_minor FROM product WHERE id = ${productId}`),
    )
    .toBe('19500');
  await page.goto(`/he/p/${slug}`);
  await expect(page.getByTestId('buy-price')).toContainText('195');
});

test('3. hiding removes it from /he and its URL answers "not available" with status 404', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await openEditor(page);
  await page.getByTestId('hide').click();
  await expect
    .poll(async () => await scalar<string>(sql`SELECT state FROM product WHERE id = ${productId}`))
    .toBe('hidden');

  await page.goto('/he/shop');
  await expect(page.getByTestId('product-card').filter({ hasText: NAME })).toHaveCount(0);
  expect(await storefrontStatus(page, `/he/p/${slug}`)).toBe(404);
  await expect(page.getByText(NOT_AVAILABLE)).toBeVisible();
  const key = await mainKeyFromDb();
  expect((await page.request.get(`/dev-images/${key}-800.webp`)).status()).toBe(404);

  await openEditor(page);
  await page.getByTestId('unhide').click();
  await expect
    .poll(async () => await scalar<string>(sql`SELECT state FROM product WHERE id = ${productId}`))
    .toBe('published');
});

test('6. an option group with a swatch: the selector shows and the price follows the chosen value', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await openEditor(page);
  await page.getByTestId('option-group-add').click();
  await page.getByTestId('option-group-name').fill('צבע שיער');
  await page.getByTestId('option-value-add').click();
  await page.getByTestId('option-value-label').nth(0).fill('חום');
  await page.getByTestId('option-swatch-brown').first().click();
  await page.getByTestId('option-value-add').click();
  await page.getByTestId('option-value-label').nth(1).fill('בלונד');
  await page.getByTestId('option-value-delta').nth(1).fill('20');
  await page.getByTestId('option-group-save').click();
  await expect
    .poll(
      async () =>
        await scalar<number>(sql`
          SELECT count(*)::int AS n FROM option_value
          WHERE group_id IN (SELECT id FROM option_group WHERE product_id = ${productId})`),
    )
    .toBe(2);

  await page.goto(`/he/p/${slug}`);
  const chips = page.getByTestId('option-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.filter({ hasText: 'חום' }).locator('.swatch-brown')).toHaveCount(1);
  await chips.filter({ hasText: 'בלונד' }).click();
  await expect(page.getByTestId('buy-price')).toContainText('215'); // 195 + 20
  await chips.filter({ hasText: 'חום' }).click();
  await expect(page.getByTestId('buy-price')).toContainText('195');
});

test('reordering photos and choosing another main photo changes the catalog card', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await openEditor(page);
  const before = await mainKeyFromDb();
  const items = page.getByTestId('photo-item');
  await expect(items).toHaveCount(3);
  await items.nth(1).getByTestId('photo-main').click();
  await expect.poll(mainKeyFromDb).not.toBe(before);
  const after = await mainKeyFromDb();
  await expect(items.first()).toHaveAttribute('data-main', 'true');

  // Moving the last photo up swaps it with the middle one, in the page and in the database.
  const idsOnPage = await items.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-image-id') ?? ''),
  );
  const [first, second, third] = idsOnPage;
  await items.nth(2).getByTestId('photo-up').click();
  await expect
    .poll(async () =>
      (
        await sql<{ id: string }[]>`
          SELECT id FROM product_image
          WHERE product_id = ${productId} AND deleted_at IS NULL ORDER BY position`
      ).map((row) => row.id),
    )
    .toEqual([first, third, second]);
  await expect(items.nth(1)).toHaveAttribute('data-image-id', third ?? '');
  await expect(items.nth(2)).toHaveAttribute('data-image-id', second ?? '');

  await page.goto('/he/shop');
  await expect(
    page.getByTestId('product-card').filter({ hasText: NAME }).locator('img'),
  ).toHaveAttribute('src', new RegExp(`/dev-images/${after}`));
});

test('4. not orderable: still visible with the label, options read-only, no add-to-cart', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await openEditor(page);
  await page.getByTestId('orderable-toggle').check();
  await page.getByTestId('save-product').click();
  await expect
    .poll(
      async () => await scalar<boolean>(sql`SELECT orderable FROM product WHERE id = ${productId}`),
    )
    .toBe(false);

  await page.goto('/he/shop');
  const card = page.getByTestId('product-card').filter({ hasText: NAME });
  await expect(card).toContainText('לא זמין להזמנה כרגע');

  await page.goto(`/he/p/${slug}`);
  await expect(page.getByTestId('unavailable-notice')).toBeVisible();
  await expect(page.getByTestId('option-chip')).toHaveCount(0);
  await expect(page.getByText('צבע שיער')).toBeVisible();
  await expect(page.getByText('חום')).toBeVisible();
  await expect(page.getByText('בלונד')).toBeVisible();
  await expect(page.getByRole('button', { name: /הוספה לסל/ })).toHaveCount(0);

  await openEditor(page);
  await page.getByTestId('orderable-toggle').uncheck();
  await page.getByTestId('save-product').click();
  await expect
    .poll(
      async () => await scalar<boolean>(sql`SELECT orderable FROM product WHERE id = ${productId}`),
    )
    .toBe(true);
});

test('8. the English view with empty English fields shows the Hebrew texts', async ({ page }) => {
  await page.goto('/en/shop');
  const card = page.getByTestId('product-card').filter({ hasText: NAME });
  await expect(card).toBeVisible();
  await page.goto(`/en/p/${slug}`);
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toContainText(NAME);
  await expect(heading).toHaveAttribute('lang', 'he');
  const description = page.getByText('בובה סרוגה בעבודת יד');
  await expect(description).toBeVisible();
  await expect(description).toHaveAttribute('lang', 'he');
});

test('English name gives the slug on a new product (no Hebrew transliteration)', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto('/admin/products');
  await page.getByTestId('product-new').click();
  await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}/);
  const id = /\/admin\/products\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
  await page.getByTestId('field-nameHe').fill('בובה אדומה');
  await page.getByTestId('field-nameEn').fill(NAME_EN_SLUG_SOURCE);
  await page.getByTestId('save-product').click();
  await expect
    .poll(
      async () =>
        (await sql<{ slug: string }[]>`SELECT slug FROM product WHERE id = ${id}`)[0]?.slug,
    )
    .toBe('red-doll');
});

test('5. delete asks for confirmation, then the product is gone from the catalog', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await openEditor(page);
  await page.getByTestId('delete-product').click();
  // Dismissing the dialog keeps the product.
  await page.keyboard.press('Escape');
  expect((await sql`SELECT id FROM product WHERE id = ${productId}`).length).toBe(1);

  await page.getByTestId('delete-product').click();
  await page.getByTestId('confirm-dialog-confirm').click();
  await expect
    .poll(async () => (await sql`SELECT id FROM product WHERE id = ${productId}`).length)
    .toBe(0);

  await page.goto('/he/shop');
  await expect(page.getByTestId('product-card').filter({ hasText: NAME })).toHaveCount(0);
  expect(await storefrontStatus(page, `/he/p/${slug}`)).toBe(404);
  expect((await sql`SELECT id FROM product_image WHERE product_id = ${productId}`).length).toBe(0);
});

test('7. an admin page without a session redirects to sign-in and shows no data', async ({
  page,
}) => {
  await page.goto('/admin/products');
  await expect(page).toHaveURL(/\/admin\/sign-in/);
  await expect(page.getByText(NAME)).toHaveCount(0);
});

test('categories: a piece can be in several, the home row follows "מומלצות", publishing needs one', async ({
  page,
}) => {
  const PIECE = 'ספל חרס';
  const [mug] = await sql<
    { id: string }[]
  >`SELECT id FROM product WHERE slug = 'sample-clay-mug' AND state = 'published'`;
  expect(mug, 'the published sample piece').toBeDefined();
  const mugId = mug?.id ?? '';
  const categoryCount = async (): Promise<number> =>
    Number(
      await scalar<string>(sql`SELECT count(*) FROM product_category WHERE product_id = ${mugId}`),
    );
  const boxes = () => page.getByTestId('field-categories');
  const open = async (): Promise<void> => {
    await page.goto(`/admin/products/${mugId}`);
    await expect(page.getByTestId('field-nameHe')).toBeVisible();
  };
  const save = async (expected: number): Promise<void> => {
    await page.getByTestId('save-product').click();
    await expect.poll(categoryCount).toBe(expected);
  };

  try {
    await signInAsAdmin(page);
    await open();
    // Its own category and "מומלצות" are ticked; the other one is not.
    await expect(boxes().getByLabel('קרמיקה', { exact: true })).toBeChecked();
    await expect(boxes().getByLabel('מומלצות', { exact: true })).toBeChecked();
    await expect(boxes().getByLabel('נרות', { exact: true })).not.toBeChecked();

    // The piece is in the home row while "מומלצות" is ticked.
    await page.goto('/he');
    await expect(page.getByTestId('home-row-track')).toContainText(PIECE);

    // Untick "מומלצות": gone from the home row (the row itself stays), still on its category page.
    await open();
    await boxes().getByLabel('מומלצות', { exact: true }).uncheck();
    await save(1);
    await page.goto('/he');
    await expect(page.getByTestId('home-row-track')).toBeVisible();
    await expect(page.getByTestId('home-row-track')).not.toContainText(PIECE);
    await page.goto('/he/c/sample-ceramics');
    await expect(page.getByTestId('product-card').filter({ hasText: PIECE })).toHaveCount(1);

    // Tick a second category: it shows on both category pages.
    await open();
    await boxes().getByLabel('נרות', { exact: true }).check();
    await save(2);
    for (const category of ['sample-ceramics', 'sample-candles']) {
      await page.goto(`/he/c/${category}`);
      await expect(page.getByTestId('product-card').filter({ hasText: PIECE })).toHaveCount(1);
    }

    // Untick everything and try to publish a draft: the missing-category message.
    await open();
    await page.getByTestId('set-draft').click();
    await expect
      .poll(async () => await scalar<string>(sql`SELECT state FROM product WHERE id = ${mugId}`))
      .toBe('draft');
    await open();
    await boxes().getByLabel('קרמיקה', { exact: true }).uncheck();
    await boxes().getByLabel('נרות', { exact: true }).uncheck();
    await save(0);
    await page.getByTestId('publish').click();
    await expect(page.getByTestId('publish-errors')).toContainText('קטגוריה');
  } finally {
    // Restore the sample data (this is the last test of the file).
    await resetDb();
  }
});
