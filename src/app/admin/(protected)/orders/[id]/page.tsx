import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CustomerDetailsForm } from '@/components/admin/CustomerDetailsForm';
import { OrderActions } from '@/components/admin/OrderActions';
import { OrderStatusBadge, PaymentStateBadge } from '@/components/admin/OrderStatusBadge';
import { Disclosure } from '@/components/ui/Disclosure';
import { Icon } from '@/components/ui/Icon';
import { LinkButton } from '@/components/ui/LinkButton';
import { Notice } from '@/components/ui/Notice';
import { Price } from '@/components/ui/Price';
import { formatDate, formatDateTime } from '@/lib/format-date';
import { pick } from '@/lib/i18n-fallback';
import { formatMoney } from '@/lib/money';
import { requireAdmin } from '@/server/auth/require-admin';
import { orderStatusEnum } from '@/server/db/schema';
import {
  getOrderDetail,
  type AdminOrder,
  type AdminOrderLine,
  type HistoryEntry,
} from '@/server/orders/admin-orders';
import type { OrderStatus } from '@/server/orders/status';
import {
  markOrderPaid,
  markOrderRefunded,
  setOrderStatus,
  stepBackOrderStatus,
  updateFulfilmentDetails,
  updateOrderCustomer,
} from './actions';

type T = Awaited<ReturnType<typeof getTranslations<'admin.orders'>>>;

const SECTION = 'grid gap-3 rounded-card border border-line bg-paper p-4';
const H2 = 'text-lg leading-tight font-extrabold';
const LABEL = 'text-[13px] font-bold text-ink-2';

function asStatus(value: unknown): OrderStatus | null {
  return orderStatusEnum.enumValues.find((status) => status === value) ?? null;
}

interface OptionSnapshot {
  group_he: string;
  group_en: string | null;
  value_he: string;
  value_en: string | null;
}

function optionsOf(line: AdminOrderLine): OptionSnapshot[] {
  return Array.isArray(line.options) ? (line.options as OptionSnapshot[]) : [];
}

/** One history line's "what", never any customer text (002 FR-018). */
function historyWhat(t: T, entry: HistoryEntry): string {
  const { kind, data } = entry;
  switch (kind) {
    case 'created':
    case 'payment_confirmed':
    case 'payment_marked_paid':
    case 'refunded':
    case 'customer_edited':
    case 'anonymized':
      return t(`history.${kind}`);
    case 'status_changed': {
      const from = asStatus(data.from);
      const to = asStatus(data.to);
      if (from === null || to === null) return t('history.unknown');
      return t(data.back === true ? 'history.back' : 'history.status_changed', {
        from: t(`status.${from}`),
        to: t(`status.${to}`),
      });
    }
    case 'fulfilment_edited':
      return data.field === 'trackingNumber' || data.field === 'pickupNote'
        ? t(`history.fulfilment_edited.${data.field}`)
        : t('history.unknown');
    case 'email_failed':
      return data.emailKind === 'order-confirmation' ||
        data.emailKind === 'order-cancelled' ||
        data.emailKind === 'order-refunded'
        ? t(`history.emailFailed.${data.emailKind}`)
        : t('history.unknown');
    default:
      return t('history.unknown');
  }
}

function historyWho(t: T, entry: HistoryEntry): string {
  switch (entry.actor.kind) {
    case 'admin':
      return entry.actor.name;
    case 'removed_admin':
      return t('history.actor.removedAdmin');
    case 'system':
      return t('history.actor.system');
  }
}

/** Block 8a's marketing line (storefront.md §12.3): given, given and withdrawn, none, or cleared. */
function marketingLine(t: T, order: AdminOrder) {
  const d = (chunks: ReactNode) => <bdi className="tnum">{chunks}</bdi>;
  if (order.anonymizedAt !== null) return t('detail.consent.marketingCleared');
  if (order.marketingOptInAt !== null && order.marketingWithdrawnAt !== null) {
    return t.rich('detail.consent.marketingWithdrawn', {
      given: formatDate(order.marketingOptInAt, 'he'),
      withdrawn: formatDate(order.marketingWithdrawnAt, 'he'),
      d,
    });
  }
  if (order.marketingOptIn && order.marketingOptInAt !== null) {
    return t.rich('detail.consent.marketingGiven', {
      date: formatDate(order.marketingOptInAt, 'he'),
      d,
    });
  }
  return t('detail.consent.marketingNone');
}

