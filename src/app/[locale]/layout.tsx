import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AnnouncementBar } from '@/components/shop/AnnouncementBar';
import { CartLink } from '@/components/shop/CartLink';
import { Footer } from '@/components/shop/Footer';
import { Header } from '@/components/shop/Header';
import {
  HEADER_CATEGORY_LIMIT,
  HeaderCategoryLinks,
  MenuCategories,
} from '@/components/shop/HeaderCategories';
import type MessageFile from '@/i18n/messages/he.json';
import { routing, type Locale } from '@/i18n/routing';
import { listCategoriesWithProducts } from '@/server/catalog/public-queries';
import { getSettings, type Settings } from '@/server/settings/settings';
import { heebo } from '../fonts';
import '../globals.css';

/** The shop name in the page language; English falls back to Hebrew (and then needs `lang="he"`). */
function shopNameFor(settings: Settings, locale: Locale): { text: string; lang?: 'he' } {
  if (locale === 'en' && settings.shopNameEn !== null && settings.shopNameEn !== '') {
    return { text: settings.shopNameEn };
  }
  return locale === 'en'
    ? { text: settings.shopNameHe, lang: 'he' }
    : { text: settings.shopNameHe };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const name = shopNameFor(await getSettings(), locale).text;
  return { title: { default: name, template: `%s · ${name}` } };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Reading request headers makes every page render per request (the CSP nonce changes each time;
  // Next.js picks the nonce up from the forwarded Content-Security-Policy header).
  await headers();
  const [settings, rawMessages, t, categories] = await Promise.all([
    getSettings(),
    getMessages(),
    getTranslations({ locale, namespace: 'common' }),
    listCategoriesWithProducts(),
  ]);
  const messages = rawMessages as unknown as typeof MessageFile;
  const brand = shopNameFor(settings, locale);

  // Only what the islands present on every page use (CartLink, LanguageSwitch) plus the error
  // boundary; pages with further islands add their own provider.
  const clientMessages = {
    common: { cart: messages.common.cart, language: messages.common.language },
    errors: { generic: messages.errors.generic },
  };

  return (
    <html lang={locale} dir={locale === 'he' ? 'rtl' : 'ltr'} className={heebo.variable}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only rounded-pill bg-sun px-5 py-3 font-bold text-ink focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-banner"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider locale={locale} messages={clientMessages}>
          <AnnouncementBar locale={locale} />
          <Header
            locale={locale}
            brand={brand}
            cartLink={<CartLink />}
            menuOnDesktop={categories.length > HEADER_CATEGORY_LIMIT}
            {...(categories.length === 0
              ? {}
              : {
                  categoryLinks: <HeaderCategoryLinks locale={locale} categories={categories} />,
                  menuCategories: <MenuCategories locale={locale} categories={categories} />,
                })}
          />
          <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-3 pb-10 lg:px-6">
            {children}
          </main>
          <Footer locale={locale} brand={brand} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
