import type { Locator, Page } from '@playwright/test';
import { expect, resetDb, sql, test, waitForFormAge } from './fixtures';
import {
  burgerLines,
  expectDrawerGeometry,
  hydrated,
  nothingLeftOpen,
  openCartDrawer,
  placeOfflineOrder,
  putCartItem,
  transitionsDone,
} from './shop-helpers';

// 006 T020 (research D7, 001 T125): direction and layout checks of docs/design/storefront.md §11:
// `lang`/`dir`; the gallery at inline-start and the brand at the mirrored side at 1280 px; no
// horizontal overflow at 320 and 375 px; no `style=` anywhere (§2, no style prop); product images
// with srcset/sizes/width/height; 44x44 px hit areas (§7.10, §7.12, §7.19); zoom arrows follow the
// reading direction (§7.14); no transform animation under reduced motion (§3.5). 007 adds: square
// card photos (§7.15), 44x44 px banner buttons, header controls in both header states and row
// arrows (§7.32), and the "All pieces" page in the screen list (no sideways scroll at 320 and
// 375 px, no `style`, `lang`/`dir`, image attributes).

test.describe.configure({ mode: 'serial' });

// 008 US6: the logo tests (title starts with "logo:") run on the phone project too; so do the
// phone-menu tests of 010 US2 (title starts with "nav-menu:").
test.beforeEach(({}, testInfo) => {
  const isLogoTest = testInfo.title.startsWith('logo:') || testInfo.title.startsWith('nav-menu:');
  test.skip(
    isLogoTest
      ? !['chromium-desktop', 'chromium-mobile'].includes(testInfo.project.name)
      : testInfo.project.name !== 'chromium-desktop',
    'Run once, in desktop Chromium (logo tests also on the phone project)',
  );
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
  { name: 'all pieces', path: () => '/shop' },
  { name: 'category', path: () => '/category/sample-ceramics' },
  { name: 'search', path: () => '/search?q=bowl' },
  // The product page of a piece with other published pieces: it has the also-like section.
  { name: 'product', path: () => '/product/sample-clay-mug' },
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
  if (screen.name === 'product') await expect(page.getByTestId('also-like')).toBeVisible();
}

// 008 US2: no business number or VAT wording on the public pages (owner decision, FR-006, FR-008a).
const TAX_STRINGS = [
  'עוסק מורשה',
  'VAT registration',
  'ע.מ.',
  '000000000',
  'כולל מע״מ',
  'incl. VAT',
  'including VAT',
];

test('the home, product and contact pages show no business number and no VAT wording', async ({
  page,
}) => {
  for (const locale of LOCALES) {
    for (const name of ['home', 'product', 'contact']) {
      const screen = SCREENS.find((candidate) => candidate.name === name);
      if (screen === undefined) throw new Error(`no screen ${name}`);
      await open(page, locale, screen);
      const text = await page.locator('body').innerText();
      for (const forbidden of TAX_STRINGS) {
        expect(text, `${locale} ${name} shows "${forbidden}"`).not.toContain(forbidden);
      }
    }
  }
});

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
    await page.goto(`/${locale}/product/sample-clay-mug`);
    const gallery = await page.getByTestId('gallery-track').boundingBox();
    const buyPanel = await page.locator('main h1').boundingBox();
    const brand = await page.getByTestId('header-brand').boundingBox();
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
    for (const path of [
      '',
      '/shop',
      '/category/sample-ceramics',
      '/search?q=bowl',
      '/product/sample-soy-candle',
    ]) {
      await page.goto(`/${locale}${path}`);
      await expect(page.locator('main')).toBeVisible();
      expect(await incomplete(), `${locale} ${path}`).toEqual([]);
      expect(await page.locator('main img').count(), `${locale} ${path}`).toBeGreaterThan(0);
    }

    // The zoom dialog's image, once the dialog is open.
    await page.goto(`/${locale}/product/sample-soy-candle`);
    await hydrated(page, 'gallery-zoom');
    await page.getByTestId('gallery-zoom').click();
    await expect(page.locator('dialog img')).toHaveCount(1);
    expect(await incomplete(), `${locale} zoom dialog`).toEqual([]);
    await page.keyboard.press('Escape');

    // Cart, checkout and order lines (they show a thumbnail when the product has a photo).
    await putCartItem(page, 'sample-clay-mug');
    await page.goto(`/${locale}/product/sample-clay-mug`);
    const drawer = await openCartDrawer(page);
    await expect(drawer.locator('img').first()).toBeVisible({ timeout: 20_000 });
    expect(await incomplete(), `${locale} cart drawer`).toEqual([]);
    await page.keyboard.press('Escape');
    await putCartItem(page, 'sample-clay-mug');
    await page.goto(`/${locale}/checkout`);
    await expect(page.locator('main img').first()).toBeVisible({ timeout: 20_000 });
    expect(await incomplete(), `${locale} /checkout`).toEqual([]);
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

      await page.goto(`/${locale}/product/sample-clay-mug`);
      await expect(page.getByTestId('add-to-cart')).toBeVisible();
      expect(await smallTargets(page, HEADER_CONTROLS), label('header')).toEqual([]);
      expect(
        await smallTargets(page, '[data-testid="buy-row"] button, [data-testid="option-chip"]'),
        label('buy box'),
      ).toEqual([]);

      await putCartItem(page, 'sample-clay-mug');
      await page.goto(`/${locale}/product/sample-clay-mug`);
      const drawer = await openCartDrawer(page);
      await expect(drawer.getByTestId('cart-line')).toHaveCount(1, { timeout: 20_000 });
      expect(
        await smallTargets(page, '#cart-drawer button, #cart-drawer a'),
        label('cart drawer'),
      ).toEqual([]);
      await page.keyboard.press('Escape');

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
    await page.goto(`/${locale}/product/sample-soy-candle`);
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
  await page.goto('/he/product/sample-clay-mug');
  await hydrated(page, 'add-to-cart');
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('added-to-cart-row')).toBeVisible();
  expect(await badgeAnimation(), 'control').toBe('badge-pop');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/he/product/sample-clay-mug');
  await hydrated(page, 'add-to-cart');
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('added-to-cart-row')).toBeVisible();
  await expect(page.getByTestId('add-to-cart')).toContainText('נוסף לסל');
  expect(await badgeAnimation(), 'reduced motion').toBe('none');
});

