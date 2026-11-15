import type { Page } from '@playwright/test';
import { expect, resetDb, test } from './fixtures';
import { hydrated, placeOfflineOrder, putCartItem } from './shop-helpers';

// 006 T020 (research D7, 001 T125): direction and layout checks of docs/design/storefront.md §11:
// `lang`/`dir`; the gallery at inline-start and the brand at the mirrored side at 1280 px; no
// horizontal overflow at 320 and 375 px; no `style=` anywhere (§2, no style prop); product images
// with srcset/sizes/width/height; 44x44 px hit areas (§7.10, §7.12, §7.19); zoom arrows follow the
// reading direction (§7.14); no transform animation under reduced motion (§3.5).

test.describe.configure({ mode: 'serial' });

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Run once, in desktop Chromium');
});

const LOCALES = ['he', 'en'] as const;
type Locale = (typeof LOCALES)[number];

let orderPath = '';

test.beforeAll(async ({ browser }, testInfo) => {
  if (testInfo.project.name !== 'chromium-desktop') return;
  await resetDb();
  orderPath = await placeOfflineOrder(browser, testInfo);
});

interface Screen {
  name: string;
  /** Path without the locale prefix. */
  path: () => string;
  cart?: boolean;
}

const SCREENS: Screen[] = [
  { name: 'home', path: () => '' },
  { name: 'category', path: () => '/c/sample-ceramics' },
  { name: 'search', path: () => '/search?q=bowl' },
  { name: 'product', path: () => '/p/sample-clay-mug' },
  { name: 'cart', path: () => '/cart', cart: true },
  { name: 'checkout', path: () => '/checkout', cart: true },
  { name: 'order page', path: () => orderPath },
  { name: 'about', path: () => '/pages/about' },
  { name: 'contact', path: () => '/contact' },
  { name: '404', path: () => '/no-such-page' },
];

async function open(page: Page, locale: Locale, screen: Screen): Promise<void> {
  if (screen.cart === true) await putCartItem(page, 'sample-clay-mug');
  await page.goto(`/${locale}${screen.path()}`);
  await expect(page.locator('main')).toBeVisible();
  if (screen.name === 'checkout') {
    await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  }
  if (screen.name === 'cart') await expect(page.getByTestId('cart-line')).toHaveCount(1);
}

test('every page has lang and dir for its locale', async ({ page }) => {
  for (const locale of LOCALES) {
    for (const screen of SCREENS) {
      await open(page, locale, screen);
      const html = page.locator('html');
      await expect(html, `${locale} ${screen.name}`).toHaveAttribute('lang', locale);
      await expect(html, `${locale} ${screen.name}`).toHaveAttribute(
        'dir',
        locale === 'he' ? 'rtl' : 'ltr',
      );
    }
  }
});

test('at 1280 px the gallery is at inline-start and the brand at the mirrored side', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const locale of LOCALES) {
    await page.goto(`/${locale}/p/sample-clay-mug`);
    const gallery = await page.getByTestId('gallery-track').boundingBox();
    const buyPanel = await page.locator('main h1').boundingBox();
    const brand = await page.locator('header > a').first().boundingBox();
    const cart = await page.getByTestId('cart-link').boundingBox();
    if (!gallery || !buyPanel || !brand || !cart) throw new Error('missing box');
    if (locale === 'he') {
      expect(gallery.x, 'gallery right of the buy panel in he').toBeGreaterThan(
        buyPanel.x + buyPanel.width - 1,
      );
      expect(brand.x, 'brand right of the cart in he').toBeGreaterThan(cart.x);
    } else {
      expect(gallery.x + gallery.width, 'gallery left of the buy panel in en').toBeLessThan(
        buyPanel.x + 1,
      );
      expect(brand.x, 'brand left of the cart in en').toBeLessThan(cart.x);
    }
  }
});

