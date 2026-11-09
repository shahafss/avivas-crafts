import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { CategoryChips } from '@/components/shop/CategoryChips';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextField } from '@/components/ui/TextField';
import { routing } from '@/i18n/routing';
import { listCategoriesWithProducts } from '@/server/catalog/public-queries';
import { MAX_QUERY_LENGTH, parseSearchQuery, searchProducts } from '@/server/catalog/search';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'shop.search' });
  return { title: t('title'), robots: { index: false, follow: true } };
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { q: rawQuery } = await searchParams;
  const query = parseSearchQuery(rawQuery);

  const [t, common, categories, products] = await Promise.all([
    getTranslations({ locale, namespace: 'shop.search' }),
    getTranslations({ locale, namespace: 'common' }),
    listCategoriesWithProducts(),
    query.kind === 'query' ? searchProducts(query.q) : Promise.resolve(null),
  ]);
  const shownQuery =
    query.kind === 'query'
      ? query.q
      : query.kind === 'too_long'
        ? (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim().slice(0, MAX_QUERY_LENGTH * 2)
        : undefined;
  const chips =
    categories.length === 0 ? null : <CategoryChips locale={locale} categories={categories} />;

  return (
    <div className="grid gap-5 pt-2 lg:gap-6">
      <Breadcrumbs
        label={t('breadcrumbs')}
        items={[{ label: common('home'), href: `/${locale}` }, { label: t('title') }]}
      />
      <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance lg:text-[34px]">
        {t('title')}
      </h1>

      <form
        action={`/${locale}/search`}
        method="get"
        role="search"
        className="flex max-w-xl flex-wrap items-start gap-3"
      >
        <TextField
          name="q"
          type="search"
          data-testid="search-input"
          label={t('label')}
          defaultValue={shownQuery ?? ''}
          enterKeyHint="search"
          autoFocus={query.kind === 'empty'}
          autoComplete="off"
          className="min-w-[14rem] flex-1"
          error={query.kind === 'too_long' ? t('tooLong') : undefined}
        />
        <Button type="submit" variant="secondary" className="mt-[26px]">
          {t('button')}
        </Button>
      </form>

      {query.kind === 'query' && products !== null ? (
        products.length === 0 ? (
          <>
            <EmptyState
              icon="search"
              title={t.rich('noResultsTitle', {
                query: query.q,
                q: (chunks) => <bdi>{chunks}</bdi>,
              })}
              text={t('noResultsText')}
            />
            {chips}
          </>
        ) : (
          <>
            <p role="status" data-testid="search-results-line" className="text-ink-2">
              {t.rich('results', {
                count: products.length,
                query: query.q,
                q: (chunks) => <bdi className="font-bold text-ink">{chunks}</bdi>,
              })}
            </p>
            <ProductGrid products={products} locale={locale} />
          </>
        )
      ) : (
        <>
          {query.kind === 'empty' ? <p className="text-ink-2">{t('prompt')}</p> : null}
          {chips}
        </>
      )}
    </div>
  );
}
