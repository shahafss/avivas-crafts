import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { OrderCleanup } from '@/components/shop/OrderCleanup';
import { OrderProgress } from '@/components/shop/OrderProgress';
import { OrderSummary, type OrderSummaryLabels } from '@/components/shop/OrderSummary';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { LinkButton } from '@/components/ui/LinkButton';
import { Notice } from '@/components/ui/Notice';
import { routing } from '@/i18n/routing';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';
import { cn } from '@/lib/cn';
import { getOrderByToken } from '@/server/orders/public-order';
import type { OrderStatus } from '@/server/orders/status';
import { alternates } from '@/server/seo';
import { getSettings } from '@/server/settings/settings';

const CONTACT_LINK = 'inline-flex min-h-11 items-center font-bold underline underline-offset-[3px]';

const CURRENT_STEP = {
  new: 0,
  in_preparation: 1,
  shipped: 2,
  ready_for_pickup: 2,
  completed: 3,
} as const;

const ORDER_TEST_IDS = { root: 'order-summary', line: 'order-line', prep: 'order-prep-time' };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}): Promise<Metadata> {
  const { locale, token } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'order' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
    alternates: alternates(`/order/${token}`, locale),
  };
}

// The order status page (storefront.md §8.8), reached through an unguessable link that works while
// the order is open and for 30 days after it is Completed or Cancelled (FR-015). It shows where the
// order stands, what was ordered and how to pay, never the customer's address, phone or email.
type MadeKey = 'madePaid' | 'madeAwaiting' | 'madeInPreparation';

/** The "made" note by status and payment state (storefront.md §8.8 table); null = hidden. */
function madeNotice(
  status: OrderStatus,
  payment: 'awaiting_payment' | 'paid' | 'refunded',
): MadeKey | null {
  if (status !== 'new' && status !== 'in_preparation') return null;
  if (payment === 'refunded') return null;
  if (status === 'in_preparation') return 'madeInPreparation';
  return payment === 'paid' ? 'madePaid' : 'madeAwaiting';
}

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
              {t('contact.link')}
            </LinkButton>
          }
        />
      </div>
    );
  }

  const { order, lines, justPlaced } = found;
  const settings = await getSettings();
  const loc = locale;
  const status = order.status;
  const cancelled = status === 'cancelled';
  const completed = status === 'completed';
  const showOffline =
    order.paymentMethod === 'offline' &&
    order.paymentState === 'awaiting_payment' &&
    !cancelled &&
    !completed;
  // Nothing is owed on a cancelled order, so "awaiting payment" would only mislead.
  const showChip = !(cancelled && order.paymentState === 'awaiting_payment');
  const showPickupInstructions =
    order.deliveryMethod === 'pickup' && (status === 'new' || status === 'in_preparation');
  const madeText = madeNotice(status, order.paymentState);
  const instructions = pick(loc, settings.offlineInstructionsHe, settings.offlineInstructionsEn);
  const pickup = pick(loc, settings.pickupInstructionsHe, settings.pickupInstructionsEn);
  const number = String(order.orderNumber);
  const pickupNote = order.pickupNote?.trim() ?? '';
  const trackingNumber = order.trackingNumber?.trim() ?? '';

  const contact = (
    <p className="mt-2 flex flex-wrap items-center gap-x-4">
      <a href={`tel:${settings.businessPhone}`} className={CONTACT_LINK}>
        <span className="me-1 font-normal">{t('contact.phone')}:</span>
        <bdi dir="ltr">{settings.businessPhone}</bdi>
      </a>
      <a href={`mailto:${settings.businessEmail}`} className={CONTACT_LINK}>
        <span className="me-1 font-normal">{t('contact.email')}:</span>
        <bdi dir="ltr">{settings.businessEmail}</bdi>
      </a>
      <a href={`/${locale}/contact`} className={CONTACT_LINK}>
        {t('contact.link')}
      </a>
    </p>
  );

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
        {cancelled ? null : (
          <span className="grid size-14 place-items-center rounded-full bg-sage text-ink">
            <Icon name="check" size={26} />
          </span>
        )}
        <h1 className="text-[32px] leading-[1.15] font-bold tracking-[-0.01em] text-balance lg:text-[44px]">
          {justPlaced ? t('heading') : t('headingLater')}
        </h1>
        <p>
          <span className="block text-ink-2">{t('numberLabel')}</span>
          <bdi data-testid="order-number" className="tnum text-2xl font-extrabold">
            {number}
          </bdi>
        </p>
        <p className="text-ink-2">{t('emailSent')}</p>
        {showChip ? (
          <p
            data-testid="order-payment-state"
            className={cn(
              'inline-flex min-h-8 items-center rounded-pill px-3.5 text-sm font-bold',
              order.paymentState === 'paid' && 'bg-sage',
              order.paymentState === 'refunded' && 'bg-photo',
              order.paymentState === 'awaiting_payment' && 'border-[1.5px] border-field bg-paper',
            )}
          >
            {t(`paymentState.${order.paymentState}`)}
          </p>
        ) : null}
      </div>

      {cancelled ? null : (
        <OrderProgress
          label={t('progress')}
          steps={[
            t('steps.received'),
            t('steps.making'),
            order.deliveryMethod === 'pickup' ? t('steps.ready') : t('steps.shipped'),
            t('steps.completed'),
          ]}
          current={CURRENT_STEP[status]}
        />
      )}

      {status === 'shipped' ? (
        <Notice tone="info">
          <h2 className="font-extrabold">{t('tracking.title')}</h2>
          {trackingNumber === '' ? null : (
            <p className="mt-1">
              {t('tracking.number')}:{' '}
              <bdi dir="ltr" data-testid="order-tracking-number" className="tnum font-bold">
                {trackingNumber}
              </bdi>
            </p>
          )}
        </Notice>
      ) : null}

      {status === 'ready_for_pickup' ? (
        <div data-testid="order-pickup-note">
          <Notice tone="info">
            <h2 className="font-extrabold">{t('pickupReady.title')}</h2>
            {pickupNote !== '' ? (
              <p dir="auto" className="mt-1 whitespace-pre-line">
                {pickupNote}
              </p>
            ) : pickup.text.trim() !== '' ? (
              <p
                lang={fallbackAttrs(pickup).lang}
                dir={fallbackAttrs(pickup).dir}
                className="mt-1 whitespace-pre-line"
              >
                {pickup.text.trim()}
              </p>
            ) : (
              <>
                <p className="mt-1">{t('pickupReady.fallback')}</p>
                {contact}
              </>
            )}
          </Notice>
        </div>
      ) : null}

      {cancelled ? (
        <div data-testid="order-cancelled">
          <Notice tone="info">
            <h2 className="font-extrabold">{t('cancelled.title')}</h2>
            {order.paymentState === 'refunded' ? (
              <p className="mt-1">{t('cancelled.refunded')}</p>
            ) : order.paymentState === 'paid' ? (
              <p className="mt-1">{t('cancelled.willRefund')}</p>
            ) : null}
            {contact}
          </Notice>
        </div>
      ) : null}

      {showOffline ? (
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

      {showPickupInstructions && pickup.text.trim() !== '' ? (
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

      {madeText === null ? null : <Notice tone="made">{t(madeText)}</Notice>}

      <section
        aria-label={t('summary.label')}
        className="rounded-card border border-line bg-paper p-[18px]"
      >
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
        <LinkButton href={`/${locale}/shop`} variant="quiet">
          {t('backToShop')}
        </LinkButton>
      </div>
    </div>
  );
}
