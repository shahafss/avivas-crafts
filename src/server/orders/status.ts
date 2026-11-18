/**
 * Order status and payment rules (002 research R1, R2, R16; data-model.md).
 *
 * Pure and database-free so the order page (a client island) and the server actions share one
 * source of truth. Enum types come in with `import type` only: a value import from the schema
 * would pull Drizzle into a client bundle.
 */
import type {
  deliveryMethodEnum,
  orderStatusEnum,
  paymentMethodEnum,
  paymentStateEnum,
} from '@/server/db/schema';

export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type PaymentState = (typeof paymentStateEnum.enumValues)[number];
export type DeliveryMethod = (typeof deliveryMethodEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];

export const OPEN_STATUSES: readonly OrderStatus[] = [
  'new',
  'in_preparation',
  'shipped',
  'ready_for_pickup',
];

export function isOpen(status: OrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** The status step that sends the piece out, by delivery method. */
function dispatchStatus(deliveryMethod: DeliveryMethod): OrderStatus {
  return deliveryMethod === 'shipping' ? 'shipped' : 'ready_for_pickup';
}

/** Forward status steps in display order. Never includes `cancelled` (shown as its own action). */
export function forwardTargets(status: OrderStatus, deliveryMethod: DeliveryMethod): OrderStatus[] {
  switch (status) {
    case 'new':
      return ['in_preparation', dispatchStatus(deliveryMethod)];
    case 'in_preparation':
      return [dispatchStatus(deliveryMethod)];
    case 'shipped':
    case 'ready_for_pickup':
      return ['completed'];
    default:
      return [];
  }
}

export function canCancel(status: OrderStatus): boolean {
  return isOpen(status);
}

/** Whether `from -> to` is an allowed forward move (including cancelling an open order). */
export function canMoveForward(
  from: OrderStatus,
  to: OrderStatus,
  deliveryMethod: DeliveryMethod,
): boolean {
  if (to === 'cancelled') return canCancel(from);
  return forwardTargets(from, deliveryMethod).includes(to);
}

/**
 * The one step back: in preparation returns to new; shipped / ready for pickup return to the
 * status the order entered them from (new or in preparation), or new when the history has none.
 */
export function stepBackTarget(
  status: OrderStatus,
  enteredFrom: OrderStatus | null,
): OrderStatus | null {
  if (status === 'in_preparation') return 'new';
  if (status === 'shipped' || status === 'ready_for_pickup') {
    return enteredFrom === 'new' || enteredFrom === 'in_preparation' ? enteredFrom : 'new';
  }
  return null;
}

/** Moves into a final status ask the owner to confirm first. */
export function needsConfirmation(target: OrderStatus): boolean {
  return target === 'completed' || target === 'cancelled';
}

/** Only an offline order that is still awaiting payment can be marked paid by hand (FR-012). */
export function canMarkPaid(paymentMethod: PaymentMethod, paymentState: PaymentState): boolean {
  return paymentMethod === 'offline' && paymentState === 'awaiting_payment';
}

export function canMarkRefunded(paymentState: PaymentState): boolean {
  return paymentState === 'paid';
}

/** The fulfilment field the owner may still correct at this status (R16). */
export function canEditFulfilment(status: OrderStatus): 'trackingNumber' | 'pickupNote' | null {
  if (status === 'shipped') return 'trackingNumber';
  if (status === 'ready_for_pickup') return 'pickupNote';
  return null;
}
