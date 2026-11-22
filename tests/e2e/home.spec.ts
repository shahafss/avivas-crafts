import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, resetDb, sql, test } from './fixtures';
import {
  burgerLines,
  expandedState,
  expectDrawerGeometry,
  hydrated,
  nothingLeftOpen,
  pageIsInert,
  reachableOutside,
  runningTransitionsOn,
  transitionsDone,
} from './shop-helpers';

// 007 US1 (tasks.md T018; contracts/ui.md "Home page" and "Header states", contracts/home-row.md
// "Home row", research D4, D5, D17, D18): the new home page. Written before the page exists, so it
// fails until the home page task (T031) and the "All pieces" page (T032) are done.
//
// Test data: the seed has 3 sample pieces and 2 categories (catalog.spec.ts relies on exactly 3),
// so this file adds its own rows in beforeAll and removes exactly those in afterAll: 7 extra
// published pieces (`e2e-home-*`) in `featured`, spread over 2 extra categories, and 12-character
// category names (the longest the admin accepts, FR-040) on the five categories with pieces, so the
// header row from 1024 px carries the longest names it can meet.

test.describe.configure({ mode: 'serial' });

const LOCALES = ['he', 'en'] as const;
type Locale = (typeof LOCALES)[number];

const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const WHITE = 'rgb(255, 255, 255)';
const INK = 'rgb(6, 20, 6)'; // #061406
const ARROW_PATH = 'M4 12h16M14 6l6 6-6 6'; // the `arrow` icon pointing to the reading end (LTR)

const SECTION_ORDER = [
  'home-hero',
  'home-row',
  'home-banner-child',
  'home-band',
  'home-banner-shelf',
];

const EXTRA_PIECES = 7;
const EXTRA_CATEGORIES = [
  { slug: 'e2e-home-a', index: 4 },
  { slug: 'e2e-home-b', index: 5 },
] as const;

/** Five categories with pieces, in category order: candles, ceramics, featured, then the extras. */
const RENAMED_SLUGS = ['sample-candles', 'sample-ceramics', 'featured', 'e2e-home-a', 'e2e-home-b'];

interface CategoryRow {
  id: string;
  slug: string;
  name_he: string;
  name_en: string | null;
}

let originalCategories: CategoryRow[] = [];
let featuredId = '';
let originalShopNames = { he: '', en: '' as string | null };

function longHe(index: number): string {
  return `${String(index)}-${'ארוכה-'.repeat(4)}`.slice(0, 12);
}
function longEn(index: number): string {
  return `${String(index)}-Long-category-name-here`.slice(0, 12);
}

/** A 60-character shop name that contains a 25-letter word (spec edge case "long shop name"). */
function longShopName(): string {
  const name = 'Abcdefghijklmnopqrstuvwxy Knitted Toys And Wool Things For You Today'.slice(0, 60);
  if (name.length !== 60) throw new Error('long shop name must have 60 characters');
  return name;
}

test.beforeAll(async () => {
  await resetDb();

  const [settings] = await sql<{ he: string; en: string | null }[]>`
    SELECT shop_name_he AS he, shop_name_en AS en FROM shop_settings WHERE id = 1`;
  if (!settings) throw new Error('No settings row');
  originalShopNames = settings;

  const [featured] = await sql<{ id: string }[]>`SELECT id FROM category WHERE slug = 'featured'`;
  if (!featured) throw new Error('The seed must create the "featured" category');
  featuredId = featured.id;

  // Two extra categories after the existing ones.
  const [max] = await sql<
    { max: number }[]
  >`SELECT coalesce(max(sort_order), -1) AS max FROM category`;
  let order = (max?.max ?? -1) + 1;
  for (const extra of EXTRA_CATEGORIES) {
    await sql`
      INSERT INTO category (slug, name_he, name_en, sort_order)
      VALUES (${extra.slug}, ${`קטגוריית בדיקה ${String(extra.index)}`}, ${`Test category ${String(extra.index)}`}, ${order})`;
    order += 1;
  }

  // Seven extra published pieces: copy the photos of one sample, distinct slugs, staggered dates.
  const [sample] = await sql<
    { id: string }[]
  >`SELECT id FROM product WHERE slug = 'sample-clay-mug'`;
  if (!sample) throw new Error('No sample product');
  const extraIds = await sql<{ id: string; slug: string }[]>`
    SELECT id, slug FROM category WHERE slug IN ('e2e-home-a', 'e2e-home-b') ORDER BY sort_order`;
  for (let i = 1; i <= EXTRA_PIECES; i += 1) {
    const [created] = await sql<{ id: string }[]>`
      INSERT INTO product (slug, name_he, name_en, price_ils_minor, state, orderable, published_at)
      VALUES (${`e2e-home-${String(i)}`}, ${`יצירת בדיקה ${String(i)}`}, ${`Test piece ${String(i)}`},
              5500, 'published', true, now() - ${`${String(i)} hours`}::interval)
      RETURNING id`;
    if (!created) throw new Error('Could not insert a test product');
    await sql`
      INSERT INTO product_image (product_id, storage_key, width, height, alt_he, alt_en, position)
      SELECT ${created.id}, storage_key, width, height, alt_he, alt_en, position
      FROM product_image WHERE product_id = ${sample.id} AND deleted_at IS NULL`;
    const extra = extraIds[i % 2];
    if (!extra) throw new Error('Missing extra category');
    await sql`
      INSERT INTO product_category (product_id, category_id)
      VALUES (${created.id}, ${featuredId}), (${created.id}, ${extra.id})`;
  }

  // 12-character names on the five categories with pieces.
  originalCategories = await sql<CategoryRow[]>`
    SELECT id, slug, name_he, name_en FROM category WHERE slug IN ${sql(RENAMED_SLUGS)}`;
  for (const row of originalCategories) {
    const index = RENAMED_SLUGS.indexOf(row.slug) + 1;
    await sql`UPDATE category SET name_he = ${longHe(index)}, name_en = ${longEn(index)} WHERE id = ${row.id}`;
  }
});

test.afterAll(async () => {
  await sql`UPDATE shop_settings SET shop_name_he = ${originalShopNames.he}, shop_name_en = ${originalShopNames.en} WHERE id = 1`;
  await sql`DELETE FROM product WHERE slug LIKE 'e2e-home-%'`; // photos and links cascade
  await sql`DELETE FROM category WHERE slug LIKE 'e2e-home-%'`;
  for (const row of originalCategories) {
    await sql`UPDATE category SET name_he = ${row.name_he}, name_en = ${row.name_en} WHERE id = ${row.id}`;
  }
});

// ---------------------------------------------------------------- helpers

function message(locale: Locale, path: string): string {
  const file = join(process.cwd(), 'src/i18n/messages', `${locale}.json`);
  let node: unknown = JSON.parse(readFileSync(file, 'utf8'));
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) {
      throw new Error(`Missing message ${locale}:${path}`);
    }
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== 'string') throw new Error(`Message ${locale}:${path} is not a text`);
  return node;
}

async function shopName(locale: Locale): Promise<string> {
  const [row] = await sql<{ he: string; en: string | null }[]>`
    SELECT shop_name_he AS he, shop_name_en AS en FROM shop_settings WHERE id = 1`;
  if (!row) throw new Error('No settings row');
  return locale === 'en' && row.en !== null && row.en !== '' ? row.en : row.he;
}

