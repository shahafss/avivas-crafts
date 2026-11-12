import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt } from './_shared';

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
  // PGlite hands bytea back as a plain Uint8Array; the column type promises a Buffer.
  fromDriver: (value) => Buffer.from(value),
});

export const userRoleEnum = pgEnum('user_role', ['admin', 'user']);

export const adminUser = pgTable(
  'admin_user',
  {
    id: id(),
    displayName: text('display_name').notNull(),
    // Plain UNIQUE (not a unique index on lower(...)): the E2E fixture upserts ON CONFLICT (google_email).
    googleEmail: text('google_email').notNull().unique(),
    googleSub: text('google_sub').unique(),
    // Only `admin` may sign in or hold a working session; the owner sets it with `pnpm admin:role`.
    role: userRoleEnum('role').notNull().default('user'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('admin_user_email_lower', sql`${t.googleEmail} = lower(${t.googleEmail})`),
    check('admin_user_display_name_len', sql`char_length(${t.displayName}) BETWEEN 1 AND 60`),
  ],
);

export const adminSession = pgTable(
  'admin_session',
  {
    tokenHash: bytea('token_hash').primaryKey(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => adminUser.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    lastSeenAt: tstz('last_seen_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at').notNull(),
    userAgentSummary: text('user_agent_summary').notNull().default(''),
  },
  (t) => [
    index('admin_session_admin_idx').on(t.adminId),
    index('admin_session_expires_idx').on(t.expiresAt),
  ],
);

export const oauthFlow = pgTable('oauth_flow', {
  stateHash: bytea('state_hash').primaryKey(),
  codeVerifier: text('code_verifier').notNull(),
  nonce: text('nonce').notNull(),
  nextPath: text('next_path'),
  expiresAt: tstz('expires_at').notNull(),
  createdAt: createdAt(),
});

export const adminActivity = pgTable(
  'admin_activity',
  {
    id: id(),
    at: tstz('at').notNull().defaultNow(),
    adminId: uuid('admin_id').references(() => adminUser.id, { onDelete: 'set null' }),
    actorKind: text('actor_kind').notNull(),
    actorLabel: text('actor_label'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    details: jsonb('details')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    check(
      'admin_activity_actor_kind',
      sql`${t.actorKind} IN ('admin','unapproved_account','system')`,
    ),
    index('admin_activity_at_idx').on(t.at),
  ],
);

export const rateLimitBucket = pgTable(
  'rate_limit_bucket',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull().default(0),
    expiresAt: tstz('expires_at').notNull(),
  },
  (t) => [index('rate_limit_bucket_expires_idx').on(t.expiresAt)],
);

export const notificationThrottle = pgTable('notification_throttle', {
  kind: text('kind').primaryKey(),
  lastSentAt: tstz('last_sent_at').notNull().defaultNow(),
});
