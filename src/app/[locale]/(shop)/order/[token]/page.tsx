import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { OrderCleanup } from '@/components/shop/OrderCleanup';
import { OrderSummary, type OrderSummaryLabels } from '@/components/shop/OrderSummary';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { LinkButton } from '@/components/ui/LinkButton';
import { Notice } from '@/components/ui/Notice';
import { routing } from '@/i18n/routing';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';
import { cn } from '@/lib/cn';
import { getOrderByToken } from '@/server/orders/public-order';
import { getSettings } from '@/server/settings/settings';

const ORDER_TEST_IDS = { root: 'order-summary', line: 'order-line', prep: 'order-prep-time' };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'order' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

// The confirmation page, reached through an unguessable link for 30 days. It shows what was
// ordered and how to pay, never the address, phone number or email.
export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: 'order' });
  const found = await getOrderByToken(token);

  if (found === null) {
    return (
      <div className="mx-auto w-full max-w-160 pt-6 lg:pt-10">
        <EmptyState
          icon="info"
          title={t('expired.title')}
          text={t('expired.text')}
          action={
            <LinkButton href={`/${locale}/contact`} variant="secondary">
              {t('expired.contact')}
            </LinkButton>
          }
        />
      </div>
    );
  }

  const { order, lines, justPlaced } = found;
  const settings = await getSettings();
  const loc = locale;
  const paid = order.paymentState === 'paid';
  const offline = order.paymentMethod === 'offline' && order.paymentState === 'awaiting_payment';
  const instructions = pick(loc, settings.offlineInstructionsHe, settings.offlineInstructionsEn);
  const pickup = pick(loc, settings.pickupInstructionsHe, settings.pickupInstructionsEn);
  const number = String(order.orderNumber);

  const labels: OrderSummaryLabels = {
    subtotal: t('summary.subtotal'),
    delivery: t('summary.delivery'),
    free: t('summary.free'),
    total: t('summary.total'),
    prepTime: (prepTime) => t('summary.prepTime', { prepTime }),
    quantity: (count) => t('summary.quantity', { count }),
    option: (group, value) => t('summary.option', { group, value }),
  };
  const summaryLines = lines.map((line) => {
    const name = pick(loc, line.productNameHe, line.productNameEn);
    const prep = pick(loc, line.prepTimeHe, line.prepTimeEn);
    const options = line.options as {
      group_he: string;
      group_en: string | null;
      value_he: string;
      value_en: string | null;
    }[];
    return {
      key: line.id,
      name: name.text,
      nameLang: fallbackAttrs(name).lang,
      options: options.map((option) => ({
        group: pick(loc, option.group_he, option.group_en).text,
        value: pick(loc, option.value_he, option.value_en).text,
      })),
      prepTime: prep.text,
      prepTimeLang: prep.fallback && prep.text !== '' ? ('he' as const) : undefined,
      quantity: line.quantity,
      lineTotalMinor: line.lineTotalMinor,
    };
  });

  return (
    <div className="mx-auto grid w-full max-w-160 gap-5 pt-6 lg:pt-10">
      <OrderCleanup justPlaced={justPlaced} />
      <div className="grid justify-items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-sun-soft text-ink">
          <Icon name="check" size={26} />
        </span>
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance">
          {t('heading')}
        </h1>
        <p>
          <span className="block text-ink-2">{t('numberLabel')}</span>
          <bdi data-testid="order-number" className="tnum text-2xl font-extrabold">
            {number}
          </bdi>
        </p>
        <p className="text-ink-2">{t('emailSent')}</p>
        <p
          data-testid="order-payment-state"
          className={cn(
            'inline-flex min-h-8 items-center rounded-pill px-3.5 text-sm font-bold',
            paid ? 'bg-sun-soft' : 'border-[1.5px] border-field bg-panel',
          )}
        >
          {t(`paymentState.${order.paymentState}`)}
        </p>
      </div>

      {offline ? (
        <div data-testid="offline-instructions">
          <Notice tone="attention">
            <h2 className="font-extrabold">{t('howToPay')}</h2>
            {instructions.text.trim() === '' ? null : (
              <p
                lang={fallbackAttrs(instructions).lang}
                dir={fallbackAttrs(instructions).dir}
                className="mt-1 whitespace-pre-line"
              >
                {instructions.text.trim()}
              </p>
            )}
            <p className="mt-2 font-bold">
              {t.rich('quoteNumber', { number, n: (chunks) => <bdi>{chunks}</bdi> })}
            </p>
          </Notice>
        </div>
      ) : null}

      {order.deliveryMethod === 'pickup' && pickup.text.trim() !== '' ? (
        <div data-testid="pickup-instructions">
          <Notice tone="info">
            <h2 className="font-extrabold">{t('pickup')}</h2>
            <p
              lang={fallbackAttrs(pickup).lang}
              dir={fallbackAttrs(pickup).dir}
              className="mt-1 whitespace-pre-line"
            >
              {pickup.text.trim()}
            </p>
          </Notice>
        </div>
      ) : null}

      <Notice tone="made">{paid ? t('madePaid') : t('madeAwaiting')}</Notice>

      <section aria-label={t('summary.label')} className="rounded-card bg-panel p-[18px]">
        <h2 className="mb-3 text-lg font-extrabold">{t('summary.label')}</h2>
        <OrderSummary
          lines={summaryLines}
          currency={order.currency}
          locale={loc}
          subtotalMinor={order.subtotalMinor}
          deliveryFeeMinor={order.deliveryFeeMinor}
          totalMinor={order.totalMinor}
          labels={labels}
          testIds={ORDER_TEST_IDS}
        />
      </section>

      <div className="text-center">
        <LinkButton href={`/${locale}`} variant="quiet">
          {t('backToShop')}
        </LinkButton>
      </div>
    </div>
  );
}
