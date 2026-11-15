import type { ReactNode } from 'react';
import { formatMoney, type Currency, type MoneyLocale } from '@/lib/money';

export interface SummaryLine {
  key: string;
  name: string;
  /** `he` when `name` is Hebrew text on an English page. */
  nameLang?: 'he' | undefined;
  /** Thumbnail (checkout only: order photos are private). */
  imageUrl?: string | null | undefined;
  options: { group: string; value: string }[];
  /** The line's own preparation time (the distance-selling disclosure before ordering). */
  prepTime: string;
  prepTimeLang?: 'he' | undefined;
  quantity: number;
  lineTotalMinor: number;
}

export interface OrderSummaryLabels {
  subtotal: string;
  delivery: string;
  free: string;
  total: string;
  /** "Time to make: {prepTime}". */
  prepTime: (prepTime: string) => string;
  /** "× {count}". */
  quantity: (count: number) => string;
  /** "{group}: {value}". */
  option: (group: string, value: string) => string;
}

export interface OrderSummaryProps {
  lines: SummaryLine[];
  currency: Currency;
  locale: MoneyLocale;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  labels: OrderSummaryLabels;
  testIds?: { root?: string; line?: string; prep?: string } | undefined;
  /** Shown while totals are being worked out (checkout). */
  totalsBusy?: ReactNode;
}

/**
 * Lines (name × quantity, options, preparation time, line total), then subtotal, delivery
 * ("free" when 0) and total (storefront.md §7.23). Used by the checkout and the order page.
 */
export function OrderSummary({
  lines,
  currency,
  locale,
  subtotalMinor,
  deliveryFeeMinor,
  totalMinor,
  labels,
  testIds,
  totalsBusy,
}: OrderSummaryProps) {
  return (
    <div data-testid={testIds?.root ?? 'order-summary'} className="grid gap-3">
      <ul className="grid gap-3">
        {lines.map((line) => (
          <li
            key={line.key}
            data-testid={testIds?.line ?? 'order-summary-line'}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3"
          >
            {line.imageUrl === undefined || line.imageUrl === null ? null : (
              <span className="block h-[60px] w-12 overflow-hidden rounded-chip bg-photo">
                <img
                  src={line.imageUrl}
                  srcSet={`${line.imageUrl} 400w`}
                  sizes="48px"
                  width={48}
                  height={60}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              </span>
            )}
            <div className="col-start-2 min-w-0 text-[15px] leading-snug">
              <p className="font-bold">
                <span lang={line.nameLang} dir={line.nameLang === undefined ? undefined : 'auto'}>
                  {line.name}
                </span>{' '}
                <bdi className="tnum font-medium text-ink-2">{labels.quantity(line.quantity)}</bdi>
              </p>
              {line.options.length === 0 ? null : (
                <p className="text-sm text-ink-2">
                  {line.options
                    .map((option) => labels.option(option.group, option.value))
                    .join(' · ')}
                </p>
              )}
              {line.prepTime === '' ? null : (
                <p
                  data-testid={testIds?.prep}
                  lang={line.prepTimeLang}
                  dir={line.prepTimeLang === undefined ? undefined : 'auto'}
                  className="text-sm text-ink-2"
                >
                  {labels.prepTime(line.prepTime)}
                </p>
              )}
            </div>
            <bdi className="tnum col-start-3 text-[15px] font-bold">
              {formatMoney(line.lineTotalMinor, currency, locale)}
            </bdi>
          </li>
        ))}
      </ul>
      <OrderTotals
        currency={currency}
        locale={locale}
        subtotalMinor={subtotalMinor}
        deliveryFeeMinor={deliveryFeeMinor}
        totalMinor={totalMinor}
        labels={labels}
        totalsBusy={totalsBusy}
        withTestIds
      />
    </div>
  );
}

/**
 * Subtotal, delivery ("free" when 0) and total. The checkout shows it twice on a phone (inside
 * the summary and above the submit button), so only one copy carries the test ids.
 */
export function OrderTotals({
  currency,
  locale,
  subtotalMinor,
  deliveryFeeMinor,
  totalMinor,
  labels,
  totalsBusy,
  withTestIds = false,
}: Pick<
  OrderSummaryProps,
  'currency' | 'locale' | 'subtotalMinor' | 'deliveryFeeMinor' | 'totalMinor' | 'totalsBusy'
> & { labels: OrderSummaryLabels; withTestIds?: boolean }) {
  return (
    <dl className="grid gap-1.5 border-t border-line pt-3 text-base">
      <div className="flex items-baseline justify-between gap-3">
        <dt>{labels.subtotal}</dt>
        <dd>
          <bdi className="tnum">{formatMoney(subtotalMinor, currency, locale)}</bdi>
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt>{labels.delivery}</dt>
        <dd data-testid={withTestIds ? 'summary-delivery' : undefined}>
          {deliveryFeeMinor === 0 ? (
            labels.free
          ) : (
            <bdi className="tnum">{formatMoney(deliveryFeeMinor, currency, locale)}</bdi>
          )}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-lg font-extrabold">
        <dt>{labels.total}</dt>
        <dd
          data-testid={withTestIds ? 'summary-total' : undefined}
          className="flex items-center gap-2"
        >
          {totalsBusy}
          <bdi className="tnum">{formatMoney(totalMinor, currency, locale)}</bdi>
        </dd>
      </div>
    </dl>
  );
}