function Line({ line, currency, t }: { line: AdminOrderLine; currency: 'ILS' | 'USD'; t: T }) {
  const name = pick('he', line.productNameHe, line.productNameEn).text;
  const prepTime = pick('he', line.prepTimeHe, line.prepTimeEn).text;
  return (
    <li className="flex gap-3 py-3 first:pt-0" data-testid="admin-order-line">
      <span
        className="grid h-[90px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-chip bg-photo"
        data-testid={line.imageUrl === null ? 'order-line-photo-empty' : 'order-line-photo'}
      >
        {line.imageUrl === null ? null : (
          <img
            src={line.imageUrl}
            alt=""
            width={72}
            height={90}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        )}
      </span>
      <span className="grid min-w-0 flex-1 content-start gap-1">
        <bdi className="text-base leading-snug font-bold">{name}</bdi>
        {optionsOf(line).map((option) => (
          <bdi key={`${option.group_he}:${option.value_he}`} className="text-[15px] text-ink-2">
            {t('detail.option', {
              group: pick('he', option.group_he, option.group_en).text,
              value: pick('he', option.value_he, option.value_en).text,
            })}
          </bdi>
        ))}
        <bdi className="tnum text-[15px] text-ink-2">
          {line.quantity} × {formatMoney(line.unitPriceMinor, currency, 'he')}
        </bdi>
        {prepTime === '' ? null : (
          <bdi className="text-[15px] text-ink-2">{t('detail.prepTime', { prepTime })}</bdi>
        )}
      </span>
      <Price minor={line.lineTotalMinor} currency={currency} locale="he" className="self-start" />
    </li>
  );
}

