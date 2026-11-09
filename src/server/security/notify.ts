import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { eq, lte } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { adminUser, notificationThrottle, shopSettings } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { enqueueEmail } from '@/server/email/outbox';
import { kickOutbox } from '@/server/email/sender';
import {
  THROTTLED_KINDS,
  renderSecurityAlert,
  type SecurityAlertData,
  type SecurityAlertKind,
} from '@/server/email/templates/security-alert';

const WINDOW_MS = 15 * 60_000;

export interface NotifyOptions {
  /** The caller's transaction; the caller then calls `kickOutbox()` after commit. */
  tx?: DbLike;
  /** Id of the `admin_activity` row; part of the dedupe key of the always-sent kinds. */
  activityId?: string | undefined;
  /** Test hook. */
  now?: Date;
}

function short(address: string): string {
  return createHash('sha256').update(address).digest('hex').slice(0, 16);
}

/**
 * Emails every admin's Google address and `notification_emails`. The three repeatable sign-in
 * kinds are throttled to one email per kind per 15 minutes; all others are always sent.
 * Returns the number of emails queued.
 */
export async function notifyAdmins(
  kind: SecurityAlertKind,
  data: SecurityAlertData,
  options: NotifyOptions = {},
): Promise<number> {
  if (options.tx === undefined) {
    // Own transaction (throttle claim and queued rows commit together), then send right away.
    const queued = await db.transaction((tx) => notifyAdmins(kind, data, { ...options, tx }));
    if (queued > 0) kickOutbox();
    return queued;
  }
  const { tx, activityId, now = new Date() } = options;
  const throttled = THROTTLED_KINDS.includes(kind);
  const window = Math.floor(now.getTime() / WINDOW_MS);

  if (throttled) {
    // One atomic statement: the row is taken only when the last email is older than the window.
    const claimed = await tx
      .insert(notificationThrottle)
      .values({ kind: `security.${kind}`, lastSentAt: now })
      .onConflictDoUpdate({
        target: notificationThrottle.kind,
        set: { lastSentAt: now },
        setWhere: lte(notificationThrottle.lastSentAt, new Date(now.getTime() - WINDOW_MS)),
      })
      .returning({ kind: notificationThrottle.kind });
    if (claimed.length === 0) return 0;
  }

  const admins = await tx.select({ email: adminUser.googleEmail }).from(adminUser);
  // Read through `tx` (not getSettings()): a second connection would not see this transaction.
  const [settings] = await tx.select().from(shopSettings).where(eq(shopSettings.id, 1));
  if (!settings) throw new Error('shop_settings row is missing: run `pnpm db:seed`');
  const recipients = [
    ...new Set(
      [...admins.map((a) => a.email), ...settings.notificationEmails].map((e) => e.toLowerCase()),
    ),
  ].sort();
  const mail = renderSecurityAlert(kind, data, settings.shopNameHe);
  const unique = throttled ? String(window) : (activityId ?? randomUUID());

  let queued = 0;
  for (const to of recipients) {
    const added = await enqueueEmail(tx, {
      kind: 'security-alert',
      to,
      locale: 'he',
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      dedupeKey: `security:${kind}:${unique}:${short(to)}`,
    });
    if (added) queued += 1;
  }
  return queued;
}
