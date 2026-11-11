import { eq, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { loadDrafts } from '@/server/content/drafts';
import { CONTENT_SLUGS, isVersionedSlug } from '@/server/content/slugs';
import { recordVersion } from '@/server/content/versions';
import { category, contentPage, shippingZone, shippingZoneCountry, shopSettings } from './schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SeedDb = PgDatabase<any, any>;

/** Real defaults the seed provides (the working shop name). Not launch placeholders. */
export const SEED_DEFAULTS = {
  shopNameHe: 'היצירות של אביבה',
  shopNameEn: "Aviva's Crafts",
} as const;

/**
 * Placeholder texts the seed puts into shop_settings (keys are shop_settings field names).
 * `placeholderFields()` compares the live row with these values.
 */
export const SEED_PLACEHOLDERS = {
  businessNameHe: 'שם העסק (להשלמה)',
  businessNameEn: 'Business name (to be completed)',
  businessRegNumber: '000000000',
  businessEmail: 'shop@example.invalid',
  businessPhone: '+972500000000',
  businessAddressHe: 'כתובת העסק (להשלמה)',
  businessAddressEn: 'Business address (to be completed)',
  notificationEmails: ['notify@example.invalid'],
} as const;

// Moved to a dependency-free module (003); re-exported for existing imports.
export { CONTENT_SLUGS };

const SAMPLE_CATEGORIES = [
  { slug: 'sample-candles', nameHe: 'נרות', nameEn: 'Candles' },
  { slug: 'sample-ceramics', nameHe: 'קרמיקה', nameEn: 'Ceramics' },
] as const;

export interface SeedOptions {
  /** Add sample categories (development and test only; the caller decides). */
  samples: boolean;
  /** Folder with the supplied content drafts (`<slug>.<he|en>.md`); see `loadDrafts`. */
  contentDir?: string;
}

/** Idempotent: only inserts missing rows and never overwrites owner edits. */
export async function runSeed(database: SeedDb, options: SeedOptions): Promise<void> {
  await database.transaction((db) => seedInTx(db, options));
  if (options.samples) {
    // After the transaction: photos go through the image pipeline and storage, which take their own connections.
    // Imported only here, so a deploy-time seed without samples never loads the image libraries.
    const { seedSampleProducts } = await import('@/server/catalog/sample-products');
    await seedSampleProducts(database);
  }
}

async function seedInTx(db: SeedDb, options: SeedOptions): Promise<void> {
  await db
    .insert(shippingZone)
    .values({
      code: 'IL',
      nameHe: 'ישראל',
      nameEn: 'Israel',
      currency: 'ILS',
      enabled: true,
      shippingEnabled: true,
      pickupEnabled: true,
      shippingFeeMinor: 3000,
      freeShippingThresholdMinor: 30000,
    })
    .onConflictDoNothing({ target: shippingZone.code });
  // Always link IL (a zone may exist without its country); never touches an existing link.
  const [zone] = await db
    .select({ id: shippingZone.id })
    .from(shippingZone)
    .where(eq(shippingZone.code, 'IL'));
  if (!zone) throw new Error('Zone IL is missing after seeding');
  await db
    .insert(shippingZoneCountry)
    .values({ zoneId: zone.id, countryCode: 'IL' })
    .onConflictDoNothing();

  await db
    .insert(shopSettings)
    .values({
      id: 1,
      shopNameHe: SEED_DEFAULTS.shopNameHe,
      shopNameEn: SEED_DEFAULTS.shopNameEn,
      businessNameHe: SEED_PLACEHOLDERS.businessNameHe,
      businessNameEn: SEED_PLACEHOLDERS.businessNameEn,
      businessRegNumber: SEED_PLACEHOLDERS.businessRegNumber,
      businessEmail: SEED_PLACEHOLDERS.businessEmail,
      businessPhone: SEED_PLACEHOLDERS.businessPhone,
      businessAddressHe: SEED_PLACEHOLDERS.businessAddressHe,
      businessAddressEn: SEED_PLACEHOLDERS.businessAddressEn,
      notificationEmails: [...SEED_PLACEHOLDERS.notificationEmails],
    })
    .onConflictDoNothing({ target: shopSettings.id });

  if (options.contentDir === undefined) {
    const inserted = await db
      .insert(contentPage)
      .values(CONTENT_SLUGS.map((slug) => ({ slug, titleHe: 'טיוטה', bodyHe: 'טיוטה' })))
      .onConflictDoNothing({ target: contentPage.slug })
      .returning();
    // Every version an order can refer to has a copy, also in a database seeded without drafts.
    for (const row of inserted) {
      if (isVersionedSlug(row.slug)) await recordVersion(db, row);
    }
  } else {
    await loadDrafts(db, options.contentDir);
  }

  if (options.samples) {
    for (const sample of SAMPLE_CATEGORIES) {
      // New categories go to the end, so an existing order is never disturbed.
      await db
        .insert(category)
        .values({
          ...sample,
          sortOrder: sql`(SELECT coalesce(max(${category.sortOrder}), -1) + 1 FROM ${category})`,
        })
        .onConflictDoNothing({ target: category.slug });
    }
  }
}
