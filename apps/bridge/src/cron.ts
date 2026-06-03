import { eq, lt, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

import { cfGraphQL } from './cf-graphql/client';
import type { MetricRow, WorkersData } from './cf-graphql/queries';
import { WORKERS_QUERY, parseWorkersResponse } from './cf-graphql/queries';
import { metrics, syncState } from './db/schema';

interface Env {
	DB: D1Database;
	CF_API_TOKEN: string;
	CF_ACCOUNT_ID: string;
}

const RETENTION_SECONDS = 31 * 24 * 3600;

interface DatasetConfig {
	name: string;
	query: string;
	parser: (data: WorkersData) => MetricRow[];
}

const DATASETS: DatasetConfig[] = [
	{ name: 'workers', query: WORKERS_QUERY, parser: parseWorkersResponse },
];

const collectDataset = async (
	env: Env,
	dataset: DatasetConfig,
	scheduledTime: number,
): Promise<void> => {
	const db = drizzle(env.DB);

	const syncRows = await db
		.select()
		.from(syncState)
		.where(eq(syncState.dataset, dataset.name))
		.limit(1);

	const [syncRow] = syncRows;
	const lastSyncAt = syncRow === undefined
		? Math.floor(scheduledTime / 1000) - 86400
		: syncRow.lastSyncAt;

	const from = new Date(lastSyncAt * 1000).toISOString();
	const to = new Date(scheduledTime).toISOString();

	const response = await cfGraphQL<WorkersData>(
		env.CF_API_TOKEN,
		dataset.query,
		{ accountId: env.CF_ACCOUNT_ID, from, to },
	);

	if (response.data === null) return;

	const rows: MetricRow[] = dataset.parser(response.data);
	if (rows.length === 0) return;

	await db
		.insert(metrics)
		.values(
			rows.map((r) => ({
				ts: r.ts,
				dataset: r.dataset,
				resource: r.resource,
				metricName: r.metricName,
				value: r.value,
				dims: r.dims,
			})),
		)
		.onConflictDoUpdate({
			target: [metrics.ts, metrics.dataset, metrics.resource, metrics.metricName],
			set: {
				value: sql`excluded.value`,
				dims: sql`excluded.dims`,
			},
		});

	const nowSeconds = Math.floor(scheduledTime / 1000);
	await db
		.insert(syncState)
		.values({ dataset: dataset.name, lastSyncAt: nowSeconds })
		.onConflictDoUpdate({
			target: syncState.dataset,
			set: { lastSyncAt: nowSeconds },
		});
};

export const collectMetrics = async (env: Env, scheduledTime: number): Promise<void> => {
	const db = drizzle(env.DB);

	await Promise.all(
		DATASETS.map((dataset) => collectDataset(env, dataset, scheduledTime)),
	);

	const cutoff = Math.floor(scheduledTime / 1000) - RETENTION_SECONDS;
	await db.delete(metrics).where(lt(metrics.ts, cutoff));
};
