import 'server-only';
import type { Locale } from '@/i18n/routing';
import type { Settings } from '@/server/settings/settings';

/** The shop name in the page language; English falls back to Hebrew (and then needs `lang="he"`). */
export function shopNameFor(settings: Settings, locale: Locale): { text: string; lang?: 'he' } {
  if (locale === 'en' && settings.shopNameEn !== null && settings.shopNameEn !== '') {
    return { text: settings.shopNameEn };
  }
  return locale === 'en'
    ? { text: settings.shopNameHe, lang: 'he' }
    : { text: settings.shopNameHe };
}
