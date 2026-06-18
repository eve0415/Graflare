import type { IntrospectedFields } from './cf-graphql/introspection';
import type { DatasetConfig } from './collectors/registry';
import type { BridgeEnv } from './env';
import type { drizzle } from 'drizzle-orm/d1';

import { sql } from 'drizzle-orm';

import { cfGraphQL } from './cf-graphql/client';
import { discoverScopeDatasets, introspectDatasetFields } from './cf-graphql/introspection';
import { OVERRIDES } from './collectors/overrides';
import { schemaToConfig } from './collectors/schema-to-config';
import { discoveryCache, schemaCache } from './db/schema';
import { parseZoneIds } from './env';
import { isRecord } from './lib/typed-access';

const SETTINGS_REFRESH_SECONDS = 24 * 3600;
const SCHEMA_REFRESH_SECONDS = 7 * 24 * 3600;

// --- Settings-based availability discovery ---

export const buildDiscoveryQuery = (nodeNames: readonly string[], scope: 'account' | 'zone'): string => {
  if (nodeNames.length === 0) return '';

  const scopeIdVar = scope === 'account' ? '$accountId' : '$zoneId';
  const filterKey = scope === 'account' ? 'accountTag' : 'zoneTag';
  const scopeNode = scope === 'account' ? 'accounts' : 'zones';

  const datasetFields = nodeNames.map(n => `${n} { enabled maxPageSize notOlderThan }`);

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
  isRecord(v) &&
  'enabled' in v &&
  typeof v.enabled === 'boolean' &&
  'maxPageSize' in v &&
  typeof v.maxPageSize === 'number' &&
  'notOlderThan' in v &&
  typeof v.notOlderThan === 'number';

const upsertDiscoveryConflictSet = {
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
      set: upsertDiscoveryConflictSet,
    });

