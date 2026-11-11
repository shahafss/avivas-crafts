'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

// Cookieless page-view beacon (003 research R12): no storage, no identifier, no markup. Checkout
// and order paths are never sent, so an order-page token never leaves the browser in a beacon.
const PRIVATE = /^\/[^/]+\/(?:checkout|order)(?:\/|$)/;

/** The referrer's host, lower-cased; "" when there is none (a direct arrival). */
function referrerHost(): string {
  try {
    return document.referrer === '' ? '' : new URL(document.referrer).host.toLowerCase();
  } catch {
    return '';
  }
}

export function StatsBeacon() {
  const pathname = usePathname();
  const sent = useRef(false);

  useEffect(() => {
    if (PRIVATE.test(pathname)) return;
    // `r` rides only with the first beacon this document actually sends.
    const body = sent.current ? { p: pathname } : { p: pathname, r: referrerHost() };
    sent.current = true;
    navigator.sendBeacon('/api/v', JSON.stringify(body));
  }, [pathname]);

  return null;
}