async function setShopName(name: string | null): Promise<void> {
  if (name === null) {
    await sql`UPDATE shop_settings SET shop_name_he = ${originalShopNames.he}, shop_name_en = ${originalShopNames.en} WHERE id = 1`;
  } else {
    await sql`UPDATE shop_settings SET shop_name_he = ${name}, shop_name_en = ${name} WHERE id = 1`;
  }
}

async function categoryNames(slug: string): Promise<{ he: string; en: string }> {
  const [row] = await sql<{ he: string; en: string }[]>`
    SELECT name_he AS he, name_en AS en FROM category WHERE slug = ${slug}`;
  if (!row) throw new Error(`No category ${slug}`);
  return row;
}

function skipUnlessProject(testInfo: { project: { name: string } }, names: string[]): void {
  test.skip(!names.includes(testInfo.project.name), `runs on ${names.join(', ')}`);
}

async function nextFrames(page: Page, count = 2): Promise<void> {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const step = (left: number): void => {
          if (left <= 0) resolve();
          else
            requestAnimationFrame(() => {
              step(left - 1);
            });
        };
        step(n);
      }),
    count,
  );
}

async function scrollToY(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => {
    window.scrollTo({ top, left: 0, behavior: 'instant' });
  }, y);
  await nextFrames(page);
}

async function headerLook(page: Page): Promise<{ bg: string; color: string }> {
  return page.evaluate(() => {
    const header = document.getElementById('site-header');
    if (!header) throw new Error('no #site-header');
    const style = getComputedStyle(header);
    return { bg: style.backgroundColor, color: style.color };
  });
}

/** Alpha of a computed colour: `rgb(...)`, `rgba(...)` or `color(srgb r g b / a)`. */
function alphaOf(css: string): number {
  const match =
    /\/\s*([\d.]+)\s*\)$/.exec(css) ?? /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/.exec(css);
  return match ? Number(match[1]) : 1;
}

async function headerBlur(page: Page): Promise<string> {
  return page.evaluate(() => {
    const header = document.getElementById('site-header');
    if (!header) throw new Error('no #site-header');
    const style = getComputedStyle(header);
    return style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter') || 'none';
  });
}

async function noSideScroll(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

type Box = { x: number; y: number; width: number; height: number };
async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('missing box');
  return b;
}

/** True when `inner` lies inside `outer` (1 px tolerance on every side). */
function inside(inner: Box, outer: Box): boolean {
  return (
    inner.x >= outer.x - 1 &&
    inner.x + inner.width <= outer.x + outer.width + 1 &&
    inner.y >= outer.y - 1 &&
    inner.y + inner.height <= outer.y + outer.height + 1
  );
}

/**
 * Text elements and buttons over the hero photo, and the ones that are not inside a scrim band.
 * The two banners carry no dark layer since 2026-11-17 (owner decision), so they are not part of
 * this check; the banners are checked for no dark layer in their own test below.
 */
async function bandReport(page: Page): Promise<{ checked: number; offenders: string[] }> {
  return page.evaluate(() => {
    const offenders: string[] = [];
    let checked = 0;
    for (const section of document.querySelectorAll('[data-hero]')) {
      for (const el of section.querySelectorAll('*')) {
        const ownText = [...el.childNodes].some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
        );
        if (!ownText && !el.matches('a, button')) continue;
        checked += 1;
        const band = el.closest('[class*="scrim-band"]');
        if (!band || !section.contains(band)) {
          offenders.push(
            `${section.getAttribute('data-testid') ?? '?'}: <${el.tagName.toLowerCase()}> ${el.textContent.trim().slice(0, 30)}`,
          );
        }
      }
    }
    return { checked, offenders };
  });
}

function trackItems(page: Page): Locator {
  return page.getByTestId('home-row-track').locator(':scope > li');
}

