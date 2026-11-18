'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { Notice } from '@/components/ui/Notice';
import { Skeleton } from '@/components/ui/Skeleton';
import { CART_DRAWER_ID, isKeptOpen, openerOf, rememberOpener } from '@/lib/cart/drawer';
import { ModalTracker } from '@/lib/drawer/modal';

const MENU_ID = 'site-menu';
const DRAWER_IDS: readonly string[] = [MENU_ID, CART_DRAWER_ID];
/** The header's `nav` breakpoint (`--breakpoint-nav` in `globals.css`). */
const NAV_QUERY = '(min-width: 64rem)';

type CartBody = ComponentType<{ freeShippingOverMinor: number | null }>;

/**
 * The cart body is a lazy island: pages do not pay for it until a drawer opens (D21). A plain
 * dynamic `import()` instead of `next/dynamic`, which would add its loader to every page.
 */
const loadCartBody = (): Promise<CartBody> =>
  import('./CartDrawerBody').then((module) => module.CartDrawerBody);

const isOpen = (id: string): boolean =>
  document.getElementById(id)?.matches(':popover-open') === true;

function drawerOf(event: Event): HTMLElement | null {
  const target = event.target;
  return target instanceof HTMLElement &&
    DRAWER_IDS.includes(target.id) &&
    target.hasAttribute('popover')
    ? target
    : null;
}

const openDrawers = (): string[] => DRAWER_IDS.filter(isOpen);

/**
 * The one island behind both side drawers (research D21, storefront.md 7.18, 7.34). It renders
 * nothing itself except the cart body, which it loads on the first open of the cart drawer.
 *
 * - `--drawer-top` on `<html>` (CSSOM, allowed by the CSP) is the header's top edge on screen, set
 *   just before a drawer shows, so the drawer and its backdrop never cover the green strip.
 * - Modal: every other top-level child of `<body>` is `inert` while a drawer is open.
 * - Focus returns to the control that opened the drawer, also after light dismiss.
 * - A drawer closes on navigation and on following a link inside it; the menu closes when the
 *   viewport reaches the `nav` breakpoint.
 */
export function DrawerController({
  freeShippingOverMinor,
}: {
  freeShippingOverMinor: number | null;
}) {
  const [cartRequested, setCartRequested] = useState(false);
  const [Body, setBody] = useState<CartBody | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const t = useTranslations('cart');
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  useEffect(() => {
    // Strict Mode (dev) runs the effect, cleans it up and runs it again: a microtask queued by the
    // first run must not mark the page inert through its discarded tracker.
    let active = true;
    const modal = new ModalTracker<HTMLElement>(() =>
      Array.from(document.body.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      ),
    );

    // The invoker: remember it for the focus return (the "hide" buttons are not openers).
    const onClickCapture = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const invoker = target.closest<HTMLElement>('[popovertarget]');
      const id = invoker?.getAttribute('popovertarget') ?? '';
      if (invoker === null || !DRAWER_IDS.includes(id)) return;
      if (invoker.getAttribute('popovertargetaction') === 'hide') return;
      rememberOpener(id, invoker);
    };

    const onOpen = (drawer: HTMLElement): void => {
      const header = document.getElementById('site-header');
      if (header !== null) {
        document.documentElement.style.setProperty(
          '--drawer-top',
          `${String(Math.max(0, Math.round(header.getBoundingClientRect().top)))}px`,
        );
      }
      modal.opened(drawer.id, drawer);
      if (drawer.id === CART_DRAWER_ID) {
        setLoadFailed(false);
        setCartRequested(true);
      }
    };

    // Opened before hydration (the invoker works without JavaScript): run the full open path now,
    // so the drawer is modal, placed under the strip, and its body loads.
    queueMicrotask(() => {
      if (!active) return;
      for (const id of openDrawers()) {
        const drawer = document.getElementById(id);
        if (drawer !== null) onOpen(drawer);
      }
    });

    const onBeforeToggle = (event: Event): void => {
      const drawer = drawerOf(event);
      if (drawer === null) return;
      const state = (event as ToggleEvent).newState;
      if (state === 'open') {
        onOpen(drawer);
      } else if (state === 'closed') {
        // Before the browser moves focus, so focus can land on a control of the page again.
        modal.closed(drawer.id);
      }
    };

    const onToggle = (event: Event): void => {
      const drawer = drawerOf(event);
      if (drawer === null) return;
      const state = (event as ToggleEvent).newState;
      modal.reconcile(openDrawers());
      if (state !== 'closed' || openDrawers().length > 0) return;
      const active = document.activeElement;
      if (active === null || active === document.body || drawer.contains(active)) {
        const opener = openerOf(drawer.id);
        if (opener?.isConnected === true) opener.focus();
      }
    };

    // A click on a link inside an open drawer closes it, whatever the router does with the click
    // (Next's `Link` always prevents the default, and a link to the current page changes no
    // pathname). A control that must keep the drawer open says so with `keepDrawerOpen(event)`.
    // Clicks that do not follow the link in this tab (new tab, download, `#` links) are ignored.
    const onLinkClick = (event: MouseEvent): void => {
      if (isKeptOpen(event)) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a[href]');
      if (link === null || link.getAttribute('href')?.startsWith('#') === true) return;
      const targetAttr = link.getAttribute('target');
      if ((targetAttr !== null && targetAttr !== '_self') || link.hasAttribute('download')) return;
      const drawer = link.closest<HTMLElement>('[popover]');
      if (drawer !== null && DRAWER_IDS.includes(drawer.id) && isOpen(drawer.id)) {
        drawer.hidePopover();
      }
    };

    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('beforetoggle', onBeforeToggle, true);
    document.addEventListener('toggle', onToggle, true);
    window.addEventListener('click', onLinkClick);

    const media = window.matchMedia(NAV_QUERY);
    const onBreakpoint = (): void => {
      if (media.matches && isOpen(MENU_ID)) document.getElementById(MENU_ID)?.hidePopover();
    };
    media.addEventListener('change', onBreakpoint);

    return () => {
      active = false;
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('beforetoggle', onBeforeToggle, true);
      document.removeEventListener('toggle', onToggle, true);
      window.removeEventListener('click', onLinkClick);
      media.removeEventListener('change', onBreakpoint);
      modal.reconcile([]);
    };
  }, []);

  // A navigation leaves no drawer open.
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    for (const id of openDrawers()) document.getElementById(id)?.hidePopover();
  }, [pathname]);

  useEffect(() => {
    if (!cartRequested) return;
    let alive = true;
    loadCartBody().then(
      (component) => {
        if (alive) setBody(() => component);
      },
      () => {
        // The chunk did not load (offline, a new deploy): show the failure, and let the next
        // open of the drawer try again.
        if (!alive) return;
        setLoadFailed(true);
        setCartRequested(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [cartRequested]);

  // `cartRequested` only becomes true in the browser, so reading the DOM here is safe.
  const cartHost =
    cartRequested || loadFailed ? document.getElementById('cart-drawer-body') : null;
  if (cartHost === null) return null;
  if (Body !== null) {
    return createPortal(<Body freeShippingOverMinor={freeShippingOverMinor} />, cartHost);
  }
  return createPortal(
    loadFailed ? (
      <Notice tone="alert" role="alert">
        <p className="font-bold">{t('loadError')}</p>
      </Notice>
    ) : (
      <Skeleton variant="line" label={t('loading')} />
    ),
    cartHost,
  );
}
