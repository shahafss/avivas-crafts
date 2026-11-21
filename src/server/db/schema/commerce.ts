import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUser, bytea } from './admin';
import { category, product } from './catalog';
import { createdAt, currencyEnum, id, localeEnum, tstz, updatedAt } from './_shared';

export const orderNumberSeq = pgSequence('order_number_seq', { startWith: 1001, increment: 1 });

export const deliveryMethodEnum = pgEnum('delivery_method', ['shipping', 'pickup']);
export const paymentMethodEnum = pgEnum('payment_method', ['online', 'offline']);
export const paymentStateEnum = pgEnum('payment_state', ['awaiting_payment', 'paid', 'refunded']);
export const orderStatusEnum = pgEnum('order_status', [
  'new',
  'in_preparation',
  'shipped',
  'ready_for_pickup',
  'completed',
  'cancelled',
]);
export const pendingStateEnum = pgEnum('pending_checkout_state', [
  'awaiting_provider',
  'confirmed',
  'failed',
  'switched_offline',
  'mismatch',
]);

export const shippingZone = pgTable(
  'shipping_zone',
  {
    id: id(),
    code: text('code').notNull().unique(),
    nameHe: text('name_he').notNull(),
    nameEn: text('name_en'),
    currency: currencyEnum('currency').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    shippingEnabled: boolean('shipping_enabled').notNull().default(false),
    pickupEnabled: boolean('pickup_enabled').notNull().default(false),
    shippingFeeMinor: bigint('shipping_fee_minor', { mode: 'number' }).notNull().default(0),
    freeShippingThresholdMinor: bigint('free_shipping_threshold_minor', { mode: 'number' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('shipping_zone_fee_nonneg', sql`${t.shippingFeeMinor} >= 0`),
    check(
      'shipping_zone_threshold_nonneg',
      sql`${t.freeShippingThresholdMinor} IS NULL OR ${t.freeShippingThresholdMinor} >= 0`,
    ),
  ],
);

export const shippingZoneCountry = pgTable(
  'shipping_zone_country',
  {
    countryCode: char('country_code', { length: 2 }).primaryKey(),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => shippingZone.id, { onDelete: 'cascade' }),
  },
  (t) => [index('shipping_zone_country_zone_idx').on(t.zoneId)],
);

export const shopSettings = pgTable(
  'shop_settings',
  {
    id: integer('id').primaryKey().default(1),
    onlinePaymentEnabled: boolean('online_payment_enabled').notNull().default(true),
    offlinePaymentEnabled: boolean('offline_payment_enabled').notNull().default(true),
    offlineInstructionsHe: text('offline_instructions_he'),
    offlineInstructionsEn: text('offline_instructions_en'),
    pickupInstructionsHe: text('pickup_instructions_he'),
    pickupInstructionsEn: text('pickup_instructions_en'),
    shopNameHe: text('shop_name_he').notNull(),
    shopNameEn: text('shop_name_en'),
    businessNameHe: text('business_name_he').notNull(),
    businessNameEn: text('business_name_en'),
    businessRegNumber: text('business_reg_number'),
    businessEmail: text('business_email').notNull(),
    businessPhone: text('business_phone').notNull(),
    businessAddressHe: text('business_address_he').notNull(),
    businessAddressEn: text('business_address_en'),
    notificationEmails: text('notification_emails').array().notNull(),
    // The shop's own public page addresses; null = not shown (007 FR-024).
    socialFacebookUrl: text('social_facebook_url'),
    socialInstagramUrl: text('social_instagram_url'),
    socialTiktokUrl: text('social_tiktok_url'),
    // The category the home page's row shows; null = no row (007 FR-034).
    homeCategoryId: uuid('home_category_id').references(() => category.id, {
      onDelete: 'set null',
    }),
    // The two categories the public header lists after "All pieces"; null = none (007 FR-039).
    headerCategory1Id: uuid('header_category_1_id').references(() => category.id, {
      onDelete: 'set null',
    }),
    headerCategory2Id: uuid('header_category_2_id').references(() => category.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('shop_settings_single_row', sql`${t.id} = 1`),
    check(
      'shop_settings_payment_method',
      sql`${t.onlinePaymentEnabled} OR ${t.offlinePaymentEnabled}`,
    ),
    check(
      'shop_settings_notification_emails',
      sql`cardinality(${t.notificationEmails}) BETWEEN 1 AND 3`,
    ),
    check('shop_settings_business_name_he', sql`char_length(${t.businessNameHe}) >= 1`),
    check('shop_settings_business_address_he', sql`char_length(${t.businessAddressHe}) >= 1`),
    check(
      'shop_settings_business_reg_number',
      sql`${t.businessRegNumber} IS NULL OR char_length(${t.businessRegNumber}) >= 1`,
    ),
    check('shop_settings_business_email', sql`char_length(${t.businessEmail}) >= 1`),
    check('shop_settings_business_phone', sql`char_length(${t.businessPhone}) >= 1`),
    check('shop_settings_shop_name_he', sql`char_length(${t.shopNameHe}) BETWEEN 1 AND 60`),
    check(
      'shop_settings_shop_name_en',
      sql`${t.shopNameEn} IS NULL OR char_length(${t.shopNameEn}) <= 60`,
    ),
    check(
      'shop_settings_social_facebook_url',
      sql`${t.socialFacebookUrl} IS NULL OR (${t.socialFacebookUrl} LIKE 'https://%' AND char_length(${t.socialFacebookUrl}) <= 300)`,
    ),
    check(
      'shop_settings_social_instagram_url',
      sql`${t.socialInstagramUrl} IS NULL OR (${t.socialInstagramUrl} LIKE 'https://%' AND char_length(${t.socialInstagramUrl}) <= 300)`,
    ),
    check(
      'shop_settings_social_tiktok_url',
      sql`${t.socialTiktokUrl} IS NULL OR (${t.socialTiktokUrl} LIKE 'https://%' AND char_length(${t.socialTiktokUrl}) <= 300)`,
    ),
  ],
);

export const contentPage = pgTable(
  'content_page',
  {
    slug: text('slug').primaryKey(),
    titleHe: text('title_he').notNull().default(''),
    titleEn: text('title_en'),
    bodyHe: text('body_he').notNull().default(''),
    bodyEn: text('body_en'),
    version: integer('version').notNull().default(1),
    ownerEdited: boolean('owner_edited').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'content_page_slug',
      sql`${t.slug} IN ('about','contact','privacy','terms','cookies','shipping-returns','accessibility')`,
    ),
    check('content_page_body_he_len', sql`char_length(${t.bodyHe}) <= 50000`),
    check(
      'content_page_body_en_len',
      sql`${t.bodyEn} IS NULL OR char_length(${t.bodyEn}) <= 50000`,
    ),
  ],
);

/**
 * Append-only copy of every version of the Terms and the Privacy Policy that became current
 * (003 FR-011). `orders.terms_version` / `privacy_version` refer to `(slug, version)`. No code
 * updates or deletes rows.
 */
export const contentPageVersion = pgTable(
  'content_page_version',
  {
    slug: text('slug')
      .notNull()
      .references(() => contentPage.slug, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    titleHe: text('title_he').notNull(),
    titleEn: text('title_en'),
    bodyHe: text('body_he').notNull(),
    bodyEn: text('body_en'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.slug, t.version] }),
    check('content_page_version_slug', sql`${t.slug} IN ('terms','privacy')`),
    check('content_page_version_version', sql`${t.version} >= 1`),
    check('content_page_version_body_he_len', sql`char_length(${t.bodyHe}) <= 50000`),
    check(
      'content_page_version_body_en_len',
      sql`${t.bodyEn} IS NULL OR char_length(${t.bodyEn}) <= 50000`,
    ),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: id(),
    orderNumber: integer('order_number')
      .notNull()
      .unique()
      .default(sql`nextval('order_number_seq')`),
    publicTokenHash: bytea('public_token_hash').notNull().unique(),
    publicTokenExpiresAt: tstz('public_token_expires_at').notNull(),
    locale: localeEnum('locale').notNull(),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => shippingZone.id),
    currency: currencyEnum('currency').notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone'),
    customerEmail: text('customer_email'),
    deliveryMethod: deliveryMethodEnum('delivery_method').notNull(),
    addressCountry: char('address_country', { length: 2 }),
    addressCity: text('address_city'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    addressPostalCode: text('address_postal_code'),
    note: text('note'),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    paymentState: paymentStateEnum('payment_state').notNull().default('awaiting_payment'),
    paidAt: tstz('paid_at'),
    refundedAt: tstz('refunded_at'),
    provider: text('provider'),
    providerTransactionId: text('provider_transaction_id'),
    status: orderStatusEnum('status').notNull().default('new'),
    trackingNumber: text('tracking_number'),
    pickupNote: text('pickup_note'),
    subtotalMinor: bigint('subtotal_minor', { mode: 'number' }).notNull(),
    deliveryFeeMinor: bigint('delivery_fee_minor', { mode: 'number' }).notNull().default(0),
    totalMinor: bigint('total_minor', { mode: 'number' }).notNull(),
    termsAcceptedAt: tstz('terms_accepted_at').notNull(),
    termsVersion: integer('terms_version').notNull(),
    privacyVersion: integer('privacy_version').notNull(),
    marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
    marketingOptInAt: tstz('marketing_opt_in_at'),
    marketingWithdrawnAt: tstz('marketing_withdrawn_at'),
    anonymizedAt: tstz('anonymized_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('orders_provider_transaction_unique').on(t.provider, t.providerTransactionId),
    check('orders_customer_name_len', sql`char_length(${t.customerName}) BETWEEN 2 AND 100`),
    check(
      'orders_customer_email_len',
      sql`${t.customerEmail} IS NULL OR char_length(${t.customerEmail}) <= 254`,
    ),
    check('orders_note_len', sql`${t.note} IS NULL OR char_length(${t.note}) <= 1000`),
    check(
      'orders_tracking_number_len',
      sql`${t.trackingNumber} IS NULL OR char_length(${t.trackingNumber}) <= 100`,
    ),
    check(
      'orders_pickup_note_len',
      sql`${t.pickupNote} IS NULL OR char_length(${t.pickupNote}) <= 500`,
    ),
    check(
      'orders_contact_present',
      sql`${t.anonymizedAt} IS NOT NULL OR (${t.customerEmail} IS NOT NULL AND ${t.customerPhone} IS NOT NULL)`,
    ),
    index('orders_status_idx').on(t.status),
    index('orders_created_at_idx').on(t.createdAt),
  ],
);

export const orderLine = pgTable(
  'order_line',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => product.id, { onDelete: 'set null' }),
    productNameHe: text('product_name_he').notNull(),
    productNameEn: text('product_name_en'),
    imageKey: text('image_key'),
    options: jsonb('options')
      .notNull()
      .default(sql`'[]'::jsonb`),
    prepTimeHe: text('prep_time_he'),
    prepTimeEn: text('prep_time_en'),
    unitPriceMinor: bigint('unit_price_minor', { mode: 'number' }).notNull(),
    quantity: integer('quantity').notNull(),
    lineTotalMinor: bigint('line_total_minor', { mode: 'number' }).notNull(),
  },
  (t) => [
    check('order_line_quantity', sql`${t.quantity} BETWEEN 1 AND 20`),
    index('order_line_order_idx').on(t.orderId),
  ],
);

