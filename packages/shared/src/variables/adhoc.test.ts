import type { Variable } from '../schemas/variable';

import { describe, expect, it } from 'vitest';

import { adhocVariables, resolveAdhocFilters } from './adhoc';

const DS_A = '11111111-1111-1111-1111-111111111111';
const DS_B = '22222222-2222-2222-2222-222222222222';

const base = (over: Partial<Variable>): Variable => ({
  name: 'v',
  type: 'adhoc',
  label: '',
  query: '',
  regex: '',
  sort: 'disabled',
  multi: false,
  includeAll: false,
  current: '',
  options: [],
  filters: [],
  ...over,
});

describe('resolveAdhocFilters', () => {
  it('returns filters for an adhoc variable scoped to the panel datasource', () => {
    const vars = [base({ datasourceId: DS_A, filters: [{ key: 'env', operator: '=', value: 'prod' }] })];
    expect(resolveAdhocFilters(vars, DS_A)).toEqual([{ key: 'env', operator: '=', value: 'prod' }]);
  });

  it('ignores adhoc variables scoped to a different datasource', () => {
    const vars = [base({ datasourceId: DS_B, filters: [{ key: 'env', operator: '=', value: 'prod' }] })];
    expect(resolveAdhocFilters(vars, DS_A)).toEqual([]);
  });

  it('returns nothing for a panel with no datasource', () => {
    const vars = [base({ datasourceId: DS_A, filters: [{ key: 'env', operator: '=', value: 'prod' }] })];
    expect(resolveAdhocFilters(vars)).toEqual([]);
  });

  it('treats an adhoc variable with no datasource as inert', () => {
    const vars = [base({ datasourceId: undefined, filters: [{ key: 'env', operator: '=', value: 'prod' }] })];
    expect(resolveAdhocFilters(vars, DS_A)).toEqual([]);
  });

  it('ignores non-adhoc variables even if they carry the matching datasource', () => {
    const vars = [base({ type: 'query', datasourceId: DS_A, filters: [{ key: 'env', operator: '=', value: 'prod' }] })];
    expect(resolveAdhocFilters(vars, DS_A)).toEqual([]);
  });

  it('concatenates filters from multiple matching adhoc variables in order', () => {
    const vars = [
      base({ name: 'a', datasourceId: DS_A, filters: [{ key: 'env', operator: '=', value: 'prod' }] }),
      base({ name: 'b', datasourceId: DS_A, filters: [{ key: 'region', operator: '=~', value: 'us.*' }] }),
    ];
    expect(resolveAdhocFilters(vars, DS_A)).toEqual([
      { key: 'env', operator: '=', value: 'prod' },
      { key: 'region', operator: '=~', value: 'us.*' },
    ]);
  });

  it('returns an empty array when the adhoc variable has no filters', () => {
    const vars = [base({ datasourceId: DS_A, filters: [] })];
    expect(resolveAdhocFilters(vars, DS_A)).toEqual([]);
  });
});

describe('adhocVariables', () => {
  it('keeps only adhoc-typed variables', () => {
    const vars = [base({ name: 'a', type: 'adhoc' }), base({ name: 'q', type: 'query' }), base({ name: 'b', type: 'adhoc' })];
    expect(adhocVariables(vars).map(v => v.name)).toEqual(['a', 'b']);
  });
});
