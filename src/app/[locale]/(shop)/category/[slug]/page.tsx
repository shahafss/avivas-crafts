import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { CategoryChips } from '@/components/shop/CategoryChips';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { SortLinks } from '@/components/shop/SortLinks';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/LinkButton';
import { routing } from '@/i18n/routing';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';
import {
  getCategoryBySlug,
  listCategoriesWithProducts,
  listPublishedProducts,
  type ProductSort,
} from '@/server/catalog/public-queries';
import { pageMetadata } from '@/server/seo';
import { getSettings } from '@/server/settings/settings';
import { shopNameFor } from '@/server/settings/shop-name';

type Params = Promise<{ locale: string; slug: string }>;

const SORTS: ProductSort[] = ['newest', 'price-asc', 'price-desc'];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const category = await getCategoryBySlug(slug);
  if (category === null) return {};
  const [settings, common] = await Promise.all([
    getSettings(),
    getTranslations({ locale, namespace: 'common' }),
  ]);
  const siteName = shopNameFor(settings, locale).text;
  const description = common('meta.description');
  const title = pick(locale, category.nameHe, category.nameEn).text;
  return {
    title,
    ...pageMetadata({ locale, path: `/category/${category.slug}`, title, description, siteName }),
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { sort: rawSort } = await searchParams;
  const sort = SORTS.find((value) => value === rawSort) ?? 'newest';

  const category = await getCategoryBySlug(slug);
  if (category === null) notFound();

  const [t, common, products, categories] = await Promise.all([
    getTranslations({ locale, namespace: 'shop.category' }),
    getTranslations({ locale, namespace: 'common' }),
    listPublishedProducts({ categoryId: category.id, sort }),
    listCategoriesWithProducts(),
  ]);
  const name = pick(locale, category.nameHe, category.nameEn);

  return (
    <div className="grid grid-cols-1 gap-5 pt-2 lg:gap-6">
      <Breadcrumbs
        label={t('breadcrumbs')}
        items={[
          { label: common('home'), href: `/${locale}` },
          { label: name.text, ...(name.fallback ? { lang: 'he' as const } : {}) },
        ]}
      />
      <div className="grid gap-1">
        <h1
          {...fallbackAttrs(name)}
          className="text-[32px] leading-[1.15] font-bold tracking-[-0.01em] text-balance lg:text-[44px]"
        >
          {name.text}
        </h1>
        <p data-testid="category-count" className="text-ink-2">
          {t('count', { count: products.length })}
        </p>
      </div>
      <CategoryChips locale={locale} categories={categories} currentSlug={category.slug} />
      {products.length === 0 ? (
        <EmptyState
          icon="yarn"
          title={t('emptyTitle')}
          text={t('emptyText')}
          action={
            <LinkButton href={`/${locale}/shop`} variant="secondary">
              {t('emptyAction')}
            </LinkButton>
          }
        />
      ) : (
        <>
          <SortLinks
            locale={locale}
            basePath={`/${locale}/category/${category.slug}`}
            current={sort}
          />
          <ProductGrid products={products} locale={locale} />
        </>
      )}
    </div>
  );
}