test('no page scrolls sideways at 320 and 375 px', async ({ page }) => {
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 800 });
    for (const locale of LOCALES) {
      for (const screen of SCREENS) {
        await open(page, locale, screen);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${locale} ${screen.name} at ${String(width)} px`).toBeLessThanOrEqual(0);
      }
    }
  }
});

test('no style attribute in the server HTML or in the DOM', async ({ page }) => {
  for (const locale of LOCALES) {
    for (const screen of SCREENS) {
      const html = await (await page.request.get(`/${locale}${screen.path()}`)).text();
      expect(/\sstyle\s*=/i.test(html), `${locale} ${screen.name}: server HTML`).toBe(false);

      await open(page, locale, screen);
      const styled = await page.evaluate(() =>
        [...document.querySelectorAll('[style]')]
          .filter((element) => element.tagName.toLowerCase() !== 'next-route-announcer')
          .map((element) => element.outerHTML.slice(0, 120)),
      );
      expect(styled, `${locale} ${screen.name}: DOM`).toEqual([]);
    }
  }
});

test('every product image has srcset, sizes, width and height', async ({ page }) => {
  const incomplete = (): Promise<string[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll('main img, dialog img')]
        .filter(
          (img) =>
            !img.getAttribute('srcset') ||
            !img.getAttribute('sizes') ||
            !img.getAttribute('width') ||
            !img.getAttribute('height'),
        )
        .map((img) => img.outerHTML.slice(0, 160)),
    );
  for (const locale of LOCALES) {
    for (const path of ['', '/c/sample-ceramics', '/search?q=bowl', '/p/sample-soy-candle']) {
      await page.goto(`/${locale}${path}`);
      await expect(page.locator('main')).toBeVisible();
      expect(await incomplete(), `${locale} ${path}`).toEqual([]);
      expect(await page.locator('main img').count(), `${locale} ${path}`).toBeGreaterThan(0);
    }

    // The zoom dialog's image, once the dialog is open.
    await page.goto(`/${locale}/p/sample-soy-candle`);
    await hydrated(page, 'gallery-zoom');
    await page.getByTestId('gallery-zoom').click();
    await expect(page.locator('dialog img')).toHaveCount(1);
    expect(await incomplete(), `${locale} zoom dialog`).toEqual([]);
    await page.keyboard.press('Escape');

    // Cart, checkout and order lines (they show a thumbnail when the product has a photo).
    for (const path of ['/cart', '/checkout']) {
      await putCartItem(page, 'sample-clay-mug');
      await page.goto(`/${locale}${path}`);
      await expect(page.locator('main img').first()).toBeVisible({ timeout: 20_000 });
      expect(await incomplete(), `${locale} ${path}`).toEqual([]);
    }
    await page.goto(`/${locale}${orderPath}`);
    // The order page lists its lines without thumbnails (§7.23); any image it has is checked.
    await expect(page.getByTestId('order-number')).toBeVisible();
    expect(await incomplete(), `${locale} order page`).toEqual([]);
  }
});

/** Size of the clickable area: the box, or its `::before`/`::after` when that is larger. */
async function smallTargets(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((query) => {
    const small: string[] = [];
    let measured = 0;
    for (const element of document.querySelectorAll<HTMLElement>(query)) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      measured += 1;
      let width = rect.width;
      let height = rect.height;
      for (const pseudo of ['::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        if (style.content !== 'none' && style.position === 'absolute') {
          width = Math.max(width, Number.parseFloat(style.width) || 0);
          height = Math.max(height, Number.parseFloat(style.height) || 0);
        }
      }
      if (width < 44 - 0.5 || height < 44 - 0.5) {
        small.push(
          `${element.tagName.toLowerCase()}[${element.getAttribute('data-testid') ?? element.getAttribute('aria-label') ?? element.textContent.trim().slice(0, 20)}] ${width.toFixed(1)}x${height.toFixed(1)}`,
        );
      }
    }
    // A selector that matches nothing must fail, not pass.
    return measured === 0 ? [`nothing measured for ${query}`] : small;
  }, selector);
}

const HEADER_CONTROLS = 'header a, header button';

test('header, buy-box, cart and checkout controls have a 44 by 44 px hit area', async ({
  page,
}) => {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const locale of LOCALES) {
      const label = (what: string): string => `${locale} ${what} at ${String(width)} px`;

      await page.goto(`/${locale}/p/sample-clay-mug`);
      await expect(page.getByTestId('add-to-cart')).toBeVisible();
      expect(await smallTargets(page, HEADER_CONTROLS), label('header')).toEqual([]);
      expect(
        await smallTargets(page, '[data-testid="buy-row"] button, [data-testid="option-chip"]'),
        label('buy box'),
      ).toEqual([]);

      await putCartItem(page, 'sample-clay-mug');
      await page.goto(`/${locale}/cart`);
      await expect(page.getByTestId('cart-line')).toHaveCount(1);
      expect(
        await smallTargets(page, 'main button, main aside a, [data-testid="cart-line"] a'),
        label('cart'),
      ).toEqual([]);

      await page.goto(`/${locale}/checkout`);
      await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
      // The inline terms and privacy links inside the checkbox label are exempt (WCAG 2.5.8
      // inline exception, storefront.md §7.10); the selector below covers buttons, radios and boxes.
      expect(
        await smallTargets(
          page,
          '[data-testid="checkout-form"] input[type="radio"], [data-testid="checkout-form"] input[type="checkbox"], [data-testid="checkout-form"] button',
        ),
        label('checkout'),
      ).toEqual([]);
    }
  }
});

test('zoom dialog: the arrow that points the reading way shows the next photo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [locale, forward, back] of [
    ['he', 'ArrowLeft', 'ArrowRight'],
    ['en', 'ArrowRight', 'ArrowLeft'],
  ] as const) {
    await page.goto(`/${locale}/p/sample-soy-candle`);
    await hydrated(page, 'gallery-zoom');
    await page.getByTestId('gallery-zoom').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('1 / 2')).toBeVisible();
    await page.keyboard.press(forward);
    await expect(dialog.getByText('2 / 2'), `${locale} ${forward}`).toBeVisible();
    await page.keyboard.press(back);
    await expect(dialog.getByText('1 / 2'), `${locale} ${back}`).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
});

test('add to cart: the badge pops normally and does not animate under reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const badgeAnimation = async (): Promise<string> => {
    const badge = page.getByTestId('cart-badge');
    await expect(badge).toBeVisible();
    return badge.evaluate((element) => getComputedStyle(element).animationName);
  };

  // Control: with no preference the badge runs `badge-pop` (a transform animation, §3.5).
  await page.goto('/he/p/sample-clay-mug');
  await hydrated(page, 'add-to-cart');
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('added-to-cart-row')).toBeVisible();
  expect(await badgeAnimation(), 'control').toBe('badge-pop');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/he/p/sample-clay-mug');
  await hydrated(page, 'add-to-cart');
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('added-to-cart-row')).toBeVisible();
  await expect(page.getByTestId('add-to-cart')).toContainText('נוסף לסל');
  expect(await badgeAnimation(), 'reduced motion').toBe('none');
});
