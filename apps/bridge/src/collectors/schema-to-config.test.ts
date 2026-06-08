import type { IntrospectedFields } from '../cf-graphql/introspection';

import { describe, expect, it } from 'vitest';

import { OVERRIDES } from './overrides';
import { REGISTRY } from './registry';
import { MAX_FIELDS, schemaToConfig, toDatasetName } from './schema-to-config';

describe('toDatasetName', () => {
  it('converts node names to kebab-case without suffixes', () => {
    expect(toDatasetName('workersInvocationsAdaptive')).toBe('workers-invocations');
    expect(toDatasetName('d1AnalyticsAdaptiveGroups')).toBe('d1analytics');
    expect(toDatasetName('httpRequestsAdaptiveGroups')).toBe('http-requests');
    expect(toDatasetName('kvOperationsAdaptiveGroups')).toBe('kv-operations');
  });
});

const countConfigFields = (
  c: { time: { field?: string }; dimKeys: readonly string[]; resourceDimension: string; metrics: readonly unknown[] } | undefined,
): number => {
  if (c === undefined) return Infinity;
  const timeCost = c.time.field === undefined ? 0 : 1;
  const resCost = c.resourceDimension === '_all' || c.resourceDimension === '_scopeId' ? 0 : 1;
  return timeCost + c.dimKeys.length + resCost + c.metrics.length;
};

const getMetricSources = (c: ReturnType<typeof schemaToConfig>): string[] => c?.metrics.map(m => m.source) ?? [];

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

  it('caps total fields at MAX_FIELDS for large datasets', () => {
    const sumFields = Array.from({ length: 15 }, (_, i) => `sumField${String(i)}`);
    const avgFields = Array.from({ length: 10 }, (_, i) => `avgField${String(i)}`);
    const maxFields = Array.from({ length: 10 }, (_, i) => `maxField${String(i)}`);
    const quantilesFields = Array.from({ length: 5 }, (_, i) => `quantP${String(i)}`);
    const extraDims = Array.from({ length: 8 }, (_, i) => `dim${String(i)}`);

    const fields: IntrospectedFields = {
      hasCount: true,
      dimensionFields: ['datetimeMinute', 'scriptName', ...extraDims],
      metricBlocks: { sum: sumFields, avg: avgFields, max: maxFields, quantiles: quantilesFields },
    };

    const config = schemaToConfig('bigDatasetAdaptive', 'account', fields, OVERRIDES['workersInvocationsAdaptive']);
    expect(config).toBeDefined();
    expect(countConfigFields(config)).toBeLessThanOrEqual(MAX_FIELDS);
  });

  it('prioritizes metrics as count > sum > quantiles > avg > max', () => {
    const fields: IntrospectedFields = {
      hasCount: true,
      dimensionFields: ['datetimeMinute', 'scriptName'],
      metricBlocks: {
        sum: ['s0', 's1', 's2'],
        avg: ['a0', 'a1'],
        max: ['m0', 'm1'],
        quantiles: ['q0', 'q1'],
      },
    };

    const config = schemaToConfig('priorityTestAdaptive', 'account', fields, OVERRIDES['workersInvocationsAdaptive']);
    expect(config).toBeDefined();

    const sources = getMetricSources(config);
    expect(sources[0]).toBe('count');
    expect(sources.lastIndexOf('sum')).toBeLessThan(sources.indexOf('quantiles'));
    expect(sources.lastIndexOf('quantiles')).toBeLessThan(sources.indexOf('avg'));
    expect(sources.lastIndexOf('avg')).toBeLessThan(sources.indexOf('max'));
  });

  it('prioritizes metrics over dimKeys when dimensions are huge', () => {
    const extraDims = Array.from({ length: 90 }, (_, i) => `dim${String(i)}`);
    const fields: IntrospectedFields = {
      hasCount: true,
      dimensionFields: ['datetimeMinute', 'scriptName', ...extraDims],
      metricBlocks: { sum: ['requests', 'bytes'], avg: ['latency'], max: [], quantiles: ['cpuP50'] },
    };

    const config = schemaToConfig('hugeDimsAdaptive', 'account', fields, OVERRIDES['workersInvocationsAdaptive']);
    expect(config).toBeDefined();
    expect(config?.metrics.length).toBeGreaterThan(0);
    expect(countConfigFields(config)).toBeLessThanOrEqual(MAX_FIELDS);
  });

  it('does not truncate curated registry configs', () => {
    for (const registryConfig of REGISTRY) {
      expect(countConfigFields(registryConfig)).toBeLessThanOrEqual(MAX_FIELDS);
    }
  });
});
