import { describe, expect, it } from 'vitest';

import { mapAdhocFilters, resolveVariableType, splitCsv } from './variable-mapping';

describe('resolveVariableType', () => {
  it('maps each modeled Grafana type to its Graflare type without warning', () => {
    const warnings: string[] = [];
    expect(resolveVariableType('query', 'a', warnings)).toBe('query');
    expect(resolveVariableType('custom', 'a', warnings)).toBe('custom');
    expect(resolveVariableType('constant', 'a', warnings)).toBe('constant');
    expect(resolveVariableType('textbox', 'a', warnings)).toBe('textbox');
    expect(resolveVariableType('interval', 'a', warnings)).toBe('interval');
    expect(resolveVariableType('datasource', 'a', warnings)).toBe('datasource');
    expect(resolveVariableType('adhoc', 'a', warnings)).toBe('adhoc');
    expect(warnings).toEqual([]);
  });

  it('maps adhoc to a real adhoc variable without warning (no longer downgraded to custom)', () => {
    const warnings: string[] = [];
    expect(resolveVariableType('adhoc', 'filters', warnings)).toBe('adhoc');
    expect(warnings).toEqual([]);
  });

  it('treats an unknown type as custom with a warning, but a literal "custom" never warns', () => {
    const warnings: string[] = [];
    expect(resolveVariableType('something-new', 'x', warnings)).toBe('custom');
    expect(warnings).toHaveLength(1);
    expect(resolveVariableType('custom', 'y', warnings)).toBe('custom');
    expect(warnings).toHaveLength(1); // unchanged — custom is the expected fallthrough
  });
});

describe('mapAdhocFilters', () => {
  it('keeps filters with supported operators', () => {
    const warnings: string[] = [];
    const result = mapAdhocFilters(
      [
        { key: 'env', operator: '=', value: 'prod' },
        { key: 'job', operator: '!=', value: 'api' },
        { key: 'region', operator: '=~', value: 'us.*' },
        { key: 'host', operator: '!~', value: 'dev.*' },
      ],
      'v',
      warnings,
    );
    expect(result).toEqual([
      { key: 'env', operator: '=', value: 'prod' },
      { key: 'job', operator: '!=', value: 'api' },
      { key: 'region', operator: '=~', value: 'us.*' },
      { key: 'host', operator: '!~', value: 'dev.*' },
    ]);
    expect(warnings).toEqual([]);
  });

  it('drops a filter with an unsupported operator and warns', () => {
    const warnings: string[] = [];
    const result = mapAdhocFilters([{ key: 'cpu', operator: '>', value: '5' }], 'v', warnings);
    expect(result).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('>');
  });

  it('skips a filter with an empty key', () => {
    const warnings: string[] = [];
    expect(mapAdhocFilters([{ key: '', operator: '=', value: 'x' }], 'v', warnings)).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe('splitCsv', () => {
  it('splits, trims, and drops empty parts', () => {
    expect(splitCsv('1m, 5m ,, 15m')).toEqual(['1m', '5m', '15m']);
  });

  it('returns an empty array for empty or whitespace-only input', () => {
    expect(splitCsv('')).toEqual([]);
    expect(splitCsv('  ,  ')).toEqual([]);
  });
});
