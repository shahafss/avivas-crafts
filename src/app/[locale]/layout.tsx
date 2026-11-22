import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { CartDrawer } from '@/components/shop/CartDrawer';
import { AnnouncementBar } from '@/components/shop/AnnouncementBar';
import { CartLink } from '@/components/shop/CartLink';
import { ConsentRoot, ConsentSkipLink } from '@/components/shop/ConsentRoot';
import { CookieSettingsButton } from '@/components/shop/CookieSettingsButton';
import { DrawerController } from '@/components/shop/DrawerController';
import { Footer } from '@/components/shop/Footer';
import { Header } from '@/components/shop/Header';
import { LanguageSwitch } from '@/components/shop/LanguageSwitch';
import { StatsBeacon } from '@/components/shop/StatsBeacon';
import { appleTouchIcon, icon32 } from '@/lib/brand';
import type MessageFile from '@/i18n/messages/he.json';
import { routing } from '@/i18n/routing';
import { pickHeaderCategories } from '@/server/catalog/header-categories';
import { listCategoriesWithProducts } from '@/server/catalog/public-queries';
import { defaultZone } from '@/server/checkout/zones';
import { consentRequired } from '@/server/consent/config';
import { getEnv } from '@/server/env';
import { getSettings } from '@/server/settings/settings';
import { shopNameFor } from '@/server/settings/shop-name';
import { defaultSocial } from '@/server/seo';
import { assistant } from '../fonts';
import '../globals.css';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const [settings, t] = await Promise.all([
    getSettings(),
    getTranslations({ locale, namespace: 'common' }),
  ]);
  const name = shopNameFor(settings, locale).text;
  const description = t('meta.description');
  return {
    metadataBase: new URL(getEnv().APP_ORIGIN),
    title: { default: name, template: `%s · ${name}` },
    description,
    ...defaultSocial({ locale, description, siteName: name }),
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
        { url: icon32(), type: 'image/png', sizes: '32x32' },
      ],
      apple: [{ url: appleTouchIcon(), sizes: '180x180' }],
    },
    manifest: '/site.webmanifest',
  };
}

export const viewport: Viewport = { themeColor: '#ffffff' };

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
  const nonce = (await headers()).get('x-nonce') ?? '';
  const [settings, rawMessages, t, categories, zone] = await Promise.all([
    getSettings(),
    getMessages(),
    getTranslations({ locale, namespace: 'common' }),
    listCategoriesWithProducts(),
    defaultZone(),
  ]);
  const messages = rawMessages as unknown as typeof MessageFile;
  const brand = shopNameFor(settings, locale);
  const freeShippingOverMinor =
    zone !== null && zone.shippingEnabled ? zone.freeShippingThresholdMinor : null;

  // Only what the islands present on every page use (CartLink, LanguageSwitch, the cart drawer's
  // body) plus the error boundary; pages with further islands add their own provider.
  const clientMessages = {
    common: { cart: messages.common.cart, language: messages.common.language },
    cart: messages.cart,
    errors: { generic: messages.errors.generic },
  };

  return (
    <html lang={locale} dir={locale === 'he' ? 'rtl' : 'ltr'} className={assistant.variable}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only rounded-pill bg-forest px-5 py-3 font-bold text-paper focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-banner"
        >
          {t('skipToContent')}
        </a>
        <ConsentSkipLink locale={locale} />
        <NextIntlClientProvider locale={locale} messages={clientMessages}>
          <AnnouncementBar locale={locale} />
          <Header
            locale={locale}
            brand={brand}
            headerCategories={pickHeaderCategories(settings, categories)}
            menuCategories={categories}
            cartLink={<CartLink />}
            menuLanguageSwitch={<LanguageSwitch variant="full" />}
          />
          <CartDrawer locale={locale} />
          <main
            id="main"
            className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-10 lg:px-6 has-[>[data-full-bleed]]:max-w-none has-[>[data-full-bleed]]:px-0 has-[>[data-full-bleed]]:pb-0"
          >
            {children}
          </main>
          <Footer
            locale={locale}
            brand={brand}
            settings={settings}
            languageSwitch={<LanguageSwitch variant="full" />}
            {...(consentRequired()
              ? { cookieSettings: <CookieSettingsButton label={t('footer.cookieSettings')} /> }
              : {})}
          />
          <DrawerController freeShippingOverMinor={freeShippingOverMinor} />
          <StatsBeacon />
          <ConsentRoot locale={locale} nonce={nonce} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