export async function generateMetadata() {
  const t = await getTranslations('admin.orders');
  return { title: t('detail.title') };
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();
  const { order, lines, history } = detail;
  const t = await getTranslations('admin.orders');
  const phone = order.customerPhone;
  const email = order.customerEmail;
  const addressLines =
    order.deliveryMethod === 'shipping'
      ? [
          order.addressLine1,
          order.addressLine2,
          [order.addressPostalCode, order.addressCity].filter(Boolean).join(' '),
          order.addressCountry !== null && order.addressCountry !== 'IL'
            ? order.addressCountry
            : null,
        ].filter((line): line is string => line !== null && line !== '')
      : [];

  return (
    <div className="grid grid-cols-1 gap-5">
      <header className="grid gap-2">
        <Link
          href="/admin/orders"
          prefetch={false}
          className="inline-flex min-h-11 items-center gap-1 text-[15px] font-bold"
        >
          <Icon name="arrow" direction="start" size={18} />
          {t('detail.allOrders')}
        </Link>
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance">
          {t('detail.title')} <bdi className="tnum">#{order.orderNumber}</bdi>
        </h1>
        <p className="text-[15px] text-ink-2">
          <bdi className="tnum">{formatDateTime(order.createdAt, 'he')}</bdi>
        </p>
        <div className="flex flex-wrap gap-1.5">
          <OrderStatusBadge status={order.status} />
          <PaymentStateBadge state={order.paymentState} />
        </div>
      </header>

      {detail.confirmationEmailFailed ||
      detail.failedCustomerEmails.length > 0 ||
      order.anonymizedAt !== null ? (
        <div className="grid gap-2">
          {detail.confirmationEmailFailed ? (
            <Notice tone="alert" role="alert" id="order-email-failed-alert">
              <p className="font-bold">{t('detail.emailFailed')}</p>
              {phone === null ? null : (
                <LinkButton
                  href={`tel:${phone}`}
                  variant="secondary"
                  prefetch={false}
                  className="mt-2 min-h-11 text-ink"
                  data-testid="order-email-failed-call"
                >
                  <Icon name="phone" size={20} />
                  <bdi dir="ltr">{phone}</bdi>
                </LinkButton>
              )}
            </Notice>
          ) : null}
          {detail.failedCustomerEmails.map((kind) => (
            <p
              key={kind}
              role="alert"
              className="flex items-center gap-2 text-sm font-bold text-alert"
              data-testid="order-email-failed-line"
            >
              <Icon name="alert" size={18} />
              {t(`detail.failedEmail.${kind}`)}
            </p>
          ))}
          {order.anonymizedAt === null ? null : (
            <Notice tone="info">{t('detail.anonymised')}</Notice>
          )}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Before the details, so a phone shows the next step on top (storefront.md §12.3). */}
        <aside className="lg:order-2 lg:sticky lg:top-6">
          <OrderActions
            orderId={order.id}
            status={order.status}
            trackingNumber={order.trackingNumber}
            pickupNote={order.pickupNote}
            paymentState={order.paymentState}
            paymentMethod={order.paymentMethod}
            allowed={{
              forward: detail.allowed.forward,
              stepBackTo: detail.allowed.stepBackTo,
              cancel: detail.allowed.cancel,
              markPaid: detail.allowed.markPaid,
              markRefunded: detail.allowed.markRefunded,
              editFulfilment: detail.allowed.editFulfilment,
            }}
            actions={{
              setOrderStatus,
              stepBackOrderStatus,
              updateFulfilmentDetails,
              markOrderPaid,
              markOrderRefunded,
            }}
          />
        </aside>
        <div className="grid grid-cols-1 gap-5 lg:order-1">
          <section className={SECTION} aria-labelledby="order-items-title">
            <h2 id="order-items-title" className={H2}>
              {t('detail.items')}
            </h2>
            <ul className="divide-y divide-line" data-testid="admin-order-lines">
              {lines.map((line) => (
                <Line key={line.id} line={line} currency={order.currency} t={t} />
              ))}
            </ul>
            <dl className="grid gap-1.5 border-t border-line pt-3 text-[15px]">
              <div className="flex justify-between gap-3">
                <dt>{t('detail.subtotal')}</dt>
                <dd>
                  <Price minor={order.subtotalMinor} currency={order.currency} locale="he" />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>{t('detail.deliveryFee')}</dt>
                <dd>
                  {order.deliveryFeeMinor === 0 ? (
                    t('detail.free')
                  ) : (
                    <Price minor={order.deliveryFeeMinor} currency={order.currency} locale="he" />
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3 text-base font-extrabold">
                <dt>{t('detail.total')}</dt>
                <dd data-testid="admin-order-total">
                  <Price
                    minor={order.totalMinor}
                    currency={order.currency}
                    locale="he"
                    className="font-extrabold"
                  />
                </dd>
              </div>
            </dl>
          </section>

          <section className={SECTION} aria-labelledby="order-customer-title">
            <h2 id="order-customer-title" className={H2}>
              {t('detail.customer')}
            </h2>
            <bdi className="text-base font-bold" data-testid="admin-order-customer-name">
              {order.customerName}
            </bdi>
            {phone === null ? null : (
              <div className="grid gap-1">
                <span className={LABEL}>{t('detail.phone')}</span>
                <LinkButton
                  href={`tel:${phone}`}
                  variant="secondary"
                  prefetch={false}
                  className="justify-start"
                  data-testid="order-phone-link"
                >
                  <Icon name="phone" size={20} />
                  <bdi dir="ltr">{phone}</bdi>
                </LinkButton>
              </div>
            )}
            {email === null ? null : (
              <div className="grid gap-1">
                <span className={LABEL}>{t('detail.email')}</span>
                <LinkButton
                  href={`mailto:${email}`}
                  variant="secondary"
                  prefetch={false}
                  className="justify-start"
                  data-testid="order-email-link"
                >
                  <Icon name="mail" size={20} />
                  <bdi dir="ltr">{email}</bdi>
                </LinkButton>
              </div>
            )}
          </section>

          <section className={SECTION} aria-labelledby="order-delivery-title">
            <h2 id="order-delivery-title" className={H2}>
              {t('detail.delivery')}
            </h2>
            <p className="font-bold">{t(`delivery.${order.deliveryMethod}`)}</p>
            {addressLines.length === 0 ? null : (
              <address className="grid gap-0.5 text-[15px] not-italic" data-testid="order-address">
                {addressLines.map((line) => (
                  <bdi key={line}>{line}</bdi>
                ))}
              </address>
            )}
          </section>

          {order.note === null || order.note === '' ? null : (
            <section className={SECTION} aria-labelledby="order-note-title">
              <h2 id="order-note-title" className={H2}>
                {t('detail.note')}
              </h2>
              <p dir="auto" className="whitespace-pre-line" data-testid="order-note">
                {order.note}
              </p>
            </section>
          )}

          <section
            className={SECTION}
            aria-labelledby="order-payment-title"
            data-testid="order-payment"
          >
            <h2 id="order-payment-title" className={H2}>
              {t('detail.payment')}
            </h2>
            <p>{t(`paymentMethod.${order.paymentMethod}`)}</p>
            <p>
              <PaymentStateBadge state={order.paymentState} />
            </p>
            {order.paidAt === null ? null : (
              <p className="text-[15px] text-ink-2" data-testid="order-paid-at">
                {t.rich('detail.paidAt', {
                  date: formatDateTime(order.paidAt, 'he'),
                  d: (chunks) => <bdi className="tnum">{chunks}</bdi>,
                })}
              </p>
            )}
            {order.refundedAt === null ? null : (
              <p className="text-[15px] text-ink-2" data-testid="order-refunded-at">
                {t.rich('detail.refundedAt', {
                  date: formatDateTime(order.refundedAt, 'he'),
                  d: (chunks) => <bdi className="tnum">{chunks}</bdi>,
                })}
              </p>
            )}
          </section>

          <section
            className={SECTION}
            aria-labelledby="order-consent-title"
            data-testid="order-consent"
          >
            <h2 id="order-consent-title" className={H2}>
              {t('detail.consent.title')}
            </h2>
            <p className="text-[15px]">
              {t.rich('detail.consent.terms', {
                date: formatDateTime(order.termsAcceptedAt, 'he'),
                d: (chunks) => <bdi className="tnum">{chunks}</bdi>,
              })}
            </p>
            <p className="text-[15px] text-ink-2">
              <Link
                href={`/admin/content/terms/versions/${String(order.termsVersion)}`}
                prefetch={false}
                data-testid="order-terms-link"
                className="inline-flex min-h-11 items-center underline underline-offset-[3px]"
              >
                {t('detail.consent.termsVersion', { n: order.termsVersion })}
              </Link>{' '}
              ·{' '}
              <Link
                href={`/admin/content/privacy/versions/${String(order.privacyVersion)}`}
                prefetch={false}
                data-testid="order-privacy-link"
                className="inline-flex min-h-11 items-center underline underline-offset-[3px]"
              >
                {t('detail.consent.privacyVersion', { n: order.privacyVersion })}
              </Link>
            </p>
            <p className="text-[15px]" data-testid="order-marketing">
              {marketingLine(t, order)}
            </p>
          </section>

          {order.trackingNumber === null || order.trackingNumber === '' ? null : (
            <section className={SECTION} aria-labelledby="order-tracking-title">
              <h2 id="order-tracking-title" className={H2}>
                {t('detail.tracking')}
              </h2>
              <bdi dir="ltr" className="tnum text-start" data-testid="order-tracking-number">
                {order.trackingNumber}
              </bdi>
            </section>
          )}
          {order.pickupNote === null || order.pickupNote === '' ? null : (
            <section className={SECTION} aria-labelledby="order-pickup-note-title">
              <h2 id="order-pickup-note-title" className={H2}>
                {t('detail.pickupNote')}
              </h2>
              <p dir="auto" className="whitespace-pre-line" data-testid="order-pickup-note">
                {order.pickupNote}
              </p>
            </section>
          )}

          {/* Anonymised orders show the info Notice above instead (storefront.md §12.3, block 10). */}
          {order.anonymizedAt !== null || phone === null || email === null ? null : (
            <Disclosure title={t('customer.title')}>
              <CustomerDetailsForm
                orderId={order.id}
                fullName={order.customerName}
                phone={phone}
                email={email}
                address={
                  order.deliveryMethod === 'shipping'
                    ? {
                        country: order.addressCountry ?? '',
                        city: order.addressCity ?? '',
                        line1: order.addressLine1 ?? '',
                        line2: order.addressLine2 ?? '',
                        postalCode: order.addressPostalCode ?? '',
                      }
                    : null
                }
                actions={{ updateOrderCustomer }}
              />
            </Disclosure>
          )}

          <section className={SECTION} aria-labelledby="order-history-title">
            <h2 id="order-history-title" className={H2}>
              {t('detail.history')}
            </h2>
            <ol className="grid gap-2 text-[15px]" data-testid="order-history">
              {history.map((entry, index) => (
                <li
                  key={`${entry.at.toISOString()}:${String(index)}`}
                  data-testid="order-history-entry"
                >
                  <bdi className="tnum">{formatDateTime(entry.at, 'he')}</bdi> ·{' '}
                  {historyWhat(t, entry)} · <bdi>{historyWho(t, entry)}</bdi>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
