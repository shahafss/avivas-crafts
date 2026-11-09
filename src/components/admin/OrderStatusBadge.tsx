import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/cn';
import type { OrderStatus, PaymentState } from '@/server/orders/status';

/** Badge looks: docs/design/storefront.md §12.1. The text label is always present. */
export const BADGE_BASE =
  'inline-block rounded-pill px-3 py-1 text-[13px] font-bold leading-normal whitespace-nowrap';

export const STATUS_LOOK: Record<OrderStatus, string> = {
  new: 'bg-sun-soft text-ink',
  in_preparation: 'bg-photo text-ink',
  shipped: 'border-[1.5px] border-ink bg-panel text-ink',
  ready_for_pickup: 'border-[1.5px] border-ink bg-panel text-ink',
  completed: 'border-[1.5px] border-field bg-panel text-ink-2',
  cancelled: 'border-[1.5px] border-alert bg-panel text-alert',
};

export const PAYMENT_LOOK: Record<PaymentState, string> = {
  awaiting_payment: 'border-[1.5px] border-field bg-panel text-ink',
  paid: 'bg-sun-soft text-ink',
  refunded: 'bg-photo text-ink',
};

export async function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = await getTranslations('admin.orders.status');
  return <span className={cn(BADGE_BASE, STATUS_LOOK[status])}>{t(status)}</span>;
}

export async function PaymentStateBadge({ state }: { state: PaymentState }) {
  const t = await getTranslations('admin.orders.payment');
  return <span className={cn(BADGE_BASE, PAYMENT_LOOK[state])}>{t(state)}</span>;
}
