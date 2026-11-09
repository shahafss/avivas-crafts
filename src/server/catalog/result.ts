import type { ZodError } from 'zod';
import type { AdminContext } from '@/server/auth/require-admin';

/** Translation key (full path, e.g. `admin.products.errors.slug_taken`). */
export type MessageKey = string;

/** contracts/server-actions.md: the result every admin write returns. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      fieldErrors?: Record<string, MessageKey>;
      formError?: MessageKey;
      /** Publish validation: field names (`nameHe`, `images`, ...) that block publishing. */
      missingFields?: string[];
      /** Delete refused because of N products. */
      count?: number;
    };

export type Failure = Extract<ActionResult, { ok: false }>;

/** Who made a change (for `admin_activity`); `null` actor = system work such as seeding (not logged). */
export interface Actor {
  adminId: string | null;
  label?: string | undefined;
}

export function actorOf(context: Pick<AdminContext, 'admin'>): Actor {
  return { adminId: context.admin.id, label: context.admin.displayName };
}

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export function formFailure(
  formError: MessageKey,
  extra: Omit<Failure, 'ok' | 'formError'> = {},
): Failure {
  return { ok: false, formError, ...extra };
}

export function fieldFailure(field: string, message: MessageKey): Failure {
  return { ok: false, fieldErrors: { [field]: message } };
}

/** Zod issues -> one message key per top-level field. */
export function zodFailure(error: ZodError, messageKey: MessageKey): Failure {
  const fieldErrors: Record<string, MessageKey> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    fieldErrors[typeof field === 'string' ? field : 'form'] ??= messageKey;
  }
  return { ok: false, fieldErrors };
}
