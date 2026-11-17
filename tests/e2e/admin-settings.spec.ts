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

test.afterAll(async () => {
  await sql`UPDATE shop_settings SET social_facebook_url = NULL, social_instagram_url = NULL, social_tiktok_url = NULL`;
});

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

test('social links: saved, shown in the footer in both languages, refused on a wrong site, removed', async ({
  page,
}) => {
  await resetDb();
  await signInAsAdmin(page);
  await openSettings(page);
  const section = page.getByTestId('settings-social');
  const socialLinks = (locale: 'he' | 'en') =>
    page
      .goto(`/${locale}`)
      .then(() => page.locator('footer').locator('[data-testid^="footer-social-"]'));

  // Save one address: stored normalised, shown in the field, toast.
  await page.getByTestId('settings-socialInstagramUrl').fill('instagram.com/aviva');
  await section.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('ההגדרות נשמרו')).toBeVisible();
  await expect(page.getByTestId('settings-socialInstagramUrl')).toHaveValue(
    'https://instagram.com/aviva',
  );

  const heLinks = await socialLinks('he');
  await expect(heLinks).toHaveCount(1);
  await expect(page.getByTestId('footer-social-instagram')).toHaveAttribute(
    'href',
    'https://instagram.com/aviva',
  );
  await expect(page.locator('footer').getByRole('link', { name: 'האינסטגרם שלי' })).toHaveCount(1);
  await expect(page.getByTestId('footer-social')).toHaveAttribute(
    'aria-label',
    'הרשתות החברתיות שלי',
  );
  // The links open in the same tab: no target attribute on any of them.
  for (const link of await heLinks.all()) await expect(link).not.toHaveAttribute('target');
  const enLinks = await socialLinks('en');
  await expect(enLinks).toHaveCount(1);
  await expect(page.locator('footer').getByRole('link', { name: 'My Instagram' })).toHaveCount(1);

  // A wrong site: the Hebrew message under the field, nothing saved, the footer is unchanged.
  await openSettings(page);
  await page.getByTestId('settings-socialFacebookUrl').fill('https://example.com/a');
  await section.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.locator('#settings-social-facebook-error')).toContainText(
    'זו לא כתובת של פייסבוק',
  );
  await expect(page.getByTestId('settings-socialFacebookUrl')).toHaveAttribute(
    'aria-describedby',
    /settings-social-facebook-error/,
  );
  // One error only: no summary.
  await expect(page.getByTestId('settings-social-error-summary')).toHaveCount(0);
  expect(
    (await sql<{ v: string | null }[]>`SELECT social_facebook_url AS v FROM shop_settings`)[0]?.v,
  ).toBeNull();
  await expect(await socialLinks('he')).toHaveCount(1);
  await expect(page.getByTestId('footer-social-instagram')).toBeVisible();

  // Two bad addresses at once: a summary at the top with two entries, focus on it, each entry
  // leads to its field, and each message is also under its own field.
  await openSettings(page);
  await page.getByTestId('settings-socialFacebookUrl').fill('https://example.com/a');
  await page.getByTestId('settings-socialTiktokUrl').fill('https://example.com/b');
  await section.getByRole('button', { name: 'שמירה' }).click();
  const summary = page.getByTestId('settings-social-error-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(summary.getByRole('listitem')).toHaveCount(2);
  await expect(summary).toContainText('זו לא כתובת של פייסבוק');
  await expect(summary).toContainText('זו לא כתובת של טיקטוק');
  await expect(page.locator('#settings-social-facebook-error')).toContainText(
    'זו לא כתובת של פייסבוק',
  );
  await expect(page.locator('#settings-social-tiktok-error')).toContainText(
    'זו לא כתובת של טיקטוק',
  );
  await summary.getByRole('link', { name: /טיקטוק/ }).click();
  await expect(page.getByTestId('settings-socialTiktokUrl')).toBeFocused();

  // Empty both fields (the section saves its three fields together): the list is gone.
  await openSettings(page);
  await page.getByTestId('settings-socialFacebookUrl').fill('');
  await page.getByTestId('settings-socialInstagramUrl').fill('');
  await section.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('ההגדרות נשמרו')).toBeVisible();
  await page.goto('/he');
  await expect(page.getByTestId('footer-social')).toHaveCount(0);
});

