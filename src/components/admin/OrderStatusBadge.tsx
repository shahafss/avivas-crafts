import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/cn';
import type { OrderStatus, PaymentState } from '@/server/orders/status';
import { BADGE_BASE, PAYMENT_LOOK, STATUS_LOOK } from './order-badge-looks';

// Re-exported for the badge unit test; the looks live in a dependency-free module.
export { BADGE_BASE, STATUS_LOOK, PAYMENT_LOOK };

export async function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = await getTranslations('admin.orders.status');
  return <span className={cn(BADGE_BASE, STATUS_LOOK[status])}>{t(status)}</span>;
}

export async function PaymentStateBadge({ state }: { state: PaymentState }) {
  const t = await getTranslations('admin.orders.payment');
  return <span className={cn(BADGE_BASE, PAYMENT_LOOK[state])}>{t(state)}</span>;
}
