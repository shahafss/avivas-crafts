import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/env', () => ({
  getEnv: () => ({ APP_ORIGIN: 'https://shop.example' }),
}));

import { ogImage } from '@/lib/brand';
import { alternates, defaultSocial, pageMetadata } from '@/server/seo';

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

describe('pageMetadata (contracts/metadata.md)', () => {
  const siteName = 'Aviva’s Crafts';
  const og = ogImage();

  it.each([
    ['he', '', 'he_IL', 'שלום', 'תיאור'],
    ['en', '', 'en_US', 'Hello', 'About'],
    ['he', '/pages/about', 'he_IL', 'עלינו', 'תיאור הדף'],
    ['en', '/pages/about', 'en_US', 'About us', 'Page text'],
    ['he', '/contact', 'he_IL', 'יצירת קשר', 'כתבו לי'],
    ['en', '/contact', 'en_US', 'Contact', 'Write to me'],
  ] as const)('%s %s: Open Graph and Twitter values with absolute URLs', (locale, path, ogLocale, title, description) => {
    const meta = pageMetadata({ locale, path, title, description, siteName });
    expect(meta.alternates).toEqual(alternates(path, locale));
    expect(meta.description).toBe(description);
    expect(meta.openGraph).toMatchObject({
      type: 'website',
      siteName,
      locale: ogLocale,
      url: `${O}/${locale}${path}`,
      title,
      description,
      images: [{ url: `${O}${og.url}`, width: 1200, height: 630, alt: siteName }],
    });
    expect(meta.twitter).toMatchObject({
      card: 'summary_large_image',
      title,
      description,
      images: [`${O}${og.url}`],
    });
    expect(og.url.startsWith('/brand/og.')).toBe(true);
  });
});

describe('defaultSocial (layout defaults)', () => {
  it('has the site name, locale, description and image but no url', () => {
    const meta = defaultSocial({ locale: 'en', description: 'D', siteName: 'S' });
    expect(meta.openGraph).toMatchObject({ siteName: 'S', locale: 'en_US', description: 'D' });
    expect(meta.openGraph).not.toHaveProperty('url');
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image', description: 'D' });
  });
});