export const orderEvent = pgTable(
  'order_event',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    adminId: uuid('admin_id').references(() => adminUser.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    data: jsonb('data')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index('order_event_order_idx').on(t.orderId)],
);

export const pendingCheckout = pgTable(
  'pending_checkout',
  {
    id: id(),
    resumeTokenHash: bytea('resume_token_hash').notNull(),
    locale: localeEnum('locale').notNull(),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => shippingZone.id),
    currency: currencyEnum('currency').notNull(),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    customerEmail: text('customer_email'),
    deliveryMethod: deliveryMethodEnum('delivery_method').notNull(),
    addressCountry: char('address_country', { length: 2 }),
    addressCity: text('address_city'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    addressPostalCode: text('address_postal_code'),
    note: text('note'),
    termsAcceptedAt: tstz('terms_accepted_at').notNull(),
    marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
    marketingOptInAt: tstz('marketing_opt_in_at'),
    termsVersion: integer('terms_version').notNull(),
    privacyVersion: integer('privacy_version').notNull(),
    lines: jsonb('lines'),
    subtotalMinor: bigint('subtotal_minor', { mode: 'number' }).notNull(),
    deliveryFeeMinor: bigint('delivery_fee_minor', { mode: 'number' }).notNull().default(0),
    totalMinor: bigint('total_minor', { mode: 'number' }).notNull(),
    provider: text('provider').notNull(),
    providerPageId: text('provider_page_id'),
    state: pendingStateEnum('state').notNull().default('awaiting_provider'),
    lastStatusCheckAt: tstz('last_status_check_at'),
    retainedUntil: tstz('retained_until'),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    expiresAt: tstz('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('pending_checkout_expires_idx').on(t.expiresAt),
    index('pending_checkout_provider_page_idx').on(t.providerPageId),
  ],
);
