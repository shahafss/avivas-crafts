import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { CartView } from '@/components/shop/CartView';
import type MessageFile from '@/i18n/messages/he.json';
import { routing } from '@/i18n/routing';
import { defaultZone } from '@/server/checkout/zones';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'cart' });
  return { title: t('title'), robots: { index: false, follow: true } };
}

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [t, rawMessages, zone] = await Promise.all([
    getTranslations({ locale, namespace: 'cart' }),
    getMessages(),
    defaultZone(),
  ]);
  const messages = rawMessages as unknown as typeof MessageFile;

  const threshold = zone !== null && zone.shippingEnabled ? zone.freeShippingThresholdMinor : null;

  return (
    <div className="grid gap-5 pt-4 lg:gap-6 lg:pt-6">
      <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance lg:text-[34px]">
        {t('title')}
      </h1>
      <NextIntlClientProvider locale={locale} messages={{ cart: messages.cart }}>
        <CartView freeShippingOverMinor={threshold} />
      </NextIntlClientProvider>
    </div>
  );
}
