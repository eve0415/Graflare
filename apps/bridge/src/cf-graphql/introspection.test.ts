import { afterEach, describe, expect, it, vi } from 'vitest';

import { discoverScopeDatasets, introspectDatasetFields } from './introspection';

const mockFetch = (responses: Record<string, unknown>) => {
	vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
		const body = typeof init?.body === 'string' ? init.body : '';
		for (const [key, value] of Object.entries(responses)) {
			if (body.includes(key)) {
				return Promise.resolve(new Response(JSON.stringify(value), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}));
			}
		}
		return Promise.resolve(new Response(JSON.stringify({ data: null }), { status: 200 }));
	});
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe('discoverScopeDatasets', () => {
	it('discovers dataset nodes from account scope', async () => {
		mockFetch({
			'account': {
				data: {
					__type: {
						fields: [
							{
								name: 'workersInvocationsAdaptive',
								isDeprecated: false,
								args: [{ name: 'filter' }, { name: 'limit' }],
								type: { name: null, kind: 'NON_NULL', ofType: { name: null, kind: 'LIST', ofType: { name: null, kind: 'NON_NULL', ofType: { name: 'AccountWorkersInvocationsAdaptive', kind: 'OBJECT' } } } },
							},
							{
								name: 'accountTag',
								isDeprecated: false,
								args: [],
								type: { name: 'string', kind: 'SCALAR', ofType: null },
							},
							{
								name: 'settings',
								isDeprecated: false,
								args: [],
								type: { name: 'AccountSettings', kind: 'OBJECT', ofType: null },
							},
							{
								name: 'oldDataset',
								isDeprecated: true,
								args: [{ name: 'filter' }],
								type: { name: null, kind: 'NON_NULL', ofType: { name: null, kind: 'LIST', ofType: { name: null, kind: 'NON_NULL', ofType: { name: 'OldType', kind: 'OBJECT' } } } },
							},
						],
					},
				},
			},
		});

		const datasets = await discoverScopeDatasets('test-token', 'account');
		expect(datasets).toHaveLength(1);
		expect(datasets[0]?.nodeName).toBe('workersInvocationsAdaptive');
		expect(datasets[0]?.typeName).toBe('AccountWorkersInvocationsAdaptive');
		expect(datasets[0]?.hasFilterArg).toBe(true);
	});

	it('returns empty for failed response', async () => {
		mockFetch({});
		const datasets = await discoverScopeDatasets('test-token', 'account');
		expect(datasets).toEqual([]);
	});
});

describe('introspectDatasetFields', () => {
	it('discovers dimensions, sum, max, and count fields', async () => {
		mockFetch({
			'AccountD1AnalyticsAdaptiveGroups': {
				data: {
					root: {
						fields: [
							{ name: 'count', type: { name: 'uint64', kind: 'SCALAR' } },
							{ name: 'dimensions', type: { name: 'AccountD1Dims', kind: 'OBJECT' } },
							{ name: 'sum', type: { name: 'AccountD1Sum', kind: 'OBJECT' } },
						],
					},
					dimensions: {
						fields: [
							{ name: 'date' },
							{ name: 'databaseId' },
						],
					},
					sum: {
						fields: [
							{ name: 'readQueries' },
							{ name: 'writeQueries' },
						],
					},
					avg: null,
					max: null,
					quantiles: null,
				},
			},
		});

		const result = await introspectDatasetFields('test-token', 'AccountD1AnalyticsAdaptiveGroups');
		expect(result.hasCount).toBe(true);
		expect(result.dimensionFields).toContain('date');
		expect(result.dimensionFields).toContain('databaseId');
		expect(result.metricBlocks.sum).toContain('readQueries');
		expect(result.metricBlocks.sum).toContain('writeQueries');
		expect(result.metricBlocks.max).toEqual([]);
	});

	it('discovers max-only datasets', async () => {
		mockFetch({
			'AccountKvStorageAdaptiveGroups': {
				data: {
					root: {
						fields: [
							{ name: 'dimensions', type: { name: 'KvDims', kind: 'OBJECT' } },
							{ name: 'max', type: { name: 'KvMax', kind: 'OBJECT' } },
						],
					},
					dimensions: { fields: [{ name: 'date' }, { name: 'namespaceId' }] },
					max: { fields: [{ name: 'keyCount' }, { name: 'byteCount' }] },
					sum: null,
					avg: null,
					quantiles: null,
				},
			},
		});

		const result = await introspectDatasetFields('test-token', 'AccountKvStorageAdaptiveGroups');
		expect(result.hasCount).toBe(false);
		expect(result.metricBlocks.max).toContain('keyCount');
		expect(result.metricBlocks.max).toContain('byteCount');
		expect(result.metricBlocks.sum).toEqual([]);
	});

	it('returns empty for failed response', async () => {
		mockFetch({});
		const result = await introspectDatasetFields('test-token', 'Unknown');
		expect(result.hasCount).toBe(false);
		expect(result.dimensionFields).toEqual([]);
	});
});
