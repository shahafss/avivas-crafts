'use client';

import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/ClientIcon';
import { IconButton } from '@/components/ui/IconButton';
import { CART_DRAWER_ID } from '@/lib/cart/drawer';
import { useAddSignal, useCart } from '@/lib/cart/store';

/**
 * The header's cart button: a `popovertarget` button that opens the cart drawer (research D21). Server-rendered without a badge; after hydration it reads the cart
 * from the device. The badge pops when something is added on this page.
 */
export function CartLink() {
  const t = useTranslations('common.cart');
  const { count } = useCart();
  const added = useAddSignal();
  return (
    <IconButton
      popoverTarget={CART_DRAWER_ID}
      label={t('label', { count })}
      data-testid="cart-link"
      badge={
        count > 0 ? (
          <span
            key={added}
            data-testid="cart-badge"
            aria-hidden="true"
            className={`tnum pointer-events-none absolute end-0 top-0 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-sage px-1 text-[11px] leading-none font-extrabold text-ink ${added > 0 ? 'badge-pop' : ''}`}
          >
            {count}
          </span>
        ) : null
      }
    >
      <Icon name="cart" />
    </IconButton>
  );
}
