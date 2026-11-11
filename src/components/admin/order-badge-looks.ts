import type { OrderStatus, PaymentState } from '@/server/orders/status';

/**
 * Badge looks: docs/design/storefront.md §12.1. Dependency-free, so both the server badges
 * (`OrderStatusBadge.tsx`) and the client one (`OrderBadgesClient.tsx`) import the same classes.
 */
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
