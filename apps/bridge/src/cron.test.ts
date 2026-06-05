import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REGISTRY } from './collectors/registry';
import type { BridgeEnv } from './env';

import { collectMetrics } from './cron';

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
			accounts: [{
				workers: [{
					dimensions: { scriptName: 'my-worker', datetimeMinute: '2026-06-05T12:00:00Z' },
					sum: { requests: 100, errors: 0, subrequests: 10, wallTime: 500 },
					quantiles: { cpuTimeP50: 5, cpuTimeP99: 50 },
				}],
				durableObjects: [],
				d1: [],
				kv: [],
				r2: [],
				kvStorage: [],
				r2Storage: [],
				stream: [],
				aiGateway: [],
				ddosAttacks: [],
				queues: [],
				workersSubrequests: [],
				streamPlayback: [],
				magicTransit: [],
				magicFirewall: [],
				logpushHealth: [],
			}],
		},
	},
};

const ZONE_RESPONSE = {
	data: {
		viewer: {
			zones: [{
				httpRequests: [{
					count: 500,
					dimensions: { datetimeFiveMinutes: '2026-06-05T12:00:00Z' },
					sum: { edgeResponseBytes: 1024000, visits: 400 },
				}],
				firewallEvents: [],
				dns: [],
				loadBalancing: [],
				healthChecks: [],
				spectrum: [],
				nel: [],
			}],
		},
	},
};

const jsonResponse = (body: unknown) =>
	new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const resolveUrl = (input: RequestInfo | URL): string => {
	if (typeof input === 'string') return input;
	if (input instanceof URL) return input.href;
	return input.url;
};

const mockSmartFetch = (opts: {
	accountResponse?: unknown;
	billingResponse?: Response;
} = {}) => {
	vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
		const url = resolveUrl(input);

		if (url.includes('paygo-usage')) {
			return Promise.resolve(opts.billingResponse ?? jsonResponse({ result: [] }));
		}

		return Promise.resolve(jsonResponse(opts.accountResponse ?? ACCOUNT_RESPONSE));
	});
};

const mockSmartFetchWithZones = (opts: {
	accountResponse?: unknown;
	zoneResponse?: unknown;
	billingResponse?: Response;
} = {}) => {
	vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
		const url = resolveUrl(input);

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
	const values = REGISTRY.map((c) =>
		`('${c.nodeName}', '${c.scope}', 1, 10000, 0, ${String(nowSeconds)})`,
	).join(', ');
	await env.DB.exec(
		`INSERT INTO discovery_cache (node_name, scope, is_available, max_page_size, not_older_than, last_checked_at) VALUES ${values}`,
	);
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
		).bind(oldTs).run();

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
		await env.DB.prepare(
			"INSERT INTO sync_state (dataset, scope, scope_id, last_sync_at) VALUES ('billing', 'account', ?, ?)",
		).bind(env.CF_ACCOUNT_ID, Math.floor(SCHEDULED_TIME / 1000) - 600).run();

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
});
