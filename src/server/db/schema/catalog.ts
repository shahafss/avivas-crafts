import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt } from './_shared';

export const productStateEnum = pgEnum('product_state', ['draft', 'published', 'hidden']);

export const category = pgTable(
  'category',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    nameHe: text('name_he').notNull(),
    nameEn: text('name_en'),
    // UNIQUE (sort_order) DEFERRABLE INITIALLY DEFERRED is added by the custom migration.
    sortOrder: integer('sort_order').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('category_slug_format', sql`${t.slug} ~ '^[a-z0-9-]{1,60}$'`),
    check('category_name_he_len', sql`char_length(${t.nameHe}) BETWEEN 1 AND 80`),
    check('category_name_en_len', sql`${t.nameEn} IS NULL OR char_length(${t.nameEn}) <= 80`),
  ],
);

export const product = pgTable(
  'product',
  {
    id: id(),
    // NULL = no address yet (drafts only; product_slug_when_public).
    slug: text('slug').unique(),
    nameHe: text('name_he').notNull(),
    nameEn: text('name_en'),
    descriptionHe: text('description_he'),
    descriptionEn: text('description_en'),
    priceIlsMinor: bigint('price_ils_minor', { mode: 'number' }),
    priceUsdMinor: bigint('price_usd_minor', { mode: 'number' }),
    prepTimeHe: text('prep_time_he'),
    prepTimeEn: text('prep_time_en'),
    state: productStateEnum('state').notNull().default('draft'),
    orderable: boolean('orderable').notNull().default(true),
    /** The owner's "Show as New" tick box (spec 011 FR-012). */
    showAsNew: boolean('show_as_new').notNull().default(false),
    publishedAt: tstz('published_at'),
    searchText: text('search_text').generatedAlwaysAs(
      sql`lower(coalesce(name_he,'') || ' ' || coalesce(name_en,'') || ' ' || coalesce(description_he,'') || ' ' || coalesce(description_en,''))`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('product_slug_format', sql`${t.slug} IS NULL OR ${t.slug} ~ '^[a-z0-9-]{1,60}$'`),
    check('product_slug_when_public', sql`${t.state} = 'draft' OR ${t.slug} IS NOT NULL`),
    check('product_name_he_len', sql`char_length(${t.nameHe}) BETWEEN 1 AND 120`),
    check('product_name_en_len', sql`${t.nameEn} IS NULL OR char_length(${t.nameEn}) <= 120`),
    check(
      'product_description_he_len',
      sql`${t.descriptionHe} IS NULL OR char_length(${t.descriptionHe}) <= 5000`,
    ),
    check(
      'product_description_en_len',
      sql`${t.descriptionEn} IS NULL OR char_length(${t.descriptionEn}) <= 5000`,
    ),
    check('product_price_ils_positive', sql`${t.priceIlsMinor} IS NULL OR ${t.priceIlsMinor} > 0`),
    check('product_price_usd_positive', sql`${t.priceUsdMinor} IS NULL OR ${t.priceUsdMinor} > 0`),
    index('product_state_idx').on(t.state),
  ],
);

/**
 * A piece can be in several categories (007 FR-031). A category with pieces cannot be deleted
 * (`restrict`, as `product.category_id` was); deleting a piece removes its links.
 */
export const productCategory = pgTable(
  'product_category',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.categoryId] }),
    index('product_category_category_idx').on(t.categoryId),
  ],
);

export const productImage = pgTable(
  'product_image',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    altHe: text('alt_he'),
    altEn: text('alt_en'),
    // Null once soft-deleted. UNIQUE (product_id, position) DEFERRABLE INITIALLY DEFERRED is
    // added by the custom migration.
    position: integer('position'),
    deletedAt: tstz('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [index('product_image_product_idx').on(t.productId)],
);

export const optionGroup = pgTable(
  'option_group',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'cascade' }),
    nameHe: text('name_he').notNull(),
    nameEn: text('name_en'),
    position: integer('position').notNull(),
  },
  (t) => [
    check('option_group_name_he_len', sql`char_length(${t.nameHe}) BETWEEN 1 AND 60`),
    check('option_group_name_en_len', sql`${t.nameEn} IS NULL OR char_length(${t.nameEn}) <= 60`),
    index('option_group_product_idx').on(t.productId),
  ],
);

export const optionValue = pgTable(
  'option_value',
  {
    id: id(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => optionGroup.id, { onDelete: 'cascade' }),
    labelHe: text('label_he').notNull(),
    labelEn: text('label_en'),
    deltaIlsMinor: bigint('delta_ils_minor', { mode: 'number' }).notNull().default(0),
    deltaUsdMinor: bigint('delta_usd_minor', { mode: 'number' }),
    swatch: text('swatch'),
    position: integer('position').notNull(),
  },
  (t) => [
    check('option_value_label_he_len', sql`char_length(${t.labelHe}) BETWEEN 1 AND 60`),
    check(
      'option_value_label_en_len',
      sql`${t.labelEn} IS NULL OR char_length(${t.labelEn}) <= 60`,
    ),
    check(
      'option_value_swatch',
      sql`${t.swatch} IS NULL OR ${t.swatch} IN ('white','cream','beige','brown','grey','black','red','pink','orange','yellow','green','blue')`,
    ),
    index('option_value_group_idx').on(t.groupId),
  ],
);
