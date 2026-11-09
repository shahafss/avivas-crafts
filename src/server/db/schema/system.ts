import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, localeEnum, tstz } from './_shared';
import { orders } from './commerce';

export const outboxStatusEnum = pgEnum('outbox_status', ['pending', 'sending', 'sent', 'failed']);

export const consentRecord = pgTable('consent_record', {
  id: id(),
  choices: jsonb('choices')
    .notNull()
    .default(sql`'{}'::jsonb`),
  policyVersion: integer('policy_version').notNull(),
  decidedAt: tstz('decided_at').notNull().defaultNow(),
});

export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: id(),
    kind: text('kind').notNull(),
    toAddress: text('to_address').notNull(),
    locale: localeEnum('locale').notNull(),
    subject: text('subject').notNull(),
    replyTo: text('reply_to'),
    html: text('html').notNull().default(''),
    textBody: text('text_body').notNull().default(''),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    dedupeKey: text('dedupe_key').notNull().unique(),
    status: outboxStatusEnum('status').notNull().default('pending'),
    lockedUntil: tstz('locked_until'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: tstz('next_attempt_at').notNull().defaultNow(),
    sentAt: tstz('sent_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('email_outbox_due_idx').on(t.status, t.nextAttemptAt),
    index('email_outbox_order_idx').on(t.orderId),
  ],
);

export const analyticsDailyPage = pgTable(
  'analytics_daily_page',
  {
    day: date('day').notNull(),
    path: text('path').notNull(),
    views: integer('views').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.path] }),
    check('analytics_page_views', sql`${t.views} >= 0`),
  ],
);

export const analyticsDailyReferrer = pgTable(
  'analytics_daily_referrer',
  {
    day: date('day').notNull(),
    referrerHost: text('referrer_host').notNull(),
    visits: integer('visits').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.referrerHost] }),
    check('analytics_referrer_visits', sql`${t.visits} >= 0`),
  ],
);

export const jobRun = pgTable('job_run', {
  job: text('job').primaryKey(),
  lastStartedAt: tstz('last_started_at'),
  lastFinishedAt: tstz('last_finished_at'),
  lastResult: text('last_result'),
  lockedUntil: tstz('locked_until'),
});
