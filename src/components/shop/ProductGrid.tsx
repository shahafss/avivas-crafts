import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import type { PublicProductCard } from '@/server/catalog/public-queries';
import { ProductCard } from './ProductCard';

/** 2 columns, 3 from 640 px, 4 from 900 px. `label` names the list for screen readers. */
export async function ProductGrid({
  products,
  locale,
  label,
}: {
  products: PublicProductCard[];
  locale: Locale;
  /** Translated list name; defaults to the catalog's "Pieces". */
  label?: string;
}) {
  const fallback = await getTranslations({ locale, namespace: 'shop.catalog' });
  return (
    <ul
      aria-label={label ?? fallback('gridLabel')}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5"
    >
      {products.map((product, index) => (
        <li key={product.id} className="min-w-0">
          <ProductCard product={product} locale={locale} index={index} />
        </li>
      ))}
    </ul>
  );
}
