import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * The `wa.me` link for a phone number (Israel is the default country), or `null` when the
 * number is not valid. No text is pre-filled.
 */
export function whatsAppLink(phone: string): string | null {
  const parsed = parsePhoneNumberFromString(phone.trim(), 'IL');
  if (parsed === undefined || !parsed.isValid()) return null;
  return `https://wa.me/${parsed.number.replace(/^\+/, '')}`;
}
