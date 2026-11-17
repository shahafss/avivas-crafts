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

const SOCIAL_DOMAIN = {
  facebook: 'facebook.com',
  instagram: 'instagram.com',
  tiktok: 'tiktok.com',
} as const;

/**
 * One social page address (contracts/social-links.md): trimmed, `https://` added when there is no
 * scheme, then checked step by step. Empty means "not set" (null). The stored value is the
 * normalised `href`. Messages are complete translation keys (no placeholders).
 */
export function socialUrl(platform: keyof typeof SOCIAL_DOMAIN) {
  const social = (name: string) => KEY(`social.${name}`);
  return z
    .string({ error: social('invalid') })
    .nullish()
    .transform((value, ctx): string | null => {
      const trimmed = value?.trim() ?? '';
      if (trimmed === '') return null;
      const fail = (message: string) => {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      };
      const text = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
      let url: URL;
      try {
        url = new URL(text);
      } catch {
        return fail(social('invalid'));
      }
      if (url.protocol !== 'https:') return fail(social('notHttps'));
      if (url.username !== '' || url.password !== '' || url.port !== '') {
        return fail(social('invalid'));
      }
      const domain = SOCIAL_DOMAIN[platform];
      if (url.hostname !== domain && !url.hostname.endsWith(`.${domain}`)) {
        return fail(social(`wrongSite.${platform}`));
      }
      if (url.pathname === '' || url.pathname === '/') return fail(social(`noPage.${platform}`));
      if (url.href.length > 300) return fail(social('tooLong'));
      return url.href;
    });
}

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
    socialFacebookUrl: socialUrl('facebook'),
    socialInstagramUrl: socialUrl('instagram'),
    socialTiktokUrl: socialUrl('tiktok'),
    homeCategoryId: z
      .uuid({ error: KEY('invalid') })
      .nullable()
      .optional(),
    headerCategory1Id: z
      .uuid({ error: KEY('invalid') })
      .nullable()
      .optional(),
    headerCategory2Id: z
      .uuid({ error: KEY('invalid') })
      .nullable()
      .optional(),
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
