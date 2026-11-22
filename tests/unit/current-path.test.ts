// 010 US2 (tasks.md T015; contracts/navigation-links.md): the pure rule behind `aria-current`.
import { describe, expect, it } from 'vitest';
import { isCurrentPath } from '@/lib/nav/current-path';

describe('isCurrentPath', () => {
  it('matches an exact path', () => {
    expect(isCurrentPath('/en/pages/about', '/en/pages/about')).toBe(true);
    expect(isCurrentPath('/he/category/featured', '/he/category/featured')).toBe(true);
  });

  it('ignores a trailing slash on either side', () => {
    expect(isCurrentPath('/en/pages/about/', '/en/pages/about')).toBe(true);
    expect(isCurrentPath('/en/pages/about', '/en/pages/about/')).toBe(true);
  });

  it('ignores a query or hash on the href', () => {
    expect(isCurrentPath('/en/shop', '/en/shop?sort=price-asc')).toBe(true);
    expect(isCurrentPath('/en/shop', '/en/shop#top')).toBe(true);
  });

  it('ignores a query on the page path', () => {
    expect(isCurrentPath('/en/shop?page=2', '/en/shop')).toBe(true);
  });

  it('matches nothing on a different page', () => {
    expect(isCurrentPath('/he/product/x', '/he/shop')).toBe(false);
    expect(isCurrentPath('/he', '/he/shop')).toBe(false);
    expect(isCurrentPath('/he/shop', '/he')).toBe(false);
  });

  it('does not match across languages', () => {
    expect(isCurrentPath('/en/pages/about', '/he/pages/about')).toBe(false);
  });

  it('keeps the root path', () => {
    expect(isCurrentPath('/', '/')).toBe(true);
  });
});