async function trackSlugs(page: Page): Promise<string[]> {
  const hrefs = await page
    .getByTestId('home-row-track')
    .getByTestId('product-card')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('href') ?? ''));
  return hrefs.map((href) => href.replace(/^.*\/p\//, ''));
}

async function featuredSlugsNewestFirst(): Promise<string[]> {
  const rows = await sql<{ slug: string }[]>`
    SELECT p.slug FROM product p
    JOIN product_category pc ON pc.product_id = p.id
    WHERE pc.category_id = ${featuredId} AND p.state = 'published'
    ORDER BY p.published_at DESC, p.created_at DESC, p.id ASC
    LIMIT 12`;
  return rows.map((row) => row.slug);
}

// ---------------------------------------------------------------- structure and texts

test('the home-row category is featured and holds every sample', async () => {
  const [setting] = await sql<{ home_category_id: string | null }[]>`
    SELECT home_category_id FROM shop_settings WHERE id = 1`;
  expect(setting?.home_category_id).toBe(featuredId);
  const linked = await sql<{ slug: string }[]>`
    SELECT p.slug FROM product p JOIN product_category pc ON pc.product_id = p.id
    WHERE pc.category_id = ${featuredId} AND p.slug LIKE 'sample-%' ORDER BY p.slug`;
  expect(linked.map((row) => row.slug)).toEqual([
    'sample-ceramic-bowl',
    'sample-clay-mug',
    'sample-soy-candle',
  ]);
});

for (const locale of LOCALES) {
  test(`${locale}: sections in order, one h1 (the shop name), no chips or sort links`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);
    const order = await page
      .locator('[data-full-bleed] > [data-testid]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
    expect(order).toEqual(SECTION_ORDER);

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(await shopName(locale));
    await expect(page.getByTestId('home-hero').locator('h1')).toHaveCount(1);

    const names = await categoryNames('featured');
    await expect(page.getByTestId('home-row').getByRole('heading', { level: 2 })).toHaveText(
      locale === 'he' ? names.he : names.en,
    );

    const main = page.locator('main');
    await expect(
      main.getByRole('navigation', { name: message(locale, 'shop.catalog.categoriesLabel') }),
    ).toHaveCount(0);
    await expect(
      main.getByRole('navigation', { name: message(locale, 'shop.catalog.sortLabel') }),
    ).toHaveCount(0);
    await expect(main.locator('a[href*="sort="]')).toHaveCount(0);
  });

  test(`${locale}: banner buttons, the band link and "view all" lead to All pieces`, async ({
    page,
  }) => {
    const shop = `/${locale}/shop`;
    await page.goto(`/${locale}`);
    for (const id of ['home-banner-child', 'home-banner-shelf']) {
      await expect(page.getByTestId(id).getByTestId('home-banner-button')).toHaveAttribute(
        'href',
        shop,
      );
    }
    await expect(page.getByTestId('home-band-link')).toHaveAttribute('href', shop);
    await expect(page.getByTestId('home-row-view-all')).toHaveAttribute('href', shop);

    await page.getByTestId('home-band-link').click();
    await expect(page).toHaveURL(new RegExp(`${shop}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      message(locale, 'shop.allPieces.title'),
    );

    await page.goto(`/${locale}`);
    await page.getByTestId('home-row-view-all').click();
    await expect(page).toHaveURL(new RegExp(`${shop}$`));
    await page.goto(`/${locale}`);
    await page.getByTestId('home-banner-child').getByTestId('home-banner-button').click();
    await expect(page).toHaveURL(new RegExp(`${shop}$`));
  });

  test(`${locale}: hero and banner images have the translated alt, srcset, sizes, width and height`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);
    const cases = [
      ['home-hero', 'shop.home.hero.alt'],
      ['home-banner-child', 'shop.home.bannerChild.alt'],
      ['home-banner-shelf', 'shop.home.bannerShelf.alt'],
    ] as const;
    for (const [id, key] of cases) {
      const img = page.getByTestId(id).locator('img');
      await expect(img, id).toHaveCount(1);
      await expect(img, `${id} alt`).toHaveAttribute('alt', message(locale, key));
      for (const attribute of ['srcset', 'sizes', 'width', 'height']) {
        await expect(img, `${id} ${attribute}`).toHaveAttribute(attribute, /\S/);
      }
      // The wide <source> carries its own srcset and sizes.
      const source = page.getByTestId(id).locator('picture source');
      await expect(source).toHaveAttribute('srcset', /-w800\..*-w2000\./);
      await expect(source).toHaveAttribute('sizes', '100vw');
    }
  });

  test(`${locale}: the peach band link has the arrow icon and is at least 44 px tall; thin type`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);
    const link = page.getByTestId('home-band').getByTestId('home-band-link');
    await expect(link.locator(`svg path[d="${ARROW_PATH}"]`)).toHaveCount(1);
    expect((await box(link)).height).toBeGreaterThanOrEqual(44);
    await expect(link).toHaveText(message(locale, 'shop.home.band.link'));
    // 008 US7: the band sentence (the owner's new wording, "especially for you").
    await expect(page.getByTestId('home-band').locator('p')).toHaveText(
      locale === 'he'
        ? 'אני סורגת כל יצירה בעצמי, בסבלנות ובאהבה, במיוחד בשבילכם.'
        : 'I crochet every piece myself, with patience and love, especially for you.',
    );

    const weight = (locator: Locator): Promise<string> =>
      locator.evaluate((el) => getComputedStyle(el).fontWeight);
    expect(await weight(page.getByTestId('home-hero').locator('h1'))).toBe('300');
    expect(await weight(page.getByTestId('home-band').locator('p'))).toBe('300');
  });
}

test('no "sold out" text and no account icon or link on the home page, a card and a product page', async ({
  page,
}) => {
  for (const path of ['/he', '/en', '/he/p/sample-clay-mug', '/en/p/sample-clay-mug']) {
    await page.goto(path);
    const text = await page.locator('body').innerText();
    expect(/sold out|אזל/i.test(text), `${path}: sold out`).toBe(false);
    await expect(
      page.locator(
        'a[href*="/account"], a[href*="sign-in"], a[href*="login"], [aria-label*="account" i], [aria-label*="חשבון"]',
      ),
      `${path}: account`,
    ).toHaveCount(0);
  }
});

// ---------------------------------------------------------------- hero name centred

test('the hero shop name is centred, on phones and on computers (owner fix 2026-11-17)', async ({
  page,
}) => {
  for (const locale of LOCALES) {
    for (const width of [375, 1280]) {
      const label = `${locale} at ${String(width)} px`;
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/${locale}`);
      const h1 = page.getByTestId('home-hero').locator('h1');
      await expect(h1, label).toBeVisible();
      expect(
        await h1.evaluate((el) => getComputedStyle(el).textAlign),
        `${label}: text-align`,
      ).toBe('center');
      const hero = await box(page.getByTestId('home-hero'));
      // The h1 is a full-width block, so its box is centred either way: measure where the text
      // itself sits (a Range over the text, midpoint against the hero's midpoint).
      const text = await h1.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const r = range.getBoundingClientRect();
        return { x: r.x, width: r.width };
      });
      expect(text.width, `${label}: the h1 text has a box`).toBeGreaterThan(0);
      expect(
        Math.abs(text.x + text.width / 2 - (hero.x + hero.width / 2)),
        `${label}: the h1 text is centred in the hero`,
      ).toBeLessThanOrEqual(2);
    }
  }
});

// ---------------------------------------------------------------- header and menu

// 007 T092 (spec "Owner answers: menu and cart drawers", FR-044, FR-045, research D21): the menu
// is a modal drawer that slides in from the reading-start side, from the header's top edge as it
// is on screen. Phone projects (below 1024 px); written before the drawer exists.

const MENU_BUTTON = '#site-header [popovertarget="site-menu"]';

function phoneOnly(testInfo: { project: { name: string } }): void {
  skipUnlessProject(testInfo, ['chromium-mobile', 'webkit-mobile']);
}

/**
 * Clicks the middle of a header control by coordinates: `locator.click()` scrolls a sticky header
 * control "into view" first, which moves the page because of `scroll-padding-top`.
 */
async function clickAtCentre(page: Page, locator: Locator): Promise<void> {
  const b = await box(locator);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

/** Scrolls to `y`, then opens the menu with the header's button (hydrated first). */
async function openMenu(page: Page, locale: Locale, y: number): Promise<void> {
  await page.goto(`/${locale}`);
  await hydrated(page, 'cart-link');
  await scrollToY(page, y);
  await clickAtCentre(page, page.locator(MENU_BUTTON));
  await expect(page.locator('#site-menu')).toBeVisible();
}

test('the menu drawer: reading-start side, from the header top edge to the viewport bottom, strip not covered, close X on the menu button', async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const locale of LOCALES) {
    for (const y of [0, 300]) {
      const label = `${locale} at scroll ${String(y)}`;
      await page.goto(`/${locale}`);
      await hydrated(page, 'cart-link');
      await scrollToY(page, y);
      const button = await box(page.locator(MENU_BUTTON));
      await clickAtCentre(page, page.locator(MENU_BUTTON));
      const drawer = page.locator('#site-menu');
      await expect(drawer, label).toBeVisible();
      // Reading start: the right edge in Hebrew, the left edge in English.
      await expectDrawerGeometry(page, 'site-menu', locale === 'he' ? 'right' : 'left', label);

      // The close X sits on the menu button's pixels and has focus.
      const close = page.getByTestId('menu-close');
      await expect(close, label).toBeFocused();
      const closeBox = await box(close);
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(
          Math.abs(closeBox[key] - button[key]),
          `${label}: close button ${key} = menu button ${key}`,
        ).toBeLessThanOrEqual(1);
      }
      // Named after the menu, in the page's language.
      await expect(close).toHaveAccessibleName(message(locale, 'common.menuClose'));

      // The strip is visible (not covered) at scroll 0.
      if (y === 0) await expect(page.getByTestId('announcement-bar'), label).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(drawer, label).toBeHidden();
    }
  }
});

