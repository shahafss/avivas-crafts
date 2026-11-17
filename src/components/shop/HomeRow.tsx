import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/ui/Icon';
import type { Locale } from '@/i18n/routing';
import { fallbackAttrs } from '@/lib/i18n-fallback';
import type { HomeRow as HomeRowData } from '@/server/catalog/public-queries';
import { ProductCard } from './ProductCard';
import { RowArrows } from './RowArrows';

const TRACK_ID = 'home-row-track';

/**
 * The home page's swipeable row (storefront.md §7.32, contracts/home-row.md "Home row"): the
 * pieces of the home-row category in one line that scrolls and snaps with CSS alone, so it swipes
 * and scrolls without JavaScript and the page itself never scrolls sideways. `RowArrows` adds the
 * previous / next buttons from 900 px. The track's padding gives the focus ring of a card room
 * (the track clips what lies outside it); the negative margin keeps the cards in line with the
 * heading.
 */
export async function HomeRow({ row, locale }: { row: HomeRowData; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'shop.home.row' });
  return (
    <section
      data-testid="home-row"
      aria-labelledby="home-row-title"
      className="mx-auto w-full max-w-[1240px] px-4 pt-12 pb-16 lg:px-6 lg:pt-[72px] lg:pb-[88px]"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 lg:mb-8">
        <h2
          id="home-row-title"
          {...fallbackAttrs(row.name)}
          className="text-[28px] leading-[1.15] font-bold tracking-[-0.01em] text-balance lg:text-[40px]"
        >
          {row.name.text}
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/shop`}
            data-testid="home-row-view-all"
            className="inline-flex min-h-11 items-center gap-2 text-base font-semibold text-ink underline underline-offset-4"
          >
            {t('viewAll')}
            <Icon name="arrow" size={20} />
          </Link>
          <RowArrows trackId={TRACK_ID} labels={{ previous: t('previous'), next: t('next') }} />
        </div>
      </div>
      <ul
        id={TRACK_ID}
        data-testid="home-row-track"
        aria-label={row.name.text}
        className="row-track -mx-2 -my-2 grid auto-cols-[calc((100%-0.75rem)/2.15)] grid-flow-col gap-3 overflow-x-auto overscroll-x-contain scroll-px-2 snap-x snap-mandatory px-2 py-2 lg:auto-cols-[calc((100%-3rem)/4)] lg:gap-4"
      >
        {row.cards.map((card, index) => (
          <li key={card.id} className="min-w-0 snap-start">
            <ProductCard product={card} locale={locale} index={index} eager={false} />
          </li>
        ))}
      </ul>
    </section>
  );
}
