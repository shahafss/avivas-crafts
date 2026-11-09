'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { formatMoney, type MoneyLocale } from '@/lib/money';

export interface SelectorValue {
  id: string;
  label: string;
  /** `he` when `label` is Hebrew text on an English page. */
  labelLang?: 'he';
  deltaMinor: number;
  swatch: string | null;
}

export interface SelectorGroup {
  id: string;
  name: string;
  nameLang?: 'he';
  values: SelectorValue[];
}

/** "+₪15.00" / "−₪10.00"; nothing for 0. */
export function DeltaText({ minor, locale }: { minor: number; locale: MoneyLocale }) {
  if (minor === 0) return null;
  return (
    <bdi className="tnum">
      {minor < 0 ? '−' : '+'}
      {formatMoney(Math.abs(minor), 'ILS', locale)}
    </bdi>
  );
}

/**
 * One fieldset of radio chips per group. The radios are uncontrolled: the browser keeps the
 * choice, and the parent reads it from the DOM (so a click that lands before hydration counts).
 */
export function OptionSelector({
  groups,
  locale,
  invalidGroupId,
}: {
  groups: SelectorGroup[];
  locale: MoneyLocale;
  /** The first group without a choice after a failed "add to cart" (US2). */
  invalidGroupId?: string | undefined;
}) {
  const t = useTranslations('shop.product');
  return (
    <div className="grid gap-4">
      {groups.map((group) => (
        <fieldset
          key={group.id}
          aria-invalid={invalidGroupId === group.id ? true : undefined}
          className="min-w-0"
        >
          <legend className="mb-2 text-sm leading-snug font-bold">
            <span lang={group.nameLang} dir={group.nameLang === undefined ? undefined : 'auto'}>
              {group.name}
            </span>{' '}
            <span className="font-medium text-ink-2">{t('chooseOne')}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {group.values.map((value) => (
              <label
                key={value.id}
                data-testid="option-chip"
                className={cn(
                  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-chip border-[1.5px] bg-panel px-4 text-[15px] font-medium transition-colors duration-150 ease-out',
                  invalidGroupId === group.id ? 'border-alert' : 'border-field',
                  'hover:bg-sun-soft has-checked:border-ink has-checked:bg-sun-soft has-checked:ring-1 has-checked:ring-ink has-checked:ring-inset',
                  'has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-ink',
                )}
              >
                <input type="radio" name={group.id} value={value.id} className="peer sr-only" />
                {value.swatch === null ? null : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      `swatch-${value.swatch}`,
                      'size-4 shrink-0 rounded-full border border-ink/20',
                    )}
                  />
                )}
                <span
                  lang={value.labelLang}
                  dir={value.labelLang === undefined ? undefined : 'auto'}
                >
                  {value.label}
                </span>
                {value.deltaMinor === 0 ? null : (
                  <span className="text-[13px] text-ink-2">
                    <DeltaText minor={value.deltaMinor} locale={locale} />
                  </span>
                )}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
