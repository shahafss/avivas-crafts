import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { CategoryChips } from '@/components/shop/CategoryChips';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { SortLinks } from '@/components/shop/SortLinks';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/LinkButton';
import { routing } from '@/i18n/routing';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';
import {
  listCategoriesWithProducts,
  listPublishedProducts,
  type ProductSort,
} from '@/server/catalog/public-queries';
import { getSettings } from '@/server/settings/settings';

const SORTS: ProductSort[] = ['newest', 'price-asc', 'price-desc'];

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { sort: rawSort } = await searchParams;
  const sort = SORTS.find((value) => value === rawSort) ?? 'newest';

  const [t, settings, products, categories] = await Promise.all([
    getTranslations({ locale, namespace: 'shop.catalog' }),
    getSettings(),
    listPublishedProducts({ sort }),
    listCategoriesWithProducts(),
  ]);
  const shopName = pick(locale, settings.shopNameHe, settings.shopNameEn);

  return (
    <div className="grid gap-5 pt-4 lg:gap-6 lg:pt-6">
      <div className="grid gap-1.5">
        <h1
          {...fallbackAttrs(shopName)}
          className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance lg:text-[34px]"
        >
          {shopName.text}
        </h1>
        <p className="max-w-[40ch] text-ink-2">{t('intro')}</p>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon="yarn"
          title={t('emptyTitle')}
          text={t('emptyText')}
          action={
            <LinkButton href={`/${locale}/contact`} variant="secondary">
              {t('emptyAction')}
            </LinkButton>
          }
        />
      ) : (
        <>
          {categories.length === 0 ? null : (
            <CategoryChips locale={locale} categories={categories} currentSlug={null} />
          )}
          <SortLinks locale={locale} basePath={`/${locale}`} current={sort} />
          <ProductGrid products={products} locale={locale} />
        </>
      )}
    </div>
  );
}
