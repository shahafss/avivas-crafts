import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logActivity } from '@/server/activity/log';
import { adminSession, adminUser } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';

const inputSchema = z.object({
  email: z.email().max(254),
  role: z.enum(['admin', 'user']),
  name: z.string().trim().min(1).max(60).optional(),
});

export type AdminRoleResult =
  | { ok: true; displayName: string; role: 'admin' | 'user'; created: boolean }
  | { ok: false; error: 'invalid' }
  | { ok: false; error: 'no_such_user' };

/**
 * Sets a user's role (`pnpm admin:role`, the owner's command; contracts/admin-role-command.md).
 * A new email with role `admin` creates the user; role `user` also ends all of that user's
 * sessions in the same transaction. One `admin.role_set` activity row per change, never the email.
 */
export async function setAdminRole(
  database: DbLike,
  input: { email: string; role: string; name?: string | undefined },
): Promise<AdminRoleResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const { role, name } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  return database.transaction(async (tx) => {
    const [existing] = await tx.select().from(adminUser).where(eq(adminUser.googleEmail, email));
    let user: { id: string; displayName: string };
    let created = false;
    if (existing) {
      const displayName = name ?? existing.displayName;
      await tx
        .update(adminUser)
        .set({ role, displayName, updatedAt: new Date() })
        .where(eq(adminUser.id, existing.id));
      user = { id: existing.id, displayName };
    } else {
      if (role !== 'admin') return { ok: false as const, error: 'no_such_user' as const };
      const displayName = name ?? email.slice(0, email.indexOf('@')).slice(0, 60);
      const [inserted] = await tx
        .insert(adminUser)
        .values({ displayName, googleEmail: email, role })
        .returning({ id: adminUser.id });
      if (!inserted) throw new Error('User was not created');
      user = { id: inserted.id, displayName };
      created = true;
    }
    if (role === 'user') await tx.delete(adminSession).where(eq(adminSession.adminId, user.id));
    await logActivity(tx, {
      adminId: user.id,
      actorKind: 'system',
      actorLabel: 'admin:role',
      action: 'admin.role_set',
      targetType: 'admin',
      targetId: user.id,
      details: { role },
    });
    return { ok: true as const, displayName: user.displayName, role, created };
  });
}
