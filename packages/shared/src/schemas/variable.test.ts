import { describe, expect, it } from 'vitest';

import { adhocFilterSchema, adhocOperatorSchema, variableSchema } from './variable';

describe('variableSchema — backward compatibility', () => {
  it('parses a pre-adhoc variable (no `filters` key) and defaults filters to []', () => {
    // A dashboard saved before adhoc existed omits `filters` entirely. `.parse` throws on failure,
    // so reaching the assertions proves it parsed — no conditional needed.
    const parsed = variableSchema.parse({ name: 'job', type: 'query', query: 'label_values(up, job)' });
    expect(parsed.filters).toEqual([]);
    expect(parsed.type).toBe('query');
  });

  it('still accepts every previously-modeled type unchanged', () => {
    for (const type of ['query', 'custom', 'constant', 'textbox', 'interval', 'datasource'] as const) {
      const result = variableSchema.safeParse({ name: 'v', type });
      expect(result.success).toBe(true);
    }
  });
});

describe('variableSchema — adhoc', () => {
  it('parses an adhoc variable with filters and a datasource scope', () => {
    const parsed = variableSchema.parse({
      name: 'filters',
      type: 'adhoc',
      datasourceId: '550e8400-e29b-41d4-a716-446655440000',
      filters: [
        { key: 'env', operator: '=', value: 'prod' },
        { key: 'region', operator: '=~', value: 'us.*' },
      ],
    });
    expect(parsed.type).toBe('adhoc');
    expect(parsed.filters).toHaveLength(2);
    expect(parsed.filters[0]).toEqual({ key: 'env', operator: '=', value: 'prod' });
  });

  it('parses an adhoc variable with no filters (defaults to [])', () => {
    expect(variableSchema.parse({ name: 'filters', type: 'adhoc' }).filters).toEqual([]);
  });

  it('rejects an unmodeled type', () => {
    expect(variableSchema.safeParse({ name: 'v', type: 'bogus' }).success).toBe(false);
  });
});

describe('adhocFilterSchema', () => {
  it('accepts each supported operator', () => {
    for (const operator of ['=', '!=', '=~', '!~'] as const) {
      expect(adhocFilterSchema.safeParse({ key: 'k', operator, value: 'v' }).success).toBe(true);
    }
  });

  it('defaults a missing value to an empty string', () => {
    expect(adhocFilterSchema.parse({ key: 'k', operator: '=' }).value).toBe('');
  });

  it('rejects an empty key', () => {
    expect(adhocFilterSchema.safeParse({ key: '', operator: '=', value: 'v' }).success).toBe(false);
  });

  it('rejects an unsupported operator', () => {
    expect(adhocFilterSchema.safeParse({ key: 'k', operator: '>', value: '5' }).success).toBe(false);
  });
});

describe('adhocOperatorSchema', () => {
  it('accepts the four PromQL label-match operators and nothing else', () => {
    expect(adhocOperatorSchema.safeParse('=').success).toBe(true);
    expect(adhocOperatorSchema.safeParse('!=').success).toBe(true);
    expect(adhocOperatorSchema.safeParse('=~').success).toBe(true);
    expect(adhocOperatorSchema.safeParse('!~').success).toBe(true);
    expect(adhocOperatorSchema.safeParse('==').success).toBe(false);
    expect(adhocOperatorSchema.safeParse('<').success).toBe(false);
  });
});