test('the menu drawer is a named modal dialog around the nav; the rest of the page is inert; Tab stays inside', async ({
  page,
}, testInfo) => {
  skipUnlessProject(testInfo, ['chromium-mobile']);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const locale of LOCALES) {
    await openMenu(page, locale, 0);
    const name = message(locale, 'common.menuNav');
    const dialog = page.getByRole('dialog', { name });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.locator('nav')).toHaveCount(1);
    expect(await pageIsInert(page), `${locale}: header, main, footer, strip inert`).toEqual([
      true,
      true,
      true,
      true,
    ]);

    // Generic: no focusable control outside the drawer is reachable (the skip links, the consent
    // banner and anything else included), not just the named parts.
    expect(await reachableOutside(page, 'site-menu'), `${locale}: reachable outside`).toEqual([]);

    // Tab through every control: focus never leaves the drawer, and every control is reached.
    const controls = await dialog.evaluate(
      (node) =>
        [...node.querySelectorAll<HTMLElement>('a[href], button, input')].filter(
          (el) => el.getClientRects().length > 0,
        ).length,
    );
    expect(controls, `${locale}: the drawer has controls`).toBeGreaterThan(5);
    const reached = new Set<string>();
    for (let i = 0; i < controls + 3; i += 1) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => {
        const active = document.activeElement;
        const drawer = document.getElementById('site-menu');
        return {
          inDrawer: active !== null && drawer !== null && drawer.contains(active),
          // Past the last control the browser's own UI may take focus (the body then).
          onBody: active === document.body,
          id:
            (active?.getAttribute('data-testid') ?? '') +
            (active?.getAttribute('href') ?? '') +
            (active?.textContent ?? '').trim().slice(0, 20),
        };
      });
      expect(
        state.inDrawer || state.onBody,
        `${locale}: Tab ${String(i)} left the drawer (focus on ${state.id})`,
      ).toBe(true);
      if (state.inDrawer) reached.add(state.id);
    }
    expect(reached.size, `${locale}: Tab reached every control`).toBeGreaterThanOrEqual(
      controls - 1,
    );
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
});

test('Esc, the X and a tap outside close the menu drawer and focus returns to the menu button', async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const locale of LOCALES) {
    for (const how of ['escape', 'close button', 'tap outside'] as const) {
      const label = `${locale}, ${how}`;
      await openMenu(page, locale, 0);
      const drawer = page.locator('#site-menu');
      if (how === 'escape') await page.keyboard.press('Escape');
      else if (how === 'close button') await page.getByTestId('menu-close').click();
      else {
        // The drawer is at the reading start; tap the page strip at the other edge.
        await page.mouse.click(locale === 'he' ? 10 : 365, 500);
      }
      await expect(drawer, label).toBeHidden();
      await expect(page.locator(MENU_BUTTON), `${label}: focus returns`).toBeFocused();
      await nothingLeftOpen(page);
    }
  }
});

test('the page does not scroll while the menu is open; links close it; widening to 1024 px closes it', async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  await page.setViewportSize({ width: 375, height: 812 });
  await openMenu(page, 'he', 300);
  expect(await page.evaluate(() => window.scrollY)).toBe(300);
  // Mobile WebKit has no mouse wheel (see catalog.spec.ts); the overflow check below covers it.
  if (testInfo.project.name !== 'webkit-mobile') await page.mouse.wheel(0, 400);
  await nextFrames(page, 3);
  expect(await page.evaluate(() => window.scrollY), 'no scroll while open').toBe(300);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe(
    'hidden',
  );

  // Widening to 1024 px closes it and leaves no inert part or scroll lock.
  await page.setViewportSize({ width: 1024, height: 812 });
  await expect(page.locator('#site-menu')).toBeHidden();
  await nothingLeftOpen(page);

  // A link closes the drawer and navigates; nothing is left open.
  await page.setViewportSize({ width: 375, height: 812 });
  await openMenu(page, 'he', 0);
  await page.locator('#site-menu a[href="/he/shop"]').click();
  await expect(page).toHaveURL(/\/he\/shop$/);
  await expect(page.locator('#site-menu')).toBeHidden();
  await nothingLeftOpen(page);
});

test('the menu button has three lines, the close button turns them into an X', async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const locale of LOCALES) {
    await page.goto(`/${locale}`);
    await hydrated(page, 'cart-link');
    const closed = await burgerLines(page.locator(MENU_BUTTON));
    expect(closed, `${locale}: three lines`).toHaveLength(3);
    for (const line of closed) {
      expect(Math.abs(line.rotation), `${locale}: lines are flat`).toBeLessThan(1);
      expect(line.opacity, `${locale}: lines are drawn`).toBeGreaterThan(0.9);
    }
    const ys = closed.map((line) => line.centreY);
    expect(new Set(ys.map((y) => Math.round(y))).size, `${locale}: three distinct rows`).toBe(3);

    await page.locator(MENU_BUTTON).click();
    await expect(page.locator('#site-menu')).toBeVisible();
    await transitionsDone(page);
    // FR-045: the menu button reports that the menu is open (Chromium's accessibility tree).
    if (testInfo.project.name === 'chromium-mobile') {
      // The header is inert while the drawer is open, so Chromium may leave the button out of the
      // accessibility tree: undefined is accepted, false is not.
      expect([true, undefined], `${locale}: reports open`).toContain(
        await expandedState(page, MENU_BUTTON),
      );
    }
    const open = await burgerLines(page.getByTestId('menu-close'));
    const drawn = open.filter((line) => line.opacity > 0.5);
    expect(drawn, `${locale}: two crossed lines`).toHaveLength(2);
    const angles = drawn.map((line) => Math.round(line.rotation)).sort((a, b) => a - b);
    expect(angles[0], `${locale}: one line at -45`).toBeCloseTo(-45, 0);
    expect(angles[1], `${locale}: one line at +45`).toBeCloseTo(45, 0);
    // They cross at the same point.
    const [one, two] = drawn;
    if (!one || !two) throw new Error('two lines expected');
    expect(Math.abs(one.centreX - two.centreX)).toBeLessThanOrEqual(1);
    expect(Math.abs(one.centreY - two.centreY)).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#site-menu')).toBeHidden();
    // Back to three lines: the close button is gone and the header button's lines are where they were.
    await transitionsDone(page);
    await expect(page.getByTestId('menu-close')).toBeHidden();
    const back = await burgerLines(page.locator(MENU_BUTTON));
    expect(back, `${locale}: three lines again`).toHaveLength(3);
    back.forEach((line, index) => {
      const before = closed[index];
      expect(
        Math.abs(line.centreY - (before?.centreY ?? -99)),
        `${locale}: line ${String(index)} place`,
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(line.rotation), `${locale}: line ${String(index)} flat`).toBeLessThan(1);
      expect(line.opacity, `${locale}: line ${String(index)} drawn`).toBeGreaterThan(0.9);
    });
    if (testInfo.project.name === 'chromium-mobile') {
      expect(await expandedState(page, MENU_BUTTON), `${locale}: reports closed`).toBe(false);
    }
  }
});

