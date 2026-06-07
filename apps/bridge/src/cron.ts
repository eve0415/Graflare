import { and, eq, lt, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

import { cfGraphQL, classifyError, extractDeniedField } from './cf-graphql/client';
import type { ErrorClass, GraphQLError, GraphQLResponse } from './cf-graphql/client';
import type { IntrospectedFields } from './cf-graphql/introspection';
import { buildBatchedQuery } from './cf-graphql/query-builder';
import { REST_COLLECTORS, toCollector } from './collectors/index';
import { REGISTRY } from './collectors/registry';
import type { GraphQLCollector, MetricRow, RESTCollector } from './collectors/types';
import { datasetStatus, metrics, schemaCache, syncState } from './db/schema';
import { getEnabledDatasets, getIntrospectedConfigs, runDiscovery, runSchemaDiscovery, shouldRunSchemaDiscovery, shouldRunSettingsDiscovery } from './discovery';
import { parseZoneIds } from './env';
import type { BridgeEnv } from './env';
import { isRecord } from './lib/typed-access';
import { checkTokenPermissions } from './lib/token-check';

const RETENTION_SECONDS = 31 * 24 * 3600;
const INSERT_CHUNK_SIZE = 100;
export const BATCH_CHUNK_SIZE = 15;
const BACKOFF_BASE_S = 300;
const BACKOFF_CAP_S = 14400;

export const computeBackoff = (attempts: number): number =>
	Math.min(BACKOFF_BASE_S * (2 ** attempts), BACKOFF_CAP_S);

const STATUS_LABELS: Record<ErrorClass, string> = {
	permission: 'permission_denied',
	validation: 'validation_error',
	rate_limit: 'rate_limited',
	server: 'server_error',
	unknown: 'error',
};

interface CollectResult {
	dataset: string;
	scope: 'account' | 'zone';
	scopeId: string;
	status: 'success' | 'error' | 'skipped' | 'empty' | 'field_stripped';
	rowCount: number;
	error: string;
}

interface DatasetStatusRow {
	dataset: string;
	scope: string;
	scopeId: string;
	retryAfter: number;
	attemptCount: number;
}

const isSkipped = (statuses: DatasetStatusRow[], name: string, scope: string, scopeId: string, nowSeconds: number): boolean =>
	statuses.some(
		(s) =>
			s.dataset === name
			&& s.scope === scope
			&& s.scopeId === scopeId
			&& s.retryAfter > nowSeconds,
	);

const insertMetricRows = async (db: ReturnType<typeof drizzle>, rows: MetricRow[]): Promise<void> => {
	if (rows.length === 0) return;

	const values = rows.map((r) => ({
		ts: r.ts,
		dataset: r.dataset,
		scope: r.scope,
		scopeId: r.scopeId,
		resource: r.resource,
		metricName: r.metricName,
		value: r.value,
		dims: r.dims,
		dimsHash: r.dimsHash,
	}));

	const chunks: (typeof values)[] = [];
	for (let i = 0; i < values.length; i += INSERT_CHUNK_SIZE) {
		chunks.push(values.slice(i, i + INSERT_CHUNK_SIZE));
	}

	await Promise.all(
		chunks.map((chunk) =>
			db
				.insert(metrics)
				.values(chunk)
				.onConflictDoUpdate({
					target: [
						metrics.ts,
						metrics.dataset,
						metrics.scope,
						metrics.scopeId,
						metrics.resource,
						metrics.metricName,
						metrics.dimsHash,
					],
					set: {
						value: sql`excluded.value`,
						dims: sql`excluded.dims`,
					},
				}),
		),
	);
};

const updateSyncState = async (
	db: ReturnType<typeof drizzle>,
	dataset: string,
	scope: string,
	scopeId: string,
	nowSeconds: number,
): Promise<void> => {
	await db
		.insert(syncState)
		.values({ dataset, scope, scopeId, lastSyncAt: nowSeconds })
		.onConflictDoUpdate({
			target: [syncState.dataset, syncState.scope, syncState.scopeId],
			set: { lastSyncAt: nowSeconds },
		});
};

const getAttemptCount = (
	statuses: readonly DatasetStatusRow[],
	name: string,
	scope: string,
	scopeId: string,
): number =>
	statuses.find(
		(s) => s.dataset === name && s.scope === scope && s.scopeId === scopeId,
	)?.attemptCount ?? 0;

const markDatasetStatus = async (
	db: ReturnType<typeof drizzle>,
	dataset: string,
	scope: string,
	scopeId: string,
	status: string,
	lastError: string,
	nowSeconds: number,
	attemptCount: number,
): Promise<void> => {
	const retryAfter = nowSeconds + computeBackoff(attemptCount);
	await db
		.insert(datasetStatus)
		.values({ dataset, scope, scopeId, status, lastError, retryAfter, attemptCount })
		.onConflictDoUpdate({
			target: [datasetStatus.dataset, datasetStatus.scope, datasetStatus.scopeId],
			set: { status, lastError, retryAfter, attemptCount },
		});
};

const clearDatasetStatus = async (
	db: ReturnType<typeof drizzle>,
	dataset: string,
	scope: string,
	scopeId: string,
): Promise<void> => {
	await db.delete(datasetStatus).where(
		and(
			eq(datasetStatus.dataset, dataset),
			eq(datasetStatus.scope, scope),
			eq(datasetStatus.scopeId, scopeId),
		),
	);
};

const matchErrorsToAlias = (errors: readonly GraphQLError[], alias: string): GraphQLError[] =>
	errors.filter((e) => {
		if (!e.path) return false;
		return e.path.some((segment) => segment === alias);
	});

const stripDeniedFieldFromCache = async (
	db: ReturnType<typeof drizzle>,
	nodeName: string,
	scope: string,
	fieldName: string,
): Promise<boolean> => {
	const rows = await db.select().from(schemaCache)
		.where(and(eq(schemaCache.nodeName, nodeName), eq(schemaCache.scope, scope)))
		.limit(1);

	const [row] = rows;
	if (row === undefined) return false;

	const parsed: unknown = JSON.parse(row.schemaJson);
	if (!isRecord(parsed)) return false;

	const mb: unknown = parsed['metricBlocks'];
	if (!isRecord(mb)) return false;

	const fieldLower = fieldName.toLowerCase();
	let changed = false;
	const strip = (block: unknown): string[] => {
		if (!Array.isArray(block)) return [];
		const original = block.filter((f): f is string => typeof f === 'string');
		const filtered = original.filter((f) => f.toLowerCase() !== fieldLower);
		if (filtered.length !== original.length) changed = true;
		return filtered;
	};

	const rawDims: unknown = parsed['dimensionFields'];
	const dimFields = Array.isArray(rawDims)
		? rawDims.filter((f): f is string => typeof f === 'string')
		: [];
	const newDimFields = dimFields.filter((f) => f.toLowerCase() !== fieldLower);
	if (newDimFields.length !== dimFields.length) changed = true;

	const newMetricBlocks = {
		sum: strip(mb['sum']),
		avg: strip(mb['avg']),
		max: strip(mb['max']),
		quantiles: strip(mb['quantiles']),
	};

	if (!changed) return false;

	const hasMetrics = parsed['hasCount'] === true
		|| newMetricBlocks.sum.length > 0
		|| newMetricBlocks.avg.length > 0
		|| newMetricBlocks.max.length > 0
		|| newMetricBlocks.quantiles.length > 0;

	if (!hasMetrics) return false;

	const newSchema: IntrospectedFields = {
		hasCount: parsed['hasCount'] === true,
		dimensionFields: newDimFields,
		metricBlocks: newMetricBlocks,
	};

	await db.update(schemaCache)
		.set({ schemaJson: JSON.stringify(newSchema) })
		.where(and(eq(schemaCache.nodeName, nodeName), eq(schemaCache.scope, scope)));

	return true;
};

const processCollectorResult = async (
	db: ReturnType<typeof drizzle>,
	collector: GraphQLCollector,
	scopeData: Record<string, unknown>,
	batchErrors: readonly GraphQLError[],
	scope: 'account' | 'zone',
	scopeId: string,
	nowSeconds: number,
	fromSeconds: number,
	statuses: readonly DatasetStatusRow[],
): Promise<CollectResult> => {
	const aliasErrors = matchErrorsToAlias(batchErrors, collector.alias);
	if (aliasErrors.length > 0) {
		const errClass = classifyError(aliasErrors[0] ?? { message: '' });
		if (errClass !== 'unknown') {
			const errorMsg = aliasErrors.map((e) => e.message).join('; ');

			if (errClass === 'permission') {
				const deniedField = extractDeniedField(errorMsg);
				if (deniedField !== null) {
					const stripped = await stripDeniedFieldFromCache(db, collector.nodeName, scope, deniedField);
					if (stripped) {
						return { dataset: collector.name, scope, scopeId, status: 'field_stripped', rowCount: 0, error: '' };
					}
				}
			}

			const attempts = getAttemptCount(statuses, collector.name, scope, scopeId) + 1;
			await markDatasetStatus(db, collector.name, scope, scopeId, STATUS_LABELS[errClass], errorMsg, nowSeconds, attempts);
			return { dataset: collector.name, scope, scopeId, status: 'error', rowCount: 0, error: errorMsg };
		}
	}

	const aliasData: unknown = scopeData[collector.alias];
	const rows = collector.parse(aliasData, scopeId, fromSeconds);

	if (rows.length === 0) {
		return { dataset: collector.name, scope, scopeId, status: 'empty', rowCount: 0, error: '' };
	}

	await insertMetricRows(db, rows);
	await updateSyncState(db, collector.name, scope, scopeId, nowSeconds);
	await clearDatasetStatus(db, collector.name, scope, scopeId);
	return { dataset: collector.name, scope, scopeId, status: 'success', rowCount: rows.length, error: '' };
};

const extractScopeData = (
	response: GraphQLResponse<Record<string, unknown>>,
	scopeNode: string,
): Record<string, unknown> | null => {
	const { data } = response;
	if (data === null) return null;

	const { viewer } = data;
	if (!isRecord(viewer)) return null;

	const scopeArray: unknown = viewer[scopeNode];
	if (!Array.isArray(scopeArray) || scopeArray.length === 0) return null;

	const narrowed: unknown[] = scopeArray;
	const [first] = narrowed;
	if (!isRecord(first)) return null;

	return first;
};

const processGraphQLBatch = async (
	db: ReturnType<typeof drizzle>,
	env: BridgeEnv,
	collectors: readonly GraphQLCollector[],
	scope: 'account' | 'zone',
	scopeId: string,
	fromTime: string,
	toTime: string,
	fromDate: string,
	toDate: string,
	nowSeconds: number,
	statuses: readonly DatasetStatusRow[],
): Promise<CollectResult[]> => {
	if (collectors.length === 0) return [];

	const needsTime = collectors.some((c) => c.timeVarType === 'Time');
	const needsDate = collectors.some((c) => c.timeVarType === 'Date');
	const query = buildBatchedQuery(scope, collectors);
	const variables: Record<string, unknown> = {
		...(scope === 'account' ? { accountId: scopeId } : { zoneId: scopeId }),
		...(needsTime && { fromTime, toTime }),
		...(needsDate && { fromDate, toDate }),
	};

	const response: GraphQLResponse<Record<string, unknown>> = await cfGraphQL(
		env.CF_API_TOKEN,
		query,
		variables,
		{ debug: env.BRIDGE_DEBUG !== undefined && env.BRIDGE_DEBUG !== '' },
	);

	if (response.data === null) {
		const errorMsg = response.errors?.map((e) => e.message).join('; ') ?? 'unknown error';
		const errClass = response.errors !== undefined && response.errors.length > 0
			? classifyError(response.errors[0] ?? { message: '' })
			: 'unknown' satisfies ErrorClass;

		console.error(JSON.stringify({
			level: 'error',
			event: 'batch_fetch_failed',
			scope,
			scopeId,
			errorClass: errClass,
			error: errorMsg,
		}));

		if (collectors.length > 1 && errClass !== 'rate_limit') {
			const fallback = (c: GraphQLCollector): CollectResult => ({
				dataset: c.name, scope, scopeId, status: 'error', rowCount: 0, error: errorMsg,
			});
			const singletonResults = await Promise.all(
				collectors.map((c) =>
					processGraphQLBatch(db, env, [c], scope, scopeId, fromTime, toTime, fromDate, toDate, nowSeconds, statuses)
						.then((results) => results[0] ?? fallback(c)),
				),
			);
			return singletonResults;
		}

		return Promise.all(
			collectors.map(async (c): Promise<CollectResult> => {
				try {
					if (errClass === 'permission') {
						const deniedField = extractDeniedField(errorMsg);
						if (deniedField !== null) {
							const stripped = await stripDeniedFieldFromCache(db, c.nodeName, scope, deniedField);
							if (stripped) {
								return { dataset: c.name, scope, scopeId, status: 'field_stripped', rowCount: 0, error: '' };
							}
						}
					}
					const attempts = getAttemptCount(statuses, c.name, scope, scopeId) + 1;
					await markDatasetStatus(db, c.name, scope, scopeId, STATUS_LABELS[errClass], errorMsg, nowSeconds, attempts);
				} catch { /* best-effort status update */ }
				return { dataset: c.name, scope, scopeId, status: 'error', rowCount: 0, error: errorMsg };
			}),
		);
	}

	const scopeNode = scope === 'account' ? 'accounts' : 'zones';
	const scopeData = extractScopeData(response, scopeNode);

	if (scopeData === null) {
		return collectors.map((c) => ({
			dataset: c.name,
			scope,
			scopeId,
			status: 'empty',
			rowCount: 0,
			error: '',
		}));
	}

	const batchErrors = response.errors ?? [];

	return Promise.all(
		collectors.map(async (collector) => {
			try {
				const fromSeconds = Math.floor(new Date(fromTime).getTime() / 1000);
				return await processCollectorResult(db, collector, scopeData, batchErrors, scope, scopeId, nowSeconds, fromSeconds, statuses);
			} catch (error: unknown) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				console.error(JSON.stringify({
					level: 'error',
					event: 'dataset_process_failed',
					dataset: collector.name,
					scope,
					scopeId,
					error: errorMsg,
				}));
				return { dataset: collector.name, scope, scopeId, status: 'error', rowCount: 0, error: errorMsg };
			}
		}),
	);
};

