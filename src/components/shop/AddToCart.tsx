'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { addToCart } from '@/lib/cart/store';
import { QuantityStepper } from './QuantityStepper';

export interface MissingGroup {
  id: string;
  name: string;
  nameLang?: 'he';
}

const MORPH_MS = 1800;

/**
 * The buy row: quantity stepper and "Add to cart". The button is never disabled: with an
 * unchosen option group, pressing it names the group under the button, marks the fieldset and
 * moves focus there (`onMissing`). On success the label turns into a check for 1.8 s, a row
 * "<name> is in your cart · Go to cart" stays, and a live region announces the new count.
 */
export function AddToCart({
  productId,
  name,
  chosen,
  firstMissing,
  invalid,
  onMissing,
}: {
  productId: string;
  name: { text: string; lang?: 'he' };
  /** Chosen option value ids (one per group). */
  chosen: string[];
  /** The first group without a choice, or undefined when every group has one. */
  firstMissing: MissingGroup | undefined;
  /** The group currently marked invalid (message shown), if any. */
  invalid: MissingGroup | undefined;
  onMissing: (group: MissingGroup) => void;
}) {
  const locale = useLocale();
  const t = useTranslations('cart.add');
  const [quantity, setQuantity] = useState(1);
  const [morphing, setMorphing] = useState(false);
  const [inCart, setInCart] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [full, setFull] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  function onPress(): void {
    if (firstMissing !== undefined) {
      onMissing(firstMissing);
      return;
    }
    const result = addToCart({ productId, optionValueIds: chosen, quantity });
    if (!result.ok) {
      setFull(true);
      return;
    }
    setFull(false);
    setInCart(true);
    setMorphing(true);
    setAnnouncement(t('announce', { count: result.count }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setMorphing(false);
    }, MORPH_MS);
  }

  return (
    <div className="grid gap-2" data-testid="buy-row">
      <div className="flex items-center gap-3">
        <QuantityStepper value={quantity} onChange={setQuantity} />
        <Button
          variant="primary"
          data-testid="add-to-cart"
          onClick={onPress}
          className="min-w-0 flex-1"
        >
          {morphing ? (
            <>
              <Icon name="check" />
              <span>{t('added')}</span>
            </>
          ) : (
            t('button')
          )}
        </Button>
      </div>
      {/* Reserved space, so the message does not move the page. */}
      <p
        aria-live="polite"
        data-testid="add-to-cart-message"
        className="min-h-5 text-[13px] leading-snug font-bold text-alert"
      >
        {invalid !== undefined
          ? t.rich('chooseFirst', {
              groupName: invalid.name,
              group: (chunks) => (
                <span
                  lang={invalid.nameLang}
                  dir={invalid.nameLang === undefined ? undefined : 'auto'}
                >
                  {chunks}
                </span>
              ),
            })
          : full
            ? t('full')
            : null}
      </p>
      {inCart ? (
        <p data-testid="added-to-cart-row" className="text-[15px]">
          {t.rich('inCartRow', {
            name: name.text,
            n: (chunks) => (
              <span lang={name.lang} dir={name.lang === undefined ? undefined : 'auto'}>
                {chunks}
              </span>
            ),
            cart: (chunks) => (
              <Link
                href={`/${locale}/cart`}
                data-testid="go-to-cart"
                className="inline-flex min-h-11 items-center font-bold underline underline-offset-[3px]"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : null}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
