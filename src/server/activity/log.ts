import 'server-only';
import { adminActivity } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';

/** The only keys `details` may hold: non-personal facts (data-model.md › admin_activity). */
export const ACTIVITY_DETAIL_KEYS = [
  'from',
  'to',
  'oldPriceMinor',
  'newPriceMinor',
  'currency',
  'field',
  'count',
  'state',
  'orderNumber',
  'slug',
  'role',
] as const;

const ALLOWED = new Set<string>(ACTIVITY_DETAIL_KEYS);

export interface ActivityInput {
  adminId: string | null;
  actorKind: 'admin' | 'unapproved_account' | 'system';
  /** Admin display name at the time (kept for `admin` actors), or a fixed command name for `system`. */
  actorLabel?: string | undefined;
  action: string;
  targetType?: string | undefined;
  targetId?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

/**
 * Writes one audit row inside the caller's transaction and returns its id. Unknown or
 * unapproved actors never get a label (never an unapproved account's email).
 */
export async function logActivity(tx: DbLike, input: ActivityInput): Promise<string> {
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.details ?? {})) {
    // Only allow-listed keys with plain scalar values: no nested objects or arrays.
    if (
      ALLOWED.has(key) &&
      (value === null || ['string', 'number', 'boolean'].includes(typeof value))
    ) {
      details[key] = value;
    }
  }
  // Never a label for an unapproved account (it could be an email).
  const keepsLabel = input.actorKind !== 'unapproved_account';
  const [row] = await tx
    .insert(adminActivity)
    .values({
      adminId: input.actorKind === 'unapproved_account' ? null : input.adminId,
      actorKind: input.actorKind,
      actorLabel: keepsLabel ? (input.actorLabel ?? null) : null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      details,
    })
    .returning({ id: adminActivity.id });
  if (!row) throw new Error('Activity row was not written');
  return row.id;
}
