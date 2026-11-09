export type ContentLocale = 'he' | 'en';

export interface Picked {
  text: string;
  /** Language of `text`: the owner writes Hebrew first, English is optional (FR-045). */
  lang: ContentLocale;
  /** True when an English page shows the Hebrew text because no English text exists. */
  fallback: boolean;
}

/**
 * The owner-written text for a page language: `en` on English pages when it is not empty,
 * otherwise the Hebrew text. Hebrew text on an English page is marked as such.
 */
export function pick(
  locale: ContentLocale,
  he: string | null | undefined,
  en: string | null | undefined,
): Picked {
  if (locale === 'en' && en !== null && en !== undefined && en.trim() !== '') {
    return { text: en, lang: 'en', fallback: false };
  }
  return { text: he ?? '', lang: 'he', fallback: locale === 'en' };
}

/** `lang="he" dir="auto"` for Hebrew fallback text on an English page; nothing otherwise. */
export function fallbackAttrs(picked: Picked): { lang?: 'he'; dir?: 'auto' } {
  return picked.fallback ? { lang: 'he', dir: 'auto' } : {};
}
