import { z } from 'zod';
import {
  addressFields,
  contactFields,
  refineShippingAddress,
  type ShippingAddressErrors,
} from './checkout';

/**
 * The shared rules for correcting a customer's details on an order (002 research R10): the
 * checkout field rules with the admin area's own message keys (the admin layout gives client
 * components only the `admin` and `common` namespaces). It must never import `libphonenumber-js`:
 * the phone is only checked for presence here, the data layer validates and normalises it.
 */

export const ORDER_CUSTOMER_ERRORS = {
  fullName: 'admin.orders.customer.errors.fullName',
  phone: 'admin.orders.customer.errors.phone',
  email: 'admin.orders.customer.errors.email',
  city: 'admin.orders.customer.errors.city',
  line1: 'admin.orders.customer.errors.line1',
  line2: 'admin.orders.customer.errors.line2',
  postalCodeIl: 'admin.orders.customer.errors.postalCodeIl',
  postalCode: 'admin.orders.customer.errors.postalCode',
} as const satisfies Record<string, string> & ShippingAddressErrors;

/** Name, phone, email and an optional address (required for shipping orders: see below). */
export const orderCustomerSchema = z.object({
  ...contactFields(ORDER_CUSTOMER_ERRORS),
  address: z.object(addressFields(ORDER_CUSTOMER_ERRORS)).optional(),
});

export type OrderCustomerForm = z.output<typeof orderCustomerSchema>;

/** The extra rule of a shipping order: city and street are required, the postal code fits the country. */
export function refineOrderCustomerAddress(
  address: OrderCustomerForm['address'],
  country: string,
  ctx: z.RefinementCtx,
): void {
  refineShippingAddress(address, country, ctx, ORDER_CUSTOMER_ERRORS);
}
