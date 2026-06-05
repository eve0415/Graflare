import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const discoveryCache = sqliteTable(
	'discovery_cache',
	{
		nodeName: text('node_name').notNull(),
		scope: text('scope').notNull(),
		isAvailable: integer('is_available', { mode: 'boolean' }).notNull(),
		maxPageSize: integer('max_page_size').notNull().default(0),
		notOlderThan: integer('not_older_than').notNull().default(0),
		lastCheckedAt: integer('last_checked_at').notNull(),
	},
	(table) => [
		uniqueIndex('discovery_cache_pk').on(table.nodeName, table.scope),
	],
);

export const metrics = sqliteTable(
	'metrics',
	{
		ts: integer('ts').notNull(),
		dataset: text('dataset').notNull(),
		scope: text('scope').notNull().default('account'),
		scopeId: text('scope_id').notNull().default(''),
		resource: text('resource').notNull(),
		metricName: text('metric_name').notNull(),
		value: real('value').notNull(),
		dims: text('dims', { mode: 'json' }).$type<Record<string, string>>().notNull().default({}),
		dimsHash: text('dims_hash').notNull().default(''),
	},
	(table) => [
		uniqueIndex('metrics_pk').on(
			table.ts,
			table.dataset,
			table.scope,
			table.scopeId,
			table.resource,
			table.metricName,
			table.dimsHash,
		),
		index('metrics_dataset_ts').on(table.scope, table.scopeId, table.dataset, table.ts),
	],
);

export const syncState = sqliteTable(
	'sync_state',
	{
		dataset: text('dataset').notNull(),
		scope: text('scope').notNull().default('account'),
		scopeId: text('scope_id').notNull().default(''),
		lastSyncAt: integer('last_sync_at').notNull(),
	},
	(table) => [
		uniqueIndex('sync_state_pk').on(table.dataset, table.scope, table.scopeId),
	],
);

export const datasetStatus = sqliteTable(
	'dataset_status',
	{
		dataset: text('dataset').notNull(),
		scope: text('scope').notNull(),
		scopeId: text('scope_id').notNull(),
		status: text('status').notNull(),
		lastError: text('last_error').notNull().default(''),
		retryAfter: integer('retry_after').notNull().default(0),
	},
	(table) => [
		uniqueIndex('dataset_status_pk').on(table.dataset, table.scope, table.scopeId),
	],
);