test('in normal motion the menu drawer slides and its X lines turn (transitions run); one drawer closes the other', async ({
  page,
}, testInfo) => {
  skipUnlessProject(testInfo, ['chromium-mobile']);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/he');
  await hydrated(page, 'cart-link');
  await page.locator(MENU_BUTTON).click();
  // Right after the click, before the 300 ms are over.
  expect(await runningTransitionsOn(page, '#site-menu'), 'the drawer transitions').toBeGreaterThan(
    0,
  );
  expect(
    await runningTransitionsOn(page, '[data-testid="menu-close"] span'),
    'the X lines transition',
  ).toBeGreaterThan(0);
  await transitionsDone(page);

  // Opening the cart drawer (the way "add to cart" does) closes the menu drawer.
  await page.evaluate(() => {
    document.getElementById('cart-drawer')?.showPopover();
  });
  await expect(page.getByTestId('cart-drawer')).toBeVisible();
  await expect(page.locator('#site-menu')).toBeHidden();
  expect(await reachableOutside(page, 'cart-drawer'), 'only the cart drawer is reachable').toEqual(
    [],
  );
  await page.evaluate(() => {
    document.getElementById('site-menu')?.showPopover();
  });
  await expect(page.locator('#site-menu')).toBeVisible();
  await expect(page.getByTestId('cart-drawer')).toBeHidden();
  expect(await reachableOutside(page, 'site-menu'), 'only the menu drawer is reachable').toEqual(
    [],
  );
  await page.keyboard.press('Escape');
  await nothingLeftOpen(page);
});

test('reduced motion: the menu drawer and the X have the same end states, with nothing moving', async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page, 'he', 0);
  expect(
    await page.evaluate(
      () => document.getAnimations().filter((a) => a instanceof CSSTransition).length,
    ),
    'no transition runs',
  ).toBe(0);
  await expectDrawerGeometry(page, 'site-menu', 'right', 'reduced motion');
  const drawn = (await burgerLines(page.getByTestId('menu-close'))).filter(
    (line) => line.opacity > 0.5,
  );
  expect(drawn).toHaveLength(2);
  expect(drawn.map((line) => Math.round(Math.abs(line.rotation)))).toEqual([45, 45]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#site-menu')).toBeHidden();
  await expect(page.locator(MENU_BUTTON)).toBeFocused();
});

test('at 1280 px the first header link, "All pieces", is at the reading start; no menu button', async ({
  page,
}, testInfo) => {
  skipUnlessProject(testInfo, ['chromium-desktop']);
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const locale of LOCALES) {
    await page.goto(`/${locale}`);
    const header = page.getByTestId('site-header');
    const first = header.locator('a:visible').first();
    await expect(first).toHaveText(message(locale, 'common.nav.allPieces'));
    await expect(first).toHaveAttribute('href', `/${locale}/shop`);
    const firstBox = await box(first);
    const brand = await box(page.getByTestId('header-brand'));
    if (locale === 'he') expect(firstBox.x, 'he: link right of the brand').toBeGreaterThan(brand.x);
    else expect(firstBox.x, 'en: link left of the brand').toBeLessThan(brand.x);
    // From 1024 px the header is one row of links and the search field, whatever the number of
    // categories (research D20): no menu button.
    await expect(page.locator(`${MENU_BUTTON}:visible`)).toHaveCount(0);
    await expect(page.getByTestId('header-search')).toBeVisible();
  }
});

test('at 900 px with five categories: no sideways scroll, and the header sits in the hero strip', async ({
  page,
}, testInfo) => {
  skipUnlessProject(testInfo, ['chromium-desktop']);
  await page.setViewportSize({ width: 900, height: 800 });
  for (const locale of LOCALES) {
    await page.goto(`/${locale}`);
    expect(await noSideScroll(page), `${locale}: sideways scroll`).toBeLessThanOrEqual(0);
    await scrollToY(page, 0);
    const header = await box(page.getByTestId('site-header'));
    const hero = await box(page.getByTestId('home-hero'));
    const headerH = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')),
    );
    expect(headerH, '--header-h is set').toBeGreaterThan(0);
    // The hero is pulled up under the header: the bar lies inside the hero's first --header-h.
    expect(header.y).toBeGreaterThanOrEqual(hero.y - 1);
    expect(header.y + header.height).toBeLessThanOrEqual(hero.y + headerH + 1);
  }
});

test('at 900 px (menu button) and 1024 px (full row) with a 60-character shop name: no sideways scroll, the controls stay clear of the brand', async ({
  page,
}, testInfo) => {
  skipUnlessProject(testInfo, ['chromium-desktop']);
  const names = [
    'Abcdefghijklmnopqrstuvwxy Knitted Toys And Wool Things For You Today'.slice(0, 60),
    'סטודיו אביבה לבובות סרוגות ולמוצרי צמר עבודת יד מיוחדים בשבילכם היום'.slice(0, 60),
  ];
  try {
    for (const [width, menuButtons] of [
      [900, 1],
      [1024, 0],
    ] as const) {
      await page.setViewportSize({ width, height: 800 });
      for (const name of names) {
        await sql`UPDATE shop_settings SET shop_name_he = ${name}, shop_name_en = ${name} WHERE id = 1`;
        for (const locale of LOCALES) {
          const label = `${String(width)} px, ${locale}, name ${name.slice(0, 6)}`;
          await page.goto(`/${locale}`);
          expect(await noSideScroll(page), `${label}: sideways scroll`).toBeLessThanOrEqual(0);
          await expect(page.locator(`${MENU_BUTTON}:visible`), label).toHaveCount(menuButtons);
          const brand = await box(page.getByTestId('header-brand'));
          const overlaps = await page
            .getByTestId('site-header')
            .locator('a, button')
            .evaluateAll(
              (nodes, [brandId, left, right]) => {
                const bad: (string | null)[] = [];
                for (const node of nodes) {
                  if (node.getAttribute('data-testid') === brandId) continue;
                  if ((node as HTMLElement).getClientRects().length === 0) continue;
                  const r = node.getBoundingClientRect();
                  let x = r.left;
                  let end = r.right;
                  for (let el = node.parentElement; el; el = el.parentElement) {
                    if (getComputedStyle(el).overflowX === 'visible') continue;
                    const c = el.getBoundingClientRect();
                    x = Math.max(x, c.left);
                    end = Math.min(end, c.right);
                  }
                  if (end > x && x < Number(right) - 0.5 && end > Number(left) + 0.5) {
                    bad.push(node.getAttribute('aria-label') ?? node.textContent);
                  }
                }
                return bad;
              },
              ['header-brand', brand.x, brand.x + brand.width],
            );
          expect(overlaps, `${label}: controls overlapping the brand`).toEqual([]);
        }
      }
    }
  } finally {
    await sql`UPDATE shop_settings SET shop_name_he = ${originalShopNames.he}, shop_name_en = ${originalShopNames.en} WHERE id = 1`;
  }
});

type HeaderState = { bg: string; color: string; blur: string };

/** Waits for the 250 ms transition to settle on a state, then returns it. */
async function settledHeader(
  page: Page,
  y: number,
  want: 'see-through' | 'frosted',
  label: string,
): Promise<HeaderState> {
  await scrollToY(page, y);
  await expect
    .poll(
      async () => {
        const look = await headerLook(page);
        return want === 'see-through' ? alphaOf(look.bg) === 0 : alphaOf(look.bg) > 0.8;
      },
      { message: `${label}: header settles ${want}`, timeout: 3000 },
    )
    .toBe(true);
  return { ...(await headerLook(page)), blur: await headerBlur(page) };
}

async function headerStates(page: Page): Promise<HeaderState[]> {
  return [
    await settledHeader(page, 0, 'see-through', 'scroll 0'),
    await settledHeader(page, 2, 'frosted', 'scrolled 2 px'),
    await settledHeader(page, 40, 'frosted', 'scrolled 40 px'),
    await settledHeader(page, 600, 'frosted', 'far down'),
    await settledHeader(page, 0, 'see-through', 'back at 0'),
  ];
}

