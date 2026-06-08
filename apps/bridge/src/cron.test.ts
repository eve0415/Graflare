import type { BridgeEnv } from './env';

import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REGISTRY } from './collectors/registry';
import { BATCH_CHUNK_SIZE, collectMetrics, computeBackoff, updateSyncState } from './cron';
import { syncState } from './db/schema';

const testEnv: BridgeEnv = {
  DB: env.DB,
  CF_API_TOKEN: env.CF_API_TOKEN,
  CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
  CF_ZONE_IDS: '',
  BRIDGE_AUTH_TOKEN: 'test-token',
  BRIDGE_DEBUG: '',
};

const SCHEDULED_TIME = new Date('2026-06-05T12:05:00Z').getTime();

const ACCOUNT_RESPONSE = {
  data: {
    viewer: {
      accounts: [
        {
          workers: [
            {
              dimensions: { scriptName: 'my-worker', datetimeMinute: '2026-06-05T12:00:00Z' },
              sum: { requests: 100, errors: 0, subrequests: 10, wallTime: 500 },
              quantiles: { cpuTimeP50: 5, cpuTimeP99: 50 },
            },
          ],
          durableObjects: [],
          d1: [],
          kv: [],
          r2: [],
          kvStorage: [],
          r2Storage: [],
          stream: [],
          aiGateway: [],
          queues: [],
          streamPlayback: [],
          magicFirewall: [],
          logpushHealth: [],
          nel: [],
        },
      ],
    },
  },
};

const ZONE_RESPONSE = {
  data: {
    viewer: {
      zones: [
        {
          httpRequests: [
            {
              count: 500,
              dimensions: { datetimeFiveMinutes: '2026-06-05T12:00:00Z' },
              sum: { edgeResponseBytes: 1024000, visits: 400 },
            },
          ],
          firewallEvents: [],
          dns: [],
          loadBalancing: [],
          healthChecks: [],
        },
      ],
    },
  },
};

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const resolveUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

const mockSmartFetch = (
  opts: {
    accountResponse?: unknown;
    billingResponse?: Response;
  } = {},
) => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(input => {
    const url = resolveUrl(input);

    if (url.includes('tokens/verify')) {
      return Promise.resolve(jsonResponse({ success: true, result: { status: 'active' } }));
    }

    if (url.includes('paygo-usage')) {
      return Promise.resolve(opts.billingResponse ?? jsonResponse({ result: [] }));
    }

    return Promise.resolve(jsonResponse(opts.accountResponse ?? ACCOUNT_RESPONSE));
  });
};

const mockSmartFetchWithZones = (
  opts: {
    accountResponse?: unknown;
    zoneResponse?: unknown;
    billingResponse?: Response;
  } = {},
) => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = resolveUrl(input);

    if (url.includes('tokens/verify')) {
      return Promise.resolve(jsonResponse({ success: true, result: { status: 'active' } }));
    }

    if (url.includes('paygo-usage')) {
      return Promise.resolve(opts.billingResponse ?? jsonResponse({ result: [] }));
    }

    if (url.includes('graphql')) {
      const body = typeof init?.body === 'string' ? init.body : '';
      if (body.includes('ZoneMetrics')) {
        return Promise.resolve(jsonResponse(opts.zoneResponse ?? ZONE_RESPONSE));
      }
      return Promise.resolve(jsonResponse(opts.accountResponse ?? ACCOUNT_RESPONSE));
    }

    return Promise.resolve(jsonResponse({ data: null, errors: [{ message: 'Unexpected' }] }));
  });
};

const seedDiscoveryCache = async (nowSeconds: number) => {
  const values = REGISTRY.map(c => `('${c.nodeName}', '${c.scope}', 1, 10000, 0, ${String(nowSeconds)})`).join(', ');
  await env.DB.exec(`INSERT INTO discovery_cache (node_name, scope, is_available, max_page_size, not_older_than, last_checked_at) VALUES ${values}`);
};

