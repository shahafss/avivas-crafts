'use server';

import { z } from 'zod';
import { actorOf, formFailure, type ActionResult } from '@/server/catalog/result';
import { requireAdmin } from '@/server/auth/require-admin';
import { orderStatusEnum } from '@/server/db/schema';
import { kickOutbox } from '@/server/email/sender';
import {
  markOrderPaid as markOrderPaidRecord,
  markOrderRefunded as markOrderRefundedRecord,
  setOrderStatus as setOrderStatusRecord,
  stepBackOrderStatus as stepBackOrderStatusRecord,
  updateFulfilmentDetails as updateFulfilmentDetailsRecord,
  updateOrderCustomer as updateOrderCustomerRecord,
  type SetOrderStatusInput,
  type StepBackInput,
  type UpdateFulfilmentInput,
  type UpdateOrderCustomerInput,
  type CustomerField,
} from '@/server/orders/order-changes';
import type { OrderStatus } from '@/server/orders/status';

/** Contracts/server-actions.md: thin wrappers; the data layer holds the rules (002 R3). */

const NOT_FOUND = 'admin.orders.errors.not_found';
const INVALID = 'admin.orders.errors.invalid';

// Length limits of the tracking number and pickup note are checked by the data layer so they
// come back as field errors; this cap only keeps absurd payloads out.
const freeText = z.string().max(2000);
const status = z.enum(orderStatusEnum.enumValues);

const setStatusSchema = z.object({
  orderId: z.uuid(),
  expectedStatus: status,
  to: z.enum(['in_preparation', 'shipped', 'ready_for_pickup', 'completed', 'cancelled']),
  trackingNumber: freeText.optional(),
  pickupNote: freeText.optional(),
  confirm: z.boolean().optional(),
  alsoMarkPaid: z.boolean().optional(),
});

const stepBackSchema = z.object({
  orderId: z.uuid(),
  expectedStatus: z.enum(['in_preparation', 'shipped', 'ready_for_pickup']),
});

const paymentMarkSchema = z.object({ orderId: z.uuid(), confirm: z.boolean().optional() });

const fulfilmentSchema = z
  .object({
    orderId: z.uuid(),
    expectedStatus: z.enum(['shipped', 'ready_for_pickup']),
    trackingNumber: freeText.optional(),
    pickupNote: freeText.optional(),
  })
  .superRefine((value, context) => {
    // The field that matches the status must be sent ('' clears it).
    const missing =
      value.expectedStatus === 'shipped'
        ? value.trackingNumber === undefined
        : value.pickupNote === undefined;
    if (missing) context.addIssue({ code: 'custom', message: INVALID });
  });

// The field rules (lengths, phone, address) live in the data layer so they come back as field
// errors; this only checks the shape and keeps absurd payloads out.
const customerSchema = z.object({
  orderId: z.uuid(),
  fullName: freeText,
  phone: freeText,
  email: freeText,
  address: z
    .object({
      city: freeText,
      line1: freeText,
      line2: freeText.optional(),
      postalCode: freeText.optional(),
    })
    .optional(),
});

/** A malformed order id is "not found"; any other bad input is "invalid". */
function badInput(input: unknown) {
  const orderId =
    typeof input === 'object' && input !== null
      ? (input as { orderId?: unknown }).orderId
      : undefined;
  return formFailure(z.uuid().safeParse(orderId).success ? INVALID : NOT_FOUND);
}

export async function setOrderStatus(
  input: Omit<SetOrderStatusInput, 'confirm' | 'alsoMarkPaid'> & {
    confirm?: boolean;
    alsoMarkPaid?: boolean;
  },
): Promise<ActionResult<{ changed: boolean; status: OrderStatus; refundReminder: boolean }>> {
  const context = await requireAdmin();
  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) return badInput(input);
  const { confirm, alsoMarkPaid, ...rest } = parsed.data;
  const result = await setOrderStatusRecord(actorOf(context), {
    ...rest,
    ...(confirm === true ? { confirm } : {}),
    ...(alsoMarkPaid === true ? { alsoMarkPaid } : {}),
  });
  // A cancel queued its customer email in the transaction; send it now that it has committed.
  if (result.ok && result.data.changed && result.data.status === 'cancelled') kickOutbox();
  return result;
}

export async function stepBackOrderStatus(
  input: StepBackInput,
): Promise<ActionResult<{ changed: boolean; status: OrderStatus }>> {
  const context = await requireAdmin();
  const parsed = stepBackSchema.safeParse(input);
  if (!parsed.success) return badInput(input);
  return stepBackOrderStatusRecord(actorOf(context), parsed.data);
}

export async function updateFulfilmentDetails(
  input: UpdateFulfilmentInput,
): Promise<ActionResult<{ changed: boolean }>> {
  const context = await requireAdmin();
  const parsed = fulfilmentSchema.safeParse(input);
  if (!parsed.success) return badInput(input);
  return updateFulfilmentDetailsRecord(actorOf(context), parsed.data);
}

export async function markOrderPaid(input: {
  orderId: string;
  confirm?: boolean;
}): Promise<ActionResult<{ changed: boolean }>> {
  const context = await requireAdmin();
  const parsed = paymentMarkSchema.safeParse(input);
  if (!parsed.success) return badInput(input);
  return markOrderPaidRecord(actorOf(context), {
    orderId: parsed.data.orderId,
    ...(parsed.data.confirm === true ? { confirm: true as const } : {}),
  });
}

export async function markOrderRefunded(input: {
  orderId: string;
  confirm?: boolean;
}): Promise<ActionResult<{ changed: boolean }>> {
  const context = await requireAdmin();
  const parsed = paymentMarkSchema.safeParse(input);
  if (!parsed.success) return badInput(input);
  const result = await markOrderRefundedRecord(actorOf(context), {
    orderId: parsed.data.orderId,
    ...(parsed.data.confirm === true ? { confirm: true as const } : {}),
  });
  // The refund email was queued in the transaction; send it now that it has committed.
  if (result.ok && result.data.changed) kickOutbox();
  return result;
}

export async function updateOrderCustomer(
  input: UpdateOrderCustomerInput,
): Promise<ActionResult<{ changed: boolean; fields: CustomerField[] }>> {
  const context = await requireAdmin();
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return badInput(input);
  return updateOrderCustomerRecord(actorOf(context), parsed.data);
}
