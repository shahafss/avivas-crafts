'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import type { OrderStatus, PaymentState } from '@/server/orders/status';
import { BADGE_BASE, PAYMENT_LOOK, STATUS_LOOK } from './order-badge-looks';

/**
 * The status and payment badges for client islands: the server badges are async Server Components
 * and cannot render inside an island. Same classes, same labels (`admin.orders.status|payment`).
 */
export function OrderBadgesClient({
  status,
  paymentState,
}: {
  status: OrderStatus;
  paymentState: PaymentState;
}) {
  const statusLabels = useTranslations('admin.orders.status');
  const paymentLabels = useTranslations('admin.orders.payment');
  return (
    <span className="flex flex-wrap gap-1.5">
      <span className={cn(BADGE_BASE, STATUS_LOOK[status])}>{statusLabels(status)}</span>
      <span className={cn(BADGE_BASE, PAYMENT_LOOK[paymentState])}>
        {paymentLabels(paymentState)}
      </span>
    </span>
  );
}
