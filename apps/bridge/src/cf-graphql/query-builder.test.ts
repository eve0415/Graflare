import type { GraphQLCollector } from '../collectors/types';

import { describe, expect, it } from 'vitest';

import { buildBatchedQuery } from './query-builder';

const fakeCollector = (overrides: Partial<GraphQLCollector>): GraphQLCollector => ({
  kind: 'graphql',
  name: 'test',
  nodeName: 'test',
  scope: 'account',
  alias: 'test',
  fragment: 'test: testDataset { count }',
  timeVarType: 'Time',
  parse: () => [],
  ...overrides,
});

describe('buildBatchedQuery', () => {
  it('returns empty string for no collectors', () => {
    expect(buildBatchedQuery('account', [])).toBe('');
  });

  it('builds account-scoped query with Time variables', () => {
    const query = buildBatchedQuery('account', [fakeCollector({ fragment: 'workers: workersData { count }', timeVarType: 'Time' })]);

    expect(query).toContain('query AccountMetrics');
    expect(query).toContain('$accountId: String!');
    expect(query).toContain('$fromTime: Time!');
    expect(query).toContain('$toTime: Time!');
    expect(query).not.toContain('$fromDate');
    expect(query).toContain('accounts(filter: { accountTag: $accountId })');
    expect(query).toContain('workers: workersData { count }');
  });

  it('builds zone-scoped query', () => {
    const query = buildBatchedQuery('zone', [fakeCollector({ scope: 'zone', fragment: 'http: httpData { count }', timeVarType: 'Time' })]);

    expect(query).toContain('query ZoneMetrics');
    expect(query).toContain('$zoneId: String!');
    expect(query).toContain('zones(filter: { zoneTag: $zoneId })');
    expect(query).toContain('http: httpData { count }');
  });

  it('includes Date variables when needed', () => {
    const query = buildBatchedQuery('account', [fakeCollector({ fragment: 'd1: d1Data { count }', timeVarType: 'Date' })]);

    expect(query).toContain('$fromDate: Date!');
    expect(query).toContain('$toDate: Date!');
    expect(query).not.toContain('$fromTime');
  });

  it('includes both Time and Date when mixed', () => {
    const query = buildBatchedQuery('account', [
      fakeCollector({ fragment: 'w: workersData { count }', timeVarType: 'Time' }),
      fakeCollector({ name: 'd1', fragment: 'd1: d1Data { count }', timeVarType: 'Date' }),
    ]);

    expect(query).toContain('$fromTime: Time!');
    expect(query).toContain('$toTime: Time!');
    expect(query).toContain('$fromDate: Date!');
    expect(query).toContain('$toDate: Date!');
  });

  it('includes multiple fragments', () => {
    const query = buildBatchedQuery('account', [
      fakeCollector({ fragment: 'workers: wData { requests }' }),
      fakeCollector({ name: 'do', fragment: 'durableObjects: doData { requests }' }),
    ]);

    expect(query).toContain('workers: wData { requests }');
    expect(query).toContain('durableObjects: doData { requests }');
  });
});
