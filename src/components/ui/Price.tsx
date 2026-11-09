import { cn } from '@/lib/cn';
import { formatMoney, type Currency, type MoneyLocale } from '@/lib/money';

export interface PriceProps {
  minor: number;
  currency: Currency;
  locale: MoneyLocale;
  size?: 'lg' | 'md';
  /** Translated prefix such as "From"; the price then reads "From ₪120". */
  from?: string;
  /** Translated "incl. VAT", shown after the price (ILS only; the caller decides). */
  vatLabel?: string;
  className?: string;
}

export function Price({
  minor,
  currency,
  locale,
  size = 'md',
  from,
  vatLabel,
  className,
}: PriceProps) {
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2', className)}>
      {from === undefined ? null : (
        <span className="text-[15px] font-medium text-ink-2">{from}</span>
      )}
      <bdi
        className={cn(
          'tnum',
          size === 'lg' ? 'text-2xl leading-tight font-bold' : 'text-[15px] font-medium',
        )}
      >
        {formatMoney(minor, currency, locale)}
      </bdi>
      {vatLabel === undefined ? null : <span className="text-[13px] text-ink-2">{vatLabel}</span>}
    </span>
  );
}
