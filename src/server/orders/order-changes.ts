import 'server-only';
import { desc, and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { logActivity } from '@/server/activity/log';
import { db } from '@/server/db/client';
import { orderEvent, orders } from '@/server/db/schema';
import {
  ORDER_CUSTOMER_ERRORS,
  orderCustomerSchema,
  refineOrderCustomerAddress,
} from '@/lib/validation/order-customer';
import { checkoutFieldErrors } from '@/lib/validation/checkout';
import { isValidPhone, lowerDomain, normalisePhone } from '@/server/checkout/validate';
import { enqueueOrderCancelledEmail, enqueueOrderRefundedEmail } from './order-emails';
import type { DbLike } from '@/server/db/types';
import {
  fieldFailure,
  formFailure,
  ok,
  type ActionResult,
  type Actor,
} from '@/server/catalog/result';
import {
  canEditFulfilment,
  canMarkPaid,
  canMarkRefunded,
  canMoveForward,
  needsConfirmation,
  stepBackTarget,
  type OrderStatus,
} from './status';

/** Order status and fulfilment changes (002 research R2, R3, R4, R6, R16; contracts/server-actions.md). */

export interface Options {
  /** Test hook (two connections in concurrency tests); defaults to the app's `db`. */
  database?: DbLike;
  /** Fixes the clock for `paid_at`, `refunded_at`, the link expiry and `updated_at`. */
  now?: Date;
}

export type SetOrderStatusInput = {
  orderId: string;
  expectedStatus: OrderStatus;
  to: 'in_preparation' | 'shipped' | 'ready_for_pickup' | 'completed' | 'cancelled';
  trackingNumber?: string | undefined;
  pickupNote?: string | undefined;
  confirm?: true | undefined;
  alsoMarkPaid?: true | undefined;
};

export type StepBackInput = {
  orderId: string;
  expectedStatus: 'in_preparation' | 'shipped' | 'ready_for_pickup';
};

export type UpdateFulfilmentInput = {
  orderId: string;
  expectedStatus: 'shipped' | 'ready_for_pickup';
  trackingNumber?: string | undefined;
  pickupNote?: string | undefined;
};

export type UpdateOrderCustomerInput = {
  orderId: string;
  fullName: string;
  phone: string;
  email: string;
  /** Required for shipping orders (missing: field errors); ignored for pickup. */
  address?:
    | {
        city: string;
        line1: string;
        line2?: string | undefined;
        postalCode?: string | undefined;
      }
    | undefined;
};

export type CustomerField = 'name' | 'phone' | 'email' | 'address';

const ANONYMIZED = 'admin.orders.errors.anonymized';
const NOT_FOUND = 'admin.orders.errors.not_found';
const STALE = 'admin.orders.errors.stale';
const NOT_ALLOWED = 'admin.orders.errors.not_allowed';
const TRACKING_TOO_LONG = 'admin.orders.errors.tracking_too_long';
const PICKUP_NOTE_TOO_LONG = 'admin.orders.errors.pickup_note_too_long';
const INVALID = 'admin.orders.errors.invalid';
const CONFIRM_REQUIRED = 'admin.confirm_required';

const TRACKING_MAX = 100;
const PICKUP_NOTE_MAX = 500;
/** How long the customer's order link works after the order is closed (R4). */
const CLOSED_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const uuid = z.uuid();

type OrderRow = typeof orders.$inferSelect;

/** Trimmed text; empty becomes null (the field as submitted is what is stored). */
function normalise(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** `select … for update`: the second of two writers waits here and then sees the first's result. */
async function lockOrder(tx: DbLike, orderId: string): Promise<OrderRow | null> {
  if (!uuid.safeParse(orderId).success) return null;
  const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
  return row ?? null;
}

function activityFor(
  actor: Actor,
  action: string,
  order: Pick<OrderRow, 'orderNumber'>,
  details: Record<string, unknown>,
) {
  return {
    adminId: actor.adminId,
    actorKind: 'admin' as const,
    actorLabel: actor.label,
    action,
    targetType: 'order',
    targetId: String(order.orderNumber),
    details: { ...details, orderNumber: order.orderNumber },
  };
}

/** `created_at` from the database clock after the lock is held (R3), so history follows lock order. */
async function writeEvent(
  tx: DbLike,
  orderId: string,
  adminId: string | null,
  kind: string,
  data: Record<string, unknown>,
): Promise<void> {
  await tx
    .insert(orderEvent)
    .values({ orderId, adminId, kind, data, createdAt: sql`clock_timestamp()` });
}

/** Where a step back from `status` goes: the `from` of the latest entry into it (R2). */
async function stepBackTargetFor(
  tx: DbLike,
  orderId: string,
  status: OrderStatus,
): Promise<OrderStatus | null> {
  if (status !== 'shipped' && status !== 'ready_for_pickup') return stepBackTarget(status, null);
  const [entered] = await tx
    .select({ data: orderEvent.data })
    .from(orderEvent)
    .where(
      and(
        eq(orderEvent.orderId, orderId),
        eq(orderEvent.kind, 'status_changed'),
        sql`${orderEvent.data}->>'to' = ${status}`,
      ),
    )
    .orderBy(desc(orderEvent.createdAt))
    .limit(1);
  const from = (entered?.data as { from?: unknown } | undefined)?.from;
  return stepBackTarget(status, from === 'new' || from === 'in_preparation' ? from : null);
}

export async function setOrderStatus(
  actor: Actor,
  input: SetOrderStatusInput,
  options: Options = {},
): Promise<ActionResult<{ changed: boolean; status: OrderStatus; refundReminder: boolean }>> {
  // Before touching the database: a final status needs the owner's confirmation.
  if (needsConfirmation(input.to) && input.confirm !== true) {
    return formFailure(CONFIRM_REQUIRED);
  }
  const now = options.now ?? new Date();
  const { to } = input;

  return (options.database ?? db).transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!order) return formFailure(NOT_FOUND);
    const refundReminder = to === 'cancelled' && order.paymentState === 'paid';

    const submittedTracking = normalise(input.trackingNumber);
    const submittedNote = normalise(input.pickupNote);
    const sameDetails =
      (to !== 'shipped' || submittedTracking === order.trackingNumber) &&
      (to !== 'ready_for_pickup' || submittedNote === order.pickupNote);

    // A true repeat (double tap, second identical submission): nothing is written.
    if (
      order.status === to &&
      sameDetails &&
      (input.alsoMarkPaid !== true || order.paymentState === 'paid')
    ) {
      return ok({ changed: false, status: order.status, refundReminder });
    }
    // Someone else changed it (or the same status with other details): the page is out of date.
    if (order.status !== input.expectedStatus || order.status === to) return formFailure(STALE);

    if (!canMoveForward(order.status, to, order.deliveryMethod)) return formFailure(NOT_ALLOWED);
    if (
      input.alsoMarkPaid === true &&
      (to !== 'completed' || !canMarkPaid(order.paymentMethod, order.paymentState))
    ) {
      return formFailure(NOT_ALLOWED);
    }
    if (to === 'shipped' && submittedTracking !== null && submittedTracking.length > TRACKING_MAX) {
      return fieldFailure('trackingNumber', TRACKING_TOO_LONG);
    }
    if (
      to === 'ready_for_pickup' &&
      submittedNote !== null &&
      submittedNote.length > PICKUP_NOTE_MAX
    ) {
      return fieldFailure('pickupNote', PICKUP_NOTE_TOO_LONG);
    }

    const closing = to === 'completed' || to === 'cancelled';
    const markPaid = input.alsoMarkPaid === true;
    await tx
      .update(orders)
      .set({
        status: to,
        updatedAt: now,
        ...(to === 'shipped' ? { trackingNumber: submittedTracking } : {}),
        ...(to === 'ready_for_pickup' ? { pickupNote: submittedNote } : {}),
        ...(closing ? { publicTokenExpiresAt: new Date(now.getTime() + CLOSED_LINK_TTL_MS) } : {}),
        ...(markPaid ? { paymentState: 'paid' as const, paidAt: now } : {}),
      })
      .where(eq(orders.id, order.id));
    await writeEvent(tx, order.id, actor.adminId, 'status_changed', { from: order.status, to });
    await logActivity(
      tx,
      activityFor(actor, 'order.status_changed', order, { from: order.status, to }),
    );
    if (markPaid) {
      await writeEvent(tx, order.id, actor.adminId, 'payment_marked_paid', {});
      await logActivity(tx, activityFor(actor, 'order.marked_paid', order, {}));
    }
    if (to === 'cancelled') await enqueueOrderCancelledEmail(tx, order.id);
    return ok({ changed: true, status: to, refundReminder });
  });
}

