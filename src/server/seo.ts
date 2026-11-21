import 'server-only';
import type { Metadata } from 'next';
import { ogImage } from '@/lib/brand';
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

const OG_LOCALE: Record<Locale, string> = { he: 'he_IL', en: 'en_US' };

/** The Open Graph locale tag of a site locale. */
export function ogLocale(locale: Locale): string {
  return OG_LOCALE[locale];
}

function absoluteOgImage(): { url: string; width: number; height: number } {
  const image = ogImage();
  return { ...image, url: `${getEnv().APP_ORIGIN}${image.url}` };
}

/**
 * The layout's default link-preview tags: site name, locale, description and the brand image, but
 * no `url`, so checkout, order and not-found pages do not claim the home address (contracts/metadata.md).
 */
export function defaultSocial(input: {
  locale: Locale;
  description: string;
  siteName: string;
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  const image = absoluteOgImage();
  return {
    openGraph: {
      type: 'website',
      siteName: input.siteName,
      locale: OG_LOCALE[input.locale],
      description: input.description,
      images: [{ ...image, alt: input.siteName }],
    },
    twitter: {
      card: 'summary_large_image',
      description: input.description,
      images: [image.url],
    },
  };
}

/** Description, canonical, language versions and link-preview tags of one public page. */
export function pageMetadata(input: {
  locale: Locale;
  path: string;
  title: string;
  description: string;
  siteName: string;
}): Metadata {
  const { locale, path, title, description, siteName } = input;
  const image = absoluteOgImage();
  return {
    description,
    alternates: alternates(path, locale),
    openGraph: {
      type: 'website',
      siteName,
      locale: OG_LOCALE[locale],
      url: `${getEnv().APP_ORIGIN}/${locale}${path}`,
      title,
      description,
      images: [{ ...image, alt: siteName }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}