test('header states: see-through only at scroll 0, frosted white bar from 1 px with a short fade in time; same end states under reduced motion', async ({
  page,
}) => {
  await page.goto('/he');
  // The fade is a CSS transition of about 250 ms (not a scroll-linked animation).
  const transition = await page.evaluate(() => {
    const style = getComputedStyle(document.getElementById('site-header') as HTMLElement);
    return { duration: style.transitionDuration, property: style.transitionProperty };
  });
  expect(transition.duration, 'transition duration').toContain('0.25s');
  expect(transition.property, 'transition covers background and blur').toContain(
    'background-color',
  );
  expect(transition.property).toContain('backdrop-filter');

  const check = (states: HeaderState[], label: string): void => {
    const [top, down, mid, far, back] = states;
    if (!top || !down || !mid || !far || !back) throw new Error('missing state');
    for (const [name, look] of [
      ['scroll 0', top],
      ['back at 0', back],
    ] as const) {
      expect(alphaOf(look.bg), `${label}: ${name} is transparent`).toBe(0);
      expect(look.color, `${label}: ${name} text is white`).toBe(WHITE);
      expect(look.blur, `${label}: ${name} has no blur`).not.toContain('blur');
    }
    for (const [name, look] of [
      ['scrolled 2 px', down],
      ['scrolled 40 px', mid],
      ['far down', far],
    ] as const) {
      expect(alphaOf(look.bg), `${label}: ${name}, mostly opaque`).toBeGreaterThan(0.8);
      expect(alphaOf(look.bg), `${label}: ${name}, slightly see-through`).toBeLessThan(1);
      expect(look.color, `${label}: ${name}, ink text`).toBe(INK);
      expect(look.blur, `${label}: ${name}, backdrop blur`).toContain('blur');
    }
  };

  const normal = await headerStates(page);
  check(normal, 'normal motion');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/he');
  const reduced = await headerStates(page);
  check(reduced, 'reduced motion');
  expect(reduced, 'reduced motion gives exactly the same end states').toEqual(normal);
  expect(normal[2], '40 px settles to the same state as 600 px').toEqual(normal[3]);
});

test('without JavaScript the home header is the readable frosted bar when scrolled down', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: String(testInfo.project.use.baseURL),
    viewport: { width: 1280, height: 800 },
  });
  try {
    const bare = await context.newPage();
    await bare.goto('/he');
    await bare.keyboard.press('End');
    const header = bare.getByTestId('site-header');
    await expect(header, 'ink text, not white on the page').toHaveCSS('color', INK);
    await expect(header).not.toHaveCSS('background-color', TRANSPARENT);
    // The bar itself is the white bar there, so the logo has no glow and the link no box.
    await bare.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    const brand = bare.getByTestId('header-brand');
    await expect(brand, 'no box without JavaScript').toHaveCSS('background-color', TRANSPARENT);
    await expect(brand).toHaveCSS('box-shadow', 'none');
    await expect(bare.getByTestId('header-logo'), 'no glow without JavaScript').toHaveCSS(
      'filter',
      'none',
    );
  } finally {
    await context.close();
  }
});

type Backing = { filter: string; bg: string; shadow: string };

async function logoBacking(page: Page): Promise<Backing> {
  return page.evaluate(() => {
    const brand = document.querySelector('#site-header [data-testid="header-brand"]');
    const logo = document.querySelector('#site-header [data-testid="header-logo"]');
    if (!brand || !logo) throw new Error('no brand link or logo');
    const link = getComputedStyle(brand);
    return {
      filter: getComputedStyle(logo).filter,
      bg: link.backgroundColor,
      shadow: link.boxShadow,
    };
  });
}

/** Scrolls to `y`, waits for the 250 ms fade to settle, then returns the logo's glow state. */
async function settledBacking(page: Page, y: number, glowing: boolean): Promise<Backing> {
  await scrollToY(page, y);
  await expect
    .poll(
      async () => {
        const now = await logoBacking(page);
        return glowing ? now.filter.includes('drop-shadow') : now.filter === 'none';
      },
      {
        message: `scroll ${String(y)}: glow settles ${glowing ? 'in' : 'out'}`,
        timeout: 3000,
      },
    )
    .toBe(true);
  return logoBacking(page);
}

/** The link never has a box of its own, in any state. */
function expectNoBox(look: Backing, label: string): void {
  expect(look.bg, `${label}: link background is transparent`).toBe(TRANSPARENT);
  expect(look.shadow, `${label}: link has no box-shadow`).toBe('none');
}

test('logo backing: soft white glow at the top of the home page, gone once scrolled, never on other pages', async ({
  page,
}) => {
  const check = async (label: string): Promise<void> => {
    await page.goto('/he');
    const top = await settledBacking(page, 0, true);
    expect(top.filter, `${label}: glow at scroll 0`).toContain('drop-shadow');
    expectNoBox(top, `${label} top`);
    const down = await settledBacking(page, 600, false);
    expect(down.filter, `${label}: no glow when scrolled`).toBe('none');
    expectNoBox(down, `${label} scrolled`);

    await page.goto('/he/c/sample-ceramics');
    await scrollToY(page, 0);
    const other = await logoBacking(page);
    expect(other.filter, `${label}: no glow on another page`).toBe('none');
    expectNoBox(other, `${label} other page`);
  };
  await check('normal motion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await check('reduced motion');
});

test('logo backing: none in forced colours', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ['chromium-desktop', 'chromium-mobile']);
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/he');
  await scrollToY(page, 0);
  const look = await logoBacking(page);
  expect(look.filter, 'no glow in forced colours').toBe('none');
  expectNoBox(look, 'forced colours');
});

test('logo focus ring: white at the top of the home page, ink elsewhere, 2 px, inside the header', async ({
  page,
}) => {
  const cases: [string, string][] = [
    ['/he', WHITE],
    ['/he/c/sample-ceramics', INK],
  ];
  for (const [path, wantColor] of cases) {
    await page.goto(path);
    await scrollToY(page, 0);
    // Tab from the skip link onward until the brand link has focus.
    let focused = false;
    for (let step = 0; step < 12 && !focused; step += 1) {
      await page.keyboard.press('Tab');
      focused = await page.evaluate(
        () => document.activeElement?.getAttribute('data-testid') === 'header-brand',
      );
    }
    expect(focused, `${path}: the brand link gets keyboard focus`).toBe(true);
    const ring = await page.evaluate(() => {
      const brand = document.querySelector('#site-header [data-testid="header-brand"]');
      const header = document.querySelector('#site-header');
      if (!brand || !header) throw new Error('missing element');
      const style = getComputedStyle(brand);
      const b = brand.getBoundingClientRect();
      const h = header.getBoundingClientRect();
      return {
        style: style.outlineStyle,
        width: style.outlineWidth,
        offset: style.outlineOffset,
        color: style.outlineColor,
        inside: b.top - 2 >= h.top && b.bottom + 2 <= h.bottom,
      };
    });
    expect(ring.style, `${path}: outline style`).toBe('solid');
    expect(ring.width, `${path}: outline width`).toBe('2px');
    expect(ring.offset, `${path}: outline offset`).toBe('0px');
    expect(ring.color, `${path}: outline colour`).toBe(wantColor);
    expect(ring.inside, `${path}: ring lies inside the header`).toBe(true);
  }
});

