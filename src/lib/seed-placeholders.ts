/**
 * Placeholder texts the seed puts into shop_settings (keys are shop_settings field names).
 * `placeholderFields()` compares the live row with these values.
 */
export const SEED_PLACEHOLDERS = {
  businessNameHe: 'שם העסק (להשלמה)',
  businessNameEn: 'Business name (to be completed)',
  businessRegNumber: '000000000',
  businessEmail: 'shop@example.invalid',
  businessPhone: '+972500000000',
  businessAddressHe: 'כתובת העסק (להשלמה)',
  businessAddressEn: 'Business address (to be completed)',
  notificationEmails: ['notify@example.invalid'],
} as const;
