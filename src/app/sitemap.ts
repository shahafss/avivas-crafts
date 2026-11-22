import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { listSitemapEntries } from '@/server/catalog/public-queries';
import { CONTENT_SLUGS } from '@/server/content/slugs';
import { getEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

// Every public page once per language. No language-alternate lines: the page heads carry the
// hreflang pairs (src/server/seo.ts; 010 research D8), and without them Chrome shows the file as a
// tree. Search, cart, checkout, order pages, admin and api are left out.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getEnv().APP_ORIGIN;
  const { products, categorySlugs } = await listSitemapEntries();
  const pages: { path: string; lastModified?: Date }[] = [
    { path: '' },
    { path: '/shop' },
    ...categorySlugs.map((slug) => ({ path: `/category/${slug}` })),
    ...products.map((item) => ({ path: `/product/${item.slug}`, lastModified: item.updatedAt })),
    ...CONTENT_SLUGS.filter((slug) => slug !== 'contact').map((slug) => ({
      path: `/pages/${slug}`,
    })),
    { path: '/contact' },
  ];
  return pages.flatMap(({ path, lastModified }) =>
    routing.locales.map((locale) => ({
      url: `${origin}/${locale}${path}`,
      ...(lastModified === undefined ? {} : { lastModified }),
    })),
  );
}