test('header is the white bar on a category page at scroll 0', async ({ page }) => {
  await page.goto('/he/c/sample-ceramics');
  await scrollToY(page, 0);
  const look = await headerLook(page);
  expect(look.color).toBe(INK);
  expect(alphaOf(look.bg), 'the bar is mostly opaque, slightly see-through').toBeGreaterThan(0.8);
  expect(alphaOf(look.bg)).toBeLessThan(1);
  expect(await headerBlur(page), 'frosted: backdrop blur').toContain('blur');
});

// ---------------------------------------------------------------- photos and text bands

test('phone: the hero download is a phone variant under 200 KB (SC-005)', async ({
  page,
}, testInfo) => {
  skipUnlessProject(testInfo, ['chromium-mobile', 'webkit-mobile']);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/he');
  const hero = page.getByTestId('home-hero').locator('img');
  await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.complete)).toBe(true);
  const currentSrc = await hero.evaluate((img: HTMLImageElement) => img.currentSrc);
  expect(currentSrc).toMatch(/-p(400|565)\./);
  const transfer = await page.evaluate((src) => {
    const entry = performance.getEntriesByName(src)[0] as PerformanceResourceTiming | undefined;
    return entry?.transferSize ?? 0;
  }, currentSrc);
  const bytes =
    transfer > 0 ? transfer : (await (await page.request.get(currentSrc)).body()).length;
  expect(bytes).toBeLessThan(200 * 1024);
});

for (const locale of LOCALES) {
  test(`${locale}: text over the hero sits inside scrim bands, and the banners have no dark layer, at 320, 375 and 1280 px, also with a 60-character shop name`, async ({
    page,
  }, testInfo) => {
    const desktop = testInfo.project.name === 'chromium-desktop';
    const widths = desktop ? [320, 375, 1280] : [320, 375];
    try {
      for (const name of [null, longShopName()]) {
        await setShopName(name);
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`/${locale}`);
          const label = `${locale} ${String(width)} px ${name === null ? 'seeded name' : '60-character name'}`;
          const report = await bandReport(page);
          expect(report.checked, `${label}: found text over the hero photo`).toBeGreaterThan(0);
          expect(report.offenders, label).toEqual([]);

          // The banners carry no dark layer: no scrim-band class anywhere in them, a transparent
          // copy box and no pseudo-element feather (owner decision 2026-11-17).
          for (const id of ['home-banner-child', 'home-banner-shelf']) {
            const section = page.getByTestId(id);
            await expect(section.locator('[class*="scrim-band"]'), `${label} ${id}`).toHaveCount(0);
            const copy = section.locator('.banner-copy');
            await expect(copy, `${label} ${id}: copy box`).toHaveCount(1);
            const look = await copy.evaluate((el) => ({
              bg: getComputedStyle(el).backgroundColor,
              image: getComputedStyle(el).backgroundImage,
              after: getComputedStyle(el, '::after').content,
            }));
            expect(look.bg, `${label} ${id}: transparent copy box`).toBe(TRANSPARENT);
            expect(look.image, `${label} ${id}: no gradient`).toBe('none');
            expect(look.after, `${label} ${id}: no feather`).toBe('none');
          }

          if (width === 1280) {
            // The copy box sits in the reading-start half: right in Hebrew, left in English.
            for (const id of ['home-banner-child', 'home-banner-shelf']) {
              const banner = await box(page.getByTestId(id));
              const band = await box(page.getByTestId(id).locator('.banner-copy'));
              const bannerMid = banner.x + banner.width / 2;
              // The whole copy box lies in the half (1 px tolerance for rounding).
              if (locale === 'he')
                expect(band.x, `${label} ${id}`).toBeGreaterThanOrEqual(bannerMid - 1);
              else expect(band.x + band.width, `${label} ${id}`).toBeLessThanOrEqual(bannerMid + 1);
            }
          }
        }
      }
    } finally {
      await setShopName(null);
    }
  });

  test(`${locale}: no sideways scroll at 320 px, also with a 60-character shop name (h1 stays in the hero)`, async ({
    page,
  }) => {
    try {
      for (const name of [null, longShopName()]) {
        await setShopName(name);
        await page.setViewportSize({ width: 320, height: 700 });
        await page.goto(`/${locale}`);
        const label = `${locale} ${name === null ? 'seeded name' : '60-character name'}`;
        expect(await noSideScroll(page), `${label}: sideways scroll`).toBeLessThanOrEqual(0);
        if (name !== null) {
          const h1 = await box(page.getByTestId('home-hero').locator('h1'));
          const hero = await box(page.getByTestId('home-hero'));
          expect(inside(h1, hero), `${label}: h1 inside the hero`).toBe(true);
        }
      }
    } finally {
      await setShopName(null);
    }
  });
}

// ---------------------------------------------------------------- the home row

for (const locale of LOCALES) {
  test(`${locale}: the row holds only published pieces of the home-row category, newest first`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);
    expect(await trackSlugs(page)).toEqual(await featuredSlugsNewestFirst());
    expect((await trackSlugs(page)).length).toBe(10);

    // Unlink one test piece from the home-row category: it leaves the row, stays on its category.
    const [piece] = await sql<{ id: string }[]>`SELECT id FROM product WHERE slug = 'e2e-home-3'`;
    if (!piece) throw new Error('No e2e-home-3');
    await sql`DELETE FROM product_category WHERE product_id = ${piece.id} AND category_id = ${featuredId}`;
    try {
      await page.goto(`/${locale}`);
      const slugs = await trackSlugs(page);
      expect(slugs).not.toContain('e2e-home-3');
      expect(slugs).toEqual(await featuredSlugsNewestFirst());
      const [other] = await sql<{ slug: string }[]>`
        SELECT c.slug FROM product_category pc JOIN category c ON c.id = pc.category_id
        WHERE pc.product_id = ${piece.id} LIMIT 1`;
      if (!other) throw new Error('e2e-home-3 has no other category');
      await page.goto(`/${locale}/c/${other.slug}`);
      await expect(page.locator('a[href$="/p/e2e-home-3"]')).toHaveCount(1);
    } finally {
      await sql`INSERT INTO product_category (product_id, category_id) VALUES (${piece.id}, ${featuredId}) ON CONFLICT DO NOTHING`;
    }

    // A draft piece disappears from the row.
    await sql`UPDATE product SET state = 'draft' WHERE slug = 'sample-clay-mug'`;
    try {
      await page.goto(`/${locale}`);
      expect(await trackSlugs(page)).not.toContain('sample-clay-mug');
    } finally {
      await sql`UPDATE product SET state = 'published' WHERE slug = 'sample-clay-mug'`;
    }
  });
}

