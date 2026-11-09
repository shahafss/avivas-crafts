import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { routing } from '@/i18n/routing';
import { formatMoney } from '@/lib/money';
import { fakeProviderAvailable, isFakePageId, readFakePage } from '@/server/payments/fake';
import { submitFakePayment } from './actions';

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Development and test only (PAYMENT_PROVIDER=fake, never in production): stands in for the
// provider's hosted payment page.
export default async function FakePayPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[]; closed?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale) || !fakeProviderAvailable()) notFound();
  const query = await searchParams;
  const pageId = typeof query.page === 'string' ? query.page : '';
  const page = isFakePageId(pageId) ? await readFakePage(pageId) : null;
  if (page === null) notFound();
  const t = await getTranslations({ locale, namespace: 'checkout.fakePay' });

  return (
    <div className="mx-auto grid w-full max-w-lg gap-4 pt-6 lg:pt-10">
      <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight">{t('title')}</h1>
      <Notice tone="attention">{t('notice')}</Notice>
      <p className="text-lg">
        {t('amount')}{' '}
        <bdi className="tnum font-extrabold">
          {formatMoney(
            page.input.amountMinor,
            page.input.currency,
            routing.locales.includes(locale) ? locale : 'he',
          )}
        </bdi>
      </p>
      {query.closed === '1' ? (
        <Notice tone="info" role="status">
          <span data-testid="fake-pay-closed">{t('closed')}</span>
        </Notice>
      ) : (
        <form action={submitFakePayment} className="grid gap-2.5">
          <input type="hidden" name="pageId" value={pageId} />
          <Button type="submit" name="mode" value="pay" data-testid="fake-pay-pay">
            {t('pay')}
          </Button>
          <Button
            type="submit"
            name="mode"
            value="fail"
            variant="secondary"
            data-testid="fake-pay-fail"
          >
            {t('fail')}
          </Button>
          <Button
            type="submit"
            name="mode"
            value="pay-close"
            variant="secondary"
            data-testid="fake-pay-pay-close"
          >
            {t('payClose')}
          </Button>
        </form>
      )}
    </div>
  );
}
