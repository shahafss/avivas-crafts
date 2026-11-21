'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { LinkButton } from '@/components/ui/LinkButton';
import { Notice } from '@/components/ui/Notice';
import { Price } from '@/components/ui/Price';
import type { MoneyLocale } from '@/lib/money';
import { AddToCart, type MissingGroup } from './AddToCart';
import { DeltaText, OptionSelector, type SelectorGroup } from './OptionSelector';

/** The radio the browser has checked in every group, read from the DOM. */
function readSelection(root: HTMLElement): Record<string, string> {
  const chosen: Record<string, string> = {};
  for (const input of root.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked')) {
    chosen[input.name] = input.value;
  }
  return chosen;
}

/**
 * Price, options and the buy row (quantity and "Add to cart"). The made-to-order note and the description arrive
 * as server-rendered `children`, so they keep their place between the price and the options.
 */
export function BuyBox({
  productId,
  name,
  basePriceMinor,
  groups,
  orderable,
  children,
}: {
  productId: string;
  /** Product name in the page language (`lang="he"` when it is the Hebrew fallback). */
  name: { text: string; lang?: 'he' };
  basePriceMinor: number;
  groups: SelectorGroup[];
  orderable: boolean;
  children?: ReactNode;
}) {
  const locale = useLocale() as MoneyLocale;
  const t = useTranslations('shop.product');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [invalidGroupId, setInvalidGroupId] = useState<string | undefined>(undefined);
  const root = useRef<HTMLDivElement | null>(null);

  // Called when the box appears (after hydration too), so a choice made before that is not lost.
  const rootRef = useCallback((element: HTMLDivElement | null) => {
    root.current = element;
    if (element !== null) setSelected(readSelection(element));
  }, []);
  function onChange(event: SyntheticEvent<HTMLDivElement>): void {
    const next = readSelection(event.currentTarget);
    setSelected(next);
    setInvalidGroupId((current) =>
      current !== undefined && next[current] !== undefined ? undefined : current,
    );
  }

  function toMissing(group: SelectorGroup): MissingGroup {
    return {
      id: group.id,
      name: group.name,
      ...(group.nameLang === undefined ? {} : { nameLang: group.nameLang }),
    };
  }
  const firstMissing = groups.find((group) => selected[group.id] === undefined);
  const invalidGroup = groups.find((group) => group.id === invalidGroupId);
  function onMissing(group: MissingGroup): void {
    setInvalidGroupId(group.id);
    // Focus the first radio of that group (the chips are native radios, so arrows work too).
    const radios = root.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    for (const radio of radios ?? []) {
      if (radio.name === group.id) {
        radio.focus();
        break;
      }
    }
  }

  // Chosen groups count with their value; the others with their lowest adjustment.
  let totalMinor = basePriceMinor;
  let open = false;
  for (const group of groups) {
    const deltas = group.values.map((value) => value.deltaMinor);
    const choice = group.values.find((value) => value.id === selected[group.id]);
    if (choice !== undefined) {
      totalMinor += choice.deltaMinor;
    } else {
      totalMinor += deltas.length === 0 ? 0 : Math.min(...deltas);
      // Same rule as the catalog card: any non-zero adjustment makes the price a "from" price.
      if (deltas.some((delta) => delta !== 0)) open = true;
    }
  }

  return (
    <div ref={rootRef} onChange={onChange} className="grid gap-4">
      <div data-testid="buy-price" aria-live="polite">
        <Price
          minor={totalMinor}
          currency="ILS"
          locale={locale}
          size="lg"
          {...(open ? { from: t('from') } : {})}
        />
      </div>

      {children}

      {groups.length === 0 ? null : orderable ? (
        <OptionSelector groups={groups} locale={locale} invalidGroupId={invalidGroupId} />
      ) : (
        <ul className="grid gap-1.5 text-[15px]" data-testid="option-readonly">
          {groups.map((group) => (
            <li key={group.id}>
              {t.rich('readonlyLine', {
                groupName: group.name,
                // The tag wraps the name so it can carry the language mark.
                group: (chunks) => (
                  <span
                    lang={group.nameLang}
                    dir={group.nameLang === undefined ? undefined : 'auto'}
                    className="font-bold"
                  >
                    {chunks}
                  </span>
                ),
                values: () =>
                  group.values.map((value, index) => (
                    <span key={value.id}>
                      {index > 0 ? ', ' : null}
                      <span
                        lang={value.labelLang}
                        dir={value.labelLang === undefined ? undefined : 'auto'}
                      >
                        {value.label}
                      </span>
                      {value.deltaMinor === 0 ? null : (
                        <>
                          {' ('}
                          <DeltaText minor={value.deltaMinor} locale={locale} />
                          {')'}
                        </>
                      )}
                    </span>
                  )),
              })}
            </li>
          ))}
        </ul>
      )}

      {orderable ? null : (
        <div data-testid="unavailable-notice">
          <Notice tone="alert">
            <p className="font-bold">{t('unavailable')}</p>
            <LinkButton href={`/${locale}/contact`} variant="quiet" className="text-ink">
              {t('unavailableLink')}
            </LinkButton>
          </Notice>
        </div>
      )}
      {orderable ? (
        <AddToCart
          productId={productId}
          name={name}
          chosen={groups.flatMap((group) => {
            const value = selected[group.id];
            return value === undefined ? [] : [value];
          })}
          firstMissing={firstMissing === undefined ? undefined : toMissing(firstMissing)}
          invalid={invalidGroup === undefined ? undefined : toMissing(invalidGroup)}
          onMissing={onMissing}
        />
      ) : null}
    </div>
  );
}