test('at 375 px about two cards and part of a third show; the track scrolls, the page does not', async ({
  page,
}) => {
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 800 });
    for (const locale of LOCALES) {
      await page.goto(`/${locale}`);
      const track = await box(page.getByTestId('home-row-track'));
      const items = trackItems(page);
      if (width === 375) {
        expect(inside(await box(items.nth(0)), track), 'card 1 whole').toBe(true);
        expect(inside(await box(items.nth(1)), track), 'card 2 whole').toBe(true);
        const third = await box(items.nth(2));
        const crosses =
          third.x + third.width > track.x + 1 &&
          third.x < track.x + track.width - 1 &&
          !inside(third, track);
        expect(crosses, 'the third card crosses the track end edge').toBe(true);
      }
      // Scroll toward the reading end: a later card becomes visible.
      const rtl = locale === 'he';
      await page.getByTestId('home-row-track').evaluate(
        (el, sign) => {
          el.scrollLeft = sign * (el.scrollWidth - el.clientWidth);
        },
        rtl ? -1 : 1,
      );
      await expect
        .poll(async () =>
          inside(await box(items.last()), await box(page.getByTestId('home-row-track'))),
        )
        .toBe(true);
      expect(
        await noSideScroll(page),
        `${locale} ${String(width)} px: page scroll`,
      ).toBeLessThanOrEqual(0);
    }
  }
});

test('at 1280 px four whole cards show in the row', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ['chromium-desktop']);
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const locale of LOCALES) {
    await page.goto(`/${locale}`);
    const track = await box(page.getByTestId('home-row-track'));
    const items = trackItems(page);
    for (let i = 0; i < 4; i += 1) {
      expect(inside(await box(items.nth(i)), track), `${locale}: card ${String(i + 1)} whole`).toBe(
        true,
      );
    }
    expect(inside(await box(items.nth(4)), track), `${locale}: card 5 not whole`).toBe(false);
  }
});

test('keyboard: Tab from "view all" through the cards brings card 5 fully into the track', async ({
  page,
}, testInfo) => {
  skipUnlessProject(testInfo, ['chromium-desktop']);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/he');
  const items = trackItems(page);
  const fifthLink = items.nth(4).getByTestId('product-card');
  await page.getByTestId('home-row-view-all').focus();
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    if (await fifthLink.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(fifthLink).toBeFocused();
  await expect
    .poll(async () =>
      inside(await box(items.nth(4)), await box(page.getByTestId('home-row-track'))),
    )
    .toBe(true);
});

test('arrows: names, disabled ends, direction, and instant movement under reduced motion', async ({
  page,
}, testInfo) => {
  skipUnlessProject(testInfo, ['chromium-desktop']);
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const locale of LOCALES) {
    await page.goto(`/${locale}`);
    const previous = page.getByTestId('home-row-previous');
    const next = page.getByTestId('home-row-next');
    await expect(previous).toHaveAccessibleName(message(locale, 'shop.home.row.previous'));
    await expect(next).toHaveAccessibleName(message(locale, 'shop.home.row.next'));
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();

    const track = page.getByTestId('home-row-track');
    const items = trackItems(page);
    await next.click();
    await expect(previous).toBeEnabled();
    await expect.poll(async () => inside(await box(items.nth(4)), await box(track))).toBe(true);
    const fourth = await box(items.nth(3));
    const fifth = await box(items.nth(4));
    // Hebrew moves toward the left (card 5 is left of card 4); English toward the right.
    if (locale === 'he') expect(fifth.x).toBeLessThan(fourth.x);
    else expect(fifth.x).toBeGreaterThan(fourth.x);

    for (let i = 0; i < 6 && (await next.isEnabled()); i += 1) {
      await next.click();
      // Wait for the smooth scroll to settle: scrollLeft stops changing between polls.
      let last = Number.NaN;
      await expect
        .poll(async () => {
          const now = await track.evaluate((el) => el.scrollLeft);
          const settled = now === last;
          last = now;
          return settled;
        })
        .toBe(true);
    }
    await expect(next).toBeDisabled();
    await expect(previous).toBeEnabled();
  }

  // Reduced motion: one press reaches its final position on the next animation frame.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en');
  const track = page.getByTestId('home-row-track');
  await page.getByTestId('home-row-next').click();
  await nextFrames(page, 1);
  expect(
    inside(await box(trackItems(page).nth(4)), await box(track)),
    'card 5 in view on the next frame',
  ).toBe(true);
});

test('below 900 px no arrow button is visible', async ({ page }) => {
  await page.setViewportSize({ width: 899, height: 800 });
  await page.goto('/he');
  await expect(page.getByTestId('home-row-next')).toBeHidden();
  await expect(page.getByTestId('home-row-previous')).toBeHidden();
});

test('with no home-row category the row is absent and the rest of the page stays', async ({
  page,
}) => {
  await sql`UPDATE shop_settings SET home_category_id = NULL WHERE id = 1`;
  try {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}`);
      await expect(page.getByTestId('home-row')).toHaveCount(0);
      for (const id of ['home-hero', 'home-banner-child', 'home-band', 'home-banner-shelf']) {
        await expect(page.getByTestId(id), id).toBeVisible();
      }
    }
  } finally {
    await sql`UPDATE shop_settings SET home_category_id = ${featuredId} WHERE id = 1`;
  }
});

// 007 Phase D gate (tasks.md T074; FR-010, FR-042, research D20): the hero has no tagline, and its
// top band's strong stop ends where the header ends. Fails until T079.
test('at scroll 0 the hero has no paragraph, the h1 is the shop name, and the header ends within the top band strong stop', async ({
  page,
}, testInfo) => {
  skipUnlessProject(testInfo, ['chromium-mobile']);
  for (const locale of LOCALES) {
    for (const width of [375, 1280]) {
      const label = `${locale} at ${String(width)} px`;
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/${locale}`);
      const hero = page.getByTestId('home-hero');
      await expect(hero, label).toBeVisible();
      await expect(hero.locator('p'), `${label}: no <p> in the hero`).toHaveCount(0);
      await expect(hero.locator('h1'), label).toHaveText(await shopName(locale));
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      const measured = await page.evaluate(() => {
        const header = document.querySelector('#site-header')?.getBoundingClientRect();
        const probe = document.createElement('div');
        probe.setAttribute('aria-hidden', 'true');
        probe.className = 'absolute invisible';
        document.body.append(probe);
        // Resolve `var(--header-h)` to pixels through a computed property, no style attribute kept.
        probe.style.height = 'var(--header-h)';
        const headerH = probe.getBoundingClientRect().height;
        probe.remove();
        return { headerTop: header?.top ?? 0, headerBottom: header?.bottom ?? 0, headerH };
      });
      // The free-shipping strip sits above the header and the hero, so measure from the band.
      const band = hero.locator('.scrim-band-top');
      await expect(band, `${label}: the blended top band stays`).toHaveCount(1);
      const bandBox = await band.boundingBox();
      if (!bandBox) throw new Error(`${label}: no band box`);
      expect(measured.headerTop, `${label}: header starts at the band's top`).toBeCloseTo(
        bandBox.y,
        0,
      );
      expect(
        measured.headerBottom,
        `${label}: header bottom <= the band's --header-h stop`,
      ).toBeLessThanOrEqual(bandBox.y + measured.headerH + 0.5);
      expect(bandBox.height, `${label}: top band covers the header`).toBeGreaterThanOrEqual(
        measured.headerH - 0.5,
      );
    }
  }
});
