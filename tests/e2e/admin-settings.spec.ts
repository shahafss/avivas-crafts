import { expect, resetDb, signInAsAdmin, sql, test } from './fixtures';

// The admin settings screen (tasks.md T086), on the mobile project. It drives the screen through
// these test ids: settings-shop-name-he, settings-online-payment, settings-offline-payment,
// settings-offline-instructions-he, settings-pickup-he, settings-notification-1..3,
// settings-businessNameHe, one `settings-zone` card per zone (data-zone) with zone-enabled,
// zone-shipping, zone-pickup, zone-fee, zone-threshold, usd-blockers, and one form per section
// (settings-shop, settings-payment, settings-pickup, settings-business, settings-notifications).

test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Admin screens run on the mobile project');
});

test.beforeAll(async () => {
  await resetDb();
});

async function openSettings(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/admin/settings');
  await expect(page.getByTestId('settings-ready')).toBeVisible({ timeout: 20_000 });
}

test('a signed-out visitor is sent to sign-in', async ({ page }) => {
  await page.goto('/admin/settings');
  await expect(page).toHaveURL(/\/admin\/sign-in/);
});

test('saving the shop name, instructions and notification emails is stored and logged', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await openSettings(page);

  await page.getByTestId('settings-shop-name-he').fill('הסריגים של דנה');
  await page.getByTestId('settings-shop').getByRole('button', { name: 'שמירה' }).click();
  await expect
    .poll(
      async () =>
        (await sql<{ shop_name_he: string }[]>`SELECT shop_name_he FROM shop_settings`)[0]
          ?.shop_name_he,
    )
    .toBe('הסריגים של דנה');

  await page.getByTestId('settings-offline-instructions-he').fill('העברה לחשבון 12-345-678901');
  await page.getByTestId('settings-pickup-he').fill('איסוף מהבית בתיאום מראש');
  await page.getByTestId('settings-payment').getByRole('button', { name: 'שמירה' }).click();
  await expect
    .poll(
      async () =>
        (await sql<{ v: string }[]>`SELECT offline_instructions_he AS v FROM shop_settings`)[0]?.v,
    )
    .toBe('העברה לחשבון 12-345-678901');
  await page.getByTestId('settings-pickup').getByRole('button', { name: 'שמירה' }).click();
  await expect
    .poll(
      async () =>
        (await sql<{ v: string }[]>`SELECT pickup_instructions_he AS v FROM shop_settings`)[0]?.v,
    )
    .toBe('איסוף מהבית בתיאום מראש');

  await page.getByTestId('settings-notification-1').fill('owner@example.com');
  await page.getByTestId('settings-notification-2').fill('not-an-email');
  await page.getByTestId('settings-notifications').getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByTestId('settings-notifications')).toContainText('כתובת האימייל לא תקינה');
  await page.getByTestId('settings-notification-2').fill('second@example.com');
  await page.getByTestId('settings-notifications').getByRole('button', { name: 'שמירה' }).click();
  await expect
    .poll(
      async () =>
        (await sql<{ v: string[] }[]>`SELECT notification_emails AS v FROM shop_settings`)[0]?.v,
    )
    .toEqual(['owner@example.com', 'second@example.com']);

  const actions = await sql<{ action: string }[]>`SELECT action FROM admin_activity`;
  expect(actions.filter((row) => row.action === 'settings.updated').length).toBeGreaterThanOrEqual(
    4,
  );
});

test('the last payment method cannot be switched off', async ({ page }) => {
  await signInAsAdmin(page);
  await openSettings(page);
  await page.getByTestId('settings-online-payment').uncheck();
  await page.getByTestId('settings-payment').getByRole('button', { name: 'שמירה' }).click();
  await expect
    .poll(
      async () =>
        (
          await sql<
            { online: boolean }[]
          >`SELECT online_payment_enabled AS online FROM shop_settings`
        )[0]?.online,
    )
    .toBe(false);

  await page.getByTestId('settings-offline-payment').uncheck();
  await page.getByTestId('settings-payment').getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByTestId('settings-payment').getByRole('alert')).toContainText(
    'לפחות אופן תשלום אחד',
  );
  const [row] = await sql<{ online: boolean; offline: boolean }[]>`
    SELECT online_payment_enabled AS online, offline_payment_enabled AS offline FROM shop_settings`;
  expect(row?.online || row?.offline).toBe(true);
});

test('Israel keeps a delivery method, and a USD zone is blocked until products have USD prices', async ({
  page,
}) => {
  await resetDb();
  await sql`
    WITH zone AS (
      INSERT INTO shipping_zone (code, name_he, currency, shipping_enabled, shipping_fee_minor)
      VALUES ('WORLD', 'שאר העולם', 'USD', true, 2500) RETURNING id)
    INSERT INTO shipping_zone_country (zone_id, country_code) SELECT id, 'US' FROM zone`;
  await signInAsAdmin(page);
  await openSettings(page);

  const israel = page.locator('[data-zone="IL"]');
  await israel.getByTestId('zone-shipping').uncheck();
  await israel.getByTestId('zone-pickup').uncheck();
  await israel.getByRole('button', { name: 'שמירה' }).click();
  await expect(israel.getByRole('alert')).toContainText('לפחות שיטת משלוח אחת');

  const world = page.locator('[data-zone="WORLD"]');
  await expect(world.getByTestId('usd-blockers')).toBeVisible();
  await world.getByTestId('zone-enabled').check();
  await world.getByRole('button', { name: 'שמירה' }).click();
  await expect(world.getByRole('alert')).toContainText('אי אפשר להפעיל את האזור');
  await expect(world.getByTestId('usd-blockers').getByRole('link').first()).toHaveAttribute(
    'href',
    /\/admin\/products\//,
  );
  const [zone] = await sql<
    { enabled: boolean }[]
  >`SELECT enabled FROM shipping_zone WHERE code = 'WORLD'`;
  expect(zone?.enabled).toBe(false);

  // Once every published product has a USD price the zone can be switched on.
  await sql`UPDATE product SET price_usd_minor = 3000 WHERE state = 'published'`;
  await sql`UPDATE option_value SET delta_usd_minor = delta_ils_minor / 3 WHERE delta_usd_minor IS NULL AND delta_ils_minor <> 0`;
  await openSettings(page);
  await page.locator('[data-zone="WORLD"]').getByTestId('zone-enabled').check();
  await page.locator('[data-zone="WORLD"]').getByRole('button', { name: 'שמירה' }).click();
  await expect
    .poll(
      async () =>
        (
          await sql<{ enabled: boolean }[]>`SELECT enabled FROM shipping_zone WHERE code = 'WORLD'`
        )[0]?.enabled,
    )
    .toBe(true);
});
