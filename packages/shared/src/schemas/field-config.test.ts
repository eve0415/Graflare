import { describe, expect, it } from 'vitest';

import { makeValueMapping, valueMappingSchema } from './field-config';

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
