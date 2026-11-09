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

export const addressSchema = z.object({
  country: text(CHECKOUT_ERRORS.country).trim().optional(),
  city: text(CHECKOUT_ERRORS.city).trim().max(100, CHECKOUT_ERRORS.city).optional(),
  line1: text(CHECKOUT_ERRORS.line1).trim().max(200, CHECKOUT_ERRORS.line1).optional(),
  line2: text(CHECKOUT_ERRORS.line2).trim().max(200, CHECKOUT_ERRORS.line2).optional(),
  postalCode: text(CHECKOUT_ERRORS.postalCode).trim().optional(),
});

export const checkoutFormSchema = z
  .object({
    fullName: text(CHECKOUT_ERRORS.fullName)
      .trim()
      .min(2, CHECKOUT_ERRORS.fullName)
      .max(100, CHECKOUT_ERRORS.fullName),
    phone: text(CHECKOUT_ERRORS.phone)
      .trim()
      .min(1, CHECKOUT_ERRORS.phone)
      .max(40, CHECKOUT_ERRORS.phone),
    email: text(CHECKOUT_ERRORS.email)
      .trim()
      .min(1, CHECKOUT_ERRORS.email)
      .max(254, CHECKOUT_ERRORS.email)
      .regex(EMAIL_SHAPE, CHECKOUT_ERRORS.email),
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
    if ((address?.city ?? '') === '') {
      ctx.addIssue({ code: 'custom', path: ['address', 'city'], message: CHECKOUT_ERRORS.city });
    }
    if ((address?.line1 ?? '') === '') {
      ctx.addIssue({ code: 'custom', path: ['address', 'line1'], message: CHECKOUT_ERRORS.line1 });
    }
    const postalCode = address?.postalCode ?? '';
    if (postalCode !== '') {
      if (country.toUpperCase() === 'IL') {
        if (!/^\d{7}$/.test(postalCode)) {
          ctx.addIssue({
            code: 'custom',
            path: ['address', 'postalCode'],
            message: CHECKOUT_ERRORS.postalCodeIl,
          });
        }
      } else if (postalCode.length > 12) {
        ctx.addIssue({
          code: 'custom',
          path: ['address', 'postalCode'],
          message: CHECKOUT_ERRORS.postalCode,
        });
      }
    }
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