test('product-card photo boxes are square in the home row, All pieces, a category and search', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const places = [
    { name: 'home row', path: '', scope: '[data-testid="home-row-track"]' },
    { name: 'all pieces', path: '/shop', scope: 'main' },
    { name: 'category', path: '/category/sample-ceramics', scope: 'main' },
    { name: 'search', path: '/search?q=bowl', scope: 'main' },
  ];
  for (const locale of LOCALES) {
    for (const place of places) {
      await page.goto(`/${locale}${place.path}`);
      const cards = page.locator(`${place.scope} [data-testid="product-card"]`);
      const count = await cards.count();
      expect(count, `${locale} ${place.name}: cards`).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) {
        const well = await cards.nth(i).locator(':scope > span').first().boundingBox();
        if (!well) throw new Error(`${locale} ${place.name}: no photo box`);
        expect(
          Math.abs(well.width - well.height),
          `${locale} ${place.name} card ${String(i)}: ${well.width.toFixed(1)}x${well.height.toFixed(1)}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  }
});

test('on the home page the banner buttons and every header control are 44 by 44 px, at the top and scrolled', async ({
  page,
}) => {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const locale of LOCALES) {
      const label = (what: string): string => `${locale} ${what} at ${String(width)} px`;
      await page.goto(`/${locale}`);
      await expect(page.getByTestId('home-banner-child')).toBeVisible();
      expect(
        await smallTargets(page, '[data-testid="home-banner-button"]'),
        label('banners'),
      ).toEqual([]);
      expect(await smallTargets(page, HEADER_CONTROLS), label('header at the top')).toEqual([]);

      await page.evaluate(() => {
        window.scrollTo({ top: 400, left: 0, behavior: 'instant' });
      });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
      expect(await smallTargets(page, HEADER_CONTROLS), label('header scrolled')).toEqual([]);
    }
  }
});

test('header at 320, 375, 900, 1024 and 1280 px: search is the menu sheet below 1024 px and the field from 1024 px, no visible control overlaps another or the brand, a long shop name does not widen the logo (default and long shop names)', async ({
  page,
}) => {
  const [original] = await sql<{ he: string; en: string | null }[]>`
    SELECT shop_name_he AS he, shop_name_en AS en FROM shop_settings WHERE id = 1`;
  if (!original) throw new Error('No settings row');
  const names: (string | null)[] = [
    null,
    'Aviva Knitted Toys 2026',
    'Abcdefghijklmnopqrstuvwxy Knitted Toys And Wool Things For You Today'.slice(0, 60),
    'סטודיו אביבה לבובות סרוגות ולמוצרי צמר עבודת יד מיוחדים בשבילכם היום'.slice(0, 60),
  ];
  try {
    for (const name of names) {
      if (name === null) {
        await sql`UPDATE shop_settings SET shop_name_he = ${original.he}, shop_name_en = ${original.en} WHERE id = 1`;
      } else {
        await sql`UPDATE shop_settings SET shop_name_he = ${name}, shop_name_en = ${name} WHERE id = 1`;
      }
      for (const width of [320, 375, 900, 1024, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        for (const locale of LOCALES) {
          for (const path of ['', '/shop']) {
            const label = `${locale}${path} at ${String(width)} px, name ${name ?? 'default'}`;
            await page.goto(`/${locale}${path}`);
            const header = page.getByTestId('site-header');
            await expect(header, label).toBeVisible();
            // 007 (FR-043): no search icon link any more. The search is the field in the header
            // row from 1024 px (the breakpoint where the menu button goes), and the first thing in
            // the menu sheet below it.
            const wide = width >= 1024;
            await expect(
              header.locator('a[href$="/search"]'),
              `${label}: no search link`,
            ).toHaveCount(0);
            await expect(
              header.getByTestId('header-search'),
              `${label}: header search field`,
            ).toBeVisible({ visible: wide });
            await expect(
              header.locator('[popovertarget="site-menu"]:visible'),
              `${label}: menu button`,
            ).toHaveCount(wide ? 0 : 1);
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
              ),
              `${label}: sideways scroll`,
            ).toBeLessThanOrEqual(0);

            const brand = await page.getByTestId('header-brand').boundingBox();
            if (!brand) throw new Error(`${label}: no brand box`);
            const controls = await header.locator('a, button').evaluateAll((nodes, brandId) => {
              // The part of a control that can be seen: its box cut by every clipping ancestor.
              const visibleBox = (node: Element) => {
                const r = node.getBoundingClientRect();
                let left = r.left;
                let right = r.right;
                for (let el = node.parentElement; el; el = el.parentElement) {
                  const style = getComputedStyle(el);
                  if (style.overflowX === 'visible') continue;
                  const c = el.getBoundingClientRect();
                  left = Math.max(left, c.left);
                  right = Math.min(right, c.right);
                }
                return { x: left, right };
              };
              return nodes
                .filter(
                  (node) =>
                    node.getAttribute('data-testid') !== brandId &&
                    (node as HTMLElement).getClientRects().length > 0,
                )
                .map((node) => {
                  const v = visibleBox(node);
                  return {
                    name: node.getAttribute('aria-label') ?? node.textContent,
                    x: v.x,
                    right: v.right,
                  };
                })
                .filter((control) => control.right > control.x);
            }, 'header-brand');
            for (const control of controls) {
              const overlaps =
                control.x < brand.x + brand.width - 0.5 && control.right > brand.x + 0.5;
              expect(overlaps, `${label}: "${control.name}" overlaps the brand`).toBe(false);
            }
            // No two visible controls overlap each other (contracts/ui.md "Page frame").
            for (const [i, a] of controls.entries()) {
              for (const b of controls.slice(i + 1)) {
                const overlaps = a.x < b.right - 0.5 && a.right > b.x + 0.5;
                expect(overlaps, `${label}: "${a.name}" overlaps "${b.name}"`).toBe(false);
              }
            }
            // 009: the logo link is 93/107 px plus 8 px padding each side; a long name does not
            // widen it (it is only the alt text and the link's accessible name).
            expect(brand.width, `${label}: brand width is the logo size`).toBeLessThanOrEqual(
              width >= 900 ? 123.5 : 109.5,
            );
            await expect(page.getByTestId('header-logo'), `${label}: logo alt`).toHaveAttribute(
              'alt',
              name ?? (locale === 'he' ? original.he : (original.en ?? original.he)),
            );
          }
        }
      }
    }
  } finally {
    await sql`UPDATE shop_settings SET shop_name_he = ${original.he}, shop_name_en = ${original.en} WHERE id = 1`;
  }
});

test('the home row arrows are 44 by 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // The three samples fit in one row without arrows: add three published pieces to "featured".
  const [sample] = await sql<
    { id: string }[]
  >`SELECT id FROM product WHERE slug = 'sample-clay-mug'`;
  const [featured] = await sql<{ id: string }[]>`SELECT id FROM category WHERE slug = 'featured'`;
  if (!sample || !featured) throw new Error('Missing sample data');
  try {
    for (let i = 1; i <= 3; i += 1) {
      const [created] = await sql<{ id: string }[]>`
        INSERT INTO product (slug, name_he, name_en, price_ils_minor, state, orderable, published_at)
        VALUES (${`e2e-layout-${String(i)}`}, ${`יצירה ${String(i)}`}, ${`Piece ${String(i)}`}, 5500,
                'published', true, now() - ${`${String(i)} hours`}::interval)
        RETURNING id`;
      if (!created) throw new Error('Could not insert a piece');
      await sql`
        INSERT INTO product_image (product_id, storage_key, width, height, alt_he, alt_en, position)
        SELECT ${created.id}, storage_key, width, height, alt_he, alt_en, position
        FROM product_image WHERE product_id = ${sample.id} AND deleted_at IS NULL`;
      await sql`INSERT INTO product_category (product_id, category_id) VALUES (${created.id}, ${featured.id})`;
    }
    for (const locale of LOCALES) {
      await page.goto(`/${locale}`);
      await expect(page.getByTestId('home-row-next')).toBeVisible();
      expect(
        await smallTargets(
          page,
          '[data-testid="home-row-previous"], [data-testid="home-row-next"], [data-testid="home-row-view-all"]',
        ),
        `${locale} row arrows and view-all link`,
      ).toEqual([]);
    }
  } finally {
    await sql`DELETE FROM product WHERE slug LIKE 'e2e-layout-%'`; // photos and links cascade
  }
});

async function expectSquare(
  boxes: ReturnType<Page['locator']>,
  label: string,
  minimum = 1,
): Promise<void> {
  const count = await boxes.count();
  expect(count, `${label}: boxes`).toBeGreaterThanOrEqual(minimum);
  for (let i = 0; i < count; i += 1) {
    const box = await boxes.nth(i).boundingBox();
    if (!box) throw new Error(`${label}: no box`);
    expect(
      Math.abs(box.width - box.height),
      `${label} ${String(i)}: ${box.width.toFixed(1)}x${box.height.toFixed(1)}`,
    ).toBeLessThanOrEqual(1);
  }
}

test('the gallery main photo box and the thumbnails are square', async ({ page }) => {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const locale of LOCALES) {
      // The soy candle has two photos, so it has thumbnails.
      await page.goto(`/${locale}/product/sample-soy-candle`);
      const label = `${locale} at ${String(width)} px`;
      await expectSquare(page.getByTestId('gallery-track'), `${label} main`);
      await expectSquare(
        page.locator('[data-testid="gallery-track"] > [data-index]'),
        `${label} slides`,
        2,
      );
      await expectSquare(
        page.locator('[data-testid="gallery-thumbnails"] button'),
        `${label} thumbnails`,
        2,
      );
    }
  }
});

test('cart line and checkout summary thumbnails are square', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const locale of LOCALES) {
    await putCartItem(page, 'sample-clay-mug');
    await page.goto(`/${locale}/product/sample-clay-mug`);
    await openCartDrawer(page);
    await expect(page.getByTestId('cart-line')).toHaveCount(1, { timeout: 20_000 });
    const cartThumb = page.locator('[data-testid="cart-line"] > span:has(img)');
    await expect(cartThumb).toHaveCount(1);
    await expectSquare(cartThumb, `${locale} cart line`);

    await page.goto(`/${locale}/checkout`);
    await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
    const summaryThumb = page.locator('[data-testid="order-summary-line"] > span:has(img)');
    await expect(summaryThumb.first()).toBeVisible({ timeout: 20_000 });
    await expectSquare(summaryThumb, `${locale} checkout summary`);
  }
});

// ---------------------------------------------------------------------------------------------
// 007 Phase D gate (tasks.md T074; research D20; contracts/ui.md "Page frame"; spec FR-007, FR-008,
// FR-039-FR-043; storefront.md §7.17, §7.18, §7.33, §11). Written before the new header exists,
// so these fail until T077-T079. Test data is set by SQL and restored in `finally`.
// ---------------------------------------------------------------------------------------------

const INK_RGB = 'rgb(6, 20, 6)'; // #061406
const FOUR_LABELS = {
  he: {
    all: 'כל היצירות',
    about: 'אודות',
    shipping: 'משלוחים והחזרות',
    contact: 'יצירת קשר',
    menuNav: 'תפריט האתר',
    langLink: 'English',
    langName: 'EN – English',
  },
  en: {
    all: 'All pieces',
    about: 'About',
    shipping: 'Shipping & returns',
    contact: 'Contact',
    menuNav: 'Site menu',
    langLink: 'עברית',
    langName: 'עב – עברית',
  },
} as const;

interface CategoryName {
  slug: string;
  he: string;
  en: string | null;
}

async function categoryIds(): Promise<Record<string, string>> {
  const rows = await sql<{ id: string; slug: string }[]>`SELECT id, slug FROM category`;
  return Object.fromEntries(rows.map((row) => [row.slug, row.id]));
}

/** Header categories by SQL: candles = header 1, ceramics = header 2, home row = "featured". */
async function setHeaderCategories(one: string | null, two: string | null): Promise<void> {
  const ids = await categoryIds();
  const idOf = (slug: string | null): string | null => (slug === null ? null : (ids[slug] ?? null));
  await sql`UPDATE shop_settings
    SET header_category_1_id = ${idOf(one)}, header_category_2_id = ${idOf(two)} WHERE id = 1`;
}

async function clearHeaderCategories(): Promise<void> {
  await sql`UPDATE shop_settings SET header_category_1_id = NULL, header_category_2_id = NULL
    WHERE id = 1`;
}

async function readCategoryNames(): Promise<CategoryName[]> {
  return sql<CategoryName[]>`SELECT slug, name_he AS he, name_en AS en FROM category`;
}

async function restoreCategoryNames(names: CategoryName[]): Promise<void> {
  for (const name of names) {
    await sql`UPDATE category SET name_he = ${name.he}, name_en = ${name.en} WHERE slug = ${name.slug}`;
  }
}

/** Header, mounted controls: visible `a` and the search form as one box, plus visible buttons and inputs. */
async function visibleHeaderControls(
  page: Page,
): Promise<
  { name: string; testId: string | null; x: number; y: number; right: number; bottom: number }[]
> {
  return page.evaluate(() => {
    const header = document.querySelector('#site-header');
    if (!header) return [];
    const search = header.querySelector('[data-testid="header-search"]');
    const nodes = [...header.querySelectorAll<HTMLElement>('a, button')].filter(
      (node) => (search === null || !search.contains(node)) && node.getClientRects().length > 0,
    );
    if (search instanceof HTMLElement && search.getClientRects().length > 0) nodes.push(search);
    return nodes
      .map((node) => {
        const r = node.getBoundingClientRect();
        return {
          name: (
            node.getAttribute('aria-label') ??
            node.getAttribute('data-testid') ??
            node.textContent
          )
            .trim()
            .slice(0, 30),
          testId: node.getAttribute('data-testid'),
          x: r.left,
          y: r.top,
          right: r.right,
          bottom: r.bottom,
        };
      })
      .filter((box) => box.right > box.x && box.bottom > box.y);
  });
}

function expectNoOverlap(
  boxes: { name: string; x: number; y: number; right: number; bottom: number }[],
  label: string,
): void {
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (!a || !b) continue;
      const intersects =
        a.x < b.right - 0.5 && a.right > b.x + 0.5 && a.y < b.bottom - 0.5 && a.bottom > b.y + 0.5;
      expect(intersects, `${label}: "${a.name}" intersects "${b.name}"`).toBe(false);
    }
  }
}

async function noSidewaysScroll(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: sideways scroll`).toBeLessThanOrEqual(0);
}

test('from 1024 px the header is one row in the owner order, in reading order, with no menu button', async ({
  page,
}) => {
  await setHeaderCategories('sample-candles', 'sample-ceramics');
  try {
    const ids = await categoryIds();
    expect(ids['featured']).toBeDefined();
    for (const width of [1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      for (const locale of LOCALES) {
        const l = FOUR_LABELS[locale];
        const names =
          locale === 'he' ? ['נרות', 'קרמיקה', 'מומלצות'] : ['Candles', 'Ceramics', 'Featured'];
        for (const path of ['', '/shop']) {
          const label = `${locale}${path} at ${String(width)} px`;
          await page.goto(`/${locale}${path}`);
          const nav = page.getByTestId('site-header').getByRole('navigation', { name: l.menuNav });
          await expect(nav, label).toBeVisible();
          const links = nav.getByRole('link');
          await expect(links, `${label}: nav links`).toHaveText([
            l.all,
            names[0] as string,
            names[1] as string,
            names[2] as string,
            l.about,
            l.shipping,
          ]);
          // The menu button is not visible from 1024 px.
          await expect(
            page.locator('#site-header button[popovertarget="site-menu"]'),
            `${label}: menu button`,
          ).toBeHidden();

          // Reading order: nav links, brand, search, cart.
          const x = async (selector: string): Promise<number> => {
            const box = await page.locator(selector).first().boundingBox();
            if (!box) throw new Error(`${label}: no box for ${selector}`);
            return box.x + box.width / 2;
          };
          const sequence: number[] = [];
          for (let i = 0; i < 6; i += 1) {
            const box = await links.nth(i).boundingBox();
            if (!box) throw new Error(`${label}: no link box ${String(i)}`);
            sequence.push(box.x + box.width / 2);
          }
          sequence.push(await x('[data-testid="header-brand"]'));
          sequence.push(await x('[data-testid="header-search"]'));
          sequence.push(await x('[data-testid="cart-link"]'));
          for (let i = 1; i < sequence.length; i += 1) {
            const prev = sequence[i - 1] as number;
            const current = sequence[i] as number;
            expect(
              locale === 'he' ? current < prev : current > prev,
              `${label}: item ${String(i)} follows item ${String(i - 1)} in reading order`,
            ).toBe(true);
          }

          const boxes = await visibleHeaderControls(page);
          expectNoOverlap(boxes, label);
          const brand = boxes.find((box) => box.testId === 'header-brand');
          expect(brand, `${label}: brand box`).toBeDefined();
          await noSidewaysScroll(page, label);
        }
      }
    }
  } finally {
    await clearHeaderCategories();
  }
});

// Owner fix 2026-11-17: the brand sits in the middle of the free space between the links and the
// search field from 1024 px, and stays centred in the bar below that.
test('the brand is centred between the nav and the search form from 1024 px, and in the bar at 375 px', async ({
  page,
}) => {
  const gap = (a: { x: number; width: number }, b: { x: number; width: number }): number =>
    Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
  const boxOf = async (selector: string): Promise<{ x: number; width: number }> => {
    const found = await page.locator(selector).first().boundingBox();
    if (!found) throw new Error(`no box for ${selector}`);
    return found;
  };
  for (const locale of LOCALES) {
    for (const width of [1024, 1280]) {
      const label = `${locale} at ${String(width)} px`;
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/${locale}`);
      const nav = await boxOf('#site-header nav');
      const brand = await boxOf('[data-testid="header-brand"]');
      const search = await boxOf('[data-testid="header-search"]');
      const before = gap(brand, nav);
      const after = gap(brand, search);
      expect(before, `${label}: room between the nav and the brand`).toBeGreaterThan(0);
      expect(
        Math.abs(before - after),
        `${label}: ${String(before)} vs ${String(after)}`,
      ).toBeLessThanOrEqual(2);
    }
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/${locale}`);
    const header = await boxOf('#site-header');
    const brand = await boxOf('[data-testid="header-brand"]');
    expect(
      Math.abs(brand.x + brand.width / 2 - (header.x + header.width / 2)),
      `${locale} at 375 px: brand centred in the bar`,
    ).toBeLessThanOrEqual(2);
  }
});

test('from 1024 px a 60-character shop name leaves the logo at its size and in the alt text and link name', async ({
  page,
}) => {
  const [original] = await sql<{ he: string; en: string | null }[]>`
    SELECT shop_name_he AS he, shop_name_en AS en FROM shop_settings WHERE id = 1`;
  if (!original) throw new Error('No settings row');
  const name = 'Abcdefghijklmnopqrstuvwxy Knitted Toys And Wool Things For You Today'.slice(0, 60);
  await sql`UPDATE shop_settings SET shop_name_he = ${name}, shop_name_en = ${name} WHERE id = 1`;
  await setHeaderCategories('sample-candles', 'sample-ceramics');
  try {
    for (const width of [1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      for (const locale of LOCALES) {
        const label = `${locale} at ${String(width)} px`;
        await page.goto(`/${locale}`);
        const brand = page.getByTestId('header-brand');
        await expect(brand, label).toBeVisible();
        const box = await brand.boundingBox();
        if (!box) throw new Error(`${label}: no brand box`);
        expect(box.width, `${label}: brand width`).toBeLessThanOrEqual(123.5);
        await expect(page.getByTestId('header-logo'), `${label}: alt`).toHaveAttribute('alt', name);
        await expect(brand, `${label}: link name`).toHaveAccessibleName(homeName(name, locale));
        expectNoOverlap(await visibleHeaderControls(page), label);
        await noSidewaysScroll(page, label);
      }
    }
  } finally {
    await sql`UPDATE shop_settings SET shop_name_he = ${original.he}, shop_name_en = ${original.en} WHERE id = 1`;
    await clearHeaderCategories();
  }
});

test('tabbing through every header control keeps each focused element fully inside the viewport and the header', async ({
  page,
}) => {
  await setHeaderCategories('sample-candles', 'sample-ceramics');
  try {
    for (const width of [1024, 1280, 375]) {
      await page.setViewportSize({ width, height: 800 });
      for (const locale of LOCALES) {
        const label = `${locale} at ${String(width)} px`;
        await page.goto(`/${locale}`);
        await expect(page.getByTestId('site-header')).toBeVisible();
        let inHeader = 0;
        for (let i = 0; i < 40; i += 1) {
          await page.keyboard.press('Tab');
          const result = await page.evaluate(() => {
            const active = document.activeElement;
            const header = document.querySelector('#site-header');
            if (!active || !header || !header.contains(active)) return null;
            const own = active.getBoundingClientRect();
            let left = own.left;
            let right = own.right;
            let top = own.top;
            let bottom = own.bottom;
            const clip = (r: DOMRect) => {
              left = Math.max(left, r.left);
              right = Math.min(right, r.right);
              top = Math.max(top, r.top);
              bottom = Math.min(bottom, r.bottom);
            };
            clip(new DOMRect(0, 0, window.innerWidth, window.innerHeight));
            clip(header.getBoundingClientRect());
            for (let el = active.parentElement; el; el = el.parentElement) {
              const style = getComputedStyle(el);
              if (style.overflowX !== 'visible' || style.overflowY !== 'visible')
                clip(el.getBoundingClientRect());
            }
            return {
              name: (active.getAttribute('aria-label') ?? active.textContent).trim(),
              full: { w: own.width, h: own.height },
              visible: { w: Math.max(0, right - left), h: Math.max(0, bottom - top) },
            };
          });
          if (result === null) continue;
          inHeader += 1;
          expect(
            result.visible.w,
            `${label}: "${result.name}" width visible`,
          ).toBeGreaterThanOrEqual(result.full.w - 0.5);
          expect(
            result.visible.h,
            `${label}: "${result.name}" height visible`,
          ).toBeGreaterThanOrEqual(result.full.h - 0.5);
        }
        // Wide: 6 links + brand + search field (and button) + cart; phone: menu button, brand, cart.
        expect(inHeader, `${label}: header stops reached by Tab`).toBeGreaterThanOrEqual(
          width >= 1024 ? 9 : 3,
        );
      }
    }
  } finally {
    await clearHeaderCategories();
  }
});

test('at 1024 px ordinary 12-character category names show in full, wide-letter ones are cut with an ellipsis and never overlap', async ({
  page,
}) => {
  const original = await readCategoryNames();
  await setHeaderCategories('sample-candles', 'sample-ceramics');
  const slugs = ['sample-candles', 'sample-ceramics', 'featured'];
  const cases = [
    { kind: 'ordinary', he: 'סלסלות קטנות', en: 'Small hearts' },
    { kind: 'wide', he: 'שששששששששששש', en: 'WWWWWWWWWWWW' },
  ] as const;
  try {
    await page.setViewportSize({ width: 1024, height: 800 });
    for (const sample of cases) {
      for (const slug of slugs) {
        await sql`UPDATE category SET name_he = ${sample.he}, name_en = ${sample.en} WHERE slug = ${slug}`;
      }
      for (const locale of LOCALES) {
        const label = `${locale} ${sample.kind} names at 1024 px`;
        await page.goto(`/${locale}`);
        const spans = page
          .getByTestId('site-header')
          .getByRole('navigation', { name: FOUR_LABELS[locale].menuNav })
          .locator('a[href*="/category/"] > span');
        await expect(spans, label).toHaveCount(3);
        const measured = await spans.evaluateAll((nodes) =>
          nodes.map((node) => {
            const style = getComputedStyle(node);
            return {
              text: node.textContent,
              width: node.clientWidth,
              fits: node.scrollWidth <= node.clientWidth,
              overflow: style.overflowX,
              textOverflow: style.textOverflow,
            };
          }),
        );
        for (const span of measured) {
          if (sample.kind === 'ordinary') {
            expect(span.width, `${label}: "${span.text}" is a box with width`).toBeGreaterThan(0);
            expect(span.fits, `${label}: "${span.text}" shown in full`).toBe(true);
          } else {
            expect(span.overflow, `${label}: overflow of "${span.text}"`).toBe('hidden');
            expect(span.textOverflow, `${label}: text-overflow of "${span.text}"`).toBe('ellipsis');
          }
        }
        const boxes = await visibleHeaderControls(page);
        expectNoOverlap(boxes, label);
        for (const box of boxes) {
          expect(box.x, `${label}: "${box.name}" left edge`).toBeGreaterThanOrEqual(-0.5);
          expect(box.right, `${label}: "${box.name}" right edge`).toBeLessThanOrEqual(1024.5);
        }
        await noSidewaysScroll(page, label);
      }
    }
  } finally {
    await restoreCategoryNames(original);
    await clearHeaderCategories();
  }
});

test('below 1024 px only the menu button, brand and cart show in the header; the sheet holds the rest', async ({
  page,
}) => {
  await setHeaderCategories('sample-candles', null);
  try {
    for (const width of [320, 375, 900, 1023]) {
      await page.setViewportSize({ width, height: 800 });
      for (const locale of LOCALES) {
        const l = FOUR_LABELS[locale];
        const label = `${locale} at ${String(width)} px`;
        await page.goto(`/${locale}`);
        await expect(page.getByTestId('site-header')).toBeVisible();
        const boxes = await visibleHeaderControls(page);
        expect(
          boxes.map((box) => box.testId ?? box.name).length,
          `${label}: visible controls`,
        ).toBe(3);
        const testIds = boxes.map((box) => box.testId);
        expect(testIds, `${label}: brand and cart`).toEqual(
          expect.arrayContaining(['header-brand', 'cart-link']),
        );
        expect(
          boxes.filter((box) => box.testId !== 'header-brand' && box.testId !== 'cart-link'),
          `${label}: the third one is the menu button`,
        ).toHaveLength(1);
        expectNoOverlap(boxes, label);
        await noSidewaysScroll(page, label);
        await expect(
          page.getByTestId('header-search'),
          `${label}: no search in the bar`,
        ).toBeHidden();
        await expect(
          page.locator('#site-header a[href^="/api/locale"]:not(#site-menu *)'),
          `${label}: no language switch in the bar`,
        ).toHaveCount(0);

        await page.locator('#site-header button[popovertarget="site-menu"]').click();
        const sheet = page.locator('#site-menu');
        await expect(sheet, label).toBeVisible();
        await expect(sheet.getByTestId('menu-search'), `${label}: menu search`).toBeVisible();
        // FR-044: the close button comes first, then the search form.
        const order = await sheet.evaluate((node) => {
          const items = [...node.querySelectorAll('a, input, button')].filter(
            (el) => el.getClientRects().length > 0,
          );
          return {
            first: items[0]?.getAttribute('data-testid'),
            afterClose: items[1]?.closest('[data-testid="menu-search"]') !== null,
          };
        });
        expect(order.first, `${label}: the close button is the first item of the drawer`).toBe(
          'menu-close',
        );
        expect(order.afterClose, `${label}: the search form is the first item after it`).toBe(true);
        const text = (await sheet.locator('a').allInnerTexts()).map((t) => t.trim());
        const names =
          locale === 'he' ? ['נרות', 'קרמיקה', 'מומלצות'] : ['Candles', 'Ceramics', 'Featured'];
        for (const wanted of [l.all, ...names, l.about, l.shipping, l.contact, l.langLink]) {
          expect(text, `${label}: sheet holds "${wanted}"`).toContain(wanted);
        }
        await noSidewaysScroll(page, `${label} with the sheet open`);
      }
    }
  } finally {
    await clearHeaderCategories();
  }
});

test('the header search: Enter opens the search page, it works without JavaScript, it is 44 px tall and readable', async ({
  page,
  browser,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/he');
  const input = page.getByTestId('header-search-input');
  await expect(input).toBeVisible();
  const form = page.getByTestId('header-search');
  await expect(form).toHaveAttribute('role', 'search');
  expect((await input.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  expect((await form.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  // Over the photo at scroll 0 the field's text is ink (not inherited white).
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await input.evaluate((node) => getComputedStyle(node).color)).toBe(INK_RGB);

  // The ring sits on the round form (forest, 2 px), the input draws none, whether the page is at
  // the top over the photo or scrolled (white bar), and the button is marked when it has focus.
  const FOREST_RGB = 'rgb(30, 70, 32)';
  const ringState = () =>
    page.evaluate(() => {
      const form = document.querySelector('[data-testid="header-search"]');
      const field = document.querySelector('[data-testid="header-search-input"]');
      const button = form?.querySelector('button');
      if (!form || !field || !button) throw new Error('no header search parts');
      const formStyle = getComputedStyle(form);
      return {
        formStyle: formStyle.outlineStyle,
        formWidth: Number.parseFloat(formStyle.outlineWidth),
        formColor: formStyle.outlineColor,
        inputStyle: getComputedStyle(field).outlineStyle,
        buttonStyle: getComputedStyle(button).outlineStyle,
        buttonBg: getComputedStyle(button).backgroundColor,
        scrollY: window.scrollY,
      };
    });
  const expectRing = (state: Awaited<ReturnType<typeof ringState>>, label: string) => {
    expect(state.formStyle, `${label}: the form has the outline`).toBe('solid');
    expect(state.formWidth, `${label}: ring width`).toBeGreaterThanOrEqual(2);
    expect(state.formColor, `${label}: the ring is forest, not ink`).toBe(FOREST_RGB);
    expect(state.inputStyle, `${label}: the input draws no outline of its own`).toBe('none');
  };

  await page.keyboard.press('Tab'); // make sure the next focus counts as keyboard focus
  await input.focus();
  const atTop = await ringState();
  expect(atTop.scrollY, 'over the photo').toBe(0);
  expectRing(atTop, 'at scroll 0');
  const idleButtonBg = atTop.buttonBg;

  await page.keyboard.press('Tab'); // input -> submit button
  await expect(form.getByRole('button')).toBeFocused();
  const onButton = await ringState();
  expectRing(onButton, 'button focused');
  expect(onButton.buttonBg, 'the focused button is marked').not.toBe(idleButtonBg);

  await page.evaluate(() => {
    window.scrollTo({ top: 600, left: 0, behavior: 'instant' });
  });
  await input.focus();
  const scrolled = await ringState();
  expect(scrolled.scrollY, 'scrolled down').toBeGreaterThan(0);
  expectRing(scrolled, 'scrolled, white bar');
  await input.fill('bowl');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/he\/search\?q=bowl$/);

  await page.goto('/en');
  await page.getByTestId('header-search-input').fill('bowl');
  await page.getByTestId('header-search-input').press('Enter');
  await expect(page).toHaveURL(/\/en\/search\?q=bowl$/);

  // Without JavaScript.
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: String(testInfo.project.use.baseURL),
    viewport: { width: 1280, height: 800 },
  });
  try {
    const bare = await context.newPage();
    await bare.goto('/he');
    await bare.getByTestId('header-search-input').fill('bowl');
    await bare.getByTestId('header-search-input').press('Enter');
    await expect(bare).toHaveURL(/\/he\/search\?q=bowl$/);
  } finally {
    await context.close();
  }

  // From the menu sheet on a phone.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/he');
  await page.locator('#site-header button[popovertarget="site-menu"]').click();
  await page.getByTestId('menu-search-input').fill('bowl');
  await page.getByTestId('menu-search-input').press('Enter');
  await expect(page).toHaveURL(/\/he\/search\?q=bowl$/);
});

test('the language switch is inside the strip on every width and not in the header bar', async ({
  page,
}) => {
  for (const width of [320, 375, 900, 1024, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const locale of LOCALES) {
      const l = FOUR_LABELS[locale];
      const target = locale === 'he' ? 'en' : 'he';
      const label = `${locale} at ${String(width)} px`;
      await page.goto(`/${locale}/shop`);
      const strip = page.getByTestId('announcement-bar');
      await expect(strip, label).toBeVisible();
      const link = strip.locator('a[href^="/api/locale"]');
      await expect(link, `${label}: one switch in the strip`).toHaveCount(1);
      await expect(link, `${label}: accessible name`).toHaveAttribute('aria-label', l.langName);
      await expect(link, `${label}: target`).toHaveAttribute('href', new RegExp(`to=${target}`));
      await expect(
        page.locator('#site-header a[href^="/api/locale"]:not(#site-menu *)'),
        `${label}: none in the header bar`,
      ).toHaveCount(0);
    }
  }
});

test('with no free-shipping amount and pickup off the strip still shows, holding only the switch', async ({
  page,
}) => {
  const [zone] = await sql<
    { id: string; threshold: number | null; pickup: boolean }[]
  >`SELECT id, free_shipping_threshold_minor AS threshold, pickup_enabled AS pickup
    FROM shipping_zone WHERE code = 'IL'`;
  if (!zone) throw new Error('No Israel zone');
  await sql`UPDATE shipping_zone SET free_shipping_threshold_minor = NULL, pickup_enabled = false
    WHERE id = ${zone.id}`;
  try {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      for (const locale of LOCALES) {
        const label = `${locale} at ${String(width)} px`;
        await page.goto(`/${locale}`);
        const strip = page.getByTestId('announcement-bar');
        await expect(strip, label).toBeVisible();
        await expect(strip.locator('a[href^="/api/locale"]'), label).toHaveCount(1);
        const extra = await strip.evaluate((node) => {
          const copy = node.cloneNode(true) as HTMLElement;
          copy.querySelectorAll('a').forEach((a) => {
            a.remove();
          });
          return copy.textContent.trim();
        });
        expect(extra, `${label}: the strip holds only the switch`).toBe('');
      }
    }
  } finally {
    await sql`UPDATE shipping_zone SET free_shipping_threshold_minor = ${zone.threshold},
      pickup_enabled = ${zone.pickup} WHERE id = ${zone.id}`;
  }
});

test("the strip's focused switch has its outline inside the viewport and above the header's top edge", async ({
  page,
}) => {
  for (const width of [1024, 375]) {
    await page.setViewportSize({ width, height: 800 });
    for (const locale of LOCALES) {
      const label = `${locale} at ${String(width)} px`;
      await page.goto(`/${locale}`);
      const link = page.getByTestId('announcement-bar').locator('a[href^="/api/locale"]');
      // Reach the switch with the keyboard: the first Tab stop after the skip link(s).
      for (let i = 0; i < 6; i += 1) {
        await page.keyboard.press('Tab');
        if (await link.evaluate((node) => node === document.activeElement)) break;
      }
      await expect(link, `${label}: reached with Tab`).toBeFocused();
      const ring = await link.evaluate((node) => {
        const style = getComputedStyle(node);
        const r = node.getBoundingClientRect();
        const grow =
          (Number.parseFloat(style.outlineWidth) || 0) +
          (Number.parseFloat(style.outlineOffset) || 0);
        const header = document.querySelector('#site-header')?.getBoundingClientRect();
        return {
          visible:
            style.outlineStyle !== 'none' && (Number.parseFloat(style.outlineWidth) || 0) > 0,
          left: r.left - grow,
          right: r.right + grow,
          top: r.top - grow,
          bottom: r.bottom + grow,
          headerTop: header?.top ?? 0,
          viewport: window.innerWidth,
        };
      });
      expect(ring.visible, `${label}: visible outline`).toBe(true);
      expect(ring.left, `${label}: outline left`).toBeGreaterThanOrEqual(-0.5);
      expect(ring.right, `${label}: outline right`).toBeLessThanOrEqual(ring.viewport + 0.5);
      expect(ring.top, `${label}: outline top`).toBeGreaterThanOrEqual(-0.5);
      expect(ring.bottom, `${label}: outline above the header`).toBeLessThanOrEqual(
        ring.headerTop + 0.5,
      );
    }
  }
});

test("at 320 px the strip's text does not meet the switch and nothing scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const locale of LOCALES) {
    const label = `${locale} at 320 px`;
    await page.goto(`/${locale}`);
    const strip = page.getByTestId('announcement-bar');
    await expect(strip, label).toBeVisible();
    const boxes = await strip.evaluate((node) => {
      const link = node.querySelector('a[href^="/api/locale"]');
      if (!link) return null;
      const l = link.getBoundingClientRect();
      const rects: { left: number; right: number; top: number; bottom: number }[] = [];
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (link.contains(text) || (text.textContent ?? '').trim() === '') continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        for (const r of range.getClientRects())
          rects.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
      return { link: { left: l.left, right: l.right, top: l.top, bottom: l.bottom }, rects };
    });
    if (!boxes) throw new Error(`${label}: no switch in the strip`);
    expect(boxes.rects.length, `${label}: the strip has text`).toBeGreaterThan(0);
    for (const rect of boxes.rects) {
      const meets =
        rect.left < boxes.link.right - 0.5 &&
        rect.right > boxes.link.left + 0.5 &&
        rect.top < boxes.link.bottom - 0.5 &&
        rect.bottom > boxes.link.top + 0.5;
      expect(meets, `${label}: strip text meets the switch`).toBe(false);
    }
    await noSidewaysScroll(page, label);
  }
});

test('with no published piece the desktop nav keeps "All pieces", "About" and "Shipping & returns", and the phone sheet keeps them plus "Contact" and the language link', async ({
  page,
}) => {
  const states = await sql<{ id: string; state: string }[]>`SELECT id, state FROM product`;
  await setHeaderCategories('sample-candles', 'sample-ceramics');
  await sql`UPDATE product SET state = 'draft'`;
  try {
    for (const locale of LOCALES) {
      const l = FOUR_LABELS[locale];
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/${locale}`);
      const nav = page.getByTestId('site-header').getByRole('navigation', { name: l.menuNav });
      await expect(nav, `${locale}: desktop nav`).toBeVisible();
      await expect(nav.getByRole('link'), `${locale}: only the fixed links`).toHaveText([
        l.all,
        l.about,
        l.shipping,
      ]);

      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`/${locale}`);
      await page.locator('#site-header button[popovertarget="site-menu"]').click();
      const sheet = page.locator('#site-menu');
      await expect(sheet).toBeVisible();
      const text = (await sheet.locator('a').allInnerTexts()).map((t) => t.trim());
      for (const wanted of [l.all, l.about, l.shipping, l.contact, l.langLink]) {
        expect(text, `${locale}: sheet holds "${wanted}"`).toContain(wanted);
      }
    }
  } finally {
    for (const row of states)
      await sql`UPDATE product SET state = ${row.state} WHERE id = ${row.id}`;
    await clearHeaderCategories();
  }
});

test('header categories cleared: only All pieces, the home-row category, About and Shipping; home row none: the home-row link goes too', async ({
  page,
}) => {
  const [settings] = await sql<{ home: string | null }[]>`
    SELECT home_category_id AS home FROM shop_settings WHERE id = 1`;
  if (!settings) throw new Error('No settings row');
  await page.setViewportSize({ width: 1280, height: 800 });
  try {
    await clearHeaderCategories();
    for (const locale of LOCALES) {
      const l = FOUR_LABELS[locale];
      const home = locale === 'he' ? 'מומלצות' : 'Featured';
      await page.goto(`/${locale}`);
      const nav = page.getByTestId('site-header').getByRole('navigation', { name: l.menuNav });
      await expect(nav.getByRole('link'), `${locale}: header categories cleared`).toHaveText([
        l.all,
        home,
        l.about,
        l.shipping,
      ]);
    }
    await sql`UPDATE shop_settings SET home_category_id = NULL WHERE id = 1`;
    for (const locale of LOCALES) {
      const l = FOUR_LABELS[locale];
      await page.goto(`/${locale}`);
      const nav = page.getByTestId('site-header').getByRole('navigation', { name: l.menuNav });
      await expect(nav.getByRole('link'), `${locale}: home row none`).toHaveText([
        l.all,
        l.about,
        l.shipping,
      ]);
    }
  } finally {
    await sql`UPDATE shop_settings SET home_category_id = ${settings.home} WHERE id = 1`;
    await clearHeaderCategories();
  }
});

test('the search forms have their accessible names and a limit of 80 characters', async ({
  page,
}) => {
  const names = {
    he: { header: 'חיפוש בחנות', menu: 'חיפוש בתפריט', page: 'חיפוש יצירות' },
    en: { header: 'Search the shop', menu: 'Search from the menu', page: 'Search pieces' },
  } as const;
  for (const locale of LOCALES) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/${locale}`);
    const header = page.getByTestId('header-search');
    await expect(header, `${locale}: header form`).toHaveAttribute('role', 'search');
    await expect(header, `${locale}: header form name`).toHaveAttribute(
      'aria-label',
      names[locale].header,
    );
    await expect(page.getByTestId('header-search-input'), locale).toHaveAttribute(
      'maxlength',
      '80',
    );

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/${locale}`);
    await page.locator('#site-header button[popovertarget="site-menu"]').click();
    const menu = page.getByTestId('menu-search');
    await expect(menu, `${locale}: menu form`).toHaveAttribute('role', 'search');
    await expect(menu, `${locale}: menu form`).toHaveAttribute('aria-label', names[locale].menu);
    await expect(page.getByTestId('menu-search-input'), locale).toHaveAttribute('maxlength', '80');

    await page.goto(`/${locale}/search?q=bowl`);
    await expect(
      page.getByRole('search', { name: names[locale].page }),
      `${locale}: the search page's own form`,
    ).toBeVisible();
  }
});

// 007 T093/T092 (FR-046): the cart drawer at every width, here on a computer; and no sideways
// scroll with a drawer open on phones.
test('the cart drawer at 1280 px: reading-end side, from the header top, 24rem at most, no menu drawer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [locale, side] of [
    ['he', 'left'],
    ['en', 'right'],
  ] as const) {
    await putCartItem(page, 'sample-clay-mug');
    await page.goto(`/${locale}/product/sample-clay-mug`);
    const drawer = await openCartDrawer(page);
    await expect(drawer.getByTestId('cart-line')).toHaveCount(1, { timeout: 20_000 });
    await expectDrawerGeometry(page, 'cart-drawer', side, `${locale} at 1280 px`);
    const width = (await drawer.boundingBox())?.width ?? 0;
    expect(width, `${locale}: at most 24rem wide`).toBeLessThanOrEqual(384 + 1);
    await expect(page.getByTestId('cart-close')).toBeFocused();
    // No menu button and no menu drawer from 1024 px.
    await expect(page.locator('#site-menu')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await nothingLeftOpen(page);
  }
});