const processOneRESTCollector = async (
	db: ReturnType<typeof drizzle>,
	env: BridgeEnv,
	collector: RESTCollector,
	fromTime: string,
	toTime: string,
	nowSeconds: number,
	statuses: DatasetStatusRow[],
): Promise<CollectResult> => {
	const scopeId = env.CF_ACCOUNT_ID;

	if (isSkipped(statuses, collector.name, collector.scope, scopeId, nowSeconds)) {
		return { dataset: collector.name, scope: collector.scope, scopeId, status: 'skipped', rowCount: 0, error: '' };
	}

	const syncRows = await db
		.select()
		.from(syncState)
		.where(
			and(
				eq(syncState.dataset, collector.name),
				eq(syncState.scope, collector.scope),
				eq(syncState.scopeId, scopeId),
			),
		)
		.limit(1);

	const [lastSync] = syncRows;
	if (lastSync !== undefined && (nowSeconds - lastSync.lastSyncAt) < collector.minIntervalSeconds) {
		return { dataset: collector.name, scope: collector.scope, scopeId, status: 'skipped', rowCount: 0, error: '' };
	}

	try {
		const rows = await collector.run(env, fromTime, toTime);
		if (rows.length === 0) {
			return { dataset: collector.name, scope: collector.scope, scopeId, status: 'empty', rowCount: 0, error: '' };
		}
		await insertMetricRows(db, rows);
		await updateSyncState(db, collector.name, collector.scope, scopeId, nowSeconds);
		await clearDatasetStatus(db, collector.name, collector.scope, scopeId);
		return { dataset: collector.name, scope: collector.scope, scopeId, status: 'success', rowCount: rows.length, error: '' };
	} catch (error: unknown) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		const errClass = classifyError({ message: errorMsg });
		try {
			const attempts = getAttemptCount(statuses, collector.name, collector.scope, scopeId) + 1;
			await markDatasetStatus(db, collector.name, collector.scope, scopeId, STATUS_LABELS[errClass], errorMsg, nowSeconds, attempts);
		} catch { /* best-effort status update */ }
		console.error(JSON.stringify({
			level: 'error',
			event: 'rest_collector_failed',
			dataset: collector.name,
			errorClass: errClass,
			error: errorMsg,
		}));
		return { dataset: collector.name, scope: collector.scope, scopeId, status: 'error', rowCount: 0, error: errorMsg };
	}
};

