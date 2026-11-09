import { z } from 'zod';
import { EMAIL_SHAPE } from './email-shape';

/**
 * The light checkout schema, shared by the checkout form (client) and the server. It must never
 * import `libphonenumber-js` (it would end up in the client bundle): the phone number is only
 * checked for presence here, and the server schema (`src/server/checkout/validate.ts`) validates
 * and normalises it. Messages are translation keys.
 */

export const CHECKOUT_ERRORS = {
  fullName: 'checkout.errors.fullName',
  phone: 'checkout.errors.phone',
  email: 'checkout.errors.email',
  country: 'checkout.errors.country',
  city: 'checkout.errors.city',
  line1: 'checkout.errors.line1',
  line2: 'checkout.errors.line2',
  postalCodeIl: 'checkout.errors.postalCodeIl',
  postalCode: 'checkout.errors.postalCode',
  note: 'checkout.errors.note',
  acceptTerms: 'checkout.errors.acceptTerms',
  deliveryMethod: 'checkout.errors.deliveryMethod',
  paymentMethod: 'checkout.errors.paymentMethod',
  shipsIsraelOnly: 'checkout.ships_israel_only',
} as const;

/** The UI-only "Other country" choice: never stored, always refused. */
export const OTHER_COUNTRY = 'other';

const text = (key: string) => z.string({ error: key });

/** Error keys of the contact fields; the checkout and the order correction pass their own. */
export interface ContactErrors {
  fullName: string;
  phone: string;
  email: string;
}

/** Error keys of the address fields. */
export interface AddressErrors {
  city: string;
  line1: string;
  line2: string;
  postalCode: string;
}

/** Error keys of the shipping-address refinement. */
export interface ShippingAddressErrors {
  city: string;
  line1: string;
  postalCodeIl: string;
  postalCode: string;
}

/** Name, phone and email with the checkout rules (the phone is only checked for presence here). */
export function contactFields(errors: ContactErrors) {
  return {
    fullName: text(errors.fullName).trim().min(2, errors.fullName).max(100, errors.fullName),
    phone: text(errors.phone).trim().min(1, errors.phone).max(40, errors.phone),
    email: text(errors.email)
      .trim()
      .min(1, errors.email)
      .max(254, errors.email)
      .regex(EMAIL_SHAPE, errors.email),
  };
}

/** City, street, apartment and postal code (length limits; required-ness is `refineShippingAddress`). */
export function addressFields(errors: AddressErrors) {
  return {
    city: text(errors.city).trim().max(100, errors.city).optional(),
    line1: text(errors.line1).trim().max(200, errors.line1).optional(),
    line2: text(errors.line2).trim().max(200, errors.line2).optional(),
    postalCode: text(errors.postalCode).trim().optional(),
  };
}

export const addressSchema = z.object({
  country: text(CHECKOUT_ERRORS.country).trim().optional(),
  ...addressFields(CHECKOUT_ERRORS),
});

/**
 * The rules of a shipping address: city and street are required, and the postal code is exactly
 * 7 digits for Israel and at most 12 characters elsewhere. Issues are added at `address.*`.
 */
export function refineShippingAddress(
  address:
    | { city?: string | undefined; line1?: string | undefined; postalCode?: string | undefined }
    | undefined,
  country: string,
  ctx: z.RefinementCtx,
  errors: ShippingAddressErrors,
): void {
  if ((address?.city ?? '') === '') {
    ctx.addIssue({ code: 'custom', path: ['address', 'city'], message: errors.city });
  }
  if ((address?.line1 ?? '') === '') {
    ctx.addIssue({ code: 'custom', path: ['address', 'line1'], message: errors.line1 });
  }
  const postalCode = address?.postalCode ?? '';
  if (postalCode !== '') {
    if (country.toUpperCase() === 'IL') {
      if (!/^\d{7}$/.test(postalCode)) {
        ctx.addIssue({
          code: 'custom',
          path: ['address', 'postalCode'],
          message: errors.postalCodeIl,
        });
      }
    } else if (postalCode.length > 12) {
      ctx.addIssue({
        code: 'custom',
        path: ['address', 'postalCode'],
        message: errors.postalCode,
      });
    }
  }
}

export const checkoutFormSchema = z
  .object({
    ...contactFields(CHECKOUT_ERRORS),
    deliveryMethod: z.enum(['shipping', 'pickup'], { error: CHECKOUT_ERRORS.deliveryMethod }),
    address: addressSchema.optional(),
    paymentMethod: z.enum(['online', 'offline'], { error: CHECKOUT_ERRORS.paymentMethod }),
    note: text(CHECKOUT_ERRORS.note).trim().max(1000, CHECKOUT_ERRORS.note).optional(),
    // A refined boolean rather than `z.literal(true)`: a literal mismatch aborts the object's
    // cross-field checks below, so one unticked box would hide the address errors.
    acceptTerms: z
      .boolean({ error: CHECKOUT_ERRORS.acceptTerms })
      .refine((value) => value, CHECKOUT_ERRORS.acceptTerms),
    marketingOptIn: z.boolean().default(false),
  })
  .superRefine((form, ctx) => {
    if (form.deliveryMethod !== 'shipping') return;
    const address = form.address;
    const country = address?.country?.trim() ?? '';
    if (country === OTHER_COUNTRY) {
      ctx.addIssue({
        code: 'custom',
        path: ['address', 'country'],
        message: CHECKOUT_ERRORS.shipsIsraelOnly,
      });
    } else if (country === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['address', 'country'],
        message: CHECKOUT_ERRORS.country,
      });
    }
    refineShippingAddress(address, country, ctx, CHECKOUT_ERRORS);
  });

export type CheckoutFormInput = z.input<typeof checkoutFormSchema>;
export type CheckoutForm = z.output<typeof checkoutFormSchema>;

/** One message key per field (`address.city` for nested ones), the first issue of each. */
export function checkoutFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    errors[issue.path.map(String).join('.') || 'form'] ??= issue.message;
  }
  return errors;
}
