import { cn } from '@/lib/cn';
import { formatMoney, type Currency, type MoneyLocale } from '@/lib/money';

export interface PriceProps {
  minor: number;
  currency: Currency;
  locale: MoneyLocale;
  size?: 'lg' | 'md' | 'card';
  /** Translated prefix such as "From"; the price then reads "From ₪120". */
  from?: string;
  className?: string;
}

export function Price({
  minor,
  currency,
  locale,
  size = 'md',
  from,
  className,
}: PriceProps) {
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2', className)}>
      {from === undefined ? null : (
        <span
          className={cn(
            size === 'card' ? 'text-sm font-normal' : 'text-[15px] font-medium',
            'text-ink-2',
          )}
        >
          {from}
        </span>
      )}
      <bdi
        className={cn(
          'tnum',
          size === 'lg' && 'text-2xl leading-tight font-bold',
          size === 'md' && 'text-[15px] font-medium',
          size === 'card' && 'text-[15px] font-normal text-ink lg:text-base',
        )}
      >
        {formatMoney(minor, currency, locale)}
      </bdi>
    </span>
  );
}
