import { describe, expect, it } from 'vitest';

import type { IntrospectedFields } from '../cf-graphql/introspection';

import { OVERRIDES } from './overrides';
import { schemaToConfig, toDatasetName } from './schema-to-config';

describe('toDatasetName', () => {
	it('converts node names to kebab-case without suffixes', () => {
		expect(toDatasetName('workersInvocationsAdaptive')).toBe('workers-invocations');
		expect(toDatasetName('d1AnalyticsAdaptiveGroups')).toBe('d1analytics');
		expect(toDatasetName('httpRequestsAdaptiveGroups')).toBe('http-requests');
		expect(toDatasetName('kvOperationsAdaptiveGroups')).toBe('kv-operations');
	});
});

describe('schemaToConfig', () => {
	it('converts workers introspected schema to DatasetConfig', () => {
		const fields: IntrospectedFields = {
			hasCount: false,
			dimensionFields: ['datetime', 'datetimeMinute', 'scriptName', 'status'],
			metricBlocks: {
				sum: ['requests', 'errors', 'subrequests', 'wallTime'],
				avg: [],
				max: [],
				quantiles: ['cpuTimeP50', 'cpuTimeP99'],
			},
		};

		const config = schemaToConfig('workersInvocationsAdaptive', 'account', fields, OVERRIDES['workersInvocationsAdaptive']);
		expect(config).toBeDefined();
		expect(config?.scope).toBe('account');
		expect(config?.time.kind).toBe('dimension');
		expect(config?.time.field).toBe('datetimeMinute');
		expect(config?.resourceDimension).toBe('scriptName');
		expect(config?.metrics).toContainEqual({ source: 'sum', field: 'requests' });
		expect(config?.metrics).toContainEqual({ source: 'quantiles', field: 'cpuTimeP50' });
	});

	it('converts d1 date-based schema', () => {
		const fields: IntrospectedFields = {
			hasCount: true,
			dimensionFields: ['date', 'databaseId'],
			metricBlocks: {
				sum: ['readQueries', 'writeQueries'],
				avg: [],
				max: [],
				quantiles: [],
			},
		};

		const config = schemaToConfig('d1AnalyticsAdaptiveGroups', 'account', fields, OVERRIDES['d1AnalyticsAdaptiveGroups']);
		expect(config?.time.kind).toBe('dateDimension');
		expect(config?.filter.kind).toBe('date');
		expect(config?.filter.filterField).toBe('date');
		expect(config?.resourceDimension).toBe('databaseId');
	});

	it('converts http-requests with extra filter override', () => {
		const fields: IntrospectedFields = {
			hasCount: true,
			dimensionFields: ['datetime', 'datetimeFiveMinutes', 'datetimeHour'],
			metricBlocks: {
				sum: ['edgeResponseBytes', 'visits'],
				avg: [],
				max: [],
				quantiles: [],
			},
		};

		const config = schemaToConfig('httpRequestsAdaptiveGroups', 'zone', fields, OVERRIDES['httpRequestsAdaptiveGroups']);
		expect(config?.time.field).toBe('datetimeFiveMinutes');
		expect(config?.filter.extraFilters).toEqual({ requestSource: '"eyeball"' });
		expect(config?.resourceDimension).toBe('_scopeId');
	});

	it('converts kv-storage max-only schema', () => {
		const fields: IntrospectedFields = {
			hasCount: false,
			dimensionFields: ['date', 'namespaceId'],
			metricBlocks: {
				sum: [],
				avg: [],
				max: ['keyCount', 'byteCount'],
				quantiles: [],
			},
		};

		const config = schemaToConfig('kvStorageAdaptiveGroups', 'account', fields, OVERRIDES['kvStorageAdaptiveGroups']);
		expect(config?.resourceDimension).toBe('namespaceId');
		expect(config?.metrics).toContainEqual({ source: 'max', field: 'keyCount' });
	});

	it('returns undefined for datasets with no metrics', () => {
		const fields: IntrospectedFields = {
			hasCount: false,
			dimensionFields: ['datetime'],
			metricBlocks: { sum: [], avg: [], max: [], quantiles: [] },
		};

		expect(schemaToConfig('emptyDataset', 'account', fields, OVERRIDES['nonexistent'])).toBeUndefined();
	});

	it('handles unknown dataset with reasonable defaults', () => {
		const fields: IntrospectedFields = {
			hasCount: true,
			dimensionFields: ['datetimeMinute', 'someField'],
			metricBlocks: {
				sum: ['bytes'],
				avg: [],
				max: [],
				quantiles: [],
			},
		};

		const config = schemaToConfig('newFutureDatasetAdaptiveGroups', 'account', fields, OVERRIDES['nonexistent']);
		expect(config?.datasetName).toBe('new-future-dataset');
		expect(config?.resourceDimension).toBe('_all');
		expect(config?.dimKeys).toContain('someField');
		expect(config?.orderBy).toBe('datetimeMinute_ASC');
	});
});
