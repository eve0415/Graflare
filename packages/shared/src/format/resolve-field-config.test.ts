import type { FieldConfig } from '../schemas/field-config';
import type { FieldDescriptor } from './resolve-field-config';

import { describe, expect, it } from 'vitest';

import { resolveFieldConfig } from './resolve-field-config';

const defaults: FieldConfig['defaults'] = { unit: 'short', decimals: 1, mappings: [] };

// A FieldConfig with the shared defaults above and the given overrides.
const withOverrides = (overrides: FieldConfig['overrides']): FieldConfig => ({ defaults, overrides });

const cpuField: FieldDescriptor = { name: 'cpu_usage' };

describe('resolveFieldConfig', () => {
  describe('no match → defaults (byte-equivalence)', () => {
    it('returns the SAME defaults reference when overrides is empty', () => {
      const fc = withOverrides([]);
      expect(resolveFieldConfig(cpuField, fc)).toBe(fc.defaults);
    });

    it('returns the SAME defaults reference when an override exists but matches nothing', () => {
      const fc = withOverrides([{ matcher: { id: 'byName', options: 'other_field' }, properties: [{ id: 'unit', value: 'bytes' }] }]);
      expect(resolveFieldConfig(cpuField, fc)).toBe(fc.defaults);
    });

    it('returns the SAME defaults reference when a matching override sets no properties', () => {
      const fc = withOverrides([{ matcher: { id: 'byName', options: 'cpu_usage' }, properties: [] }]);
      expect(resolveFieldConfig(cpuField, fc)).toBe(fc.defaults);
    });

    it('never mutates the input defaults', () => {
      const fc = withOverrides([{ matcher: { id: 'byName', options: 'cpu_usage' }, properties: [{ id: 'unit', value: 'bytes' }] }]);
      resolveFieldConfig(cpuField, fc);
      expect(fc.defaults).toEqual({ unit: 'short', decimals: 1, mappings: [] });
    });
  });

  describe('byName (exact)', () => {
    it('applies properties on an exact name match', () => {
      const fc = withOverrides([{ matcher: { id: 'byName', options: 'cpu_usage' }, properties: [{ id: 'unit', value: 'percent' }] }]);
      expect(resolveFieldConfig(cpuField, fc)).toEqual({ unit: 'percent', decimals: 1, mappings: [] });
    });

    it('does not match a partial / substring name', () => {
      const fc = withOverrides([{ matcher: { id: 'byName', options: 'cpu' }, properties: [{ id: 'unit', value: 'percent' }] }]);
      expect(resolveFieldConfig(cpuField, fc)).toBe(fc.defaults);
    });

    it('merges multiple distinct properties from one override', () => {
      const fc = withOverrides([
        {
          matcher: { id: 'byName', options: 'cpu_usage' },
          properties: [
            { id: 'unit', value: 'bytes' },
            { id: 'decimals', value: 3 },
            { id: 'min', value: 0 },
            { id: 'max', value: 100 },
          ],
        },
      ]);
      expect(resolveFieldConfig(cpuField, fc)).toEqual({ unit: 'bytes', decimals: 3, min: 0, max: 100, mappings: [] });
    });

    it('applies a mappings property, replacing the defaults mappings', () => {
      const mappings = [{ type: 'value', value: '1', result: { text: 'up' } }] as const;
      const fc = withOverrides([{ matcher: { id: 'byName', options: 'cpu_usage' }, properties: [{ id: 'mappings', value: [...mappings] }] }]);
      expect(resolveFieldConfig(cpuField, fc).mappings).toEqual(mappings);
    });
  });

  describe('byRegexp (test on field name)', () => {
    it('applies properties when the pattern matches the name', () => {
      const fc = withOverrides([{ matcher: { id: 'byRegexp', options: '^cpu_' }, properties: [{ id: 'unit', value: 'percent' }] }]);
      expect(resolveFieldConfig(cpuField, fc).unit).toBe('percent');
    });

    it('does not match when the pattern fails', () => {
      const fc = withOverrides([{ matcher: { id: 'byRegexp', options: '^mem_' }, properties: [{ id: 'unit', value: 'percent' }] }]);
      expect(resolveFieldConfig(cpuField, fc)).toBe(fc.defaults);
    });

    it('matches multiple fields with one alternation pattern', () => {
      const fc = withOverrides([{ matcher: { id: 'byRegexp', options: 'cpu|mem' }, properties: [{ id: 'unit', value: 'percent' }] }]);
      expect(resolveFieldConfig({ name: 'cpu_usage' }, fc).unit).toBe('percent');
      expect(resolveFieldConfig({ name: 'mem_usage' }, fc).unit).toBe('percent');
      expect(resolveFieldConfig({ name: 'disk_io' }, fc)).toBe(fc.defaults);
    });

    it('treats an invalid regex as a no-match (does not throw)', () => {
      const fc = withOverrides([{ matcher: { id: 'byRegexp', options: '(' }, properties: [{ id: 'unit', value: 'percent' }] }]);
      expect(() => resolveFieldConfig(cpuField, fc)).not.toThrow();
      expect(resolveFieldConfig(cpuField, fc)).toBe(fc.defaults);
    });
  });

  describe('byType', () => {
    it('matches when the field carries a matching type', () => {
      const fc = withOverrides([{ matcher: { id: 'byType', options: 'string' }, properties: [{ id: 'unit', value: 'percent' }] }]);
      expect(resolveFieldConfig({ name: 'status', type: 'string' }, fc).unit).toBe('percent');
    });

    it('does not match a different type', () => {
      const fc = withOverrides([{ matcher: { id: 'byType', options: 'string' }, properties: [{ id: 'unit', value: 'percent' }] }]);
      expect(resolveFieldConfig({ name: 'value', type: 'number' }, fc)).toBe(fc.defaults);
    });

    it('does not match a field with no type (e.g. a Prometheus series)', () => {
      const fc = withOverrides([{ matcher: { id: 'byType', options: 'number' }, properties: [{ id: 'unit', value: 'percent' }] }]);
      expect(resolveFieldConfig({ name: 'value' }, fc)).toBe(fc.defaults);
    });
  });

  describe('byFrameRefID', () => {
    it('matches when the field carries a matching refId', () => {
      const fc = withOverrides([{ matcher: { id: 'byFrameRefID', options: 'A' }, properties: [{ id: 'unit', value: 'percent' }] }]);
      expect(resolveFieldConfig({ name: 'value', refId: 'A' }, fc).unit).toBe('percent');
    });

    it('does not match a different refId', () => {
      const fc = withOverrides([{ matcher: { id: 'byFrameRefID', options: 'A' }, properties: [{ id: 'unit', value: 'percent' }] }]);
      expect(resolveFieldConfig({ name: 'value', refId: 'B' }, fc)).toBe(fc.defaults);
    });

    it('does not match a field with no refId', () => {
      const fc = withOverrides([{ matcher: { id: 'byFrameRefID', options: 'A' }, properties: [{ id: 'unit', value: 'percent' }] }]);
      expect(resolveFieldConfig({ name: 'value' }, fc)).toBe(fc.defaults);
    });
  });

  describe('precedence (later overrides win)', () => {
    it('applies a later override on top of an earlier one for the same property', () => {
      const fc = withOverrides([
        { matcher: { id: 'byName', options: 'cpu_usage' }, properties: [{ id: 'unit', value: 'bytes' }] },
        { matcher: { id: 'byRegexp', options: 'cpu' }, properties: [{ id: 'unit', value: 'percent' }] },
      ]);
      // Both match; the second (regexp) wins for `unit`.
      expect(resolveFieldConfig(cpuField, fc).unit).toBe('percent');
    });

    it('accumulates non-conflicting properties across multiple matching overrides', () => {
      const fc = withOverrides([
        { matcher: { id: 'byName', options: 'cpu_usage' }, properties: [{ id: 'unit', value: 'bytes' }] },
        { matcher: { id: 'byName', options: 'cpu_usage' }, properties: [{ id: 'decimals', value: 4 }] },
      ]);
      expect(resolveFieldConfig(cpuField, fc)).toEqual({ unit: 'bytes', decimals: 4, mappings: [] });
    });

    it('within one override, a later property of the same id wins', () => {
      const fc = withOverrides([
        {
          matcher: { id: 'byName', options: 'cpu_usage' },
          properties: [
            { id: 'unit', value: 'bytes' },
            { id: 'unit', value: 'percent' },
          ],
        },
      ]);
      expect(resolveFieldConfig(cpuField, fc).unit).toBe('percent');
    });
  });
});
