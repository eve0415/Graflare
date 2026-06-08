import type { ValueMapping } from '../schemas/field-config';

import { describe, expect, it } from 'vitest';

import { applyValueMappings } from './value-mappings';

describe('applyValueMappings', () => {
  it('returns null when there are no mappings', () => {
    expect(applyValueMappings(5, [])).toBeNull();
  });

  describe('value (exact match on string form)', () => {
    const mappings: ValueMapping[] = [{ type: 'value', value: '1', result: { text: 'one', color: '#ff0000' } }];

    it('matches the numeric value by its string form', () => {
      expect(applyValueMappings(1, mappings)).toEqual({ text: 'one', color: '#ff0000' });
    });

    it('matches a string value directly', () => {
      expect(applyValueMappings('1', mappings)).toEqual({ text: 'one', color: '#ff0000' });
    });

    it('returns null when nothing matches', () => {
      expect(applyValueMappings(2, mappings)).toBeNull();
    });
  });

  describe('range (inclusive from..to)', () => {
    const mappings: ValueMapping[] = [{ type: 'range', from: 0, to: 100, result: { text: 'in range' } }];

    it('matches values inside the range', () => {
      expect(applyValueMappings(50, mappings)).toEqual({ text: 'in range' });
    });

    it('is inclusive at both bounds', () => {
      expect(applyValueMappings(0, mappings)).toEqual({ text: 'in range' });
      expect(applyValueMappings(100, mappings)).toEqual({ text: 'in range' });
    });

    it('rejects values outside the range', () => {
      expect(applyValueMappings(-1, mappings)).toBeNull();
      expect(applyValueMappings(101, mappings)).toBeNull();
    });

    it('parses a numeric string before comparing', () => {
      expect(applyValueMappings('50', mappings)).toEqual({ text: 'in range' });
    });

    it('does not match a non-numeric string', () => {
      expect(applyValueMappings('abc', mappings)).toBeNull();
    });
  });

  describe('regex (pattern on string form)', () => {
    const mappings: ValueMapping[] = [{ type: 'regex', pattern: '^err', result: { text: 'error', color: '#ff0000' } }];

    it('matches when the pattern hits', () => {
      expect(applyValueMappings('error-rate', mappings)).toEqual({ text: 'error', color: '#ff0000' });
    });

    it('returns null when the pattern misses', () => {
      expect(applyValueMappings('ok', mappings)).toBeNull();
    });

    it('treats an invalid pattern as no match (does not throw)', () => {
      const bad: ValueMapping[] = [{ type: 'regex', pattern: '(', result: { text: 'x' } }];
      expect(() => applyValueMappings('anything', bad)).not.toThrow();
      expect(applyValueMappings('anything', bad)).toBeNull();
    });
  });

  describe('special (null / nan / empty)', () => {
    it("special:'null' matches null and undefined", () => {
      const m: ValueMapping[] = [{ type: 'special', match: 'null', result: { text: 'N/A' } }];
      expect(applyValueMappings(null, m)).toEqual({ text: 'N/A' });
      expect(applyValueMappings(undefined, m)).toEqual({ text: 'N/A' });
    });

    it("special:'nan' matches NaN as a number and as the Prometheus 'NaN' string", () => {
      const m: ValueMapping[] = [{ type: 'special', match: 'nan', result: { text: 'no number' } }];
      expect(applyValueMappings(Number.NaN, m)).toEqual({ text: 'no number' });
      // stat/table pass the raw Prometheus token; Prometheus emits NaN as 'NaN'.
      expect(applyValueMappings('NaN', m)).toEqual({ text: 'no number' });
      expect(applyValueMappings(5, m)).toBeNull();
      expect(applyValueMappings('5', m)).toBeNull();
    });

    it("special:'empty' matches the empty string", () => {
      const m: ValueMapping[] = [{ type: 'special', match: 'empty', result: { text: 'blank' } }];
      expect(applyValueMappings('', m)).toEqual({ text: 'blank' });
      expect(applyValueMappings('x', m)).toBeNull();
    });
  });

  describe('precedence (in-order, first match wins)', () => {
    it('returns the first matching mapping even if a later one also matches', () => {
      const mappings: ValueMapping[] = [
        { type: 'range', from: 0, to: 10, result: { text: 'low', color: '#00ff00' } },
        { type: 'range', from: 5, to: 15, result: { text: 'mid', color: '#ffff00' } },
      ];
      expect(applyValueMappings(7, mappings)).toEqual({ text: 'low', color: '#00ff00' });
    });

    it('skips earlier non-matching mappings', () => {
      const mappings: ValueMapping[] = [
        { type: 'value', value: '999', result: { text: 'nope' } },
        { type: 'range', from: 0, to: 10, result: { text: 'yes' } },
      ];
      expect(applyValueMappings(5, mappings)).toEqual({ text: 'yes' });
    });
  });

  it('returns a color-only result when text is absent', () => {
    const mappings: ValueMapping[] = [{ type: 'range', from: 0, to: 10, result: { color: '#0000ff' } }];
    expect(applyValueMappings(5, mappings)).toEqual({ color: '#0000ff' });
  });
});