test('home row: choosing "ללא" hides the row, choosing "מומלצות" brings it back', async ({
  page,
}) => {
  try {
    await resetDb();
    await signInAsAdmin(page);
    await openSettings(page);
    const section = page.getByTestId('settings-home');
    await page
      .getByTestId('settings-homeCategoryId')
      .selectOption({ label: 'ללא (השורה לא תוצג)' });
    await section.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByText('ההגדרות נשמרו')).toBeVisible();
    await page.goto('/he');
    await expect(page.getByTestId('home-row')).toHaveCount(0);

    await openSettings(page);
    await page.getByTestId('settings-homeCategoryId').selectOption({ label: 'מומלצות' });
    await section.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByText('ההגדרות נשמרו')).toBeVisible();
    await page.goto('/he');
    await expect(page.getByTestId('home-row')).toBeVisible();
  } finally {
    await resetDb();
  }
});

// B9e: two invalid header category ids give two field errors (the schema reports every field; the
// "not found" check stops at the first), so the summary shows both and takes focus.
test('two invalid header categories show the home section error summary with two items and focus it', async ({
  page,
}) => {
  try {
    await resetDb();
    await signInAsAdmin(page);
    await openSettings(page);
    const section = page.getByTestId('settings-home');
    // Give one option of each header select a value that is not an id.
    await page.evaluate(() => {
      const unknown = ['not-an-id-1', 'not-an-id-2'];
      ['settings-headerCategory1Id', 'settings-headerCategory2Id'].forEach((testId, index) => {
        const select = document.querySelector(`[data-testid="${testId}"]`);
        const option = select?.querySelectorAll('option')[1];
        if (!option) throw new Error('no category option');
        option.value = unknown[index] ?? '';
      });
    });
    await page.getByTestId('settings-headerCategory1Id').selectOption({ index: 1 });
    await page.getByTestId('settings-headerCategory2Id').selectOption({ index: 1 });
    await section.getByRole('button', { name: 'שמירה' }).click();
    const summary = page.getByTestId('settings-home-error-summary');
    await expect(summary).toBeVisible();
    await expect(summary.getByRole('link')).toHaveCount(2);
    await expect(summary).toBeFocused();
  } finally {
    await resetDb();
  }
});

// 007 Phase D gate (tasks.md T074; FR-039, FR-040, research D20). Fails until T077.
test('header categories: two selects set the header links in order, "ללא" removes them, and category name inputs are limited to 12', async ({
  page,
}) => {
  try {
    await resetDb();
    await signInAsAdmin(page);
    await openSettings(page);
    const section = page.getByTestId('settings-home');
    await page.getByTestId('settings-headerCategory1Id').selectOption({ label: 'קרמיקה' });
    await page.getByTestId('settings-headerCategory2Id').selectOption({ label: 'נרות' });
    await section.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByText('ההגדרות נשמרו')).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/he');
    const nav = page.getByTestId('site-header').getByRole('navigation', { name: 'תפריט האתר' });
    await expect(nav.getByRole('link')).toHaveText([
      'כל היצירות',
      'קרמיקה',
      'נרות',
      'מומלצות',
      'אודות',
      'משלוחים והחזרות',
    ]);

    await page.setViewportSize({ width: 375, height: 812 });
    await openSettings(page);
    await page.getByTestId('settings-headerCategory1Id').selectOption({ label: 'ללא' });
    await page.getByTestId('settings-headerCategory2Id').selectOption({ label: 'ללא' });
    await section.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByText('ההגדרות נשמרו')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/he');
    await expect(nav.getByRole('link')).toHaveText([
      'כל היצירות',
      'מומלצות',
      'אודות',
      'משלוחים והחזרות',
    ]);

    // The categories screen: both name inputs carry maxlength 12.
    await page.goto('/admin/categories');
    // Rows and the add form: the Hebrew and English name inputs (the English ones have no test id).
    const inputs = page.locator(
      '[data-testid="category-row"] form input, form:has([data-testid="category-new-name-he"]) input',
    );
    await expect(inputs.first()).toBeVisible({ timeout: 20_000 });
    const lengths = await inputs.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('maxlength')),
    );
    expect(lengths.length).toBeGreaterThanOrEqual(2);
    for (const value of lengths) expect(value).toBe('12');
  } finally {
    await resetDb();
  }
});
