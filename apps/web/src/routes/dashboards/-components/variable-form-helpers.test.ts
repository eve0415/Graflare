import type { Variable } from '@graflare/shared/schemas/variable';

import { describe, expect, it } from 'vitest';

import { blankVariable, resetForType, splitCsv, validateVariable, validateVariableName } from './variable-form-helpers';

describe('validateVariableName', () => {
  it('returns null for a valid name', () => {
    expect(validateVariableName('cpu_usage', [])).toBeNull();
    expect(validateVariableName('Var123', [])).toBeNull();
  });

  it('flags an empty or whitespace-only name', () => {
    expect(validateVariableName('', [])).toBe('empty');
    expect(validateVariableName('   ', [])).toBe('empty');
  });

  it('flags names with characters outside [a-zA-Z0-9_]', () => {
    expect(validateVariableName('bad name', [])).toBe('invalid');
    expect(validateVariableName('has-dash', [])).toBe('invalid');
    expect(validateVariableName('dollar$', [])).toBe('invalid');
  });

  it('flags a duplicate against existing names (case-sensitive, like Grafana)', () => {
    expect(validateVariableName('env', ['env', 'region'])).toBe('duplicate');
    // Different case is NOT a duplicate.
    expect(validateVariableName('Env', ['env'])).toBeNull();
  });
});

describe('splitCsv', () => {
  it('splits on commas, trims, and drops blanks', () => {
    expect(splitCsv('node, api ,, prod')).toEqual(['node', 'api', 'prod']);
  });

  it('returns an empty array for an empty or blanks-only string', () => {
    expect(splitCsv('')).toEqual([]);
    expect(splitCsv('  , , ')).toEqual([]);
  });
});

const sample: Variable = {
  name: 'v',
  label: 'My Var',
  type: 'query',
  datasourceId: '11111111-2222-4333-8444-555555555555',
  query: 'up',
  regex: '/.*/',
  sort: 'alphabetical-asc',
  multi: true,
  includeAll: true,
  current: 'node',
  allValue: '',
  options: ['node', 'api'],
  filters: [],
};

describe('resetForType', () => {
  it('preserves name and label, sets the new type, and resets everything else to defaults', () => {
    const next = resetForType(sample, 'custom');
    expect(next).toEqual({
      name: 'v',
      label: 'My Var',
      type: 'custom',
      query: '',
      regex: '',
      sort: 'disabled',
      multi: false,
      includeAll: false,
      current: '',
      allValue: '',
      options: [],
      filters: [],
    });
  });

  it('drops the datasourceId on type change', () => {
    expect(resetForType(sample, 'constant').datasourceId).toBeUndefined();
  });
});

describe('blankVariable', () => {
  it('produces a query-type variable with empty common fields', () => {
    const v = blankVariable();
    expect(v.type).toBe('query');
    expect(v.name).toBe('');
    expect(v.options).toEqual([]);
  });
});

describe('validateVariable', () => {
  it('returns the parsed variable when the name and schema both pass', () => {
    const result = validateVariable(sample, []);
    // `sample` is fully specified, so the schema-parsed result deep-equals it.
    expect(result).toEqual({ ok: true, variable: sample });
  });

  it('blocks an invalid name before touching the schema', () => {
    const result = validateVariable({ ...sample, name: 'bad name' }, []);
    expect(result).toEqual({ ok: false, nameError: 'invalid' });
  });

  it('blocks a duplicate name', () => {
    const result = validateVariable(sample, ['v']);
    expect(result).toEqual({ ok: false, nameError: 'duplicate' });
  });

  it('blocks an empty name', () => {
    const result = validateVariable({ ...sample, name: '' }, []);
    expect(result).toEqual({ ok: false, nameError: 'empty' });
  });

  it('reports a field error (not a name error) when a non-name field fails the schema', () => {
    // A valid name but an over-long regex (cap is 2048) must surface as a fieldError so the form
    // does not blame the name.
    const result = validateVariable({ ...sample, regex: 'x'.repeat(2049) }, []);
    expect(result.ok).toBe(false);
    expect('fieldError' in result).toBe(true);
    expect('nameError' in result).toBe(false);
  });
});
