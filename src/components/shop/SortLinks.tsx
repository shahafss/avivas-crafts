import { getTranslations } from 'next-intl/server';
import { ChipLink } from '@/components/ui/ChipLink';
import { ChipRow } from '@/components/ui/ChipRow';
import type { Locale } from '@/i18n/routing';
import type { ProductSort } from '@/server/catalog/public-queries';

const SORTS: { value: ProductSort; key: 'newest' | 'priceAsc' | 'priceDesc' }[] = [
  { value: 'newest', key: 'newest' },
  { value: 'price-asc', key: 'priceAsc' },
  { value: 'price-desc', key: 'priceDesc' },
];

/** Three links that rebuild `?sort=`; no JavaScript. Reused by the category page. */
export async function SortLinks({
  locale,
  basePath,
  current,
}: {
  locale: Locale;
  /** Path without a query, e.g. `/he`. */
  basePath: string;
  current: ProductSort;
}) {
  const t = await getTranslations({ locale, namespace: 'shop.catalog' });
  return (
    <ChipRow label={t('sortLabel')}>
      {SORTS.map(({ value, key }) => (
        <ChipLink
          key={value}
          href={value === 'newest' ? basePath : `${basePath}?sort=${value}`}
          current={current === value}
        >
          {t(`sort.${key}`)}
        </ChipLink>
      ))}
    </ChipRow>
  );
}