const processSettingsScope = async (
  db: ReturnType<typeof drizzle>,
  env: BridgeEnv,
  nodeNames: readonly string[],
  scope: 'account' | 'zone',
  nowSeconds: number,
): Promise<void> => {
  const filtered = nodeNames.filter(n => n.length > 0);
  if (filtered.length === 0) return;

  const query = buildDiscoveryQuery(filtered, scope);
  if (query === '') return;

  const scopeIds = scope === 'account' ? [env.CF_ACCOUNT_ID] : parseZoneIds(env.CF_ZONE_IDS);

  const responses = await Promise.all(
    scopeIds.map(scopeId => {
      const variables: Record<string, unknown> = scope === 'account' ? { accountId: scopeId } : { zoneId: scopeId };
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

    const { settings } = first;
    if (!isRecord(settings)) continue;

    for (const nodeName of filtered) {
      const settingsData: unknown = settings[nodeName];

      if (isSettingsData(settingsData)) {
        upserts.push(upsertDiscoveryEntry(db, nodeName, scope, settingsData.enabled, settingsData.maxPageSize, settingsData.notOlderThan, nowSeconds));
      } else {
        upserts.push(upsertDiscoveryEntry(db, nodeName, scope, false, 0, 0, nowSeconds));
      }
    }
  }

  await Promise.all(upserts);
};

// --- Schema introspection ---

const upsertSchemaConflictSet = {
  typeName: sql`excluded.type_name`,
  schemaJson: sql`excluded.schema_json`,
  lastCheckedAt: sql`excluded.last_checked_at`,
};

const introspectScope = async (
  token: string,
  scope: 'account' | 'zone',
): Promise<{ nodeName: string; scope: 'account' | 'zone'; typeName: string; fields: IntrospectedFields }[]> => {
  const datasets = await discoverScopeDatasets(token, scope);
  const filterable = datasets.filter(d => d.hasFilterArg);

  const fieldResults = await Promise.all(filterable.map(d => introspectDatasetFields(token, d.typeName).then(fields => ({ ...d, scope, fields }))));

  return fieldResults.filter(r => r.fields.dimensionFields.length > 0 || r.fields.hasCount);
};

export const runSchemaDiscovery = async (db: ReturnType<typeof drizzle>, token: string): Promise<void> => {
  const nowSeconds = Math.floor(Date.now() / 1000);

  const [accountResults, zoneResults] = await Promise.all([introspectScope(token, 'account'), introspectScope(token, 'zone')]);

  const allResults = [...accountResults, ...zoneResults];

  await Promise.all(
    allResults.map(r =>
      db
        .insert(schemaCache)
        .values({
          nodeName: r.nodeName,
          scope: r.scope,
          typeName: r.typeName,
          schemaJson: JSON.stringify(r.fields),
          lastCheckedAt: nowSeconds,
        })
        .onConflictDoUpdate({
          target: [schemaCache.nodeName, schemaCache.scope],
          set: upsertSchemaConflictSet,
        }),
    ),
  );
};

// --- Combined discovery ---

export const runDiscovery = async (db: ReturnType<typeof drizzle>, env: BridgeEnv, configs: readonly DatasetConfig[]): Promise<void> => {
  const nowSeconds = Math.floor(Date.now() / 1000);

  const accountNodes = configs.filter(c => c.scope === 'account').map(c => c.nodeName);
  const zoneNodes = configs.filter(c => c.scope === 'zone').map(c => c.nodeName);

  await Promise.all([processSettingsScope(db, env, accountNodes, 'account', nowSeconds), processSettingsScope(db, env, zoneNodes, 'zone', nowSeconds)]);
};

export const getEnabledDatasets = async (db: ReturnType<typeof drizzle>, configs: readonly DatasetConfig[]): Promise<DatasetConfig[]> => {
  const cached = await db.select().from(discoveryCache);

  if (cached.length === 0) {
    return [...configs];
  }

  const known = new Set<string>();
  const available = new Set<string>();
  for (const c of cached) {
    const key = `${c.nodeName}:${c.scope}`;
    known.add(key);
    if (c.isAvailable) available.add(key);
  }

  return configs.filter(config => {
    const key = `${config.nodeName}:${config.scope}`;
    return !known.has(key) || available.has(key);
  });
};

const toStringArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((f): f is string => typeof f === 'string') : []);

export const getIntrospectedConfigs = async (db: ReturnType<typeof drizzle>): Promise<DatasetConfig[]> => {
  const rows = await db.select().from(schemaCache);
  if (rows.length === 0) return [];

  const configs: DatasetConfig[] = [];
  for (const row of rows) {
    const parsed: unknown = JSON.parse(row.schemaJson);
    if (!isRecord(parsed)) continue;
    const mb: unknown = parsed['metricBlocks'];
    const metricBlocks = isRecord(mb) ? mb : {};
    const fields: IntrospectedFields = {
      hasCount: parsed['hasCount'] === true,
      dimensionFields: toStringArray(parsed['dimensionFields']),
      metricBlocks: {
        sum: toStringArray(metricBlocks['sum']),
        avg: toStringArray(metricBlocks['avg']),
        max: toStringArray(metricBlocks['max']),
        quantiles: toStringArray(metricBlocks['quantiles']),
      },
    };
    const override = OVERRIDES[row.nodeName];
    const scope = row.scope === 'zone' ? 'zone' : 'account';
    const config = schemaToConfig(row.nodeName, scope, fields, override);
    if (config !== undefined) {
      configs.push(config);
    }
  }
  return configs;
};

// A cache is stale (discovery should run) when it's empty or its most recent entry is older than
// the refresh window. The single most-recent timestamp stands in for the whole cache.
const isCacheStale = (rows: readonly { lastCheckedAt: number }[], refreshSeconds: number, nowSeconds: number): boolean => {
  const [latest] = rows;
  if (latest === undefined) return true;
  return nowSeconds - latest.lastCheckedAt > refreshSeconds;
};

export const shouldRunSettingsDiscovery = async (db: ReturnType<typeof drizzle>, nowSeconds: number): Promise<boolean> => {
  const rows = await db.select({ lastCheckedAt: discoveryCache.lastCheckedAt }).from(discoveryCache).limit(1);
  return isCacheStale(rows, SETTINGS_REFRESH_SECONDS, nowSeconds);
};

export const shouldRunSchemaDiscovery = async (db: ReturnType<typeof drizzle>, nowSeconds: number): Promise<boolean> => {
  const rows = await db.select({ lastCheckedAt: schemaCache.lastCheckedAt }).from(schemaCache).limit(1);
  return isCacheStale(rows, SCHEMA_REFRESH_SECONDS, nowSeconds);
};
