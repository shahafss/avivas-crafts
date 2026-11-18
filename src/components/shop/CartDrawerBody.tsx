'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorSummary } from '@/components/ui/ErrorSummary';
import { LinkButton } from '@/components/ui/LinkButton';
import { Notice } from '@/components/ui/Notice';
import { Skeleton } from '@/components/ui/Skeleton';
import { priceCart, type PriceCartResult } from '@/lib/cart/actions';
import { CART_DRAWER_ID, keepDrawerOpen } from '@/lib/cart/drawer';
import { lineKey } from '@/lib/cart/key';
import { removeFromCart, setQuantity, useCart, useCartReady } from '@/lib/cart/store';
import { formatMoney, type MoneyLocale } from '@/lib/money';
import { CartLine, lineElementId, useFlagMessage } from './CartLine';

const SUMMARY_ID = 'cart-errors';

type Outcome =
  | { signature: string; status: 'ok'; data: PriceCartResult }
  | { signature: string; status: 'error' };

/**
 * The cart drawer's contents, loaded by `DrawerController` on the first open (research D21,
 * storefront.md 7.34): one column. The lines live on the device; every price and flag comes from
 * `priceCart`. Totals are the unit prices from the last answer times the quantities in the cart,
 * so changing a quantity needs no new request. It scrolls inside `.drawer-scroll`, its host.
 */
export function CartDrawerBody({
  freeShippingOverMinor,
}: {
  /** The free-shipping threshold in minor units of the zone currency, or null for none. */
  freeShippingOverMinor: number | null;
}) {
  const locale = useLocale() as MoneyLocale;
  const t = useTranslations('cart');
  const flagMessage = useFlagMessage();
  const { items } = useCart();
  const ready = useCartReady();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [lastData, setLastData] = useState<PriceCartResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [summaryToken, setSummaryToken] = useState(0);

  // What the answer depends on: which products and options, not how many.
  const signature = items.map((item) => lineKey(item)).join('|');

  useEffect(() => {
    if (!ready || signature === '') return;
    let current = true;
    priceCart({
      items: items.map(({ productId, optionValueIds, quantity }) => ({
        productId,
        optionValueIds,
        quantity,
      })),
      locale,
    })
      .then((result) => {
        if (!current) return;
        if (result.ok) {
          setOutcome({ signature, status: 'ok', data: result.data });
          setLastData(result.data);
        } else setOutcome({ signature, status: 'error' });
      })
      .catch(() => {
        if (current) setOutcome({ signature, status: 'error' });
      });
    return () => {
      current = false;
    };
    // `items` is covered by `signature` (quantities do not change the answer).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature, attempt, locale]);

  if (!ready) {
    return (
      <Skeleton
        variant="line"
        label={t('loading')}
        className="rounded-card border border-line bg-paper p-3.5"
      />
    );
  }
  if (items.length === 0) {
    return (
      <div data-testid="cart-empty">
        <EmptyState
          icon="cart"
          title={t('empty.title')}
          text={t('empty.text')}
          action={
            <LinkButton href={`/${locale}/shop`} variant="secondary">
              {t('empty.action')}
            </LinkButton>
          }
        />
      </div>
    );
  }
  if (outcome?.status === 'error' && outcome.signature === signature) {
    return (
      <Notice tone="alert" role="alert">
        <p className="font-bold">{t('loadError')}</p>
        <Button
          variant="secondary"
          className="mt-2"
          onClick={() => {
            setOutcome(null);
            setAttempt((value) => value + 1);
          }}
        >
          {t('retry')}
        </Button>
      </Notice>
    );
  }

  const currency = lastData?.currency ?? 'ILS';
  const rows = items.map((item) => {
    const key = lineKey(item);
    return { item, key, line: lastData?.lines.find((line) => line.key === key) };
  });
  const flagged = rows.flatMap((row) =>
    row.line?.flag === undefined ? [] : [{ key: row.key, line: row.line }],
  );
  const subtotal = rows.reduce(
    (sum, row) =>
      row.line === undefined || row.line.flag !== undefined
        ? sum
        : sum + row.line.unitPriceMinor * row.item.quantity,
    0,
  );

  return (
    <div className="grid gap-4">
      {summaryToken > 0 && flagged.length > 0 ? (
        <div
          key={summaryToken}
          ref={(element) => {
            element?.querySelector<HTMLElement>(`#${SUMMARY_ID}`)?.focus();
          }}
        >
          <ErrorSummary
            id={SUMMARY_ID}
            heading={t('summary.heading')}
            onSelect={(fieldId) => {
              // Focus the line itself, inside the drawer (a `#` jump would not move focus).
              document.getElementById(fieldId)?.focus();
            }}
            items={flagged.map(({ key, line }) => ({
              fieldId: lineElementId(key),
              message: t('summary.item', {
                name: line.name === '' ? t('line.gone') : line.name,
                reason: flagMessage(line.flag as NonNullable<typeof line.flag>),
              }),
            }))}
          />
        </div>
      ) : null}
      <ul className="grid gap-3" aria-label={t('linesLabel')}>
        {rows.map(({ item, key, line }) =>
          line === undefined ? (
            <li key={key} className="rounded-card border border-line bg-paper p-3.5">
              <Skeleton variant="line" label={t('loading')} />
            </li>
          ) : (
            <CartLine
              key={key}
              line={line}
              quantity={item.quantity}
              currency={currency}
              onQuantity={(quantity) => {
                setQuantity(key, quantity);
              }}
              onRemove={() => {
                removeFromCart(key);
              }}
            />
          ),
        )}
      </ul>

      <section
        aria-label={t('summary.label')}
        className="grid gap-3 rounded-card border border-line bg-paper p-[18px]"
      >
        <p className="flex items-baseline justify-between gap-3 text-base">
          <span>{t('summary.subtotal')}</span>
          <bdi data-testid="cart-subtotal" className="tnum text-lg font-extrabold">
            {formatMoney(subtotal, currency, locale)}
          </bdi>
        </p>
        <p className="text-[15px] text-ink-2">{t('summary.deliveryLater')}</p>
        {freeShippingOverMinor === null || subtotal >= freeShippingOverMinor ? null : (
          <p className="text-[15px] text-ink-2">
            {t.rich('summary.freeShippingOver', {
              threshold: formatMoney(freeShippingOverMinor, currency, locale),
              money: (chunks) => <bdi className="tnum">{chunks}</bdi>,
            })}
          </p>
        )}
        <LinkButton
          href={`/${locale}/checkout`}
          data-testid="cart-continue"
          onClick={(event) => {
            if (flagged.length > 0) {
              event.preventDefault();
              keepDrawerOpen(event.nativeEvent);
              setSummaryToken((value) => value + 1);
            }
          }}
        >
          {t('summary.continue')}
        </LinkButton>
        <Button
          variant="quiet"
          data-testid="cart-keep-shopping"
          popoverTarget={CART_DRAWER_ID}
          popoverTargetAction="hide"
          className="justify-self-center"
        >
          {t('drawer.keepShopping')}
        </Button>
      </section>
    </div>
  );
}
