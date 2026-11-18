import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, readOutbox, resetDb, sql, test, waitForFormAge } from './fixtures';

// 003 US2 (tasks.md T020; storefront.md §8.10): the contact page and form, and the contact links
// across the shop. All three storefront projects, both locales.

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await resetDb();
});

const TEXT = {
  he: {
    sent: 'ההודעה נשלחה. אענה לכם במייל בהקדם.',
    rateLimited: /שלחתם כמה הודעות ברצף\. נסו שוב בעוד (\d+ דקות|דקה אחת)\./,
  },
  en: {
    sent: "Your message was sent. I'll reply by email soon.",
    rateLimited: /You've sent several messages in a row\. Try again in (\d+ minutes|1 minute)\./,
  },
} as const;

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

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

async function openContact(page: Page, locale: 'he' | 'en'): Promise<void> {
  await page.goto(`/${locale}/contact`);
  await expect(page.getByTestId('contact-form')).toBeVisible();
  await hydrated(page, 'contact-submit');
}

async function fillForm(page: Page, name: string, email: string, message: string): Promise<void> {
  await page.getByTestId('field-name').fill(name);
  await page.getByTestId('field-email').fill(email);
  await page.getByTestId('field-message').fill(message);
}

/** The href of the first link to the contact page inside `scope`, requested for its status. */
async function contactLinkWorks(page: Page, scope: string, locale: 'he' | 'en'): Promise<void> {
  const link = page.locator(`${scope} a[href$="/${locale}/contact"]`).first();
  await expect(link, scope).toBeAttached();
  const href = await link.getAttribute('href');
  expect(href).toBe(`/${locale}/contact`);
  expect((await page.request.get(href ?? '')).status(), scope).toBe(200);
}

for (const locale of ['he', 'en'] as const) {
  test.describe(`contact in ${locale}`, () => {
    test('shows the intro, the business details and the form (axe clean)', async ({ page }) => {
      const response = await page.goto(`/${locale}/contact`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();
      // The intro is the owner-written `contact` page, rendered as Markdown.
      await expect(page.getByTestId('contact-intro')).toBeVisible();

      const details = page.getByTestId('contact-details');
      await expect(details).toContainText(
        locale === 'he' ? 'שם העסק (להשלמה)' : 'Business name (to be completed)',
      );
      await expect(details).toContainText(
        locale === 'he' ? 'כתובת העסק (להשלמה)' : 'Business address (to be completed)',
      );
      await expect(details).toContainText('000000000');
      await expect(details.locator('a[href="mailto:shop@example.invalid"]')).toBeVisible();
      await expect(details.locator('a[href="tel:+972500000000"]')).toBeVisible();

      const form = page.getByTestId('contact-form');
      await expect(form.getByTestId('field-name')).toBeVisible();
      await expect(form.getByTestId('field-email')).toHaveAttribute('dir', 'ltr');
      await expect(form.getByTestId('field-message')).toHaveAttribute('rows', '6');
      await expect(form.getByTestId('contact-submit')).toBeVisible();
      // The honeypot is hidden from people and from assistive technology.
      const honeypot = page.locator('[aria-hidden="true"] input[name="website"]');
      await expect(honeypot).toHaveCount(1);
      await expect(honeypot).toHaveAttribute('tabindex', '-1');
      await expectNoViolations(page);
    });

    test('an empty submit shows the field errors and the error summary (axe clean)', async ({
      page,
    }) => {
      const before = (await readOutbox('contact-message')).length;
      await openContact(page, locale);
      await waitForFormAge(page);
      await page.getByTestId('contact-submit').click();
      const summary = page.getByTestId('contact-errors');
      await expect(summary).toBeVisible();
      await expect(summary).toBeFocused();
      await expect(summary.locator('li')).toHaveCount(3);
      for (const field of ['name', 'email', 'message']) {
        await expect(page.getByTestId(`field-${field}`)).toHaveAttribute('aria-invalid', 'true');
      }
      await expect(page.getByTestId('contact-form')).toBeVisible();
      expect(await readOutbox('contact-message')).toHaveLength(before);
      await expectNoViolations(page);
    });

    test('a valid message replaces the form with a focused status panel and is queued', async ({
      page,
    }) => {
      const before = (await readOutbox('contact-message')).length;
      await openContact(page, locale);
      await fillForm(
        page,
        'Dana Cohen',
        'dana-contact@example.com',
        `Hello from the ${locale} contact spec, a question about a pink hat.`,
      );
      await waitForFormAge(page);
      await page.getByTestId('contact-submit').click();

      const sent = page.getByTestId('contact-sent');
      await expect(sent).toBeVisible();
      await expect(sent).toHaveAttribute('role', 'status');
      await expect(sent).toBeFocused();
      await expect(sent).toContainText(TEXT[locale].sent);
      await expect(page.getByTestId('contact-form')).toHaveCount(0);
      await expectNoViolations(page);

      const rows = (await readOutbox('contact-message')).slice(before);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        to_address: 'notify@example.invalid',
        reply_to: 'dana-contact@example.com',
        locale: 'he',
      });
      expect(rows[0]?.subject).not.toContain('Dana');
      expect(rows[0]?.subject).not.toContain('dana-contact');
    });
  });
}

