// Storefront helpers shared by the headers, a11y and storefront-layout specs (006 T018-T020).
import type { Browser, Locator, Page, TestInfo } from '@playwright/test';
import { expect, sql, waitForFormAge } from './fixtures';

/** Puts one unit of the product into this browser's cart (same storage as the real cart). */
export async function putCartItem(page: Page, slug: string): Promise<void> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM product WHERE slug = ${slug}`;
  if (row === undefined) throw new Error(`No product ${slug}`);
  await page.goto('/he/contact');
  await page.evaluate((productId) => {
    localStorage.setItem(
      'ac_cart_v1',
      JSON.stringify({
        v: 1,
        updatedAt: new Date().toISOString(),
        items: [{ productId, optionValueIds: [], quantity: 1, addedAt: new Date().toISOString() }],
      }),
    );
  }, row.id);
}

/** Places an offline pickup order in a throw-away context and returns the order page's path
 * without the locale prefix (`/order/<token>`). */
export async function placeOfflineOrder(browser: Browser, testInfo: TestInfo): Promise<string> {
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL) });
  try {
    const page = await context.newPage();
    await putCartItem(page, 'sample-clay-mug');
    await page.goto('/he/checkout');
    await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('field-fullName').fill('דנה כהן');
    await page.getByTestId('field-phone').fill('052-234-5678');
    await page.getByTestId('field-email').fill('dana@example.com');
    await page.getByTestId('delivery-pickup').check();
    await page.getByTestId('payment-offline').check();
    await page.getByTestId('accept-terms').check();
    await waitForFormAge(page);
    await page.getByTestId('place-order').click();
    await page.waitForURL(/\/he\/order\//, { timeout: 30_000 });
    return new URL(page.url()).pathname.replace(/^\/he/, '');
  } finally {
    await context.close();
  }
}

/** Waits until React has attached its handlers to the element (a click before that is lost). */
export async function hydrated(page: Page, testId: string): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      return element !== null && Object.keys(element).some((key) => key.startsWith('__reactProps'));
    },
    testId,
    { timeout: 20_000 },
  );
}

// ---------------------------------------------------------------- drawers (007 T092/T093, D21)

/** Waits until the CSS transitions on the page (the drawer slide, the X) have finished. */
export async function transitionsDone(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

/**
 * Opens the cart drawer from the header's cart button (hydrated first, a click before that is
 * lost) and returns it. Call it on a page where the drawer is closed.
 */
export async function openCartDrawer(page: Page): Promise<Locator> {
  await hydrated(page, 'cart-link');
  // A coordinate click: `locator.click()` scrolls a sticky header control "into view" first, which
  // moves the page (Chromium to 0, WebKit to a different offset) because of `scroll-padding-top`.
  const button = await boxOf(page.getByTestId('cart-link'));
  await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
  const drawer = page.getByTestId('cart-drawer');
  await expect(drawer).toBeVisible();
  return drawer;
}

/** Opens the cart drawer unless it is open, then waits for the lazy body to show its lines. */
export async function ensureCartDrawerWithLines(page: Page): Promise<Locator> {
  const drawer = page.getByTestId('cart-drawer');
  if (!(await drawer.isVisible())) await openCartDrawer(page);
  await expect(drawer.getByTestId('cart-line').first()).toBeVisible({ timeout: 20_000 });
  await hydrated(page, 'cart-continue');
  return drawer;
}

export interface DrawerGeometry {
  drawer: { top: number; bottom: number; left: number; right: number; width: number };
  header: { top: number };
  strip: { bottom: number };
  /** What a tap at the middle of the strip would hit: inside the drawer or not. */
  stripHitsDrawer: boolean;
  /** Width of the `<html>` box: the drawer's side and the strip of page are measured against it. */
  width: number;
  htmlLeft: number;
  height: number;
}

/** Measures the open drawer `#id`, the header and the strip, once the transitions are done. */
export async function measureDrawer(page: Page, id: string): Promise<DrawerGeometry> {
  await transitionsDone(page);
  return page.evaluate((drawerId) => {
    const drawer = document.getElementById(drawerId);
    const header = document.getElementById('site-header');
    const strip = document.querySelector('[data-testid="announcement-bar"]');
    if (!drawer || !header || !strip) throw new Error('drawer, header or strip missing');
    const d = drawer.getBoundingClientRect();
    const html = document.documentElement.getBoundingClientRect();
    return {
      drawer: { top: d.top, bottom: d.bottom, left: d.left, right: d.right, width: d.width },
      header: { top: header.getBoundingClientRect().top },
      strip: { bottom: strip.getBoundingClientRect().bottom },
      // The backdrop belongs to the drawer for hit testing, so a covered strip would hit the drawer;
      // the strip itself is inert while the drawer is open, so an uncovered one hits the page below.
      stripHitsDrawer: (() => {
        const r = strip.getBoundingClientRect();
        if (r.bottom <= 0) return false;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit !== null && drawer.contains(hit);
      })(),
      // The `<html>` box, not `clientWidth`: with `scrollbar-gutter: stable` the page is laid out
      // narrower than `clientWidth` where scrollbars are hidden (headless Chromium), and the
      // drawer is flush with `<html>`.
      width: html.right - html.left,
      htmlLeft: html.left,
      height: window.innerHeight,
    };
  }, id);
}

/**
 * FR-044 / FR-046: the open drawer starts at the header's top edge as it is on screen, reaches the
 * viewport bottom, sits on the given side, leaves a strip of page to tap, and never covers the
 * green strip (its backdrop starts at the same line).
 */
