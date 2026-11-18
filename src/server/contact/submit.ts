import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { routing } from '@/i18n/routing';
import { EMAIL_SHAPE } from '@/lib/validation/email-shape';
import { formFailure, ok, type Failure, type MessageKey } from '@/server/catalog/result';
import { verifyFormToken } from '@/server/checkout/form-token';
import { lowerDomain } from '@/server/checkout/validate';
import { withTx } from '@/server/db/client';
import { shopSettings } from '@/server/db/schema';
import { enqueueEmail } from '@/server/email/outbox';
import { kickOutbox } from '@/server/email/sender';
import { renderContactMessage } from '@/server/email/templates/contact-message';
import { log } from '@/server/security/logger';
import { checkRateLimit } from '@/server/security/rate-limit';

/** Only messages actually sent count: 5 per clock hour per visitor (user decision Q3, R13). */
const RATE_LIMIT = { limit: 5, windowSec: 3600 } as const;

export const NAME_MIN = 2;
export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 5000;

const ERRORS = {
  expired: 'contact.errors.expired',
  rateLimited: 'contact.errors.rate_limited',
  name: 'contact.errors.name',
  email: 'contact.errors.email',
  messageShort: 'contact.errors.message_short',
  messageLong: 'contact.errors.message_long',
} as const;

export interface SubmitContactContext {
  /** Client IP (`null` when it is not known); only a daily-rotating hash of it is ever stored. */
  ip: string | null;
  /** Test hook. */
  now?: Date;
}

/** `retryAfterMinutes` comes with `contact.errors.rate_limited` only. */
export type SubmitContactResult =
  { ok: true; data: undefined } | (Failure & { retryAfterMinutes?: number });

const envelopeSchema = z.object({
  name: z.string(),
  email: z.string(),
  message: z.string(),
  honeypot: z.string().max(500),
  formToken: z.string().max(200),
  locale: z.enum(routing.locales),
});

/**
 * The contact form (contracts/server-actions.md > submitContact). Checks run in this order so
 * that only valid messages count toward the limit: bot signals, then the fields (all errors at
 * once), then the rate limit, then one transaction that queues one email per notification address.
 */
export async function submitContact(
  input: unknown,
  ctx: SubmitContactContext,
): Promise<SubmitContactResult> {
  const now = ctx.now ?? new Date();

  const envelope = envelopeSchema.safeParse(input);
  if (!envelope.success) return formFailure(ERRORS.expired);
  const { honeypot, formToken, locale } = envelope.data;
  if (honeypot !== '' || !verifyFormToken(formToken, now.getTime())) {
    return formFailure(ERRORS.expired);
  }

  const name = envelope.data.name.trim();
  const email = envelope.data.email.trim();
  const message = envelope.data.message.trim();
  const fieldErrors: Record<string, MessageKey> = {};
  if (name.length < NAME_MIN || name.length > NAME_MAX) fieldErrors.name = ERRORS.name;
  if (email.length > EMAIL_MAX || !EMAIL_SHAPE.test(email)) fieldErrors.email = ERRORS.email;
  if (message.length < MESSAGE_MIN) fieldErrors.message = ERRORS.messageShort;
  else if (message.length > MESSAGE_MAX) fieldErrors.message = ERRORS.messageLong;
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const limit = await checkRateLimit('contact', ctx.ip ?? 'unknown', { ...RATE_LIMIT, now });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: ERRORS.rateLimited,
      retryAfterMinutes: Math.ceil(limit.retryAfterSec / 60),
    };
  }

  const replyTo = lowerDomain(email);
  await withTx(async (tx) => {
    const [settings] = await tx.select().from(shopSettings).where(eq(shopSettings.id, 1));
    if (!settings) throw new Error('shop_settings row is missing: run `pnpm db:seed`');
    const mail = renderContactMessage({
      name,
      email: replyTo,
      message,
      siteLocale: locale,
      shopName: settings.shopNameHe,
    });
    const recipients = [
      ...new Set(settings.notificationEmails.map((address) => address.toLowerCase())),
    ].sort();
    const id = randomUUID();
    for (const [index, to] of recipients.entries()) {
      await enqueueEmail(tx, {
        kind: 'contact-message',
        to,
        replyTo,
        locale: 'he',
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        dedupeKey: `contact:${id}:${String(index)}`,
      });
    }
  });
  log.info('contact_message_queued');
  kickOutbox();
  return ok(undefined);
}
