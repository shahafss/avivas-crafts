import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, resetDb, sql, test, waitForFormAge } from './fixtures';

// 003 US6 (tasks.md T041; contracts/consent.md; storefront.md §7.21, §8.13; user decision Q2): the
// dormant consent mechanism, proven with the test category. Runs only in the `consent` project:
// a server with CONSENT_TEST_CATEGORY=analytics on port 3101. Tests run in order on shared state;
// each gets a fresh browser context (no cookies) unless it says otherwise.

test.describe.configure({ mode: 'serial' });

const OPTIONAL_COOKIE = 'ac_test_optional';
const CONSENT_COOKIE = 'ac_consent';

test.beforeAll(async () => {
  await resetDb();
});

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

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function cookieNames(context: BrowserContext): Promise<string[]> {
  return (await context.cookies()).map((cookie) => cookie.name);
}

const records = () =>
  sql<
    { choices: Record<string, boolean>; policy_version: number }[]
  >`SELECT choices, policy_version FROM consent_record ORDER BY decided_at, id`;

async function showBanner(page: Page, path = '/he'): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId('consent-banner')).toBeVisible({ timeout: 20_000 });
  await hydrated(page, 'consent-accept-all');
}

test('first visit shows the banner; Accept and Reject are equal; nothing optional is stored', async ({
  page,
  context,
}) => {
  const scriptRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/test-optional.js') scriptRequests.push(request.url());
  });
  await showBanner(page);
  const accept = page.getByTestId('consent-accept-all');
  const reject = page.getByTestId('consent-reject-all');

  // FR-021: equal prominence.
  const [acceptBox, rejectBox] = [await accept.boundingBox(), await reject.boundingBox()];
  expect(acceptBox).not.toBeNull();
  expect(rejectBox).not.toBeNull();
  expect(Math.round(acceptBox?.width ?? 0)).toBe(Math.round(rejectBox?.width ?? -1));
  expect(Math.round(acceptBox?.height ?? 0)).toBe(Math.round(rejectBox?.height ?? -1));
  const looks = (locator: typeof accept) =>
    locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        font: style.font,
        padding: style.padding,
        border: style.border,
        backgroundColor: style.backgroundColor,
      };
    });
  expect(await looks(accept)).toEqual(await looks(reject));

  // Before a choice nothing optional is stored, and nothing optional is requested.
  expect(await cookieNames(context)).not.toContain(OPTIONAL_COOKIE);
  expect(await cookieNames(context)).not.toContain(CONSENT_COOKIE);
  expect(await records()).toHaveLength(0);
  expect(scriptRequests).toEqual([]);

  await expectNoViolations(page);

  // The settings dialog, with the necessary row always on and one switch per category.
  await page.getByTestId('consent-settings-open').click();
  await expect(page.getByTestId('consent-dialog')).toBeVisible();
  await expect(page.getByTestId('consent-switch-analytics')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expectNoViolations(page);
});

test('Reject all stores only the choice: no optional cookie while browsing and after an offline order', async ({
  page,
  context,
}) => {
  await showBanner(page);
  await page.getByTestId('consent-reject-all').click();
  await expect(page.getByTestId('consent-banner')).toHaveCount(0);
  await expect.poll(async () => cookieNames(context)).toContain(CONSENT_COOKIE);
  expect(await cookieNames(context)).not.toContain(OPTIONAL_COOKIE);
  const [saved] = await records();
  expect(saved?.choices).toEqual({ analytics: false });

  // Browse, add to cart, and place an offline order.
  const [mug] = await sql<{ id: string }[]>`SELECT id FROM product WHERE slug = 'sample-clay-mug'`;
  await page.goto('/he/contact');
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
    { productId: mug?.id },
  );
  await page.goto('/he/checkout');
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('field-fullName').fill('דנה כהן');
  await page.getByTestId('field-phone').fill('052-234-5678');
  await page.getByTestId('field-email').fill('consent-dana@example.com');
  await page.getByTestId('delivery-pickup').check();
  await page.getByTestId('payment-offline').check();
  await page.getByTestId('accept-terms').check();
  await waitForFormAge(page);
  await page.getByTestId('place-order').click();
  await page.waitForURL(/\/he\/order\//, { timeout: 30_000 });
  await expect(page.getByTestId('order-number')).toBeVisible();

  expect(await cookieNames(context)).not.toContain(OPTIONAL_COOKIE);
  // The rejection is remembered: no banner on the next page.
  await page.goto('/he');
  await expect(page.getByTestId('footer-cookie-settings')).toBeVisible();
  await expect(page.getByTestId('consent-banner')).toHaveCount(0);
});

