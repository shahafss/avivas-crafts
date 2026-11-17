import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { HomeHero } from '@/components/shop/HomeHero';
import { HomeRow } from '@/components/shop/HomeRow';
import { PhotoBanner } from '@/components/shop/PhotoBanner';
import { StatementBand } from '@/components/shop/StatementBand';
import { routing } from '@/i18n/routing';
import { pick } from '@/lib/i18n-fallback';
import { getHomeRow } from '@/server/catalog/public-queries';
import { alternates } from '@/server/seo';
import { getSettings } from '@/server/settings/settings';

/**
 * The sections under the row, in the order of the Shopify shop the owner chose (FR-010 as
 * amended, 2026-11-16): the child banner, the peach band, the shelf banner.
 */
const LOWER_SECTIONS = ['bannerChild', 'band', 'bannerShelf'] as const;

const TEST_IDS = { bannerChild: 'home-banner-child', bannerShelf: 'home-banner-shelf' } as const;

// The layout supplies the title; the home page adds its canonical and language versions.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return { alternates: alternates('', locale) };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const [home, settings, row] = await Promise.all([
    getTranslations({ locale, namespace: 'shop.home' }),
    getSettings(),
    getHomeRow(locale),
  ]);
  const shop = `/${locale}/shop`;

  return (
    <div data-full-bleed>
      <HomeHero
        name={pick(locale, settings.shopNameHe, settings.shopNameEn)}
        alt={home('hero.alt')}
      />
      {row === null ? null : <HomeRow row={row} locale={locale} />}
      {LOWER_SECTIONS.map((section) => {
        switch (section) {
          case 'bannerChild':
            return (
              <PhotoBanner
                key={section}
                id="bannerChild"
                testId={TEST_IDS.bannerChild}
                heading={home('bannerChild.heading')}
                line={home('bannerChild.line')}
                button={home('bannerChild.button')}
                href={shop}
                alt={home('bannerChild.alt')}
              />
            );
          case 'band':
            return (
              <StatementBand
                key={section}
                sentence={home('band.sentence')}
                linkText={home('band.link')}
                href={shop}
              />
            );
          case 'bannerShelf':
            return (
              <PhotoBanner
                key={section}
                id="bannerShelf"
                testId={TEST_IDS.bannerShelf}
                heading={home('bannerShelf.heading')}
                line={home('bannerShelf.line')}
                button={home('bannerShelf.button')}
                href={shop}
                alt={home('bannerShelf.alt')}
              />
            );
        }
      })}
    </div>
  );
}
