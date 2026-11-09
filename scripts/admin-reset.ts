// pnpm admin:reset <googleEmail>
// Maintainer-only way back in when an admin cannot recover through the other admin: removes that
// admin's passkeys, recovery codes and sessions and prints a new one-time setup link.
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logActivity } from '@/server/activity/log';
import { createSetupLink } from '@/server/auth/setup-links';
import { db } from '@/server/db/client';
import { adminPasskey, adminRecoveryCode, adminSession, adminUser } from '@/server/db/schema';
import { notifyAdmins } from '@/server/security/notify';

// Local development: take settings from .env.local when it exists. Variables already set in the
// environment win (loadEnvFile never overrides them), so tests and CI keep control.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local: use the environment as it is.
}

const parsed = z.email().max(254).safeParse(process.argv[2]);
if (!parsed.success) {
  console.error('Usage: pnpm admin:reset <googleEmail>');
  process.exit(1);
}
const email = parsed.data.toLowerCase();

try {
  const [admin] = await db.select().from(adminUser).where(eq(adminUser.googleEmail, email));
  if (!admin) {
    console.error('No admin with this email. Create one with `pnpm admin:add`.');
    process.exit(1);
  }

  const link = await db.transaction(async (tx) => {
    await tx.delete(adminPasskey).where(eq(adminPasskey.adminId, admin.id));
    await tx.delete(adminRecoveryCode).where(eq(adminRecoveryCode.adminId, admin.id));
    await tx.delete(adminSession).where(eq(adminSession.adminId, admin.id));
    await tx
      .update(adminUser)
      .set({ passkeyFailCount: 0, passkeyBlockedUntil: null })
      .where(eq(adminUser.id, admin.id));
    const created = await createSetupLink(admin.id, { tx });
    const activityId = await logActivity(tx, {
      adminId: null,
      actorKind: 'system',
      action: 'admin.reset',
      targetType: 'admin',
      targetId: admin.id,
    });
    await notifyAdmins(
      'admin_reset',
      { at: new Date(), adminName: admin.displayName },
      { tx, activityId },
    );
    return created;
  });

  console.log(
    `Reset done for ${admin.displayName} <${email}>: passkeys, recovery codes and sessions removed.`,
  );
  console.log('');
  console.log('One-time setup link (valid 24 hours, works once):');
  console.log(link.url);
  process.exit(0);
} catch (error) {
  console.error('Could not reset the admin:', error instanceof Error ? error.message : error);
  process.exit(1);
}
