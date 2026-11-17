'use client';

import { useEffect } from 'react';

/**
 * Keeps `data-at-top` on `#site-header` while the page is scrolled all the way to the top
 * (storefront.md §4, research D5). CSS turns that into the see-through look on the home page and
 * fades it in time (about 250 ms) as soon as the page is scrolled even 1 px. The server renders the
 * attribute, so a page loaded at the top has no flash. Renders nothing.
 */
export function HeaderScrollState() {
  useEffect(() => {
    const header = document.getElementById('site-header');
    if (!header) return;
    const update = (): void => {
      header.toggleAttribute('data-at-top', window.scrollY <= 0);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
    };
  }, []);
  return null;
}
