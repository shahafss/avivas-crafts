import 'server-only';
import { emailOutbox } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';

export interface EnqueueEmail {
  kind: string;
  to: string;
  /** Contact messages only: the visitor's address (erased with the body once sent). */
  replyTo?: string | undefined;
  locale: 'he' | 'en';
  /** Never personal data: it stays in the row after sending (contracts/emails.md). */
  subject: string;
  html: string;
  text: string;
  orderId?: string | undefined;
  dedupeKey: string;
}

/**
 * Queues an email inside the caller's transaction, so a rolled-back transaction leaves nothing.
 * Returns false when a row with the same `dedupeKey` already exists (a no-op).
 */
export async function enqueueEmail(tx: DbLike, email: EnqueueEmail): Promise<boolean> {
  const rows = await tx
    .insert(emailOutbox)
    .values({
      kind: email.kind,
      toAddress: email.to,
      replyTo: email.replyTo ?? null,
      locale: email.locale,
      subject: email.subject,
      html: email.html,
      textBody: email.text,
      orderId: email.orderId ?? null,
      dedupeKey: email.dedupeKey,
    })
    .onConflictDoNothing({ target: emailOutbox.dedupeKey })
    .returning({ id: emailOutbox.id });
  return rows.length > 0;
}