const processRESTCollectors = async (
	db: ReturnType<typeof drizzle>,
	env: BridgeEnv,
	collectors: readonly RESTCollector[],
	fromTime: string,
	toTime: string,
	nowSeconds: number,
	statuses: DatasetStatusRow[],
): Promise<CollectResult[]> =>
	Promise.all(
		collectors.map((c) => processOneRESTCollector(db, env, c, fromTime, toTime, nowSeconds, statuses)),
	);

const getSyncStateTime = async (
	db: ReturnType<typeof drizzle>,
	dataset: string,
	scope: string,
	scopeId: string,
	defaultTime: number,
): Promise<number> => {
	const rows = await db
		.select()
		.from(syncState)
		.where(
			and(
				eq(syncState.dataset, dataset),
				eq(syncState.scope, scope),
				eq(syncState.scopeId, scopeId),
			),
		)
		.limit(1);
	const [row] = rows;
	return row === undefined ? defaultTime : row.lastSyncAt;
};

const buildTimeVars = async (
	db: ReturnType<typeof drizzle>,
	collectors: readonly GraphQLCollector[],
	scope: string,
	scopeId: string,
	nowSeconds: number,
	toTime: string,
): Promise<{ fromTime: string; toTime: string; fromDate: string; toDate: string }> => {
	const defaultTime = nowSeconds - 86400;
	const syncs = await Promise.all(
		collectors.map((c) => getSyncStateTime(db, c.name, scope, scopeId, defaultTime)),
	);
	const earliest = Math.min(...syncs);
	const ft = new Date(earliest * 1000).toISOString();
	return { fromTime: ft, toTime, fromDate: ft.slice(0, 10), toDate: toTime.slice(0, 10) };
};

