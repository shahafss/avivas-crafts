import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { CategoryChips } from '@/components/shop/CategoryChips';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { SortLinks } from '@/components/shop/SortLinks';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/LinkButton';
import { routing } from '@/i18n/routing';
import {
  listCategoriesWithProducts,
  listPublishedProducts,
  type ProductSort,
} from '@/server/catalog/public-queries';
import { alternates } from '@/server/seo';

const SORTS: ProductSort[] = ['newest', 'price-asc', 'price-desc'];

// The layout adds the shop name to the title (as on category pages).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'shop.allPieces' });
  return { title: t('title'), alternates: alternates('/shop', locale) };
}

/** "All pieces" (007 FR-033, research D19): the catalog that used to be the home page. */
export default async function AllPiecesPage({
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

  const [t, all, products, categories] = await Promise.all([
    getTranslations({ locale, namespace: 'shop.catalog' }),
    getTranslations({ locale, namespace: 'shop.allPieces' }),
    listPublishedProducts({ sort }),
    listCategoriesWithProducts(),
  ]);

  return (
    <div className="grid grid-cols-1 gap-5 pt-4 lg:gap-6 lg:pt-6">
      <div className="grid gap-1.5">
        <h1 className="text-[32px] leading-[1.15] font-bold tracking-[-0.01em] text-balance lg:text-[44px]">
          {all('title')}
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
          <SortLinks locale={locale} basePath={`/${locale}/shop`} current={sort} />
          <ProductGrid products={products} locale={locale} />
        </>
      )}
    </div>
  );
}