export async function stepBackOrderStatus(
  actor: Actor,
  input: StepBackInput,
  options: Options = {},
): Promise<ActionResult<{ changed: boolean; status: OrderStatus }>> {
  const now = options.now ?? new Date();

  return (options.database ?? db).transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!order) return formFailure(NOT_FOUND);

    // The target for the status the page showed; a repeat finds the order already there.
    const target = await stepBackTargetFor(tx, order.id, input.expectedStatus);
    if (target === null) return formFailure(NOT_ALLOWED);
    if (order.status === target) return ok({ changed: false, status: order.status });
    if (order.status !== input.expectedStatus) return formFailure(STALE);

    await tx.update(orders).set({ status: target, updatedAt: now }).where(eq(orders.id, order.id));
    await writeEvent(tx, order.id, actor.adminId, 'status_changed', {
      from: order.status,
      to: target,
      back: true,
    });
    await logActivity(
      tx,
      activityFor(actor, 'order.status_changed', order, { from: order.status, to: target }),
    );
    return ok({ changed: true, status: target });
  });
}

/** Corrects the tracking number (Shipped) or the pickup note (Ready for pickup) without a status change (R16). */
export async function updateFulfilmentDetails(
  actor: Actor,
  input: UpdateFulfilmentInput,
  options: Options = {},
): Promise<ActionResult<{ changed: boolean }>> {
  const now = options.now ?? new Date();

  return (options.database ?? db).transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!order) return formFailure(NOT_FOUND);
    if (order.status !== input.expectedStatus) return formFailure(STALE);

    const field = canEditFulfilment(order.status);
    const otherField = field === 'trackingNumber' ? input.pickupNote : input.trackingNumber;
    if (field === null || otherField !== undefined) return formFailure(NOT_ALLOWED);

    const submitted = field === 'trackingNumber' ? input.trackingNumber : input.pickupNote;
    // The matching field must be sent; '' clears it, leaving it out is a malformed request.
    if (submitted === undefined) return formFailure(INVALID);
    const value = normalise(submitted);
    const stored = field === 'trackingNumber' ? order.trackingNumber : order.pickupNote;
    if (value === stored) return ok({ changed: false });
    if (field === 'trackingNumber' && value !== null && value.length > TRACKING_MAX) {
      return fieldFailure('trackingNumber', TRACKING_TOO_LONG);
    }
    if (field === 'pickupNote' && value !== null && value.length > PICKUP_NOTE_MAX) {
      return fieldFailure('pickupNote', PICKUP_NOTE_TOO_LONG);
    }

    await tx
      .update(orders)
      .set({
        updatedAt: now,
        ...(field === 'trackingNumber' ? { trackingNumber: value } : { pickupNote: value }),
      })
      .where(eq(orders.id, order.id));
    await writeEvent(tx, order.id, actor.adminId, 'fulfilment_edited', { field });
    await logActivity(tx, activityFor(actor, 'order.details_updated', order, { field }));
    return ok({ changed: true });
  });
}

