import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['he', 'en'],
  defaultLocale: 'he',
  localePrefix: 'always',
  localeDetection: false,
  // The NEXT_LOCALE cookie is written only by the language switch (GET /api/locale, T097).
  localeCookie: false,
  // No Link hreflang header from the middleware: its x-default is the unprefixed path and it
  // keeps the query, which would contradict the HTML tags (src/server/seo.ts, research R4).
  alternateLinks: false,
});

export type Locale = (typeof routing.locales)[number];
