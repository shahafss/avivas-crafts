import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { CheckoutForm, type CheckoutConfig } from '@/components/shop/CheckoutForm';
import type MessageFile from '@/i18n/messages/he.json';
import { routing, type Locale } from '@/i18n/routing';
import { pick } from '@/lib/i18n-fallback';
import { db } from '@/server/db/client';
import { shippingZoneCountry } from '@/server/db/schema';
import { issueFormToken } from '@/server/checkout/form-token';
import { getEnv } from '@/server/env';
import { effectivePaymentMethods } from '@/server/payments/availability';
import { getEnabledZones, getSettings } from '@/server/settings/settings';
import { alternates } from '@/server/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'checkout' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
    alternates: alternates('/checkout', locale),
  };
}

async function countryOptions(locale: Locale): Promise<CheckoutConfig['countries']> {
  const zones = await getEnabledZones();
  const links = await db.select().from(shippingZoneCountry);
  const names = new Intl.DisplayNames(locale === 'he' ? 'he-IL' : 'en-US', { type: 'region' });
  const enabled = new Set(zones.map((zone) => zone.id));
  return links
    .filter((link) => enabled.has(link.zoneId))
    .map((link) => ({
      code: link.countryCode,
      label: names.of(link.countryCode) ?? link.countryCode,
    }))
    .sort((a, b) => (a.code === 'IL' ? -1 : b.code === 'IL' ? 1 : a.label.localeCompare(b.label)));
}

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [t, rawMessages, settings, zones, countries] = await Promise.all([
    getTranslations({ locale, namespace: 'checkout' }),
    getMessages(),
    getSettings(),
    getEnabledZones(),
    countryOptions(locale),
  ]);
  const messages = rawMessages as unknown as typeof MessageFile;
  const methods = effectivePaymentMethods(settings, getEnv().PAYMENT_PROVIDER);
  const israel = zones.find((zone) => zone.code === 'IL');
  const pickup = pick(locale, settings.pickupInstructionsHe, settings.pickupInstructionsEn);
  const businessName = pick(locale, settings.businessNameHe, settings.businessNameEn);

  const config: CheckoutConfig = {
    locale,
    formToken: issueFormToken(),
    onlineEnabled: methods.online,
    offlineEnabled: methods.offline,
    shippingAvailable: zones.some((zone) => zone.shippingEnabled),
    pickupAvailable: israel?.pickupEnabled === true,
    pickupInstructions: pickup.text.trim() === '' ? null : pickup.text.trim(),
    pickupInstructionsLang: pickup.fallback ? 'he' : undefined,
    countries,
    seller: {
      name: businessName.text,
      nameLang: businessName.fallback ? 'he' : undefined,
      regNumber: settings.businessRegNumber,
    },
  };

  return (
    <div className="grid gap-5 pt-4 lg:gap-6 lg:pt-6">
      <h1 className="text-[32px] leading-[1.15] font-bold tracking-[-0.01em] text-balance lg:text-[44px]">
        {t('title')}
      </h1>
      <NextIntlClientProvider locale={locale} messages={{ checkout: messages.checkout }}>
        <CheckoutForm config={config} />
      </NextIntlClientProvider>
    </div>
  );
}
