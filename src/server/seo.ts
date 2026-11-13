import 'server-only';
import type { Locale } from '@/i18n/routing';
import { getEnv } from '@/server/env';

/**
 * The canonical address and the language versions of one public page (contracts/seo.md).
 * `pathWithoutLocale` is `''` (home) or starts with `/`, and never holds a query. Hebrew is the
 * `x-default` version.
 */
export function alternates(
  pathWithoutLocale: string,
  locale: Locale,
): { canonical: string; languages: Record<'he' | 'en' | 'x-default', string> } {
  const origin = getEnv().APP_ORIGIN;
  const he = `${origin}/he${pathWithoutLocale}`;
  return {
    canonical: `${origin}/${locale}${pathWithoutLocale}`,
    languages: { he, en: `${origin}/en${pathWithoutLocale}`, 'x-default': he },
  };
}
