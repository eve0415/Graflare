import type { DatasourceRow } from '../../datasources/-api';
import type { Variable } from '@graflare/shared/schemas/variable';

import { describe, expect, it } from 'vitest';

import { buildEffectiveValues, computeVariableDefault, filterDatasourceItems, resolveAdhocVariables } from './variable-defaults';

const baseVariable: Variable = {
  name: 'v',
  type: 'custom',
  label: '',
  query: '',
  regex: '',
  sort: 'disabled',
  multi: false,
  includeAll: false,
  current: '',
  allValue: '',
  options: [],
  filters: [],
};

const makeVariable = (overrides: Partial<Variable>): Variable => ({ ...baseVariable, ...overrides });

const makeDatasource = (id: string, name: string, type: string): DatasourceRow => ({
  id,
  orgId: 'org-1',
  name,
  type,
  dialect: null,
  url: 'https://example.com',
  authType: 'none',
  queryTimeoutMs: 30000,
  cacheTtl: 0,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const datasources: DatasourceRow[] = [
  makeDatasource('11111111-1111-4111-8111-111111111111', 'Prom A', 'prometheus'),
  makeDatasource('22222222-2222-4222-8222-222222222222', 'SQL B', 'sql'),
  makeDatasource('33333333-3333-4333-8333-333333333333', 'Prom C', 'prometheus'),
];

describe('filterDatasourceItems', () => {
  it('returns every datasource as a value/label pair when no type filter is given', () => {
    expect(filterDatasourceItems(datasources, '')).toEqual([
      { value: '11111111-1111-4111-8111-111111111111', label: 'Prom A' },
      { value: '22222222-2222-4222-8222-222222222222', label: 'SQL B' },
      { value: '33333333-3333-4333-8333-333333333333', label: 'Prom C' },
    ]);
  });

  it('keeps only datasources of the requested type', () => {
    expect(filterDatasourceItems(datasources, 'prometheus')).toEqual([
      { value: '11111111-1111-4111-8111-111111111111', label: 'Prom A' },
      { value: '33333333-3333-4333-8333-333333333333', label: 'Prom C' },
    ]);
  });

  it('matches the type filter case-insensitively', () => {
    expect(filterDatasourceItems(datasources, 'Prometheus').map(i => i.value)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
    ]);
  });

  it('returns an empty list when no datasource matches the filter', () => {
    expect(filterDatasourceItems(datasources, 'influxdb')).toEqual([]);
  });

  it('uses the value as the label when a datasource has no name', () => {
    const nameless = [makeDatasource('44444444-4444-4444-8444-444444444444', '', 'prometheus')];
    expect(filterDatasourceItems(nameless, '')).toEqual([{ value: '44444444-4444-4444-8444-444444444444', label: '44444444-4444-4444-8444-444444444444' }]);
  });
});

describe('computeVariableDefault', () => {
  it('seeds a textbox from current when present', () => {
    expect(computeVariableDefault(makeVariable({ type: 'textbox', current: 'hello', query: 'fallback' }), datasources)).toBe('hello');
  });

  it('falls back to query for a textbox with no current (the configured default text)', () => {
    expect(computeVariableDefault(makeVariable({ type: 'textbox', current: '', query: 'default text' }), datasources)).toBe('default text');
  });

  it('seeds an interval from current when present', () => {
    expect(computeVariableDefault(makeVariable({ type: 'interval', current: '5m', options: ['1m', '5m', '1h'] }), datasources)).toBe('5m');
  });

  it('falls back to the first option for an interval with no current', () => {
    expect(computeVariableDefault(makeVariable({ type: 'interval', current: '', options: ['1m', '5m', '1h'] }), datasources)).toBe('1m');
  });

  it('returns empty for an interval with neither current nor options', () => {
    expect(computeVariableDefault(makeVariable({ type: 'interval', current: '', options: [] }), datasources)).toBe('');
  });

  it('keeps a datasource current that still matches a known datasource id', () => {
    expect(computeVariableDefault(makeVariable({ type: 'datasource', current: '22222222-2222-4222-8222-222222222222' }), datasources)).toBe(
      '22222222-2222-4222-8222-222222222222',
    );
  });

  it('seeds a datasource from the first matching id when current does not resolve', () => {
    expect(computeVariableDefault(makeVariable({ type: 'datasource', current: 'stale-name', query: 'prometheus' }), datasources)).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('does not keep a datasource current that exists but fails the type filter', () => {
    // current is the SQL ds id, but the variable only allows prometheus → fall back to the first prometheus ds.
    expect(
      computeVariableDefault(makeVariable({ type: 'datasource', current: '22222222-2222-4222-8222-222222222222', query: 'prometheus' }), datasources),
    ).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('returns empty for a datasource variable when nothing matches the filter', () => {
    expect(computeVariableDefault(makeVariable({ type: 'datasource', current: '', query: 'influxdb' }), datasources)).toBe('');
  });

  it('seeds a constant from current, then query', () => {
    expect(computeVariableDefault(makeVariable({ type: 'constant', current: 'prod' }), datasources)).toBe('prod');
    expect(computeVariableDefault(makeVariable({ type: 'constant', current: '', query: 'staging' }), datasources)).toBe('staging');
  });

  it('seeds query/custom from current, then the first option', () => {
    expect(computeVariableDefault(makeVariable({ type: 'custom', current: 'b', options: ['a', 'b'] }), datasources)).toBe('b');
    expect(computeVariableDefault(makeVariable({ type: 'query', current: '', options: ['x', 'y'] }), datasources)).toBe('x');
    expect(computeVariableDefault(makeVariable({ type: 'query', current: '', options: [] }), datasources)).toBe('');
  });
});

describe('buildEffectiveValues', () => {
  it('seeds every variable with its computed default when there are no overrides', () => {
    const variables = [
      makeVariable({ name: 'text', type: 'textbox', current: 'hello' }),
      makeVariable({ name: 'step', type: 'interval', options: ['1m', '5m'] }),
      makeVariable({ name: 'src', type: 'datasource', query: 'prometheus' }),
    ];
    const result = buildEffectiveValues(variables, new Map<string, string>(), datasources);
    expect(result.get('text')).toBe('hello');
    expect(result.get('step')).toBe('1m');
    expect(result.get('src')).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('lets an explicit override win over the computed default', () => {
    const variables = [makeVariable({ name: 'step', type: 'interval', options: ['1m', '5m'] })];
    const result = buildEffectiveValues(variables, new Map([['step', '5m']]), datasources);
    expect(result.get('step')).toBe('5m');
  });

  it('keeps an override even when it is the empty string (a deliberate clear)', () => {
    const variables = [makeVariable({ name: 'text', type: 'textbox', current: 'hello' })];
    const result = buildEffectiveValues(variables, new Map([['text', '']]), datasources);
    expect(result.get('text')).toBe('');
  });
});

describe('computeVariableDefault — adhoc', () => {
  it('returns empty (adhoc carries no scalar value)', () => {
    expect(computeVariableDefault(makeVariable({ type: 'adhoc', filters: [{ key: 'env', operator: '=', value: 'prod' }] }), datasources)).toBe('');
  });
});

describe('resolveAdhocVariables', () => {
  const PROM = '11111111-1111-4111-8111-111111111111';

  it('keeps only adhoc variables and uses their saved filters when no override exists', () => {
    const variables = [
      makeVariable({ name: 'q', type: 'query' }),
      makeVariable({ name: 'f', type: 'adhoc', datasourceId: PROM, filters: [{ key: 'env', operator: '=', value: 'prod' }] }),
    ];
    const result = resolveAdhocVariables(variables, new Map());
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('f');
    expect(result[0]?.filters).toEqual([{ key: 'env', operator: '=', value: 'prod' }]);
  });

  it('replaces the saved filters with a live override', () => {
    const variables = [makeVariable({ name: 'f', type: 'adhoc', datasourceId: PROM, filters: [{ key: 'env', operator: '=', value: 'prod' }] })];
    const overrides = new Map([['f', [{ key: 'region', operator: '=~' as const, value: 'us.*' }]]]);
    const result = resolveAdhocVariables(variables, overrides);
    expect(result[0]?.filters).toEqual([{ key: 'region', operator: '=~', value: 'us.*' }]);
  });

  it('an override to an empty array clears the filters (distinct from "no override")', () => {
    const variables = [makeVariable({ name: 'f', type: 'adhoc', datasourceId: PROM, filters: [{ key: 'env', operator: '=', value: 'prod' }] })];
    const result = resolveAdhocVariables(variables, new Map([['f', []]]));
    expect(result[0]?.filters).toEqual([]);
  });
});
