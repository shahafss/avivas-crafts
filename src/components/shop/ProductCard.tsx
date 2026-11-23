import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Price } from '@/components/ui/Price';
import type { Locale } from '@/i18n/routing';
import { cardPills } from '@/lib/card-pills';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';
import type { PublicProductCard } from '@/server/catalog/public-queries';

export const CARD_SIZES = '(min-width: 900px) 25vw, (min-width: 640px) 33vw, 50vw';

/**
 * One link, a mounted card (storefront.md §7.15): inset square photo with rounded corners, name
 * (two lines at most), price, the "not available" label, and up to two pills over the photo's
 * start corner (the pill rule, `cardPills`). On hover and focus the card lifts and its shadow
 * deepens; the border keeps its colour.
 */
export async function ProductCard({
  product,
  locale,
  index,
  eager,
  inHomeRow = false,
}: {
  product: PublicProductCard;
  locale: Locale;
  /** Position in its list; only the first card of an eager list gets high priority. */
  index: number;
  /** The photo loads at once (cards at the top of the page); otherwise it is lazy. */
  eager: boolean;
  /** The card is in the home page's row: the featured pill is left out there. */
  inHomeRow?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: 'shop.card' });
  const name = pick(locale, product.nameHe, product.nameEn);
  const pills = cardPills(product, { inHomeRow });
  const { image } = product;
  return (
    <Link
      href={`/${locale}/product/${product.slug}`}
      data-testid="product-card"
      className="group relative flex h-full min-w-0 flex-col rounded-card border border-line bg-paper p-2 shadow-card transition-[box-shadow,translate] duration-200 ease-out hover:shadow-card-hover focus-visible:shadow-card-hover motion-safe:hover:-translate-y-0.5 motion-safe:focus-visible:-translate-y-0.5 lg:p-2.5"
    >
      <span
        data-testid="card-photo"
        className="relative isolate block aspect-square overflow-hidden rounded-photo bg-photo"
      >
        {image === null ? null : (
          <img
            src={image.url800}
            srcSet={`${image.url400} 400w, ${image.url800} 800w`}
            sizes={CARD_SIZES}
            width={800}
            height={1000}
            alt=""
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager && index === 0 ? 'high' : undefined}
            decoding="async"
            className="size-full object-cover object-center motion-safe:transition-transform motion-safe:duration-[400ms] motion-safe:ease-out motion-safe:group-hover:scale-[1.03] motion-safe:group-focus-visible:scale-[1.03]"
          />
        )}
      </span>
      <span className="block px-1 pt-2.5 pb-1.5 lg:px-1.5 lg:pt-3">
        <span
          {...fallbackAttrs(name)}
          className="line-clamp-2 block text-base leading-[1.25] font-semibold lg:text-lg"
        >
          {name.text}
        </span>
        <span className="mt-[3px] block">
          <Price
            minor={product.fromPriceMinor}
            currency="ILS"
            locale={locale}
            size="card"
            {...(product.priceVaries ? { from: t('from') } : {})}
          />
        </span>
        {product.orderable ? null : (
          <span className="mt-0.5 block text-[13px] font-bold text-alert">{t('notOrderable')}</span>
        )}
      </span>
      {pills.length > 0 ? (
        // After the text in the DOM, so the link's name starts with the product name. 16 px from
        // the card's edge = 8 px from the photo's (the card pads 8 px, 10 px from 900 px).
        <span className="pointer-events-none absolute start-4 top-4 flex max-w-[calc(100%-2rem)] flex-col items-start gap-1 lg:start-[18px] lg:top-[18px] lg:max-w-[calc(100%-36px)]">
          {pills.map((pill) => {
            if (pill.kind === 'new') {
              return (
                <span
                  key="new"
                  data-testid="card-pill-new"
                  className="rounded-pill bg-sage px-2.5 py-px text-xs leading-[1.6] font-bold whitespace-nowrap text-ink"
                >
                  {t('new')}
                </span>
              );
            }
            const categoryName = pick(locale, pill.category.nameHe, pill.category.nameEn);
            return (
              <span
                key={pill.kind}
                {...fallbackAttrs(categoryName)}
                data-testid={`card-pill-${pill.kind}`}
                className="max-w-full min-w-0 truncate rounded-pill bg-paper/94 px-2.5 py-px text-xs leading-[1.6] font-semibold whitespace-nowrap text-ink ring-1 ring-line ring-inset"
              >
                {categoryName.text}
              </span>
            );
          })}
        </span>
      ) : null}
    </Link>
  );
}
