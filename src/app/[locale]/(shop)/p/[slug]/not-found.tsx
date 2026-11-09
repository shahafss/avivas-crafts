import { getLocale, getTranslations } from 'next-intl/server';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { LinkButton } from '@/components/ui/LinkButton';
import type { Locale } from '@/i18n/routing';
import { listNewestProducts } from '@/server/catalog/public-queries';

/** A draft, hidden, deleted or unknown product: the page says so (HTTP 404) and offers other pieces. */
export default async function ProductNotAvailable() {
  const locale = (await getLocale()) as Locale;
  const [t, common, products] = await Promise.all([
    getTranslations({ locale, namespace: 'shop.notAvailable' }),
    getTranslations({ locale, namespace: 'common' }),
    listNewestProducts(4),
  ]);
  return (
    <div className="grid gap-5 pt-6">
      <div className="grid max-w-xl gap-3">
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance lg:text-[34px]">
          {t('title')}
        </h1>
        {products.length === 0 ? null : <p className="text-ink-2">{t('text')}</p>}
      </div>
      {products.length === 0 ? null : (
        <ProductGrid products={products} locale={locale} label={t('listLabel')} />
      )}
      <div>
        <LinkButton href={`/${locale}`}>{common('allPieces')}</LinkButton>
      </div>
    </div>
  );
}
