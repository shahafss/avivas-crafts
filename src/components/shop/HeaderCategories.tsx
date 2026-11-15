import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';
import type { PublicCategory } from '@/server/catalog/public-queries';

/** From 900 px the header shows this many category links; the rest are in the menu. */
export const HEADER_CATEGORY_LIMIT = 5;

/** Up to five category links for the header pill (shown from 900 px by `Header`). */
export function HeaderCategoryLinks({
  locale,
  categories,
}: {
  locale: Locale;
  categories: PublicCategory[];
}) {
  return categories.slice(0, HEADER_CATEGORY_LIMIT).map((category) => {
    const name = pick(locale, category.nameHe, category.nameEn);
    return (
      <Link
        key={category.id}
        href={`/${locale}/c/${category.slug}`}
        {...fallbackAttrs(name)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center whitespace-nowrap hover:underline"
      >
        {name.text}
      </Link>
    );
  });
}

/** Every category as a list at the top of the menu sheet. */
export async function MenuCategories({
  locale,
  categories,
}: {
  locale: Locale;
  categories: PublicCategory[];
}) {
  const t = await getTranslations({ locale, namespace: 'common.nav' });
  return (
    <div className="mb-2 border-b border-line pb-2">
      <p className="text-[13px] font-bold text-ink-2">{t('categories')}</p>
      <ul className="grid gap-1 text-base font-medium">
        {categories.map((category) => {
          const name = pick(locale, category.nameHe, category.nameEn);
          return (
            <li key={category.id}>
              <Link
                href={`/${locale}/c/${category.slug}`}
                {...fallbackAttrs(name)}
                className="flex min-h-11 items-center"
              >
                {name.text}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
