import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Price } from '@/components/ui/Price';
import type { Locale } from '@/i18n/routing';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';
import type { PublicProductCard } from '@/server/catalog/public-queries';

export const CARD_SIZES = '(min-width: 900px) 25vw, (min-width: 640px) 33vw, 50vw';

/** One link: photo well, name (two lines at most), price, and the "not available" label. */
export async function ProductCard({
  product,
  locale,
  index,
}: {
  product: PublicProductCard;
  locale: Locale;
  /** Position in the grid: the first four photos load at once, the first one with high priority. */
  index: number;
}) {
  const t = await getTranslations({ locale, namespace: 'shop.card' });
  const name = pick(locale, product.nameHe, product.nameEn);
  const { image } = product;
  return (
    <Link
      href={`/${locale}/p/${product.slug}`}
      data-testid="product-card"
      className="group block min-w-0"
    >
      <span className="block aspect-[4/5] overflow-hidden rounded-card bg-photo">
        {image === null ? null : (
          <img
            src={image.url800}
            srcSet={`${image.url400} 400w, ${image.url800} 800w`}
            sizes={CARD_SIZES}
            width={800}
            height={1000}
            alt=""
            loading={index < 4 ? 'eager' : 'lazy'}
            fetchPriority={index === 0 ? 'high' : undefined}
            decoding="async"
            className="size-full object-cover motion-safe:transition-transform motion-safe:duration-[400ms] motion-safe:ease-out motion-safe:group-hover:scale-[1.03]"
          />
        )}
      </span>
      <span className="mt-2.5 block px-1">
        <span
          {...fallbackAttrs(name)}
          className="line-clamp-2 block text-base leading-snug font-bold"
        >
          {name.text}
        </span>
        <span className="mt-0.5 block">
          <Price
            minor={product.fromPriceMinor}
            currency="ILS"
            locale={locale}
            {...(product.priceVaries ? { from: t('from') } : {})}
          />
        </span>
        {product.orderable ? null : (
          <span className="mt-0.5 block text-[13px] font-bold text-alert">{t('notOrderable')}</span>
        )}
      </span>
    </Link>
  );
}
