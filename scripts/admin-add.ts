// pnpm admin:add <googleEmail> "<display name>"
// Creates an approved admin and prints a one-time setup link (valid 24 h). The token sits in the
// URL fragment, so no server or log ever sees it in a URL.
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logActivity } from '@/server/activity/log';
import { createSetupLink } from '@/server/auth/setup-links';
import { db } from '@/server/db/client';
import { SEED_PLACEHOLDERS } from '@/server/db/seed';
import { adminUser, shopSettings } from '@/server/db/schema';
import { notifyAdmins } from '@/server/security/notify';

// Local development: take settings from .env.local when it exists. Variables already set in the
// environment win (loadEnvFile never overrides them), so tests and CI keep control.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local: use the environment as it is.
}

const [emailArg, nameArg] = process.argv.slice(2);
const parsed = z
  .object({
    email: z.email().max(254),
    name: z.string().trim().min(1).max(60),
  })
  .safeParse({ email: emailArg, name: nameArg });
if (!parsed.success) {
  console.error('Usage: pnpm admin:add <googleEmail> "<display name>"');
  console.error('The email must be valid and the name 1-60 characters.');
  process.exit(1);
}
const email = parsed.data.email.toLowerCase();
const name = parsed.data.name;

try {
  const [existing] = await db
    .select({ id: adminUser.id })
    .from(adminUser)
    .where(eq(adminUser.googleEmail, email));
  if (existing) {
    console.error(
      'An admin with this email already exists. Create a new setup link from the security screen (regenerateSetupLink), or run `pnpm admin:reset <googleEmail>`.',
    );
    process.exit(1);
  }

  const link = await db.transaction(async (tx) => {
    const [admin] = await tx
      .insert(adminUser)
      .values({ displayName: name, googleEmail: email })
      .returning({ id: adminUser.id });
    if (!admin) throw new Error('Admin was not created');

    // The seed placeholder never delivers: the first admin's address takes its place.
    const [settings] = await tx.select().from(shopSettings).where(eq(shopSettings.id, 1));
    const placeholder: readonly string[] = SEED_PLACEHOLDERS.notificationEmails;
    if (
      settings &&
      settings.notificationEmails.length === placeholder.length &&
      settings.notificationEmails.every((address, index) => address === placeholder[index])
    ) {
      await tx
        .update(shopSettings)
        .set({ notificationEmails: [email] })
        .where(eq(shopSettings.id, 1));
    }

    const created = await createSetupLink(admin.id, { tx });
    const activityId = await logActivity(tx, {
      adminId: null,
      actorKind: 'system',
      action: 'admin.added',
      targetType: 'admin',
      targetId: admin.id,
    });
    await notifyAdmins('admin_added', { at: new Date(), adminName: name }, { tx, activityId });
    return created;
  });

  console.log(`Admin created: ${name} <${email}>`);
  console.log('');
  console.log('One-time setup link (valid 24 hours, works once):');
  console.log(link.url);
  console.log('');
  console.log(
    "Reminder: the shop needs TWO admins. Recovery codes only work with the other admin's approval, so set up both before launch.",
  );
  process.exit(0);
} catch (error) {
  console.error('Could not create the admin:', error instanceof Error ? error.message : error);
  process.exit(1);
}
