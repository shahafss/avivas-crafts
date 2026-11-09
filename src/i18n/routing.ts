import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['he', 'en'],
  defaultLocale: 'he',
  localePrefix: 'always',
  localeDetection: false,
  // The NEXT_LOCALE cookie is written only by the language switch (GET /api/locale, T097).
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];