describe('collectMetrics orchestrator', () => {
  beforeEach(async () => {
    await seedDiscoveryCache(Math.floor(SCHEDULED_TIME / 1000));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await env.DB.exec('DELETE FROM dataset_status');
    await env.DB.exec('DELETE FROM sync_state');
    await env.DB.exec('DELETE FROM metrics');
    await env.DB.exec('DELETE FROM discovery_cache');
    await env.DB.exec('DELETE FROM schema_cache');
  });

  it('collects account metrics and inserts rows', async () => {
    mockSmartFetch();

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const result = await env.DB.prepare('SELECT COUNT(*) as count FROM metrics WHERE dataset = ?').bind('workers').first<{ count: number }>();
    expect(result?.count).toBeGreaterThan(0);
  });

  it('updates sync state after collection', async () => {
    mockSmartFetch();

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const result = await env.DB.prepare('SELECT * FROM sync_state WHERE dataset = ?').bind('workers').first<{ dataset: string; last_sync_at: number }>();
    expect(result).toBeDefined();
    expect(result?.last_sync_at).toBe(Math.floor(SCHEDULED_TIME / 1000));
  });

  it('handles API errors gracefully without throwing', async () => {
    mockSmartFetch({
      accountResponse: { data: null, errors: [{ message: 'Internal error' }] },
    });

    await expect(collectMetrics(testEnv, SCHEDULED_TIME)).resolves.toBeUndefined();
  });

  it('handles permission errors and updates dataset status', async () => {
    mockSmartFetch({
      accountResponse: { data: null, errors: [{ message: 'You do not have permission to access this resource' }] },
    });

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const result = await env.DB.prepare('SELECT * FROM dataset_status WHERE status = ?').bind('permission_denied').all();
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('collects zone metrics when CF_ZONE_IDS is set', async () => {
    const envWithZones: BridgeEnv = { ...testEnv, CF_ZONE_IDS: 'zone-abc' };

    mockSmartFetchWithZones();

    await collectMetrics(envWithZones, SCHEDULED_TIME);

    const zoneResult = await env.DB.prepare("SELECT COUNT(*) as count FROM metrics WHERE scope = 'zone'").first<{ count: number }>();
    expect(zoneResult?.count).toBeGreaterThan(0);
  });

  it('runs retention delete even if collection fails', async () => {
    const oldTs = Math.floor(SCHEDULED_TIME / 1000) - 32 * 24 * 3600;
    await env.DB.prepare(
      "INSERT INTO metrics (ts, dataset, scope, scope_id, resource, metric_name, value, dims, dims_hash) VALUES (?, 'test', 'account', '', 'r', 'm', 1, '{}', '')",
    )
      .bind(oldTs)
      .run();

    mockSmartFetch({
      accountResponse: { data: null, errors: [{ message: 'fail' }] },
    });

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const result = await env.DB.prepare('SELECT COUNT(*) as count FROM metrics WHERE ts = ?').bind(oldTs).first<{ count: number }>();
    expect(result?.count).toBe(0);
  });

  it('handles empty data without errors', async () => {
    mockSmartFetch({
      accountResponse: {
        data: { viewer: { accounts: [{ workers: [], durableObjects: [], d1: [], kv: [], r2: [] }] } },
      },
    });

    await expect(collectMetrics(testEnv, SCHEDULED_TIME)).resolves.toBeUndefined();
  });

  it('skips billing when last sync is recent', async () => {
    await env.DB.prepare("INSERT INTO sync_state (dataset, scope, scope_id, last_sync_at) VALUES ('billing', 'account', ?, ?)")
      .bind(env.CF_ACCOUNT_ID, Math.floor(SCHEDULED_TIME / 1000) - 600)
      .run();

    mockSmartFetch();

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const fetchSpy = vi.mocked(globalThis.fetch);
    const billingCalls = fetchSpy.mock.calls.filter(([input]) => {
      const url = resolveUrl(input);
      return url.includes('paygo-usage');
    });
    expect(billingCalls).toHaveLength(0);
  });

  it('writes server_error to dataset_status on HTTP 500', async () => {
    mockSmartFetch({
      accountResponse: { data: null, errors: [{ message: 'CF API returned 500' }] },
    });

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const result = await env.DB.prepare('SELECT * FROM dataset_status WHERE status = ?').bind('server_error').all();
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('writes permission_denied to dataset_status on HTTP 403', async () => {
    mockSmartFetch({
      accountResponse: { data: null, errors: [{ message: 'CF API returned 403' }] },
    });

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const result = await env.DB.prepare('SELECT * FROM dataset_status WHERE status = ?').bind('permission_denied').all();
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('writes error to dataset_status for unknown errors', async () => {
    mockSmartFetch({
      accountResponse: { data: null, errors: [{ message: 'Something unexpected happened' }] },
    });

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const result = await env.DB.prepare('SELECT * FROM dataset_status WHERE status = ?').bind('error').all();
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('uses singleton fallback for validation errors in batch', async () => {
    mockSmartFetch({
      accountResponse: { data: null, errors: [{ message: "Cannot query field 'badField' on type 'Account'" }] },
    });

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const result = await env.DB.prepare('SELECT * FROM dataset_status WHERE status = ?').bind('validation_error').all();
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('clears dataset_status on successful sync', async () => {
    const nowSeconds = Math.floor(SCHEDULED_TIME / 1000);
    await env.DB.prepare(
      "INSERT INTO dataset_status (dataset, scope, scope_id, status, last_error, retry_after, attempt_count) VALUES ('workers', 'account', ?, 'error', 'old error', ?, 3)",
    )
      .bind(env.CF_ACCOUNT_ID, nowSeconds - 100)
      .run();

    mockSmartFetch();

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const result = await env.DB.prepare("SELECT * FROM dataset_status WHERE dataset = 'workers'").all();
    expect(result.results).toHaveLength(0);
  });

  it('uses exponential backoff for retry_after', async () => {
    mockSmartFetch({
      accountResponse: { data: null, errors: [{ message: 'Something unexpected happened' }] },
    });

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const result = await env.DB.prepare('SELECT attempt_count, retry_after FROM dataset_status WHERE status = ?')
      .bind('error')
      .first<{ attempt_count: number; retry_after: number }>();
    expect(result).toBeDefined();
    expect(result?.attempt_count).toBe(1);
    const nowSeconds = Math.floor(SCHEDULED_TIME / 1000);
    expect(result?.retry_after).toBe(nowSeconds + computeBackoff(1));
  });

  it('increments attempt_count on repeated errors', async () => {
    const nowSeconds = Math.floor(SCHEDULED_TIME / 1000);
    await env.DB.prepare(
      "INSERT INTO dataset_status (dataset, scope, scope_id, status, last_error, retry_after, attempt_count) VALUES ('workers', 'account', ?, 'error', 'old', ?, 2)",
    )
      .bind(env.CF_ACCOUNT_ID, nowSeconds - 100)
      .run();

    mockSmartFetch({
      accountResponse: { data: null, errors: [{ message: 'Something unexpected happened' }] },
    });

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const result = await env.DB.prepare("SELECT attempt_count FROM dataset_status WHERE dataset = 'workers'").first<{ attempt_count: number }>();
    expect(result?.attempt_count).toBe(3);
  });

  it('strips denied field from schema_cache instead of erroring', async () => {
    const nowSeconds = Math.floor(SCHEDULED_TIME / 1000);
    const cachedSchema = JSON.stringify({
      hasCount: true,
      dimensionFields: ['datetimeMinute', 'scriptName'],
      metricBlocks: { sum: ['requests', 'edgetimetofirstbytems'], avg: [], max: [], quantiles: [] },
    });
    await env.DB.prepare(
      "INSERT INTO schema_cache (node_name, scope, type_name, schema_json, last_checked_at) VALUES ('workersInvocationsAdaptive', 'account', 'WorkersInvocationsAdaptive', ?, ?)",
    )
      .bind(cachedSchema, nowSeconds)
      .run();

    mockSmartFetch({
      accountResponse: {
        data: {
          viewer: {
            accounts: [
              {
                workersInvocations: [],
              },
            ],
          },
        },
        errors: [
          {
            message: "does not have access to the field 'edgetimetofirstbytems'",
            path: ['viewer', 'accounts', 0, 'workersInvocations'],
          },
        ],
      },
    });

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const row = await env.DB.prepare("SELECT schema_json FROM schema_cache WHERE node_name = 'workersInvocationsAdaptive'").first<{ schema_json: string }>();
    expect(row).toBeDefined();
    expect(row?.schema_json).not.toContain('edgetimetofirstbytems');
    expect(row?.schema_json).toContain('requests');

    const statusRow = await env.DB.prepare("SELECT * FROM dataset_status WHERE dataset = 'workers-invocations' AND status = 'permission_denied'").all();
    expect(statusRow.results).toHaveLength(0);
  });
  it('strips denied field even when response data is null', async () => {
    const nowSeconds = Math.floor(SCHEDULED_TIME / 1000);
    const cachedSchema = JSON.stringify({
      hasCount: true,
      dimensionFields: ['datetimeMinute', 'scriptName'],
      metricBlocks: { sum: ['requests', 'badField'], avg: [], max: [], quantiles: [] },
    });
    await env.DB.prepare(
      "INSERT INTO schema_cache (node_name, scope, type_name, schema_json, last_checked_at) VALUES ('workersInvocationsAdaptive', 'account', 'WorkersInvocationsAdaptive', ?, ?)",
    )
      .bind(cachedSchema, nowSeconds)
      .run();

    mockSmartFetch({
      accountResponse: {
        data: null,
        errors: [{ message: "does not have access to the field 'badField'" }],
      },
    });

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const row = await env.DB.prepare("SELECT schema_json FROM schema_cache WHERE node_name = 'workersInvocationsAdaptive'").first<{ schema_json: string }>();
    expect(row).toBeDefined();
    expect(row?.schema_json).not.toContain("'badField'");
    expect(row?.schema_json).toContain('requests');
  });

  it('chunks large collector sets into multiple batches', async () => {
    const nowSeconds = Math.floor(SCHEDULED_TIME / 1000);

    const schema = JSON.stringify({
      hasCount: true,
      dimensionFields: ['datetimeMinute'],
      metricBlocks: { sum: ['requests'], avg: [], max: [], quantiles: [] },
    });
    const inserts: Promise<unknown>[] = [];
    for (let i = 0; i < 20; i++) {
      const name = `fakeDataset${String(i)}Adaptive`;
      inserts.push(
        env.DB.prepare('INSERT INTO schema_cache (node_name, scope, type_name, schema_json, last_checked_at) VALUES (?, ?, ?, ?, ?)')
          .bind(name, 'account', `FakeType${String(i)}`, schema, nowSeconds)
          .run(),
        env.DB.prepare(
          'INSERT INTO discovery_cache (node_name, scope, is_available, max_page_size, not_older_than, last_checked_at) VALUES (?, ?, 1, 10000, 0, ?)',
        )
          .bind(name, 'account', nowSeconds)
          .run(),
      );
    }
    await Promise.all(inserts);

    mockSmartFetch({
      accountResponse: {
        data: { viewer: { accounts: [{}] } },
      },
    });

    await collectMetrics(testEnv, SCHEDULED_TIME);

    const fetchSpy = vi.mocked(globalThis.fetch);
    const graphqlCalls = fetchSpy.mock.calls.filter(([input]) => {
      const url = resolveUrl(input);
      return url.includes('graphql');
    });
    expect(graphqlCalls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('computeBackoff', () => {
  it('follows exponential sequence capped at 14400', () => {
    expect(computeBackoff(0)).toBe(300);
    expect(computeBackoff(1)).toBe(600);
    expect(computeBackoff(2)).toBe(1200);
    expect(computeBackoff(3)).toBe(2400);
    expect(computeBackoff(4)).toBe(4800);
    expect(computeBackoff(5)).toBe(9600);
    expect(computeBackoff(6)).toBe(14400);
    expect(computeBackoff(7)).toBe(14400);
    expect(computeBackoff(10)).toBe(14400);
  });
});

describe('batch chunk size', () => {
  it('is 15', () => {
    expect(BATCH_CHUNK_SIZE).toBe(15);
  });

  it('ensures registry fits within chunk limit', () => {
    const accountConfigs = REGISTRY.filter(c => c.scope === 'account');
    const zoneConfigs = REGISTRY.filter(c => c.scope === 'zone');
    expect(accountConfigs.length).toBeLessThanOrEqual(BATCH_CHUNK_SIZE * 3);
    expect(zoneConfigs.length).toBeLessThanOrEqual(BATCH_CHUNK_SIZE * 3);
  });
});

describe('updateSyncState (Drizzle upsert)', () => {
  const DATASET = 'sync-persist-test';
  const SCOPE = 'account';
  const SCOPE_ID = 'acct-persist';

  const readRow = async (db: ReturnType<typeof drizzle>) =>
    db
      .select()
      .from(syncState)
      .where(and(eq(syncState.dataset, DATASET), eq(syncState.scope, SCOPE), eq(syncState.scopeId, SCOPE_ID)));

  afterEach(async () => {
    await env.DB.prepare('DELETE FROM sync_state WHERE dataset = ?').bind(DATASET).run();
  });

  it('inserts a new sync_state row when none exists', async () => {
    const db = drizzle(env.DB);

    await updateSyncState(db, DATASET, SCOPE, SCOPE_ID, 1000);

    const rows = await readRow(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastSyncAt).toBe(1000);
  });

  it('persists the updated last_sync_at on conflict', async () => {
    const db = drizzle(env.DB);

    await env.DB.prepare('INSERT INTO sync_state (dataset, scope, scope_id, last_sync_at) VALUES (?, ?, ?, ?)').bind(DATASET, SCOPE, SCOPE_ID, 1000).run();

    await updateSyncState(db, DATASET, SCOPE, SCOPE_ID, 2000);

    const rows = await readRow(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastSyncAt).toBe(2000);
  });
});
