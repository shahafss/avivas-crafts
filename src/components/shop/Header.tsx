import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { logoSize, logoSrc, logoSrcSet } from '@/lib/brand';
import { IconButton } from '@/components/ui/IconButton';
import type { Locale } from '@/i18n/routing';
import type { PublicCategory } from '@/server/catalog/public-queries';
import { HeaderNavLinks, MenuCategories } from './HeaderCategories';
import { HeaderScrollState } from './HeaderScrollState';
import { HeaderSearch } from './HeaderSearch';
import { MenuBurger } from './MenuBurger';
import { NavLink } from './NavLink';

const MENU_ID = 'site-menu';

export interface HeaderProps {
  locale: Locale;
  /** The shop name; `lang="he"` when an English page falls back to the Hebrew name. */
  brand: { text: string; lang?: 'he' };
  /** The categories in the one-row header: `pickHeaderCategories(settings, categories)`. */
  headerCategories: readonly PublicCategory[];
  /** Every category with a published piece, for the menu drawer. */
  menuCategories: readonly PublicCategory[];
  /** `CartLink` island. */
  cartLink: ReactNode;
  /** `LanguageSwitch` island in full words, inside the menu drawer. */
  menuLanguageSwitch: ReactNode;
}

/**
 * Full-width sticky bar (storefront.md 7.18, research D20). Below 1024 px: menu button, brand,
 * cart. From 1024 px one row in reading order: site links, brand, search field, cart, as a grid of
 * three columns whose outer two are always equal, so the logo's centre is the bar's centre (FR-018);
 * when the links do not fit their half, only the category names shrink. The logo (the wordmark)
 * sits inside the bar, never hanging below it (feature 009, research D3).
 * The menu drawer is a native popover sliding in from the reading start (`.drawer` in
 * `globals.css`).
 */
export async function Header({
  locale,
  brand,
  headerCategories,
  menuCategories,
  cartLink,
  menuLanguageSwitch,
}: HeaderProps) {
  const t = await getTranslations({ locale, namespace: 'common' });
  const base = `/${locale}`;

  return (
    <>
      <header
        id="site-header"
        data-testid="site-header"
        data-at-top=""
        className="sticky top-0 z-header h-(--header-h) border-b border-line text-ink"
      >
        <div className="mx-auto grid h-full max-w-[1240px] grid-cols-[1fr_minmax(0,auto)_1fr] items-center px-4 nav:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] nav:gap-4">
          <div className="flex items-center nav:hidden">
            <IconButton popoverTarget={MENU_ID} label={t('menu')}>
              <MenuBurger />
            </IconButton>
          </div>
          <nav aria-label={t('menuNav')} className="hidden min-w-0 nav:block">
            <ul className="flex min-w-0 items-center gap-3 text-[15px]">
              <HeaderNavLinks locale={locale} categories={headerCategories} />
            </ul>
          </nav>
          <Link
            href={base}
            data-testid="header-brand"
            className="inline-flex min-h-11 items-center rounded-card px-2 py-0.5"
          >
            <img
              data-testid="header-logo"
              src={logoSrc(186)}
              srcSet={logoSrcSet()}
              sizes="(min-width: 900px) 107px, 93px"
              width={logoSize().width}
              height={logoSize().height}
              alt={brand.text}
              lang={brand.lang}
              decoding="async"
              className="block h-(--logo-h) w-(--logo-w) max-w-none object-contain"
            />
            <span className="sr-only">{t('homeLinkSuffix')}</span>
          </Link>
          <div className="flex min-w-0 items-center justify-end gap-4">
            <div className="hidden shrink-0 nav:block">
              <HeaderSearch locale={locale} variant="header" />
            </div>
            <div className="flex shrink-0 items-center justify-end">{cartLink}</div>
          </div>
        </div>
      </header>
      <HeaderScrollState />
      <div
        id={MENU_ID}
        data-testid="site-menu"
        popover="auto"
        role="dialog"
        aria-modal="true"
        aria-label={t('menuNav')}
        className="drawer drawer-start nav:hidden"
      >
        <div className="drawer-head">
          <button
            type="button"
            popoverTarget={MENU_ID}
            popoverTargetAction="hide"
            autoFocus
            data-testid="menu-close"
            aria-label={t('menuClose')}
            className="drawer-close relative inline-grid size-11 shrink-0 place-items-center rounded-pill hover:bg-current/10"
          >
            <MenuBurger />
          </button>
        </div>
        <nav className="drawer-scroll px-4 pb-6">
          <HeaderSearch locale={locale} variant="menu" />
          <MenuCategories locale={locale} categories={menuCategories} />
          <ul className="grid gap-1 text-base font-medium">
            <li>
              <NavLink
                markCurrent
                href={`${base}/pages/about`}
                className="flex min-h-11 items-center"
              >
                {t('nav.about')}
              </NavLink>
            </li>
            <li>
              <NavLink
                markCurrent
                href={`${base}/pages/shipping-returns`}
                className="flex min-h-11 items-center"
              >
                {t('nav.shippingReturns')}
              </NavLink>
            </li>
            <li>
              <NavLink markCurrent href={`${base}/contact`} className="flex min-h-11 items-center">
                {t('nav.contact')}
              </NavLink>
            </li>
          </ul>
          <div className="mt-2 border-t border-line pt-2">{menuLanguageSwitch}</div>
        </nav>
      </div>
    </>
  );
}
