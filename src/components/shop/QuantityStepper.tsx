'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { MAX_QUANTITY } from '@/lib/cart/store';
import { Icon } from '@/components/ui/Icon';

const STEP =
  'grid shrink-0 place-items-center rounded-full text-ink transition-colors duration-150 ease-out hover:bg-sun-soft aria-disabled:text-ink-2 aria-disabled:hover:bg-transparent';

/**
 * A pill with minus, the value and plus (1 to 20). At a limit the button stays focusable and
 * says so instead of being disabled. The compact size is 40 px tall with 44 px hit areas.
 */
export function QuantityStepper({
  value,
  onChange,
  compact = false,
  label,
  testIdPrefix = 'quantity',
}: {
  value: number;
  onChange: (value: number) => void;
  compact?: boolean;
  /** Group name; defaults to "Quantity". */
  label?: string;
  testIdPrefix?: string;
}) {
  const t = useTranslations('cart.stepper');
  const labelId = useId();
  const [limit, setLimit] = useState<'min' | 'max' | null>(null);

  function step(delta: 1 | -1): void {
    const next = value + delta;
    if (next < 1) setLimit('min');
    else if (next > MAX_QUANTITY) setLimit('max');
    else {
      setLimit(null);
      onChange(next);
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn(
        'inline-flex shrink-0 items-center rounded-pill border-[1.5px] border-field bg-panel px-1',
        compact ? 'h-10' : 'h-[54px]',
      )}
    >
      <span id={labelId} className="sr-only">
        {label ?? t('label')}
      </span>
      <button
        type="button"
        data-testid={`${testIdPrefix}-decrease`}
        aria-label={t('decrease')}
        aria-disabled={value <= 1 ? true : undefined}
        onClick={() => {
          step(-1);
        }}
        className={cn(STEP, 'size-11')}
      >
        <Icon name="minus" />
      </button>
      <output
        data-testid={`${testIdPrefix}-value`}
        aria-live="polite"
        className={cn(
          'tnum min-w-8 text-center font-bold',
          compact ? 'text-[15px]' : 'text-[17px]',
        )}
      >
        {value}
      </output>
      <button
        type="button"
        data-testid={`${testIdPrefix}-increase`}
        aria-label={t('increase')}
        aria-disabled={value >= MAX_QUANTITY ? true : undefined}
        onClick={() => {
          step(1);
        }}
        className={cn(STEP, 'size-11')}
      >
        <Icon name="plus" />
      </button>
      <span role="status" className="sr-only">
        {limit === 'min' ? t('atMin') : limit === 'max' ? t('atMax', { max: MAX_QUANTITY }) : ''}
      </span>
    </div>
  );
}
