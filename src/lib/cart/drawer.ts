/**
 * Opening the cart drawer from code (research D21, FR-047). The drawer is a native popover; the
 * `DrawerController` island does the rest (position under the strip, modality, focus return).
 */

export const CART_DRAWER_ID = 'cart-drawer';

/** The control that opened each drawer, so focus can go back to it when the drawer closes. */
const openers = new Map<string, HTMLElement>();

const keepOpen = new WeakSet<Event>();

/**
 * A control inside a drawer that must keep the drawer open although it is a link (the cart's
 * blocked "to checkout") calls this with its click event (`event.nativeEvent` in React).
 * `DrawerController` skips marked events.
 */
export function keepDrawerOpen(event: Event): void {
  keepOpen.add(event);
}

export function isKeptOpen(event: Event): boolean {
  return keepOpen.has(event);
}

export function rememberOpener(drawerId: string, opener: HTMLElement | null): void {
  if (opener === null) openers.delete(drawerId);
  else openers.set(drawerId, opener);
}

export function openerOf(drawerId: string): HTMLElement | undefined {
  return openers.get(drawerId);
}

/**
 * Opens the cart drawer. `opener` is the control that gets focus back on close (default: the
 * element that has focus now). Does nothing when the drawer is missing or already open.
 */
export function openCartDrawer(opener?: HTMLElement | null): void {
  if (typeof document === 'undefined') return;
  const drawer = document.getElementById(CART_DRAWER_ID);
  if (drawer === null || drawer.matches(':popover-open')) return;
  const from =
    opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  rememberOpener(CART_DRAWER_ID, from === document.body ? null : from);
  drawer.showPopover();
}
