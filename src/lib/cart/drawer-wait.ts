import { CART_DRAWER_ID } from './drawer';

/**
 * Runs `callback` once the cart drawer is closed: at once when it is not open now, otherwise when
 * it closes (the checkout's empty-cart redirect waits for the visitor, FR-047). Returns a cleanup
 * that cancels a pending call.
 */
export function whenCartDrawerClosed(callback: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const isOpen = (): boolean =>
    document.getElementById(CART_DRAWER_ID)?.matches(':popover-open') === true;
  if (!isOpen()) {
    callback();
    return () => undefined;
  }
  const onToggle = (): void => {
    if (isOpen()) return;
    document.removeEventListener('toggle', onToggle, true);
    callback();
  };
  // `toggle` does not bubble: listen in the capture phase.
  document.addEventListener('toggle', onToggle, true);
  return () => {
    document.removeEventListener('toggle', onToggle, true);
  };
}
