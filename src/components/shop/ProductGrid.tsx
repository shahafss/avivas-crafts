import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import type { PublicProductCard } from '@/server/catalog/public-queries';
import { ProductCard } from './ProductCard';

/**
 * 2 columns, 3 from 640 px, 4 from 900 px (storefront.md §7.15). `label` names the list for screen
 * readers; the first `eagerCount` photos load at once (4 on All pieces, category and search; 0 where
 * the grid sits below something else).
 */
export async function ProductGrid({
  products,
  locale,
  label,
  eagerCount = 4,
}: {
  products: PublicProductCard[];
  locale: Locale;
  /** Translated list name; defaults to the catalog's "Pieces". */
  label?: string;
  eagerCount?: number;
}) {
  const fallback = await getTranslations({ locale, namespace: 'shop.catalog' });
  return (
    <ul
      aria-label={label ?? fallback('gridLabel')}
      className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-10"
    >
      {products.map((product, index) => (
        <li key={product.id} className="min-w-0">
          <ProductCard product={product} locale={locale} index={index} eager={index < eagerCount} />
        </li>
      ))}
    </ul>
  );
}