export async function expectDrawerGeometry(
  page: Page,
  id: string,
  side: 'left' | 'right',
  label: string,
): Promise<void> {
  const m = await measureDrawer(page, id);
  expect(
    Math.abs(m.drawer.top - m.header.top),
    `${label}: top edge = header top`,
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(m.drawer.bottom - m.height),
    `${label}: reaches the viewport bottom`,
  ).toBeLessThanOrEqual(1);
  if (side === 'right') {
    expect(
      Math.abs(m.drawer.right - (m.htmlLeft + m.width)),
      `${label}: at the right edge`,
    ).toBeLessThanOrEqual(1);
  } else {
    expect(Math.abs(m.drawer.left - m.htmlLeft), `${label}: at the left edge`).toBeLessThanOrEqual(1);
  }
  expect(m.width - m.drawer.width, `${label}: a strip of page stays to tap`).toBeGreaterThanOrEqual(
    40,
  );
  if (m.strip.bottom > 0) {
    expect(m.drawer.top, `${label}: the strip is not covered`).toBeGreaterThanOrEqual(
      m.strip.bottom - 1,
    );
    expect(m.stripHitsDrawer, `${label}: the drawer and its backdrop do not cover the strip`).toBe(
      false,
    );
  }
}

/** Box of a locator or a fail. */
export async function boxOf(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('missing box');
  return b;
}

/** True when header, `<main>`, footer and the strip are all inert (the modal drawer is open). */
export async function pageIsInert(page: Page): Promise<boolean[]> {
  return page.evaluate(() =>
    ['#site-header', 'main', 'footer', '[data-testid="announcement-bar"]'].map(
      (selector) => document.querySelector<HTMLElement>(selector)?.inert === true,
    ),
  );
}

/** No part of the page is inert and the page is not scroll-locked (nothing left over). */
export async function nothingLeftOpen(page: Page): Promise<void> {
  await transitionsDone(page);
  expect(
    await page.evaluate(() => document.querySelectorAll('[inert]').length),
    'no inert part left',
  ).toBe(0);
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).overflow),
    'no scroll lock left',
  ).not.toBe('hidden');
  expect(
    await page.evaluate(() => document.querySelectorAll('[popover]:popover-open').length),
    'no drawer left open',
  ).toBe(0);
}

/**
 * The line spans of a menu button or close button (spans at most 3 px high in layout, whatever
 * their rotation), with their rotation in degrees (from `rotate` or the transform matrix),
 * opacity and centre.
 */
export async function burgerLines(
  button: Locator,
): Promise<{ rotation: number; opacity: number; centreX: number; centreY: number }[]> {
  return button.evaluate((element) =>
    [...element.querySelectorAll<HTMLElement>('span')]
      .filter((span) => span.offsetHeight > 0 && span.offsetHeight <= 3 && span.offsetWidth >= 12)
      .map((span) => {
        const style = getComputedStyle(span);
        let rotation = 0;
        const rotate = /(-?[\d.]+)deg/.exec(style.rotate);
        if (style.rotate !== 'none' && rotate?.[1] !== undefined) rotation = Number(rotate[1]);
        else if (style.transform !== 'none') {
          const m = new DOMMatrixReadOnly(style.transform);
          rotation = (Math.atan2(m.b, m.a) * 180) / Math.PI;
        }
        const rect = span.getBoundingClientRect();
        return {
          rotation,
          opacity: Number(style.opacity),
          centreX: rect.left + rect.width / 2,
          centreY: rect.top + rect.height / 2,
        };
      }),
  );
}

/**
 * Focusable controls outside the open drawer `#id` that are NOT inert (they or an ancestor must be
 * inert while a modal drawer is open): the list is empty when focus cannot leave the drawer.
 * Generic: it covers the skip links and the consent banner, not a named list of parts.
 */
export async function reachableOutside(page: Page, id: string): Promise<string[]> {
  return page.evaluate((drawerId) => {
    const drawer = document.getElementById(drawerId);
    if (!drawer) throw new Error(`no #${drawerId}`);
    const found: string[] = [];
    for (const element of document.body.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, summary, [tabindex]',
    )) {
      if (drawer.contains(element) || element.contains(drawer)) continue;
      if (element.closest('[inert]') !== null) continue;
      if (element.closest('[popover]:not(:popover-open)') !== null) continue; // a closed drawer
      if (element.tabIndex < 0) continue;
      found.push(
        `${element.tagName.toLowerCase()}[${element.getAttribute('data-testid') ?? element.getAttribute('href') ?? element.textContent.trim().slice(0, 20)}]`,
      );
    }
    return found;
  }, id);
}

/** Number of CSS transitions running right now on the element `selector` or inside it. */
export async function runningTransitionsOn(page: Page, selector: string): Promise<number> {
  return page.evaluate((query) => {
    return document
      .getAnimations()
      .filter(
        (animation) =>
          animation instanceof CSSTransition &&
          animation.effect instanceof KeyframeEffect &&
          animation.effect.target instanceof Element &&
          animation.effect.target.closest(query) !== null &&
          animation.playState === 'running',
      ).length;
  }, selector);
}

/**
 * The accessibility tree's "expanded" state of the element (Chromium only), or undefined when the
 * tree does not report one. A popover invoker reports it natively.
 */
export async function expandedState(page: Page, selector: string): Promise<boolean | undefined> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const evaluated = await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(selector)})`,
    });
    const objectId = evaluated.result.objectId;
    if (objectId === undefined) throw new Error(`no ${selector}`);
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
      objectId,
      fetchRelatives: false,
    });
    const property = nodes[0]?.properties?.find((item) => item.name === 'expanded');
    return property === undefined ? undefined : property.value.value === true;
  } finally {
    await cdp.detach();
  }
}
