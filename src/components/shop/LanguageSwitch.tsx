'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { otherLocale, switchPath } from '@/lib/locale-path';

// The hit area is 4 px beyond the border box on every side: the inset is measured from the padding
// box, so it is 4 px plus the 1.5 px border.
const COMPACT =
  "relative me-1 inline-flex h-9 items-center rounded-pill border-[1.5px] border-ink px-2.5 text-[13px] font-bold text-ink transition-colors duration-150 ease-out before:absolute before:-inset-[5.5px] before:content-[''] hover:bg-sun-soft";
const FULL = 'flex min-h-11 items-center hover:underline';

/**
 * The language switch (storefront.md §7.19, contracts/locale-switch.md). A client island because
 * the layout does not see the current address. A plain `<a>`, never a `<Link>`: a prefetch would
 * call `/api/locale` and set the cookie without a click.
 */
export function LanguageSwitch({ variant }: { variant: 'compact' | 'full' }) {
  const locale = useLocale() === 'en' ? 'en' : 'he';
  const t = useTranslations('common.language');
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const target = otherLocale(locale);
  const href = `/api/locale?to=${target}&path=${encodeURIComponent(
    switchPath(pathname, query === '' ? '' : `?${query}`),
  )}`;
  const compact = variant === 'compact';
  // WCAG 2.5.3 (Label in Name): the name starts with the visible short text ("EN – English").
  const accessibleName =
    target === 'en'
      ? `${t('toEnglishShort')} – ${t('toEnglish')}`
      : `${t('toHebrewShort')} – ${t('toHebrew')}`;

  return (
    <a
      href={href}
      rel="nofollow"
      lang={target}
      hrefLang={target}
      data-testid={`language-switch-${variant}`}
      {...(compact ? { 'aria-label': accessibleName } : {})}
      className={cn(compact ? COMPACT : FULL)}
    >
      {compact
        ? target === 'en'
          ? t('toEnglishShort')
          : t('toHebrewShort')
        : target === 'en'
          ? t('toEnglish')
          : t('toHebrew')}
    </a>
  );
}
