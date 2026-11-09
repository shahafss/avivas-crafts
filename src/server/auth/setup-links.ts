import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { adminUser } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { getEnv } from '@/server/env';
import type { AdminRow } from './session';

export const SETUP_LINK_TTL_MS = 24 * 60 * 60_000;

export function hashSetupToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** The one-time link. The token sits in the fragment, so no server or log ever sees it in a URL. */
export function setupLinkUrl(token: string): string {
  return `${getEnv().APP_ORIGIN}/admin/setup#t=${token}`;
}

/** New single-use setup token (32 random bytes, only the SHA-256 is stored, valid 24 h). */
export async function createSetupLink(
  adminId: string,
  { now = new Date(), tx = db }: { now?: Date; tx?: DbLike } = {},
): Promise<{ token: string; url: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SETUP_LINK_TTL_MS);
  const updated = await tx
    .update(adminUser)
    .set({ setupTokenHash: hashSetupToken(token), setupTokenExpiresAt: expiresAt })
    .where(eq(adminUser.id, adminId))
    .returning({ id: adminUser.id });
  if (updated.length === 0) throw new Error('Admin not found');
  return { token, url: setupLinkUrl(token), expiresAt };
}

/** The admin a valid (known, unexpired) setup token belongs to. */
export async function findAdminBySetupToken(
  token: string,
  now: Date = new Date(),
): Promise<AdminRow | null> {
  if (token.length === 0 || token.length > 128) return null;
  const [admin] = await db
    .select()
    .from(adminUser)
    .where(
      and(
        eq(adminUser.setupTokenHash, hashSetupToken(token)),
        gt(adminUser.setupTokenExpiresAt, now),
      ),
    );
  return admin ?? null;
}

export async function clearSetupToken(adminId: string, tx: DbLike = db): Promise<void> {
  await tx
    .update(adminUser)
    .set({ setupTokenHash: null, setupTokenExpiresAt: null })
    .where(eq(adminUser.id, adminId));
}