export type PaymentMarkInput = { orderId: string; confirm?: true | undefined };

/** The owner received the money for an offline order (any status, FR-012). */
export async function markOrderPaid(
  actor: Actor,
  input: PaymentMarkInput,
  options: Options = {},
): Promise<ActionResult<{ changed: boolean }>> {
  if (input.confirm !== true) return formFailure(CONFIRM_REQUIRED);
  const now = options.now ?? new Date();

  return (options.database ?? db).transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!order) return formFailure(NOT_FOUND);
    // The method rule comes first: an online order is "not allowed" even though it is paid.
    if (order.paymentMethod !== 'offline') return formFailure(NOT_ALLOWED);
    if (order.paymentState === 'paid') return ok({ changed: false });
    if (!canMarkPaid(order.paymentMethod, order.paymentState)) return formFailure(NOT_ALLOWED);

    await tx
      .update(orders)
      .set({ paymentState: 'paid', paidAt: now, updatedAt: now })
      .where(eq(orders.id, order.id));
    await writeEvent(tx, order.id, actor.adminId, 'payment_marked_paid', {});
    await logActivity(tx, activityFor(actor, 'order.marked_paid', order, {}));
    return ok({ changed: true });
  });
}

/** The owner returned the money (online or offline, any status); the customer is told by email. */
export async function markOrderRefunded(
  actor: Actor,
  input: PaymentMarkInput,
  options: Options = {},
): Promise<ActionResult<{ changed: boolean }>> {
  if (input.confirm !== true) return formFailure(CONFIRM_REQUIRED);
  const now = options.now ?? new Date();

  return (options.database ?? db).transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!order) return formFailure(NOT_FOUND);
    if (order.paymentState === 'refunded') return ok({ changed: false });
    if (!canMarkRefunded(order.paymentState)) return formFailure(NOT_ALLOWED);

    await tx
      .update(orders)
      .set({ paymentState: 'refunded', refundedAt: now, updatedAt: now })
      .where(eq(orders.id, order.id));
    await writeEvent(tx, order.id, actor.adminId, 'refunded', {});
    await logActivity(tx, activityFor(actor, 'order.refunded', order, {}));
    await enqueueOrderRefundedEmail(tx, order.id);
    return ok({ changed: true });
  });
}

