import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';
import type { PublicCategory } from '@/server/catalog/public-queries';
import { NavLink } from './NavLink';

const HEADER_LINK =
  'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center whitespace-nowrap';

/**
 * The links of the header's one row from 1024 px (research D20), in the owner's order: "All pieces",
 * the header categories (Settings 1 and 2, then the home-row category, picked by
 * `pickHeaderCategories`), "About", "Shipping & Returns". Every item is `shrink-0`; a category name
 * sits in an inner span of at most 95 px with an ellipsis, so the link and its focus ring are never
 * clipped.
 */
export async function HeaderNavLinks({
  locale,
  categories,
}: {
  locale: Locale;
  categories: readonly PublicCategory[];
}) {
  const t = await getTranslations({ locale, namespace: 'common.nav' });
  return (
    <>
      <li className="shrink-0">
        <NavLink markCurrent href={`/${locale}/shop`} className={HEADER_LINK}>
          {t('allPieces')}
        </NavLink>
      </li>
      {categories.map((category) => {
        const name = pick(locale, category.nameHe, category.nameEn);
        return (
          <li key={category.id} className="shrink-0">
            <NavLink
              href={`/${locale}/category/${category.slug}`}
              markCurrent
              bareChildren
              className={HEADER_LINK}
            >
              <span {...fallbackAttrs(name)} className="nav-line block max-w-[95px] truncate">
                {name.text}
              </span>
            </NavLink>
          </li>
        );
      })}
      <li className="shrink-0">
        <NavLink markCurrent href={`/${locale}/pages/about`} className={HEADER_LINK}>
          {t('about')}
        </NavLink>
      </li>
      <li className="shrink-0">
        <NavLink markCurrent href={`/${locale}/pages/shipping-returns`} className={HEADER_LINK}>
          {t('shippingReturns')}
        </NavLink>
      </li>
    </>
  );
}

/**
 * The menu sheet's "All pieces" and category list. The "Categories" heading shows only when there
 * are categories; "All pieces" renders either way.
 */
export async function MenuCategories({
  locale,
  categories,
}: {
  locale: Locale;
  categories: readonly PublicCategory[];
}) {
  const t = await getTranslations({ locale, namespace: 'common.nav' });
  return (
    <div className="mb-2 border-b border-line pb-2">
      {categories.length === 0 ? null : (
        <p className="text-[13px] font-bold text-ink-2">{t('categories')}</p>
      )}
      <ul className="grid gap-1 text-base font-medium">
        <li>
          <NavLink markCurrent href={`/${locale}/shop`} className="flex min-h-11 items-center">
            {t('allPieces')}
          </NavLink>
        </li>
        {categories.map((category) => {
          const name = pick(locale, category.nameHe, category.nameEn);
          return (
            <li key={category.id}>
              <NavLink
                markCurrent
                href={`/${locale}/category/${category.slug}`}
                {...fallbackAttrs(name)}
                className="flex min-h-11 items-center"
              >
                {name.text}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
