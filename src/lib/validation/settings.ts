import { z } from 'zod';
import { EMAIL_SHAPE } from './email-shape';

/**
 * The settings the admin screen edits (contracts/server-actions.md > updateSettings). Every field
 * is optional so a section can be saved alone; the merged result is checked against the rules
 * that span fields (at least one payment method, 1-3 notification emails). Messages are
 * translation keys under `admin.settings.errors`.
 */

const KEY = (name: string) => `admin.settings.errors.${name}`;

const required = (name: string, max: number) =>
  z
    .string({ error: KEY(name) })
    .trim()
    .min(1, KEY(name))
    .max(max, KEY(name));

/** Empty after trimming means "not set". */
const optionalText = (name: string, max: number) =>
  z
    .string({ error: KEY(name) })
    .max(max, KEY(name))
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? '';
      return trimmed === '' ? null : trimmed;
    });

const email = z
  .string({ error: KEY('email') })
  .trim()
  .max(254, KEY('email'))
  .regex(EMAIL_SHAPE, KEY('email'));

export const settingsInputSchema = z
  .object({
    shopNameHe: required('shopNameHe', 60),
    shopNameEn: optionalText('shopNameEn', 60),
    onlinePaymentEnabled: z.boolean(),
    offlinePaymentEnabled: z.boolean(),
    offlineInstructionsHe: optionalText('instructions', 5000),
    offlineInstructionsEn: optionalText('instructions', 5000),
    pickupInstructionsHe: optionalText('instructions', 5000),
    pickupInstructionsEn: optionalText('instructions', 5000),
    businessNameHe: required('businessNameHe', 120),
    businessNameEn: optionalText('businessNameEn', 120),
    businessRegNumber: required('businessRegNumber', 40),
    businessEmail: email,
    businessPhone: required('businessPhone', 40),
    businessAddressHe: required('businessAddressHe', 300),
    businessAddressEn: optionalText('businessAddressEn', 300),
    notificationEmails: z
      .array(email, { error: KEY('notificationEmails') })
      .min(1, KEY('notificationEmails'))
      .max(3, KEY('notificationEmails')),
  })
  .partial()
  .strict();

export type SettingsInput = z.input<typeof settingsInputSchema>;

export const zoneInputSchema = z.object({
  zoneId: z.uuid(),
  enabled: z.boolean(),
  shippingEnabled: z.boolean(),
  pickupEnabled: z.boolean(),
  shippingFeeMinor: z
    .number({ error: KEY('fee') })
    .int(KEY('fee'))
    .min(0, KEY('fee'))
    .max(100_000_000, KEY('fee')),
  freeShippingThresholdMinor: z
    .number({ error: KEY('threshold') })
    .int(KEY('threshold'))
    .min(0, KEY('threshold'))
    .max(100_000_000, KEY('threshold'))
    .nullable(),
});

export type ZoneInput = z.input<typeof zoneInputSchema>;
