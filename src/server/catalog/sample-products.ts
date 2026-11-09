import 'server-only';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { category, optionGroup, optionValue, product } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { addImage, deleteImagesOfProduct } from './images';
import { syncPublicImages } from './public-images';

interface SampleProduct {
  slug: string;
  categorySlug: string;
  nameHe: string;
  nameEn: string | null;
  descriptionHe: string;
  descriptionEn: string | null;
  priceIlsMinor: number;
  prepTimeHe: string;
  prepTimeEn: string | null;
  orderable: boolean;
  /** Hue (degrees) of each generated photo. */
  photoHues: number[];
  options?: {
    nameHe: string;
    nameEn: string;
    values: {
      labelHe: string;
      labelEn: string;
      deltaIlsMinor: number;
      swatch: string | null;
    }[];
  };
}

const SAMPLES: SampleProduct[] = [
  {
    slug: 'sample-soy-candle',
    categorySlug: 'sample-candles',
    nameHe: 'נר סויה בעבודת יד',
    nameEn: 'Handmade soy candle',
    descriptionHe: 'נר סויה בריח עדין, נוצק ביד בכוס זכוכית.\nבוער כארבעים שעות.',
    descriptionEn:
      'A softly scented soy candle, hand-poured into a glass jar.\nBurns for about forty hours.',
    priceIlsMinor: 4500,
    prepTimeHe: 'כשלושה ימים',
    prepTimeEn: 'about three days',
    orderable: true,
    photoHues: [35, 20],
    options: {
      nameHe: 'צבע',
      nameEn: 'Colour',
      values: [
        { labelHe: 'שמנת', labelEn: 'Cream', deltaIlsMinor: 0, swatch: 'cream' },
        { labelHe: 'ורוד', labelEn: 'Pink', deltaIlsMinor: 1000, swatch: 'pink' },
        { labelHe: 'ירוק', labelEn: 'Green', deltaIlsMinor: 1000, swatch: 'green' },
      ],
    },
  },
  {
    slug: 'sample-ceramic-bowl',
    categorySlug: 'sample-ceramics',
    nameHe: 'קערת קרמיקה כחולה',
    nameEn: 'Blue ceramic bowl',
    descriptionHe: 'קערה מצופה זיגוג כחול, מתאימה לפירות ולסלט.',
    descriptionEn: 'A bowl with a blue glaze, good for fruit and salad.',
    priceIlsMinor: 12000,
    prepTimeHe: 'כשבועיים',
    prepTimeEn: 'about two weeks',
    orderable: false,
    photoHues: [210, 200],
  },
  {
    slug: 'sample-clay-mug',
    categorySlug: 'sample-ceramics',
    nameHe: 'ספל חרס',
    nameEn: null,
    descriptionHe: 'ספל חרס עם ידית רחבה, מתאים למשקה חם.',
    descriptionEn: null,
    priceIlsMinor: 6500,
    prepTimeHe: 'כעשרה ימים',
    prepTimeEn: null,
    orderable: true,
    photoHues: [15],
  },
];

/** A photo-like picture (soft gradient plus a round shape), unique per hue. */
async function samplePhoto(hue: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${String(hue)} 70% 78%)"/>
      <stop offset="1" stop-color="hsl(${String((hue + 40) % 360)} 55% 42%)"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="600" cy="780" r="320" fill="hsl(${String(hue)} 40% 94%)"/>
    <circle cx="600" cy="780" r="190" fill="hsl(${String((hue + 20) % 360)} 55% 60%)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

/**
 * Development and test only. Three published sample products (one with options and swatches, one
 * not orderable, one without English text); photos go through the real pipeline (`addImage`) and
 * are published with `syncPublicImages` once all photos are in. Idempotent by slug: an existing product is left alone.
 */
export async function seedSampleProducts(database: DbLike): Promise<void> {
  for (const sample of SAMPLES) {
    const [cat] = await database
      .select({ id: category.id })
      .from(category)
      .where(eq(category.slug, sample.categorySlug));
    if (!cat) continue;
    const [created] = await database
      .insert(product)
      .values({
        slug: sample.slug,
        categoryId: cat.id,
        nameHe: sample.nameHe,
        nameEn: sample.nameEn,
        descriptionHe: sample.descriptionHe,
        descriptionEn: sample.descriptionEn,
        priceIlsMinor: sample.priceIlsMinor,
        prepTimeHe: sample.prepTimeHe,
        prepTimeEn: sample.prepTimeEn,
        orderable: sample.orderable,
      })
      .onConflictDoNothing({ target: product.slug })
      .returning({ id: product.id });
    if (!created) continue;

    // A draft until every photo is in: a failed upload leaves nothing half-published, and the
    // half-made product is removed so that a re-run creates it again.
    try {
      if (sample.options) {
        const [group] = await database
          .insert(optionGroup)
          .values({
            productId: created.id,
            nameHe: sample.options.nameHe,
            nameEn: sample.options.nameEn,
            position: 0,
          })
          .returning({ id: optionGroup.id });
        if (!group) throw new Error('Sample option group was not created');
        await database.insert(optionValue).values(
          sample.options.values.map((value, position) => ({
            groupId: group.id,
            labelHe: value.labelHe,
            labelEn: value.labelEn,
            deltaIlsMinor: value.deltaIlsMinor,
            swatch: value.swatch,
            position,
          })),
        );
      }
      for (const hue of sample.photoHues) {
        const result = await addImage(null, created.id, await samplePhoto(hue), { db: database });
        if (!result.ok) throw new Error(`Sample photo failed: ${result.code}`);
      }
      await database
        .update(product)
        .set({ state: 'published', publishedAt: new Date() })
        .where(eq(product.id, created.id));
      await syncPublicImages(created.id, database);
    } catch (error) {
      await deleteImagesOfProduct(created.id, database).catch(() => undefined);
      await database.delete(product).where(eq(product.id, created.id));
      throw error;
    }
  }
}