/** Corrects the customer's name, phone, email and (shipping) address; never the country or amounts (R10). */
export async function updateOrderCustomer(
  actor: Actor,
  input: UpdateOrderCustomerInput,
  options: Options = {},
): Promise<ActionResult<{ changed: boolean; fields: CustomerField[] }>> {
  const now = options.now ?? new Date();

  return (options.database ?? db).transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!order) return formFailure(NOT_FOUND);
    if (order.anonymizedAt !== null) return formFailure(ANONYMIZED);

    const shipping = order.deliveryMethod === 'shipping';
    // The phone is judged by the address country of the order (Israel for pickup).
    const country = shipping ? (order.addressCountry ?? undefined) : undefined;
    const schema = orderCustomerSchema.superRefine((form, ctx) => {
      if (shipping) refineOrderCustomerAddress(form.address, country ?? '', ctx);
      if (!isValidPhone(form.phone, country)) {
        ctx.addIssue({ code: 'custom', path: ['phone'], message: ORDER_CUSTOMER_ERRORS.phone });
      }
    });
    const parsed = schema.safeParse({
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      address: shipping ? input.address : undefined,
    });
    if (!parsed.success) return { ok: false, fieldErrors: checkoutFieldErrors(parsed.error) };

    const form = parsed.data;
    const next = {
      name: form.fullName,
      phone: normalisePhone(form.phone, country),
      email: lowerDomain(form.email),
      city: form.address?.city ?? null,
      line1: form.address?.line1 ?? null,
      line2: normalise(form.address?.line2),
      postalCode: normalise(form.address?.postalCode),
    };
    const fields: CustomerField[] = [];
    if (next.name !== order.customerName) fields.push('name');
    if (next.phone !== order.customerPhone) fields.push('phone');
    if (next.email !== order.customerEmail) fields.push('email');
    if (
      shipping &&
      (next.city !== order.addressCity ||
        next.line1 !== order.addressLine1 ||
        next.line2 !== order.addressLine2 ||
        next.postalCode !== order.addressPostalCode)
    ) {
      fields.push('address');
    }
    if (fields.length === 0) return ok({ changed: false, fields });

    await tx
      .update(orders)
      .set({
        updatedAt: now,
        customerName: next.name,
        customerPhone: next.phone,
        customerEmail: next.email,
        ...(shipping
          ? {
              addressCity: next.city,
              addressLine1: next.line1,
              addressLine2: next.line2,
              addressPostalCode: next.postalCode,
            }
          : {}),
      })
      .where(eq(orders.id, order.id));
    // Only which fields changed, never their values (FR-018).
    await writeEvent(tx, order.id, actor.adminId, 'customer_edited', { fields });
    await logActivity(
      tx,
      activityFor(actor, 'customer.updated', order, { field: fields.join(',') }),
    );
    return ok({ changed: true, fields });
  });
}
