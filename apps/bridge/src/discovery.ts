import { sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/d1';

import { cfGraphQL } from './cf-graphql/client';
import type { DatasetConfig } from './collectors/registry';
import { discoveryCache } from './db/schema';
import type { BridgeEnv } from './env';
import { isRecord } from './lib/typed-access';

const DISCOVERY_REFRESH_SECONDS = 24 * 3600;

export const buildDiscoveryQuery = (
	registry: readonly DatasetConfig[],
	scope: 'account' | 'zone',
): string => {
	const filtered = registry.filter((c) => c.scope === scope);
	if (filtered.length === 0) return '';

	const scopeIdVar = scope === 'account' ? '$accountId' : '$zoneId';
	const filterKey = scope === 'account' ? 'accountTag' : 'zoneTag';
	const scopeNode = scope === 'account' ? 'accounts' : 'zones';

	const datasetFields = filtered.map((c) =>
		`${c.nodeName} { enabled maxPageSize notOlderThan }`,
	);

	return `query Discovery(${scopeIdVar}: String!) {
  viewer {
    ${scopeNode}(filter: { ${filterKey}: ${scopeIdVar} }) {
      settings {
        ${datasetFields.join('\n        ')}
      }
    }
  }
}`;
};

interface SettingsData {
	enabled: boolean;
	maxPageSize: number;
	notOlderThan: number;
}

const isSettingsData = (v: unknown): v is SettingsData =>
	isRecord(v)
	&& 'enabled' in v
	&& typeof v.enabled === 'boolean'
	&& 'maxPageSize' in v
	&& typeof v.maxPageSize === 'number'
	&& 'notOlderThan' in v
	&& typeof v.notOlderThan === 'number';

const upsertConflictSet = {
	isAvailable: sql`excluded.is_available`,
	maxPageSize: sql`excluded.max_page_size`,
	notOlderThan: sql`excluded.not_older_than`,
	lastCheckedAt: sql`excluded.last_checked_at`,
};

const upsertDiscoveryEntry = (
	db: ReturnType<typeof drizzle>,
	nodeName: string,
	scope: string,
	isAvailable: boolean,
	maxPageSize: number,
	notOlderThan: number,
	lastCheckedAt: number,
) =>
	db
		.insert(discoveryCache)
		.values({ nodeName, scope, isAvailable, maxPageSize, notOlderThan, lastCheckedAt })
		.onConflictDoUpdate({
			target: [discoveryCache.nodeName, discoveryCache.scope],
			set: upsertConflictSet,
		});

const processDiscoveryScope = async (
	db: ReturnType<typeof drizzle>,
	env: BridgeEnv,
	registry: readonly DatasetConfig[],
	scope: 'account' | 'zone',
	nowSeconds: number,
): Promise<void> => {
	const scopedConfigs = registry.filter((c) => c.scope === scope);
	if (scopedConfigs.length === 0) return;

	const query = buildDiscoveryQuery(registry, scope);
	if (query === '') return;

	const scopeIds = scope === 'account'
		? [env.CF_ACCOUNT_ID]
		: env.CF_ZONE_IDS.split(',').map((z) => z.trim()).filter((z) => z.length > 0);

	const responses = await Promise.all(
		scopeIds.map((scopeId) => {
			const variables: Record<string, unknown> = scope === 'account'
				? { accountId: scopeId }
				: { zoneId: scopeId };
			return cfGraphQL<Record<string, unknown>>(env.CF_API_TOKEN, query, variables);
		}),
	);

	const upserts: ReturnType<typeof upsertDiscoveryEntry>[] = [];

	for (const response of responses) {
		if (response.data === null) continue;

		const { viewer } = response.data;
		if (!isRecord(viewer)) continue;

		const scopeNode = scope === 'account' ? 'accounts' : 'zones';
		const scopeArray: unknown = viewer[scopeNode];
		if (!Array.isArray(scopeArray) || scopeArray.length === 0) continue;

		const narrowed: unknown[] = scopeArray;
		const [first] = narrowed;
		if (!isRecord(first)) continue;

		const {settings} = first;
		if (!isRecord(settings)) continue;

		for (const config of scopedConfigs) {
			const settingsData: unknown = settings[config.nodeName];

			if (isSettingsData(settingsData)) {
				upserts.push(upsertDiscoveryEntry(
					db, config.nodeName, scope,
					settingsData.enabled, settingsData.maxPageSize, settingsData.notOlderThan,
					nowSeconds,
				));
			} else {
				upserts.push(upsertDiscoveryEntry(
					db, config.nodeName, scope,
					false, 0, 0, nowSeconds,
				));
			}
		}
	}

	await Promise.all(upserts);
};

export const runDiscovery = async (
	db: ReturnType<typeof drizzle>,
	env: BridgeEnv,
	registry: readonly DatasetConfig[],
): Promise<void> => {
	const nowSeconds = Math.floor(Date.now() / 1000);
	await Promise.all([
		processDiscoveryScope(db, env, registry, 'account', nowSeconds),
		processDiscoveryScope(db, env, registry, 'zone', nowSeconds),
	]);
};

export const getEnabledDatasets = async (
	db: ReturnType<typeof drizzle>,
	registry: readonly DatasetConfig[],
): Promise<DatasetConfig[]> => {
	const cached = await db.select().from(discoveryCache);

	if (cached.length === 0) {
		return [...registry];
	}

	const available = new Set(
		cached
			.filter((c) => c.isAvailable)
			.map((c) => `${c.nodeName}:${c.scope}`),
	);

	return registry.filter((config) => {
		const entry = cached.find((c) => c.nodeName === config.nodeName && c.scope === config.scope);
		if (entry === undefined) return true;
		return available.has(`${config.nodeName}:${config.scope}`);
	});
};

export const shouldRunDiscovery = async (
	db: ReturnType<typeof drizzle>,
	nowSeconds: number,
): Promise<boolean> => {
	const rows = await db
		.select({ lastCheckedAt: discoveryCache.lastCheckedAt })
		.from(discoveryCache)
		.limit(1);

	if (rows.length === 0) return true;

	const [latest] = rows;
	if (latest === undefined) return true;

	return (nowSeconds - latest.lastCheckedAt) > DISCOVERY_REFRESH_SECONDS;
};