test('Accept all sets the optional cookie; the footer button opens the settings and a later rejection removes it', async ({
  page,
  context,
}) => {
  const scriptRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/test-optional.js') scriptRequests.push(request.url());
  });

  await showBanner(page);
  await page.getByTestId('consent-accept-all').click();
  await expect(page.getByTestId('consent-banner')).toHaveCount(0);
  // The banner that held focus is gone: focus must not fall back to <body>.
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  // The gate loads the script at once (no reload needed), and the script sets the cookie.
  await expect
    .poll(async () => cookieNames(context), { timeout: 20_000 })
    .toContain(OPTIONAL_COOKIE);
  expect(scriptRequests).toHaveLength(1);
  const before = (await records()).length;
  expect((await records()).at(-1)?.choices).toEqual({ analytics: true });

  // The footer button is on every page, in both languages, and opens the dialog.
  for (const path of ['/he', '/en', '/he/contact', '/he/pages/cookies', '/he/p/sample-clay-mug']) {
    await page.goto(path);
    await expect(page.getByTestId('footer-cookie-settings'), path).toBeVisible();
    await expect(page.getByTestId('consent-banner'), path).toHaveCount(0);
  }
  await page.goto('/he');
  await hydrated(page, 'footer-cookie-settings');
  await page.getByTestId('footer-cookie-settings').click();
  await expect(page.getByTestId('consent-dialog')).toBeVisible();
  const analytics = page.getByTestId('consent-switch-analytics');
  await expect(analytics).toHaveAttribute('aria-checked', 'true');
  await analytics.click();
  await expect(analytics).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('consent-save').click();
  await expect(page.getByTestId('consent-dialog')).toBeHidden();

  await expect.poll(async () => cookieNames(context)).not.toContain(OPTIONAL_COOKIE);
  expect(await cookieNames(context)).toContain(CONSENT_COOKIE);
  const after = await records();
  expect(after).toHaveLength(before + 1);
  expect(after.at(-1)?.choices).toEqual({ analytics: false });
});

test('after a Cookie Policy change the banner returns and nothing optional loads until the visitor accepts again (Q2)', async ({
  page,
  context,
}) => {
  await showBanner(page);
  await page.getByTestId('consent-accept-all').click();
  await expect(page.getByTestId('consent-banner')).toHaveCount(0);
  await expect
    .poll(async () => cookieNames(context), { timeout: 20_000 })
    .toContain(OPTIONAL_COOKIE);

  await sql`UPDATE content_page SET version = version + 1 WHERE slug = 'cookies'`;
  const [cookies] = await sql<{ version: number }[]>`
    SELECT version FROM content_page WHERE slug = 'cookies'`;

  const scriptRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/test-optional.js') scriptRequests.push(request.url());
  });
  expect(await cookieNames(context)).toContain(OPTIONAL_COOKIE);
  await showBanner(page, '/he/contact');
  // The optional cookie set under the old version is expired at once, on the server.
  await expect.poll(async () => cookieNames(context)).not.toContain(OPTIONAL_COOKIE);
  await page.waitForLoadState('networkidle');
  expect(scriptRequests).toEqual([]);
  expect(await cookieNames(context)).not.toContain(OPTIONAL_COOKIE);

  // The old choice pre-sets the switch in the settings dialog.
  await page.getByTestId('consent-settings-open').click();
  await expect(page.getByTestId('consent-switch-analytics')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByTestId('consent-save').click();
  await expect(page.getByTestId('consent-banner')).toHaveCount(0);
  await expect
    .poll(async () => cookieNames(context), { timeout: 20_000 })
    .toContain(OPTIONAL_COOKIE);
  expect(scriptRequests).toHaveLength(1);
  expect((await records()).at(-1)).toMatchObject({
    choices: { analytics: true },
    policy_version: cookies?.version,
  });
});

// 007 T092/T093 (FR-044, FR-046, research D21): a modal drawer makes the consent banner and its
// skip link inert too (every top-level child of <body> except the drawer), so keyboard focus
// cannot reach them while it is open, and the banner works again once it is closed.
test('an open drawer makes the consent banner inert; closing it brings the banner back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await showBanner(page);
  await hydrated(page, 'cart-link');
  const banner = page.getByTestId('consent-banner');
  await page.locator('#site-header [popovertarget="site-menu"]').click();
  await expect(page.locator('#site-menu')).toBeVisible();
  expect(
    await banner.evaluate((element) => element.closest('[inert]') !== null),
    'the banner is inert while the menu drawer is open',
  ).toBe(true);
  const reachable = await page.evaluate(() => {
    const drawer = document.getElementById('site-menu');
    return [...document.body.querySelectorAll<HTMLElement>('a[href], button, input')].filter(
      (element) =>
        !drawer?.contains(element) &&
        element.closest('[inert]') === null &&
        element.closest('[popover]:not(:popover-open)') === null,
    ).length;
  });
  expect(
    reachable,
    'nothing outside the drawer is reachable (banner and skip links included)',
  ).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#site-menu')).toBeHidden();
  expect(await banner.evaluate((element) => element.closest('[inert]') !== null)).toBe(false);
  await expect(page.getByTestId('consent-accept-all')).toBeEnabled();

  // The same for the cart drawer.
  await page.getByTestId('cart-link').click();
  await expect(page.getByTestId('cart-drawer')).toBeVisible();
  expect(await banner.evaluate((element) => element.closest('[inert]') !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cart-drawer')).toBeHidden();
  expect(await banner.evaluate((element) => element.closest('[inert]') !== null)).toBe(false);
});
