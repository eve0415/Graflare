import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { REGISTRY } from './collectors/registry';
import { discoveryCache } from './db/schema';
import { buildDiscoveryQuery, getEnabledDatasets, runDiscovery, shouldRunSettingsDiscovery } from './discovery';
import type { BridgeEnv } from './env';

const db = drizzle(env.DB);

const testEnv: BridgeEnv = {
	DB: env.DB,
	CF_API_TOKEN: 'test-token',
	CF_ACCOUNT_ID: 'test-account',
	CF_ZONE_IDS: 'zone-1',
	BRIDGE_AUTH_TOKEN: 'test-auth',
	BRIDGE_DEBUG: '',
};

const mockDiscoveryFetch = (_input: RequestInfo | URL, init?: RequestInit) => {
	const body = typeof init?.body === 'string' ? init.body : '';
	const isAccount = body.includes('accountId');
	const payload = isAccount
		? {
			data: {
				viewer: {
					accounts: [{
						settings: {
							workersInvocationsAdaptive: { enabled: true, maxPageSize: 10000, notOlderThan: 259200 },
							durableObjectsInvocationsAdaptiveGroups: { enabled: true, maxPageSize: 5000, notOlderThan: 86400 },
							d1AnalyticsAdaptiveGroups: { enabled: false, maxPageSize: 0, notOlderThan: 0 },
							kvOperationsAdaptiveGroups: { enabled: true, maxPageSize: 10000, notOlderThan: 0 },
							r2OperationsAdaptiveGroups: { enabled: true, maxPageSize: 10000, notOlderThan: 0 },
						},
					}],
				},
			},
		}
		: {
			data: {
				viewer: {
					zones: [{
						settings: {
							httpRequestsAdaptiveGroups: { enabled: true, maxPageSize: 10000, notOlderThan: 259200 },
							firewallEventsAdaptiveGroups: { enabled: true, maxPageSize: 10000, notOlderThan: 86400 },
							dnsAnalyticsAdaptiveGroups: { enabled: false, maxPageSize: 0, notOlderThan: 0 },
						},
					}],
				},
			},
		};

	return Promise.resolve(new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	}));
};

afterEach(async () => {
	vi.restoreAllMocks();
	await env.DB.exec('DELETE FROM discovery_cache');
});

describe('buildDiscoveryQuery', () => {
	it('builds account-scoped query with settings wrapper', () => {
		const nodeNames = REGISTRY.filter((c) => c.scope === 'account').map((c) => c.nodeName);
		const query = buildDiscoveryQuery(nodeNames, 'account');
		expect(query).toContain('query Discovery($accountId: String!)');
		expect(query).toContain('accounts(filter: { accountTag: $accountId })');
		expect(query).toContain('settings {');
		expect(query).toContain('workersInvocationsAdaptive { enabled maxPageSize notOlderThan }');
	});

	it('builds zone-scoped query with settings wrapper', () => {
		const nodeNames = REGISTRY.filter((c) => c.scope === 'zone').map((c) => c.nodeName);
		const query = buildDiscoveryQuery(nodeNames, 'zone');
		expect(query).toContain('query Discovery($zoneId: String!)');
		expect(query).toContain('zones(filter: { zoneTag: $zoneId })');
		expect(query).toContain('settings {');
		expect(query).toContain('httpRequestsAdaptiveGroups { enabled maxPageSize notOlderThan }');
	});

	it('returns empty for scope with no datasets', () => {
		expect(buildDiscoveryQuery([], 'account')).toBe('');
	});
});

describe('shouldRunSettingsDiscovery', () => {
	it('returns true when cache is empty', async () => {
		expect(await shouldRunSettingsDiscovery(db, 1000000)).toBe(true);
	});

	it('returns false when cache is fresh', async () => {
		const now = 1000000;
		await db.insert(discoveryCache).values({
			nodeName: 'test',
			scope: 'account',
			isAvailable: true,
			maxPageSize: 100,
			notOlderThan: 0,
			lastCheckedAt: now - 3600,
		});
		expect(await shouldRunSettingsDiscovery(db, now)).toBe(false);
	});

	it('returns true when cache is stale', async () => {
		const now = 1000000;
		await db.insert(discoveryCache).values({
			nodeName: 'test',
			scope: 'account',
			isAvailable: true,
			maxPageSize: 100,
			notOlderThan: 0,
			lastCheckedAt: now - 100000,
		});
		expect(await shouldRunSettingsDiscovery(db, now)).toBe(true);
	});
});

describe('getEnabledDatasets', () => {
	it('returns all datasets when cache is empty (first boot)', async () => {
		const result = await getEnabledDatasets(db, REGISTRY);
		expect(result).toHaveLength(REGISTRY.length);
	});

	it('filters out unavailable datasets', async () => {
		const now = Math.floor(Date.now() / 1000);
		await db.insert(discoveryCache).values([
			{ nodeName: 'workersInvocationsAdaptive', scope: 'account', isAvailable: true, maxPageSize: 10000, notOlderThan: 0, lastCheckedAt: now },
			{ nodeName: 'd1AnalyticsAdaptiveGroups', scope: 'account', isAvailable: false, maxPageSize: 0, notOlderThan: 0, lastCheckedAt: now },
		]);

		const result = await getEnabledDatasets(db, REGISTRY);
		const names = result.map((c) => c.datasetName);
		expect(names).toContain('workers');
		expect(names).not.toContain('d1');
	});

	it('includes datasets not yet in cache', async () => {
		const now = Math.floor(Date.now() / 1000);
		await db.insert(discoveryCache).values({
			nodeName: 'workersInvocationsAdaptive',
			scope: 'account',
			isAvailable: true,
			maxPageSize: 10000,
			notOlderThan: 0,
			lastCheckedAt: now,
		});

		const result = await getEnabledDatasets(db, REGISTRY);
		const names = result.map((c) => c.datasetName);
		expect(names).toContain('d1');
		expect(names).toContain('kv');
	});
});

describe('runDiscovery', () => {
	it('populates discovery_cache from settings response', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(mockDiscoveryFetch);

		await runDiscovery(db, testEnv, REGISTRY);

		const cached = await db.select().from(discoveryCache);
		expect(cached.length).toBeGreaterThan(0);

		const workers = cached.find((c) => c.nodeName === 'workersInvocationsAdaptive');
		expect(workers?.isAvailable).toBe(true);
		expect(workers?.maxPageSize).toBe(10000);

		const d1 = cached.find((c) => c.nodeName === 'd1AnalyticsAdaptiveGroups');
		expect(d1?.isAvailable).toBe(false);
	});

	it('handles API failure gracefully', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
			Promise.resolve(new Response(JSON.stringify({ data: null, errors: [{ message: 'fail' }] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			})),
		);

		await expect(runDiscovery(db, testEnv, REGISTRY)).resolves.toBeUndefined();

		const cached = await db.select().from(discoveryCache);
		expect(cached).toHaveLength(0);
	});
});
