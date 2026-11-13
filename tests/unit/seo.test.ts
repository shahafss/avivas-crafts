import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/env', () => ({
  getEnv: () => ({ APP_ORIGIN: 'https://shop.example' }),
}));

import { alternates } from '@/server/seo';

const O = 'https://shop.example';

describe('alternates (contracts/seo.md)', () => {
  it('gives the home page without a trailing slash and Hebrew as x-default', () => {
    expect(alternates('', 'en')).toEqual({
      canonical: `${O}/en`,
      languages: { he: `${O}/he`, en: `${O}/en`, 'x-default': `${O}/he` },
    });
  });

  it('gives a product page its own canonical and both versions', () => {
    expect(alternates('/p/clay-bowl', 'he')).toEqual({
      canonical: `${O}/he/p/clay-bowl`,
      languages: {
        he: `${O}/he/p/clay-bowl`,
        en: `${O}/en/p/clay-bowl`,
        'x-default': `${O}/he/p/clay-bowl`,
      },
    });
  });
});
