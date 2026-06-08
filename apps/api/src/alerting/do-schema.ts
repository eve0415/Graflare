import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Internal SQLite schema for the {@link AlertRuleDO} Durable Object. This is the
 * DO's own embedded storage (`ctx.storage.sql`), separate from the D1 schema in
 * `../db/schema.ts`. Columns mirror the original hand-rolled CREATE TABLE exactly.
 */
export const instances = sqliteTable('instances', {
  labelsHash: text('labels_hash').primaryKey(),
  labels: text('labels').notNull(),
  state: text('state').notNull().default('Normal'),
  value: real('value'),
  pendingSince: integer('pending_since'),
  firedAt: integer('fired_at'),
  resolvedAt: integer('resolved_at'),
  lastEvalAt: integer('last_eval_at').notNull(),
  lastNotifiedAt: integer('last_notified_at'),
});

export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
