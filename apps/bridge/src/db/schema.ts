import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const metrics = sqliteTable(
	'metrics',
	{
		ts: integer('ts').notNull(),
		dataset: text('dataset').notNull(),
		resource: text('resource').notNull(),
		metricName: text('metric_name').notNull(),
		value: real('value').notNull(),
		dims: text('dims', { mode: 'json' }).$type<Record<string, string>>().notNull().default({}),
	},
	(table) => [
		uniqueIndex('metrics_pk').on(table.ts, table.dataset, table.resource, table.metricName),
		index('metrics_dataset_ts').on(table.dataset, table.ts),
	],
);

export const syncState = sqliteTable('sync_state', {
	dataset: text('dataset').primaryKey(),
	lastSyncAt: integer('last_sync_at').notNull(),
});
