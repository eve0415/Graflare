import { describe, expect, it } from 'vitest';

import { parseDataset } from './generic-parser';
import { REGISTRY } from './registry';

const findConfig = (name: string) => {
  const config = REGISTRY.find(c => c.datasetName === name);
  if (config === undefined) throw new Error(`Dataset ${name} not found in registry`);
  return config;
};

const ACCOUNT_ID = 'test-account-123';
const ZONE_ID = 'test-zone-abc';
const FROM_SECONDS = 1780732800;

describe('generic parser parity', () => {
  describe('workers', () => {
    const config = findConfig('workers');

    it('parses a normal response with multiple scripts', () => {
      const data = [
        {
          dimensions: { scriptName: 'api-worker', datetimeMinute: '2026-06-05T12:00:00Z' },
          sum: { requests: 100, errors: 2, subrequests: 50, wallTime: 5000 },
          quantiles: { cpuTimeP50: 10, cpuTimeP99: 100 },
        },
        {
          dimensions: { scriptName: 'web-worker', datetimeMinute: '2026-06-05T12:00:00Z' },
          sum: { requests: 200, errors: 0, subrequests: 10, wallTime: 3000 },
          quantiles: { cpuTimeP50: 5, cpuTimeP99: 50 },
        },
      ];

      const rows = parseDataset(config, data, ACCOUNT_ID, 0);
      expect(rows).toHaveLength(12);

      const apiRows = rows.filter(r => r.resource === 'api-worker');
      expect(apiRows).toHaveLength(6);

      expect(rows).toContainEqual(
        expect.objectContaining({
          resource: 'api-worker',
          metricName: 'requests',
          value: 100,
          scope: 'account',
          scopeId: ACCOUNT_ID,
          dataset: 'workers',
        }),
      );

      expect(rows).toContainEqual(
        expect.objectContaining({
          resource: 'api-worker',
          metricName: 'errors',
          value: 2,
        }),
      );

      expect(rows).toContainEqual(
        expect.objectContaining({
          resource: 'api-worker',
          metricName: 'cpuTimeP99',
          value: 100,
        }),
      );
    });

    it('returns empty array for empty/non-array', () => {
      expect(parseDataset(config, [], ACCOUNT_ID, 0)).toEqual([]);
      expect(parseDataset(config, null, ACCOUNT_ID, 0)).toEqual([]);
      expect(parseDataset(config, undefined, ACCOUNT_ID, 0)).toEqual([]);
    });

    it('skips invalid nodes', () => {
      const data = [
        {
          dimensions: { scriptName: 'valid', datetimeMinute: '2026-06-05T12:00:00Z' },
          sum: { requests: 1, errors: 0, subrequests: 0, wallTime: 0 },
          quantiles: { cpuTimeP50: 0, cpuTimeP99: 0 },
        },
        { invalid: true },
        null,
      ];
      const rows = parseDataset(config, data, ACCOUNT_ID, 0);
      expect(rows).toHaveLength(6);
      expect(rows[0]?.resource).toBe('valid');
    });

    it('converts datetimeMinute to epoch seconds', () => {
      const data = [
        {
          dimensions: { scriptName: 'w', datetimeMinute: '2026-06-05T12:30:00Z' },
          sum: { requests: 1, errors: 0, subrequests: 0, wallTime: 0 },
          quantiles: { cpuTimeP50: 0, cpuTimeP99: 0 },
        },
      ];
      const rows = parseDataset(config, data, ACCOUNT_ID, 0);
      const expectedTs = Math.floor(new Date('2026-06-05T12:30:00Z').getTime() / 1000);
      expect(rows[0]?.ts).toBe(expectedTs);
    });

    it('produces consistent dimsHash', () => {
      const data = [
        {
          dimensions: { scriptName: 'worker-a', datetimeMinute: '2026-06-05T12:00:00Z' },
          sum: { requests: 1, errors: 0, subrequests: 0, wallTime: 0 },
          quantiles: { cpuTimeP50: 0, cpuTimeP99: 0 },
        },
        {
          dimensions: { scriptName: 'worker-a', datetimeMinute: '2026-06-05T12:01:00Z' },
          sum: { requests: 2, errors: 0, subrequests: 0, wallTime: 0 },
          quantiles: { cpuTimeP50: 0, cpuTimeP99: 0 },
        },
      ];
      const rows = parseDataset(config, data, ACCOUNT_ID, 0);
      const hashes = rows.filter(r => r.metricName === 'requests').map(r => r.dimsHash);
      expect(hashes[0]).toBe(hashes[1]);
    });
  });

  describe('durable-objects', () => {
    const config = findConfig('durable-objects');

    it('parses valid response', () => {
      const data = [
        {
          dimensions: { scriptName: 'chat-room', datetimeMinute: '2026-06-05T12:00:00Z' },
          sum: { requests: 500, responseBodySize: 102400 },
        },
      ];
      const rows = parseDataset(config, data, ACCOUNT_ID, 0);
      expect(rows).toHaveLength(2);

      expect(rows).toContainEqual(expect.objectContaining({ metricName: 'requests', value: 500, dataset: 'durable-objects', resource: 'chat-room' }));
      expect(rows).toContainEqual(expect.objectContaining({ metricName: 'responseBodySize', value: 102400 }));
    });

    it('returns empty for non-array', () => {
      expect(parseDataset(config, null, ACCOUNT_ID, 0)).toEqual([]);
    });
  });

  describe('d1', () => {
    const config = findConfig('d1');

    it('parses valid response', () => {
      const data = [
        {
          dimensions: { date: '2026-06-05', databaseId: 'db-abc123' },
          sum: { readQueries: 1000, writeQueries: 50 },
        },
      ];
      const rows = parseDataset(config, data, ACCOUNT_ID, 0);
      expect(rows).toHaveLength(2);

      const readRow = rows.find(r => r.metricName === 'readQueries');
      expect(readRow?.value).toBe(1000);
      expect(readRow?.resource).toBe('db-abc123');
      expect(readRow?.dataset).toBe('d1');

      const expectedTs = Math.floor(new Date('2026-06-05T00:00:00Z').getTime() / 1000);
      expect(readRow?.ts).toBe(expectedTs);
    });

    it('returns empty for non-array', () => {
      expect(parseDataset(config, undefined, ACCOUNT_ID, 0)).toEqual([]);
    });
  });

  describe('kv', () => {
    const config = findConfig('kv');

    it('parses valid response with multiple action types', () => {
      const data = [
        { dimensions: { date: '2026-06-05', actionType: 'read' }, sum: { requests: 5000 } },
        { dimensions: { date: '2026-06-05', actionType: 'write' }, sum: { requests: 200 } },
      ];
      const rows = parseDataset(config, data, ACCOUNT_ID, 0);
      expect(rows).toHaveLength(2);

      const readRow = rows.find(r => r.dims['actionType'] === 'read');
      expect(readRow?.value).toBe(5000);
      expect(readRow?.resource).toBe('_all');
      expect(readRow?.metricName).toBe('requests');
    });

    it('produces different hashes for different action types', () => {
      const data = [
        { dimensions: { date: '2026-06-05', actionType: 'read' }, sum: { requests: 1 } },
        { dimensions: { date: '2026-06-05', actionType: 'write' }, sum: { requests: 1 } },
      ];
      const rows = parseDataset(config, data, ACCOUNT_ID, 0);
      expect(rows[0]?.dimsHash).not.toBe(rows[1]?.dimsHash);
    });
  });

  describe('r2', () => {
    const config = findConfig('r2');

    it('parses valid response using fromSeconds as timestamp', () => {
      const data = [
        {
          dimensions: { actionType: 'GetObject', bucketName: 'my-bucket' },
          sum: { requests: 1500 },
        },
        {
          dimensions: { actionType: 'PutObject', bucketName: 'my-bucket' },
          sum: { requests: 300 },
        },
      ];
      const rows = parseDataset(config, data, ACCOUNT_ID, FROM_SECONDS);
      expect(rows).toHaveLength(2);

      const getRow = rows.find(r => r.dims['actionType'] === 'GetObject');
      expect(getRow?.value).toBe(1500);
      expect(getRow?.resource).toBe('my-bucket');
      expect(getRow?.ts).toBe(FROM_SECONDS);
    });
  });

  describe('http-requests', () => {
    const config = findConfig('http-requests');

    it('parses valid response', () => {
      const data = [
        {
          count: 10000,
          dimensions: { datetimeFiveMinutes: '2026-06-05T12:00:00Z' },
          sum: { edgeResponseBytes: 5242880, visits: 8000 },
        },
      ];
      const rows = parseDataset(config, data, ZONE_ID, 0);
      expect(rows).toHaveLength(3);

      const reqRow = rows.find(r => r.metricName === 'requests');
      expect(reqRow?.value).toBe(10000);
      expect(reqRow?.scope).toBe('zone');
      expect(reqRow?.scopeId).toBe(ZONE_ID);
      expect(reqRow?.resource).toBe(ZONE_ID);
    });
  });

  describe('firewall-events', () => {
    const config = findConfig('firewall-events');

    it('parses valid response', () => {
      const data = [
        {
          count: 50,
          dimensions: { datetimeFiveMinutes: '2026-06-05T12:00:00Z', action: 'block', source: 'firewallRules' },
        },
        {
          count: 10,
          dimensions: { datetimeFiveMinutes: '2026-06-05T12:00:00Z', action: 'challenge', source: 'rateLimit' },
        },
      ];
      const rows = parseDataset(config, data, ZONE_ID, 0);
      expect(rows).toHaveLength(2);

      const blockRow = rows.find(r => r.dims['action'] === 'block');
      expect(blockRow?.value).toBe(50);
      expect(blockRow?.dims).toEqual({ action: 'block', source: 'firewallRules' });
    });

    it('produces different hashes for different action/source combos', () => {
      const data = [
        { count: 1, dimensions: { datetimeFiveMinutes: '2026-06-05T12:00:00Z', action: 'block', source: 'waf' } },
        { count: 1, dimensions: { datetimeFiveMinutes: '2026-06-05T12:00:00Z', action: 'challenge', source: 'waf' } },
      ];
      const rows = parseDataset(config, data, ZONE_ID, 0);
      expect(rows[0]?.dimsHash).not.toBe(rows[1]?.dimsHash);
    });
  });

  describe('dns', () => {
    const config = findConfig('dns');

    it('parses valid response', () => {
      const data = [
        {
          count: 5000,
          dimensions: { date: '2026-06-05', queryType: 'A', responseCode: 'NOERROR' },
        },
        {
          count: 200,
          dimensions: { date: '2026-06-05', queryType: 'AAAA', responseCode: 'NOERROR' },
        },
      ];
      const rows = parseDataset(config, data, ZONE_ID, 0);
      expect(rows).toHaveLength(2);

      const aRow = rows.find(r => r.dims['queryType'] === 'A');
      expect(aRow?.value).toBe(5000);
      expect(aRow?.dataset).toBe('dns');
      expect(aRow?.resource).toBe(ZONE_ID);

      const expectedTs = Math.floor(new Date('2026-06-05T00:00:00Z').getTime() / 1000);
      expect(aRow?.ts).toBe(expectedTs);
    });

    it('returns empty for non-array', () => {
      expect(parseDataset(config, null, ZONE_ID, 0)).toEqual([]);
    });
  });
});