test('a form posted without scripts never puts the visitor data in the address', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  try {
    await page.goto('/he/contact');
    await expect(page.getByTestId('contact-form')).toHaveAttribute('method', 'post');
    await fillForm(page, 'Dana Cohen', 'dana-nojs@example.com', 'A message typed without scripts.');
    // Start waiting for the POST together with the click: a load-state wait right after the click
    // can return before the navigation has begun.
    const posted = page.waitForResponse((response) => response.request().method() === 'POST');
    await page.getByTestId('contact-submit').click();
    await posted;
    await page.waitForLoadState('load');
    expect(new URL(page.url()).search).toBe('');
  } finally {
    await context.close();
  }
});

test('the sixth message in an hour is refused with the wait, and nothing is queued for it', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);
  const before = (await readOutbox('contact-message')).length;
  // Six forms rendered up front share one wait for the minimum form age.
  const pages: Page[] = [];
  for (let i = 0; i < 6; i += 1) {
    const next = i === 0 ? page : await context.newPage();
    await openContact(next, 'he');
    pages.push(next);
  }
  await waitForFormAge(pages[5] as Page);
  // The limit is per clock hour: do not send in the last three minutes of one (the six sends
  // take well under that). The forms stay valid for two hours, so waiting here is safe.
  const msToNextHour = 3_600_000 - (Date.now() % 3_600_000);
  if (msToNextHour < 180_000) await page.waitForTimeout(msToNextHour + 1000);
  for (const [index, current] of pages.entries()) {
    await fillForm(
      current,
      'Dana Cohen',
      'dana-limit@example.com',
      `Message number ${String(index + 1)} for the hourly limit.`,
    );
    await current.getByTestId('contact-submit').click();
    if (index < 5) {
      await expect(current.getByTestId('contact-sent')).toBeVisible();
    }
  }
  const last = pages[5] as Page;
  const notice = last.getByTestId('contact-rate-limited');
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('alert')).toBeVisible();
  await expect(notice).toContainText(TEXT.he.rateLimited);
  await expect(last.getByTestId('contact-form')).toBeVisible();
  await expectNoViolations(last);
  expect((await readOutbox('contact-message')).length - before).toBe(5);
});

test('the contact links across the shop lead to the page in the same language', async ({
  page,
}) => {
  await sql`UPDATE product SET orderable = false WHERE slug = 'sample-clay-mug'`;
  try {
    for (const locale of ['he', 'en'] as const) {
      await page.goto(`/${locale}`);
      // The menu (a popover next to the header) holds the link.
      await contactLinkWorks(page, '#site-menu', locale);
      await contactLinkWorks(page, 'footer', locale);

      await page.goto(`/${locale}/p/sample-clay-mug`);
      await expect(page.getByTestId('unavailable-notice')).toBeVisible();
      await contactLinkWorks(page, '[data-testid="unavailable-notice"]', locale);
    }
  } finally {
    await sql`UPDATE product SET orderable = true WHERE slug = 'sample-clay-mug'`;
  }
});

test('the All pieces empty state, the checkout and the order page link to the contact page', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-desktop', 'cart and checkout: phone projects');

  // The empty catalog: the home page has no empty state any more (storefront.md §8.1); the
  // "no pieces yet" message with the contact link lives on All pieces (§8.14).
  const hidden = await sql<{ id: string }[]>`
    UPDATE product SET state = 'hidden' WHERE state = 'published' RETURNING id`;
  try {
    for (const locale of ['he', 'en'] as const) {
      await page.goto(`/${locale}/shop`);
      await contactLinkWorks(page, 'main', locale);
    }
  } finally {
    for (const row of hidden)
      await sql`UPDATE product SET state = 'published' WHERE id = ${row.id}`;
  }

  // Checkout.
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
  await contactLinkWorks(page, '#site-menu', 'he');
  // "Other country" answers with a link to the contact page.
  await page.getByTestId('delivery-shipping').check();
  await page.getByTestId('field-country').selectOption('other');
  await contactLinkWorks(page, '[data-testid="country-other-message"]', 'he');

  // The customer's order page, for an order placed here.
  await page.getByTestId('field-fullName').fill('דנה כהן');
  await page.getByTestId('field-phone').fill('052-234-5678');
  await page.getByTestId('field-email').fill('dana-order@example.com');
  await page.getByTestId('delivery-pickup').check();
  await page.getByTestId('payment-offline').check();
  await page.getByTestId('accept-terms').check({ position: { x: 4, y: 4 } });
  await waitForFormAge(page);
  await page.getByTestId('place-order').click();
  await page.waitForURL(/\/he\/order\//, { timeout: 30_000 });
  // The links show in the notices of a live order; a cancelled one always has them.
  await sql`UPDATE orders SET status = 'cancelled' WHERE customer_email = 'dana-order@example.com'`;
  await page.reload();
  await contactLinkWorks(page, '[data-testid="order-cancelled"]', 'he');
  const mails = await readOutbox('order-confirmation');
  const match = /\/he\/order\/[A-Za-z0-9_-]{43}/.exec(
    mails.find((mail) => mail.to_address === 'dana-order@example.com')?.text_body ?? '',
  );
  expect(match).not.toBeNull();
  await page.goto('/en/order/' + (match?.[0].split('/').pop() ?? ''));
  await contactLinkWorks(page, '[data-testid="order-cancelled"]', 'en');
});
