'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Price } from '@/components/ui/Price';
import { cn } from '@/lib/cn';
import { formatMoney, type MoneyLocale } from '@/lib/money';
import type { PricedCartLine } from '@/server/checkout/price-cart';
import { QuantityStepper } from './QuantityStepper';

export function lineElementId(key: string): string {
  return `cart-line-${key.replace(/[^a-zA-Z0-9-]/g, '-')}`;
}

/** The message the cart shows for a flagged line. */
export function useFlagMessage(): (flag: NonNullable<PricedCartLine['flag']>) => string {
  const t = useTranslations('cart.flags');
  return (flag) =>
    flag === 'unavailable' || flag === 'not_orderable'
      ? t('unavailable')
      : flag === 'choose_options_again'
        ? t('chooseAgain')
        : t('noUsd');
}

/**
 * One cart row: thumbnail, name, options, unit price, stepper, line total, remove. A flagged
 * line has an alert border and says why it cannot be ordered.
 */
export function CartLine({
  line,
  quantity,
  currency,
  onQuantity,
  onRemove,
}: {
  line: PricedCartLine;
  /** The quantity in the cart (the device is the source of truth for it). */
  quantity: number;
  currency: 'ILS' | 'USD';
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const locale = useLocale() as MoneyLocale;
  const t = useTranslations('cart.line');
  const flagMessage = useFlagMessage();
  const displayName = line.name === '' ? t('gone') : line.name;
  const flagged = line.flag !== undefined;
  const removable = line.flag === 'unavailable' || line.flag === 'not_orderable';

  return (
    <li
      id={lineElementId(line.key)}
      data-testid="cart-line"
      data-flag={line.flag}
      className={cn(
        'grid grid-cols-[72px_minmax(0,1fr)] gap-x-3.5 rounded-card bg-panel p-3.5',
        flagged && 'border-[1.5px] border-alert',
      )}
    >
      <span className="block h-[90px] w-[72px] overflow-hidden rounded-chip bg-photo">
        {line.imageUrl === null ? null : (
          <img
            src={line.imageUrl}
            srcSet={`${line.imageUrl} 400w`}
            sizes="72px"
            width={72}
            height={90}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        )}
      </span>
      <div className="grid min-w-0 content-start gap-2">
        <div className="min-w-0">
          {line.slug === null ? (
            <p
              data-testid="cart-line-name"
              lang={line.nameLang}
              dir={line.nameLang === undefined ? undefined : 'auto'}
              className="text-base leading-snug font-bold"
            >
              {displayName}
            </p>
          ) : (
            <Link
              href={`/${locale}/p/${line.slug}`}
              data-testid="cart-line-name"
              lang={line.nameLang}
              dir={line.nameLang === undefined ? undefined : 'auto'}
              className="flex min-h-11 items-center text-base leading-snug font-bold hover:underline"
            >
              {displayName}
            </Link>
          )}
          {line.options.length === 0 ? null : (
            <ul data-testid="cart-line-options" className="mt-0.5 text-sm text-ink-2">
              {line.options.map((option) => (
                <li key={`${option.group}-${option.value}`}>
                  {t.rich('option', {
                    group: option.group,
                    value: option.value,
                    g: (chunks) => (
                      <span
                        lang={option.groupLang}
                        dir={option.groupLang === undefined ? undefined : 'auto'}
                      >
                        {chunks}
                      </span>
                    ),
                    v: (chunks) => (
                      <span
                        lang={option.valueLang}
                        dir={option.valueLang === undefined ? undefined : 'auto'}
                      >
                        {chunks}
                      </span>
                    ),
                  })}
                </li>
              ))}
            </ul>
          )}
          {flagged ? null : (
            <p data-testid="cart-line-unit" className="mt-1">
              <Price minor={line.unitPriceMinor} currency={currency} locale={locale} />
            </p>
          )}
        </div>

        {line.flag === undefined ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <QuantityStepper
              compact
              value={quantity}
              onChange={onQuantity}
              label={t('quantityOf', { name: displayName })}
            />
            <p data-testid="cart-line-total">
              <bdi className="tnum text-base font-bold">
                {formatMoney(line.unitPriceMinor * quantity, currency, locale)}
              </bdi>
            </p>
          </div>
        ) : (
          <div className="grid gap-1" data-testid="cart-flag">
            <p className="flex items-start gap-1.5 text-[15px] font-bold text-alert">
              <Icon name="alert" size={18} className="mt-0.5" />
              <span>{flagMessage(line.flag)}</span>
            </p>
            {line.flag === 'choose_options_again' && line.slug !== null ? (
              <Link
                href={`/${locale}/p/${line.slug}`}
                className="inline-flex min-h-11 items-center font-bold underline underline-offset-[3px]"
              >
                {t('chooseAgainLink')}
              </Link>
            ) : null}
          </div>
        )}

        <div>
          <Button
            variant="quiet"
            data-testid="cart-remove"
            onClick={onRemove}
            className="text-[15px] no-underline"
          >
            <Icon name="close" size={16} />
            <span>{removable ? t('removeFromCart') : t('remove')}</span>
            <span className="sr-only">{displayName}</span>
          </Button>
        </div>
      </div>
    </li>
  );
}