export const collectMetrics = async (env: BridgeEnv, scheduledTime: number): Promise<void> => {
	const start = Date.now();
	const nowSeconds = Math.floor(scheduledTime / 1000);

	console.log(JSON.stringify({
		level: 'info',
		event: 'cron_start',
		scheduledTime: new Date(scheduledTime).toISOString(),
	}));

	const db = drizzle(env.DB);
	const zoneIds = parseZoneIds(env.CF_ZONE_IDS);

	const syncRows = await db.select().from(syncState).limit(1);
	if (syncRows.length === 0) {
		const tokenCheck = await checkTokenPermissions(env.CF_API_TOKEN);
		if (!tokenCheck.valid || tokenCheck.missingPermissions.length > 0) {
			for (const perm of tokenCheck.missingPermissions) {
				console.error(JSON.stringify({
					level: 'error',
					event: 'token_permission_missing',
					permission: perm,
					help: 'Create an API token at https://dash.cloudflare.com/profile/api-tokens with the listed permissions, then update CF_API_TOKEN secret.',
				}));
			}
			if (!tokenCheck.valid) return;
		}
	}

	if (await shouldRunSchemaDiscovery(db, nowSeconds)) {
		try {
			await runSchemaDiscovery(db, env.CF_API_TOKEN);
			console.log(JSON.stringify({ level: 'info', event: 'schema_discovery_complete' }));
		} catch (error: unknown) {
			console.error(JSON.stringify({
				level: 'warn',
				event: 'schema_discovery_failed',
				error: error instanceof Error ? error.message : String(error),
			}));
		}
	}

	const introspectedConfigs = await getIntrospectedConfigs(db);
	const allConfigs = introspectedConfigs.length > 0 ? introspectedConfigs : REGISTRY;

	if (await shouldRunSettingsDiscovery(db, nowSeconds)) {
		try {
			await runDiscovery(db, env, allConfigs);
		} catch (error: unknown) {
			console.error(JSON.stringify({
				level: 'warn',
				event: 'settings_discovery_failed',
				error: error instanceof Error ? error.message : String(error),
			}));
		}
	}

	const enabledDatasets = await getEnabledDatasets(db, allConfigs);
	const accountCollectors = enabledDatasets.filter((c) => c.scope === 'account').map((c) => toCollector(c));
	const zoneCollectors = enabledDatasets.filter((c) => c.scope === 'zone').map((c) => toCollector(c));

	const statuses: DatasetStatusRow[] = await db.select().from(datasetStatus);

	const activeAccountCollectors = accountCollectors.filter(
		(c) => !isSkipped(statuses, c.name, 'account', env.CF_ACCOUNT_ID, nowSeconds),
	);
	const activeZoneCollectors = zoneCollectors.filter(
		(c) => !zoneIds.every((zid) => isSkipped(statuses, c.name, 'zone', zid, nowSeconds)),
	);

	const toTime = new Date(scheduledTime).toISOString();

	const tasks: Promise<CollectResult[]>[] = [];

	for (let i = 0; i < activeAccountCollectors.length; i += BATCH_CHUNK_SIZE) {
		const chunk = activeAccountCollectors.slice(i, i + BATCH_CHUNK_SIZE);
		tasks.push(
			(async () => {
				const tv = await buildTimeVars(db, chunk, 'account', env.CF_ACCOUNT_ID, nowSeconds, toTime);
				return processGraphQLBatch(db, env, chunk, 'account', env.CF_ACCOUNT_ID, tv.fromTime, tv.toTime, tv.fromDate, tv.toDate, nowSeconds, statuses);
			})(),
		);
	}

	for (const zid of zoneIds) {
		const perZone = activeZoneCollectors.filter(
			(c) => !isSkipped(statuses, c.name, 'zone', zid, nowSeconds),
		);
		for (let i = 0; i < perZone.length; i += BATCH_CHUNK_SIZE) {
			const chunk = perZone.slice(i, i + BATCH_CHUNK_SIZE);
			tasks.push(
				(async () => {
					const tv = await buildTimeVars(db, chunk, 'zone', zid, nowSeconds, toTime);
					return processGraphQLBatch(db, env, chunk, 'zone', zid, tv.fromTime, tv.toTime, tv.fromDate, tv.toDate, nowSeconds, statuses);
				})(),
			);
		}
	}

	if (REST_COLLECTORS.length > 0) {
		const fromTime = new Date((nowSeconds - 86400) * 1000).toISOString();
		tasks.push(processRESTCollectors(db, env, REST_COLLECTORS, fromTime, toTime, nowSeconds, statuses));
	}

	const batchResults = await Promise.allSettled(tasks);

	const outcomes: CollectResult[] = [];
	for (const r of batchResults) {
		if (r.status === 'fulfilled') {
			outcomes.push(...r.value);
		} else {
			console.error(JSON.stringify({
				level: 'error',
				event: 'batch_failed',
				error: r.reason instanceof Error ? r.reason.message : String(r.reason),
			}));
		}
	}

	try {
		const cutoff = nowSeconds - RETENTION_SECONDS;
		await db.delete(metrics).where(lt(metrics.ts, cutoff));
	} catch (error: unknown) {
		console.error(JSON.stringify({
			level: 'error',
			event: 'retention_delete_failed',
			error: error instanceof Error ? error.message : String(error),
		}));
	}

	console.log(JSON.stringify({
		level: 'info',
		event: 'cron_end',
		durationMs: Date.now() - start,
		outcomes,
	}));
};
