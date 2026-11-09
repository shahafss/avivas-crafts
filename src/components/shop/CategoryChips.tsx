import { getTranslations } from 'next-intl/server';
import { ChipLink } from '@/components/ui/ChipLink';
import { ChipRow } from '@/components/ui/ChipRow';
import type { Locale } from '@/i18n/routing';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';
import type { PublicCategory } from '@/server/catalog/public-queries';

/** "All" plus one chip per category; `currentSlug` null marks "All" as the current page. */
export async function CategoryChips({
  locale,
  categories,
  currentSlug,
}: {
  locale: Locale;
  categories: PublicCategory[];
  /** The category page being shown; `null` = the catalog; `undefined` = none (e.g. search). */
  currentSlug?: string | null;
}) {
  const t = await getTranslations({ locale, namespace: 'shop.catalog' });
  return (
    <ChipRow label={t('categoriesLabel')}>
      <ChipLink href={`/${locale}`} current={currentSlug === null}>
        {t('all')}
      </ChipLink>
      {categories.map((category) => {
        const name = pick(locale, category.nameHe, category.nameEn);
        return (
          <ChipLink
            key={category.id}
            href={`/${locale}/c/${category.slug}`}
            current={currentSlug === category.slug}
            {...fallbackAttrs(name)}
          >
            {name.text}
          </ChipLink>
        );
      })}
    </ChipRow>
  );
}
