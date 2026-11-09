import 'server-only';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import { checkoutFormSchema, CHECKOUT_ERRORS } from '@/lib/validation/checkout';

/** The country whose rules decide whether the phone number is valid: the address, else Israel. */
function phoneCountry(country: string | undefined): CountryCode {
  const code = (country ?? '').trim().toUpperCase();
  return (/^[A-Z]{2}$/.test(code) ? code : 'IL') as CountryCode;
}

/** Whether `phone` is a valid number for the address country (Israel when there is none). */
export function isValidPhone(phone: string, country: string | undefined): boolean {
  return parsePhoneNumberFromString(phone, phoneCountry(country))?.isValid() === true;
}

/** The phone as E.164 for the address country (Israel when there is none); unchanged if unparsable. */
export function normalisePhone(phone: string, country: string | undefined): string {
  return parsePhoneNumberFromString(phone, phoneCountry(country))?.number ?? phone;
}

/** `user@Example.COM` -> `user@example.com` (only the domain is case-insensitive in practice). */
export function lowerDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return `${email.slice(0, at)}@${email.slice(at + 1).toLowerCase()}`;
}

/**
 * The server-side checkout schema: the shared light schema plus the libphonenumber check for the
 * address country (Israel by default). The result carries the phone as E.164, the email with a
 * lower-cased domain, and no address for pickup.
 */
export const checkoutServerSchema = checkoutFormSchema
  .superRefine((form, ctx) => {
    const country = form.deliveryMethod === 'shipping' ? form.address?.country : undefined;
    if (!isValidPhone(form.phone, country)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: CHECKOUT_ERRORS.phone });
    }
  })
  .transform((form) => {
    const country = form.deliveryMethod === 'shipping' ? form.address?.country : undefined;
    const phone = normalisePhone(form.phone, country);
    const { address, note, ...rest } = form;
    const trimmedNote = note?.trim() ?? '';
    return {
      ...rest,
      phone,
      email: lowerDomain(form.email),
      note: trimmedNote === '' ? null : trimmedNote,
      address:
        form.deliveryMethod === 'shipping' && address !== undefined
          ? {
              country: (address.country ?? '').toUpperCase(),
              city: address.city ?? '',
              line1: address.line1 ?? '',
              line2: address.line2 === '' ? null : (address.line2 ?? null),
              postalCode: address.postalCode === '' ? null : (address.postalCode ?? null),
            }
          : null,
    };
  });

export type CheckoutDetails = ReturnType<typeof checkoutServerSchema.parse>;
