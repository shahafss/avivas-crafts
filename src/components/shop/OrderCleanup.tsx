'use client';

import { useEffect } from 'react';
import { clearCart } from '@/lib/cart/store';

/**
 * Renders nothing. Removes the saved checkout inputs (`ac_checkout`) and, when the order was
 * created less than an hour ago, the cart too, so a cart is cleared even if the checkout or
 * return page could not do it; an old order link opened later never empties a newer cart.
 */
export function OrderCleanup({ justPlaced }: { justPlaced: boolean }) {
  useEffect(() => {
    try {
      window.sessionStorage.removeItem('ac_checkout');
    } catch {
      // nothing stored
    }
    if (justPlaced) clearCart();
  }, [justPlaced]);
  return null;
}
