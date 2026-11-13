import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { ReturnView } from '@/components/shop/ReturnView';
import type MessageFile from '@/i18n/messages/he.json';
import { routing } from '@/i18n/routing';
import { getSettings } from '@/server/settings/settings';
import { alternates } from '@/server/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'checkout.return' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
    alternates: alternates('/checkout/return', locale),
  };
}

// Where the payment provider sends the visitor back to (`c` = the resume token). The page never
// marks anything paid: it polls the status endpoint, which asks the provider.
export default async function PaymentReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ c?: string | string[]; r?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const query = await searchParams;
  const token = typeof query.c === 'string' ? query.c : '';
  const result = query.r === 'success' || query.r === 'failure' ? query.r : null;
  const [rawMessages, settings] = await Promise.all([getMessages(), getSettings()]);
  const messages = rawMessages as unknown as typeof MessageFile;

  return (
    <div className="mx-auto w-full max-w-lg pt-6 lg:pt-10">
      <NextIntlClientProvider locale={locale} messages={{ checkout: messages.checkout }}>
        <ReturnView token={token} result={result} offlineEnabled={settings.offlinePaymentEnabled} />
      </NextIntlClientProvider>
    </div>
  );
}
