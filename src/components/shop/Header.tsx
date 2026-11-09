import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import type { Locale } from '@/i18n/routing';

const MENU_ID = 'site-menu';

export interface HeaderProps {
  locale: Locale;
  /** The shop name; `lang="he"` when an English page falls back to the Hebrew name. */
  brand: { text: string; lang?: 'he' };
  /** Desktop category links (up to 5), added by the category task. */
  categoryLinks?: ReactNode;
  /** Categories inside the menu sheet, added by the category task. */
  menuCategories?: ReactNode;
  /** `CartLink` island (T072). */
  cartLink?: ReactNode;
  /** `LanguageSwitch` island (T097), compact variant. */
  languageSwitch?: ReactNode;
  /** `LanguageSwitch` island in full words, inside the menu. */
  menuLanguageSwitch?: ReactNode;
  /** More categories than the header shows: the menu button then stays visible from 900 px. */
  menuOnDesktop?: boolean;
}

/** Sticky floating pill: brand, category links, language switch, search, cart, menu. */
export async function Header({
  locale,
  brand,
  categoryLinks,
  menuCategories,
  cartLink,
  languageSwitch,
  menuLanguageSwitch,
  menuOnDesktop = false,
}: HeaderProps) {
  const t = await getTranslations({ locale, namespace: 'common' });
  const base = `/${locale}`;

  return (
    <div className="sticky top-0 z-header bg-ground px-3 py-2.5 lg:px-6 lg:py-4">
      <header className="mx-auto flex max-w-[1240px] items-center justify-between gap-3 rounded-pill bg-panel py-2 ps-4 pe-2.5 shadow-float">
        <Link
          href={base}
          lang={brand.lang}
          className="inline-flex min-h-11 items-center text-[clamp(16px,4.6vw,20px)] font-extrabold tracking-tight whitespace-nowrap"
        >
          {brand.text}
        </Link>
        {categoryLinks === undefined ? null : (
          <div className="hidden flex-1 items-center gap-5 ps-6 text-[15px] font-medium lg:flex">
            {categoryLinks}
          </div>
        )}
        <div className="flex items-center">
          {languageSwitch}
          <IconButton href={`${base}/search`} label={t('search')}>
            <Icon name="search" />
          </IconButton>
          {cartLink}
          <IconButton
            popoverTarget={MENU_ID}
            label={t('menu')}
            className={menuOnDesktop ? undefined : 'lg:hidden'}
          >
            <Icon name="menu" />
          </IconButton>
        </div>
      </header>
      <nav
        id={MENU_ID}
        popover="auto"
        aria-label={t('menuNav')}
        className="m-0 hidden w-[min(22rem,calc(100vw-1.5rem))] inset-auto end-3 top-[76px] rounded-card bg-panel p-4 text-ink shadow-float popover-open:block"
      >
        {menuCategories}
        <ul className="grid gap-1 text-base font-medium">
          <li>
            <Link href={`${base}/pages/about`} className="flex min-h-11 items-center">
              {t('nav.about')}
            </Link>
          </li>
          <li>
            <Link href={`${base}/pages/shipping-returns`} className="flex min-h-11 items-center">
              {t('nav.shippingReturns')}
            </Link>
          </li>
          <li>
            <Link href={`${base}/contact`} className="flex min-h-11 items-center">
              {t('nav.contact')}
            </Link>
          </li>
        </ul>
        {menuLanguageSwitch === undefined ? null : (
          <div className="mt-2 border-t border-line pt-2">{menuLanguageSwitch}</div>
        )}
      </nav>
    </div>
  );
}
