import { describe, expect, it } from 'vitest';

import { resolveVariableType, splitCsv } from './variable-mapping';

describe('resolveVariableType', () => {
  it('maps each modeled Grafana type to its Graflare type without warning', () => {
    const warnings: string[] = [];
    expect(resolveVariableType('query', 'a', warnings)).toBe('query');
    expect(resolveVariableType('custom', 'a', warnings)).toBe('custom');
    expect(resolveVariableType('constant', 'a', warnings)).toBe('constant');
    expect(resolveVariableType('textbox', 'a', warnings)).toBe('textbox');
    expect(resolveVariableType('interval', 'a', warnings)).toBe('interval');
    expect(resolveVariableType('datasource', 'a', warnings)).toBe('datasource');
    expect(warnings).toEqual([]);
  });

  it('falls an unmodeled type (adhoc) back to custom and warns, naming the variable and type', () => {
    const warnings: string[] = [];
    expect(resolveVariableType('adhoc', 'filters', warnings)).toBe('custom');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('filters');
    expect(warnings[0]).toContain('adhoc');
  });

  it('treats an unknown type as custom with a warning, but a literal "custom" never warns', () => {
    const warnings: string[] = [];
    expect(resolveVariableType('something-new', 'x', warnings)).toBe('custom');
    expect(warnings).toHaveLength(1);
    expect(resolveVariableType('custom', 'y', warnings)).toBe('custom');
    expect(warnings).toHaveLength(1); // unchanged — custom is the expected fallthrough
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
