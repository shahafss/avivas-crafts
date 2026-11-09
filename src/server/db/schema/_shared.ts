import { sql } from 'drizzle-orm';
import { pgEnum, timestamp, uuid } from 'drizzle-orm/pg-core';

export const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const currencyEnum = pgEnum('currency', ['ILS', 'USD']);
export const localeEnum = pgEnum('locale', ['he', 'en']);
