import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/ui/Icon';
import { CART_DRAWER_ID } from '@/lib/cart/drawer';
import type { Locale } from '@/i18n/routing';

/**
 * The cart drawer's server-rendered shell (storefront.md 7.34, research D21): a modal dialog in the
 * top layer at the reading-end side, named by its heading, with the close button where the header's
 * cart button is. The contents (`CartDrawerBody`) are loaded into `#cart-drawer-body` by
 * `DrawerController` on the first open.
 */
export async function CartDrawer({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'cart.drawer' });
  return (
    <div
      id={CART_DRAWER_ID}
      data-testid="cart-drawer"
      popover="auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
      className="drawer drawer-end"
    >
      <div className="drawer-head">
        <h2 id="cart-drawer-title" className="text-xl font-bold">
          {t('title')}
        </h2>
        <button
          type="button"
          popoverTarget={CART_DRAWER_ID}
          popoverTargetAction="hide"
          autoFocus
          data-testid="cart-close"
          aria-label={t('close')}
          className="drawer-close relative inline-grid size-11 shrink-0 place-items-center rounded-pill hover:bg-current/10"
        >
          <Icon name="close" />
        </button>
      </div>
      <div id="cart-drawer-body" className="drawer-scroll px-4 pb-6" />
    </div>
  );
}
