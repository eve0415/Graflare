import { describe, expect, it } from 'vitest';

import { fieldOverridePropertySchema, makeFieldOverrideProperty, makeValueMapping, valueMappingSchema } from './field-config';

describe('makeValueMapping', () => {
  const result = { text: 'kept', color: '#abcdef' };

  it('builds a well-formed value mapping', () => {
    const m = makeValueMapping('value', result);
    expect(m).toEqual({ type: 'value', value: '', result });
    expect(valueMappingSchema.safeParse(m).success).toBe(true);
  });

  it('builds a well-formed range mapping', () => {
    const m = makeValueMapping('range', result);
    expect(m).toEqual({ type: 'range', from: 0, to: 0, result });
    expect(valueMappingSchema.safeParse(m).success).toBe(true);
  });

  it('builds a well-formed regex mapping', () => {
    const m = makeValueMapping('regex', result);
    expect(m).toEqual({ type: 'regex', pattern: '', result });
    expect(valueMappingSchema.safeParse(m).success).toBe(true);
  });

  it('builds a well-formed special mapping', () => {
    const m = makeValueMapping('special', result);
    expect(m).toEqual({ type: 'special', match: 'null', result });
    expect(valueMappingSchema.safeParse(m).success).toBe(true);
  });

  it('preserves the result when switching types', () => {
    const m = makeValueMapping('range', result);
    expect(m.result).toEqual(result);
  });
});

describe('makeFieldOverrideProperty', () => {
  it('builds a well-formed unit property', () => {
    const p = makeFieldOverrideProperty('unit');
    expect(p).toEqual({ id: 'unit', value: '' });
    expect(fieldOverridePropertySchema.safeParse(p).success).toBe(true);
  });

  // Numeric props default to a real number (0), not undefined — the schema value is required,
  // unlike fieldConfig.defaults where min/max/decimals are optional.
  it('builds well-formed numeric properties defaulting to 0', () => {
    for (const id of ['decimals', 'min', 'max'] as const) {
      const p = makeFieldOverrideProperty(id);
      expect(p).toEqual({ id, value: 0 });
      expect(fieldOverridePropertySchema.safeParse(p).success).toBe(true);
    }
  });

  it('builds a well-formed mappings property with an empty array', () => {
    const p = makeFieldOverrideProperty('mappings');
    expect(p).toEqual({ id: 'mappings', value: [] });
    expect(fieldOverridePropertySchema.safeParse(p).success).toBe(true);
  });
});