test('no sideways scroll at 320 and 375 px with the cart drawer or the menu drawer open', async ({
  page,
}) => {
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 800 });
    for (const locale of LOCALES) {
      await putCartItem(page, 'sample-clay-mug');
      await page.goto(`/${locale}/product/sample-clay-mug`);
      const label = `${locale} at ${String(width)} px`;
      await openCartDrawer(page);
      await noSidewaysScroll(page, `${label} with the cart drawer open`);
      await page.keyboard.press('Escape');
      await page.locator('#site-header button[popovertarget="site-menu"]').click();
      await expect(page.locator('#site-menu')).toBeVisible();
      await transitionsDone(page);
      await noSidewaysScroll(page, `${label} with the menu drawer open`);
      // The menu's X is drawn as an X (the lines have turned), not as three lines.
      const drawn = (await burgerLines(page.getByTestId('menu-close'))).filter(
        (line) => line.opacity > 0.5,
      );
      expect(drawn, `${label}: two crossed lines`).toHaveLength(2);
      await page.keyboard.press('Escape');
    }
  }
});

// ------------------------------------------------------------------ 009: logo in the header

// The name is built from the image alt and the hidden suffix; Chrome may put one space between
// them, which a screen reader does not voice.
function homeName(name: string, locale: Locale): RegExp {
  const suffix = locale === 'he' ? 'דף הבית' : 'home page';
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped} ?, ${suffix}$`);
}

async function logoGeometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`no ${selector}`);
      const r = element.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    };
    return { logo: rect('[data-testid="header-logo"]'), header: rect('#site-header') };
  });
}

function expectInsideCentred(
  geometry: Awaited<ReturnType<typeof logoGeometry>>,
  label: string,
): void {
  const { logo, header } = geometry;
  expect(logo.top, `${label}: logo starts inside the bar`).toBeGreaterThanOrEqual(header.top + 4);
  expect(logo.bottom, `${label}: logo ends inside the bar`).toBeLessThanOrEqual(header.bottom - 4);
  expect(
    Math.abs((logo.top + logo.bottom) / 2 - (header.top + header.bottom) / 2),
    `${label}: logo is centred in the bar`,
  ).toBeLessThanOrEqual(1);
}

// 640 px is 1280 px at 200 % zoom (spec edge case).
const LOGO_VIEWPORTS = [320, 375, 640, 1024, 1280];

test('logo: on a content page it is inside the bar and centred, at scroll 0 and scrolled, and the content starts right under the bar', async ({
  page,
}) => {
  for (const width of LOGO_VIEWPORTS) {
    await page.setViewportSize({ width, height: 400 });
    let scrolledChecks = 0;
    for (const locale of LOCALES) {
      for (const path of ['/pages/about', '/product/sample-clay-mug', '/contact']) {
        const label = `${locale}${path} at ${String(width)} px`;
        await page.goto(`/${locale}${path}`);
        await expect(page.getByTestId('header-logo')).toBeVisible();
        const top = await page.evaluate(() => {
          const main = document.querySelector('main');
          const header = document.querySelector('#site-header');
          if (!main || !header) throw new Error('missing element');
          const first = main.firstElementChild?.getBoundingClientRect();
          return {
            firstTop: first ? first.top : Number.NaN,
            headerBottom: header.getBoundingClientRect().bottom,
            mainPadding: getComputedStyle(main).paddingTop,
            scrollPadding: getComputedStyle(document.documentElement).scrollPaddingTop,
            headerHeight: header.getBoundingClientRect().height,
          };
        });
        expect(top.mainPadding, `${label}: main has no top padding`).toBe('0px');
        expect(parseFloat(top.scrollPadding), `${label}: scroll-padding-top`).toBeCloseTo(
          top.headerHeight,
          1,
        );
        expect(top.firstTop, `${label}: content starts at or below the bar`).toBeGreaterThanOrEqual(
          top.headerBottom - 0.5,
        );
        expect(top.firstTop, `${label}: content starts right under the bar`).toBeLessThan(
          top.headerBottom + 40,
        );
        expectInsideCentred(await logoGeometry(page), `${label} at scroll 0`);
        // A short page may not scroll at all in a short window; then there is nothing to check.
        const scrolled = await page.evaluate(() => {
          window.scrollTo({ top: 200, behavior: 'instant' });
          return window.scrollY;
        });
        if (scrolled >= 199) {
          expectInsideCentred(await logoGeometry(page), `${label} scrolled`);
          scrolledChecks += 1;
        }
      }
    }
    expect(
      scrolledChecks,
      `at ${String(width)} px some page scrolled and was checked`,
    ).toBeGreaterThan(0);
  }
});

test('logo: on the home page at scroll 0 over the photo the same geometry holds', async ({
  page,
}) => {
  for (const width of LOGO_VIEWPORTS) {
    await page.setViewportSize({ width, height: 800 });
    for (const locale of LOCALES) {
      await page.goto(`/${locale}`);
      await expect(page.getByTestId('header-logo')).toBeVisible();
      expectInsideCentred(await logoGeometry(page), `${locale} home at ${String(width)} px`);
    }
  }
});

test('logo: from 1024 px the buy panel and the checkout summary stick at header height + 16 px', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Desktop project only');
  for (const width of [1024, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/he/product/sample-clay-mug');
    const panelTop = await page.evaluate(() => {
      const h1 = document.querySelector('main h1');
      const panel = h1?.parentElement;
      if (!panel) throw new Error('no buy panel');
      return getComputedStyle(panel).top;
    });
    expect(panelTop, `product panel at ${String(width)} px`).toBe('88px');
    await putCartItem(page, 'sample-clay-mug');
    await page.goto('/he/checkout');
    await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
    const asideTop = await page.evaluate(() => {
      const aside = document.querySelector('main aside');
      if (!aside) throw new Error('no summary');
      return getComputedStyle(aside).top;
    });
    expect(asideTop, `checkout summary at ${String(width)} px`).toBe('88px');
  }
});

test('logo: its box never meets the menu button, the cart button or the search field at 320, 375, 1024 and 1280 px', async ({
  page,
}) => {
  for (const width of [320, 375, 1024, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const locale of LOCALES) {
      const label = `${locale} at ${String(width)} px`;
      await page.goto(`/${locale}`);
      await expect(page.getByTestId('header-logo')).toBeVisible();
      const result = await page.evaluate(() => {
        const logo = document.querySelector('[data-testid="header-logo"]')?.getBoundingClientRect();
        if (!logo) throw new Error('no logo');
        const hit = (selector: string): boolean =>
          [...document.querySelectorAll(selector)].some((element) => {
            const r = element.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            return (
              r.left < logo.right &&
              r.right > logo.left &&
              r.top < logo.bottom &&
              r.bottom > logo.top
            );
          });
        return {
          menu: hit('#site-header [popovertarget="site-menu"]'),
          cart: hit('[data-testid="cart-link"]'),
          search: hit('[data-testid="header-search"]'),
        };
      });
      expect(result, label).toEqual({ menu: false, cart: false, search: false });
    }
  }
});

test('logo: the image alt is the shop name and the link name has the home wording', async ({
  page,
}) => {
  for (const locale of LOCALES) {
    await page.goto(`/${locale}`);
    const alt = await page.getByTestId('header-logo').getAttribute('alt');
    expect(alt, `${locale}: alt`).toBeTruthy();
    await expect(page.getByTestId('header-brand'), `${locale}: link name`).toHaveAccessibleName(
      homeName(alt ?? '', locale),
    );
    await expect(page.getByRole('link', { name: homeName(alt ?? '', locale) })).toHaveCount(1);
  }
});

test('logo: after a checkout error link the focused field is not under the bar', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Phone project only');
  await putCartItem(page, 'sample-clay-mug');
  await page.goto('/he/checkout');
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
  await waitForFormAge(page);
  await page.getByTestId('place-order').click();
  await expect(page.getByTestId('checkout-errors')).toBeVisible();
  await page.getByTestId('checkout-errors').locator('a').first().click();
  // Wait until the smooth scroll has stopped.
  let last = -1;
  await expect
    .poll(async () => {
      const y = await page.evaluate(() => window.scrollY);
      const settled = y === last;
      last = y;
      return settled;
    })
    .toBe(true);
  const result = await page.evaluate(() => {
    const header = document.querySelector('#site-header')?.getBoundingClientRect();
    const active = document.activeElement?.getBoundingClientRect();
    if (!header || !active) throw new Error('missing element');
    return { headerBottom: header.bottom, activeTop: active.top, scrollY: window.scrollY };
  });
  expect(result.scrollY, 'the page scrolled to the field').toBeGreaterThan(0);
  expect(result.activeTop - result.headerBottom, 'field sits just below the bar').toBeLessThan(40);
  expect(result.activeTop, 'focused field starts below the bar').toBeGreaterThanOrEqual(
    result.headerBottom - 0.5,
  );
});

test('logo: the menu drawer and the cart drawer each cover it', async ({ page }, testInfo) => {
  await putCartItem(page, 'sample-clay-mug');
  await page.goto('/he/pages/about');
  // The header is inert while a drawer is open, and inert elements are skipped by hit testing, so
  // the test lifts `inert` from the header for the hit test (and restores it) to see what is really
  // painted at each corner and the centre of the logo. A point inside the drawer's box must hit
  // the drawer's content. A point outside it (the cart drawer is 24rem wide on desktop) lies under
  // the backdrop, which is not hit-testable: there the drawer must be open, its backdrop must be
  // painted and must start at or above the logo's top edge.
  const covered = async (drawerId: string): Promise<boolean> =>
    page.evaluate((id) => {
      const logo = document.querySelector('[data-testid="header-logo"]');
      const drawer = document.getElementById(id);
      const header = document.getElementById('site-header');
      if (!logo || !drawer || !header) throw new Error('missing logo, drawer or header');
      if (!drawer.matches(':popover-open')) return false;
      const r = logo.getBoundingClientRect();
      const d = drawer.getBoundingClientRect();
      const backdropStyle = getComputedStyle(drawer, '::backdrop');
      const painted =
        backdropStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        backdropStyle.backgroundColor !== 'transparent';
      const backdropTop = Number.parseFloat(backdropStyle.top);
      const spansLogo = painted && Number.isFinite(backdropTop) && backdropTop <= r.top;
      const wasInert = header.inert;
      header.inert = false;
      try {
        const points: [number, number][] = [
          [r.left + r.width / 2, r.top + r.height / 2],
          [r.left, r.top],
          [r.right - 1, r.top],
          [r.left, r.bottom - 1],
          [r.right - 1, r.bottom - 1],
        ];
        return points.every(([x, y]) => {
          const inBox = x >= d.left && x <= d.right && y >= d.top && y <= d.bottom;
          if (inBox) {
            const hit = document.elementFromPoint(x, y);
            return hit !== null && drawer.contains(hit);
          }
          return spansLogo;
        });
      } finally {
        header.inert = wasInert;
      }
    }, drawerId);
  if (testInfo.project.name === 'chromium-mobile') {
    await hydrated(page, 'cart-link');
    const burger = await page.locator('#site-header [popovertarget="site-menu"]').boundingBox();
    if (!burger) throw new Error('no menu button');
    await page.mouse.click(burger.x + burger.width / 2, burger.y + burger.height / 2);
    await expect(page.getByTestId('site-menu')).toBeVisible();
    await transitionsDone(page);
    expect(await covered('site-menu'), 'menu drawer covers the logo').toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('site-menu')).toBeHidden();
  }
  await openCartDrawer(page);
  await transitionsDone(page);
  expect(await covered('cart-drawer'), 'cart drawer covers the logo').toBe(true);
});

// 010 US2 (contracts/navigation-links.md): the animated underline and `aria-current`.
const NAV_LINE_FULL = '100% 1.5px';
const NAV_LINE_EMPTY = '0% 1.5px';

function navLineSize(link: Locator): Promise<string> {
  return link.locator('.nav-line').evaluate((node) => getComputedStyle(node).backgroundSize);
}

test('nav: on About at 1280 px only the header About link is the current page and its line is full', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/en/pages/about');
  const header = page.getByTestId('site-header');
  await expect(header.locator('a[aria-current]')).toHaveCount(1);
  const about = header.getByRole('link', { name: 'About', exact: true });
  await expect(about).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => navLineSize(about)).toBe(NAV_LINE_FULL);
  // A link that is not the current page has no line.
  const all = header.getByRole('link', { name: 'All pieces', exact: true });
  await expect(all).not.toHaveAttribute('aria-current', /.*/);
  expect(await navLineSize(all)).toBe(NAV_LINE_EMPTY);
  // The footer never marks a page.
  await expect(page.locator('footer a[aria-current]')).toHaveCount(0);
});

test('nav: the home page and a product page mark no header link', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const path of ['/en', '/en/product/sample-clay-mug', '/he']) {
    await page.goto(path);
    await expect(page.getByTestId('site-header').locator('a[aria-current]'), path).toHaveCount(0);
    await expect(page.locator('footer a[aria-current]'), path).toHaveCount(0);
  }
});

test('nav: hovering a header link draws the line and leaving it removes it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/en');
  const about = page.getByTestId('site-header').getByRole('link', { name: 'About', exact: true });
  expect(await navLineSize(about)).toBe(NAV_LINE_EMPTY);
  await about.hover();
  await expect.poll(() => navLineSize(about)).toBe(NAV_LINE_FULL);
  await page.mouse.move(640, 600);
  await expect.poll(() => navLineSize(about)).toBe(NAV_LINE_EMPTY);
});

test('nav: footer links and the Cookie settings button have no underline on hover or focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/en');
  const footer = page.locator('footer');
  const items = footer.locator('nav a, nav button');
  expect(await items.count()).toBeGreaterThan(0);
  await expect(footer.locator('nav .nav-line')).toHaveCount(0);
  await expect(footer.locator('nav a[aria-current]')).toHaveCount(0);
  const decoration = (l: Locator) =>
    l.evaluate((node) => getComputedStyle(node).textDecorationLine);
  const about = footer.getByRole('link', { name: 'About', exact: true });
  await about.hover();
  expect(await decoration(about)).toBe('none');
  await page.mouse.move(640, 300);
  await about.focus();
  expect(await decoration(about)).toBe('none');
  const cookies = page.getByTestId('footer-cookie-settings');
  if ((await cookies.count()) > 0) {
    await expect(cookies.locator('.nav-line')).toHaveCount(0);
    await cookies.hover();
    expect(await decoration(cookies)).toBe('none');
    await cookies.focus();
    expect(await decoration(cookies)).toBe('none');
  }
});

test('nav: under reduced motion the line has no transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/en/pages/about');
  const about = page.getByTestId('site-header').getByRole('link', { name: 'About', exact: true });
  const duration = await about
    .locator('.nav-line')
    .evaluate((node) => getComputedStyle(node).transitionDuration);
  expect(duration).toBe('0s');
});

test('nav-menu: the phone menu marks the current category', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Phone project only');
  await page.goto('/he/category/sample-ceramics');
  await page.locator('#site-header button[popovertarget="site-menu"]').click();
  const sheet = page.locator('#site-menu');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(sheet.locator('a[href="/he/category/sample-ceramics"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('nav: a Hebrew header category with a cut-off label is marked as the current page, line full', async ({
  page,
}) => {
  const original = await readCategoryNames();
  await setHeaderCategories('sample-candles', 'sample-ceramics');
  try {
    await sql`UPDATE category SET name_he = ${'שששששששששששש'} WHERE slug = 'sample-ceramics'`;
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/he/category/sample-ceramics');
    const link = page.getByTestId('site-header').locator('a[href="/he/category/sample-ceramics"]');
    await expect(link).toHaveAttribute('aria-current', 'page');
    const label = link.locator('.nav-line');
    expect(await label.evaluate((node) => getComputedStyle(node).textOverflow)).toBe('ellipsis');
    // The label is really cut off, not just styled to be.
    expect(await label.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await expect.poll(() => navLineSize(link)).toBe(NAV_LINE_FULL);
  } finally {
    await restoreCategoryNames(original);
    await clearHeaderCategories();
  }
});

test('nav-menu: after tapping a footer link the next page shows no line on the footer link', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Phone project only');
  await page.goto('/en');
  await page.locator('footer').getByRole('link', { name: 'About', exact: true }).tap();
  await expect(page).toHaveURL(/\/en\/pages\/about$/);
  const footerAbout = page.locator('footer').getByRole('link', { name: 'About', exact: true });
  await expect(footerAbout).toHaveCount(1);
  await expect(footerAbout).not.toHaveAttribute('aria-current', /.*/);
  await expect(footerAbout.locator('.nav-line')).toHaveCount(0);
  expect(await footerAbout.evaluate((n) => getComputedStyle(n).textDecorationLine)).toBe('none');
});

// 010 US4 (contracts/sitemap-and-credit.md): the builder credit in the footer's bottom row.
const CREDIT = {
  he: { text: 'נבנה ועוצב על ידי שחף שמואל', newTab: '(נפתח בלשונית חדשה)' },
  en: { text: 'Designed & built by Shahaf Shmuel', newTab: '(opens in a new tab)' },
} as const;

async function expectCreditUnderCopyright(page: Page, label: string): Promise<void> {
  const credit = page.getByTestId('footer-credit');
  const copyright = credit.locator('xpath=preceding-sibling::p[1]');
  const c = await credit.boundingBox();
  const p = await copyright.boundingBox();
  if (!c || !p) throw new Error(`footer boxes missing: ${label}`);
  expect(c.y, `${label}: credit below copyright`).toBeGreaterThanOrEqual(p.y + p.height - 1);
  const rtl = (await page.locator('html').getAttribute('dir')) === 'rtl';
  const edge = (b: { x: number; width: number }) => (rtl ? b.x + b.width : b.x);
  expect(Math.abs(edge(c) - edge(p)), `${label}: same inline start edge`).toBeLessThanOrEqual(1);
}

test('footer credit at 1280 px: on its own line under the copyright', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const locale of LOCALES) {
    await page.goto(`/${locale}`);
    await expectCreditUnderCopyright(page, `${locale} at 1280 px`);
  }
});

test('footer credit: the text, the link to shahafs.com in a new tab and no sideways scroll at 320 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const locale of LOCALES) {
    await page.goto(`/${locale}`);
    const credit = page.getByTestId('footer-credit');
    await expect(credit).toBeVisible();
    await expectCreditUnderCopyright(page, `${locale} at 320 px`);
    const link = credit.getByRole('link');
    await expect(link).toHaveAttribute('href', 'https://shahafs.com');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    // The visible text is the message; the screen-reader part comes after the name.
    const visible = await credit.evaluate((node) => {
      const copy = node.cloneNode(true) as HTMLElement;
      for (const part of copy.querySelectorAll('.sr-only')) part.remove();
      return copy.textContent;
    });
    expect(visible, locale).toBe(CREDIT[locale].text);
    await expect(link).toHaveAccessibleName(
      new RegExp(`${CREDIT[locale].newTab.replace(/[()]/g, '\\$&')}$`),
    );
    await noSidewaysScroll(page, `${locale} footer credit at 320 px`);
  }
});
