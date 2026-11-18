import { contentPageVersion } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';

export type VersionRow = typeof contentPageVersion.$inferInsert;

/**
 * Appends the copy of a Terms or Privacy Policy version that just became current (003 FR-011).
 * Insert only, in the caller's transaction: nothing updates or deletes these rows. Imports only
 * the schema, so `scripts/seed.ts` can use it without loading the app's data layer.
 */
export async function recordVersion(
  tx: DbLike,
  row: Pick<VersionRow, 'slug' | 'version' | 'titleHe' | 'titleEn' | 'bodyHe' | 'bodyEn'>,
): Promise<void> {
  await tx.insert(contentPageVersion).values({
    slug: row.slug,
    version: row.version,
    titleHe: row.titleHe,
    titleEn: row.titleEn ?? null,
    bodyHe: row.bodyHe,
    bodyEn: row.bodyEn ?? null,
  });
}
