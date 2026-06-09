import type { GrafanaOverride } from '../schemas/grafana-classic';

import { describe, expect, it } from 'vitest';

import { mapOverrides } from './override-mapping';

// A Grafana override entry in the loose import shape (matcher.options / property.value are
// unknown). Defaults keep each case to the field under test.
const override = (matcher: { id: string; options?: unknown }, properties: { id: string; value?: unknown }[]): GrafanaOverride => ({
  matcher: { id: matcher.id, options: matcher.options },
  properties,
});

describe('mapOverrides', () => {
  it('returns an empty array for no overrides (no warnings)', () => {
    const warnings: string[] = [];
    expect(mapOverrides([], warnings)).toEqual([]);
    expect(warnings).toEqual([]);
  });

  describe('supported matchers (string options)', () => {
    it('maps byName with a unit property', () => {
      const warnings: string[] = [];
      const out = mapOverrides([override({ id: 'byName', options: 'cpu' }, [{ id: 'unit', value: 'percent' }])], warnings);
      expect(out).toEqual([{ matcher: { id: 'byName', options: 'cpu' }, properties: [{ id: 'unit', value: 'percent' }] }]);
      expect(warnings).toEqual([]);
    });

    it('maps byRegexp, byType and byFrameRefID', () => {
      const warnings: string[] = [];
      const out = mapOverrides(
        [
          override({ id: 'byRegexp', options: '^cpu' }, [{ id: 'decimals', value: 2 }]),
          override({ id: 'byType', options: 'number' }, [{ id: 'min', value: 0 }]),
          override({ id: 'byFrameRefID', options: 'A' }, [{ id: 'max', value: 100 }]),
        ],
        warnings,
      );
      expect(out).toEqual([
        { matcher: { id: 'byRegexp', options: '^cpu' }, properties: [{ id: 'decimals', value: 2 }] },
        { matcher: { id: 'byType', options: 'number' }, properties: [{ id: 'min', value: 0 }] },
        { matcher: { id: 'byFrameRefID', options: 'A' }, properties: [{ id: 'max', value: 100 }] },
      ]);
      expect(warnings).toEqual([]);
    });

    it('clamps and rounds a float decimals value to the 0..10 int range', () => {
      const out = mapOverrides([override({ id: 'byName', options: 'x' }, [{ id: 'decimals', value: 12.7 }])], []);
      expect(out[0]?.properties).toEqual([{ id: 'decimals', value: 10 }]);
    });

    it('keeps the supported properties and warn-drops the rest within one override', () => {
      const warnings: string[] = [];
      const out = mapOverrides(
        [
          override({ id: 'byName', options: 'cpu' }, [
            { id: 'unit', value: 'percent' },
            { id: 'color', value: { mode: 'fixed', fixedColor: 'red' } },
            { id: 'custom.lineWidth', value: 3 },
          ]),
        ],
        warnings,
      );
      expect(out).toEqual([{ matcher: { id: 'byName', options: 'cpu' }, properties: [{ id: 'unit', value: 'percent' }] }]);
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain('color');
      expect(warnings[1]).toContain('custom.lineWidth');
    });
  });

  describe('warn-drop unsupported matchers', () => {
    it('drops a structured-option matcher (byNames carries an object, not a string)', () => {
      const warnings: string[] = [];
      const out = mapOverrides([override({ id: 'byNames', options: { names: ['a', 'b'] } }, [{ id: 'unit', value: 'percent' }])], warnings);
      expect(out).toEqual([]);
      expect(warnings[0]).toContain('byNames');
    });

    it('drops a no-argument matcher with no usable string option', () => {
      const warnings: string[] = [];
      const out = mapOverrides([override({ id: 'numeric' }, [{ id: 'unit', value: 'percent' }])], warnings);
      expect(out).toEqual([]);
      expect(warnings[0]).toContain('numeric');
    });

    it('drops a byValue matcher (not modelled)', () => {
      const out = mapOverrides([override({ id: 'byValue', options: 'something' }, [{ id: 'unit', value: 'percent' }])], []);
      expect(out).toEqual([]);
    });
  });

  describe('property value type guards', () => {
    it('drops a unit property whose value is not a string', () => {
      const warnings: string[] = [];
      const out = mapOverrides([override({ id: 'byName', options: 'x' }, [{ id: 'unit', value: 5 }])], warnings);
      expect(out).toEqual([]);
      expect(warnings[0]).toContain('unit');
    });

    it('drops a numeric property whose value is NaN / non-number', () => {
      const out = mapOverrides([override({ id: 'byName', options: 'x' }, [{ id: 'min', value: 'lots' }])], []);
      expect(out).toEqual([]);
    });
  });

  it('drops an override whose every property dropped (matcher fine, no effect left)', () => {
    const warnings: string[] = [];
    const out = mapOverrides([override({ id: 'byName', options: 'cpu' }, [{ id: 'thresholds', value: { steps: [] } }])], warnings);
    expect(out).toEqual([]);
    expect(warnings[0]).toContain('thresholds');
  });

  describe('import bounds (DoS hardening)', () => {
    it('truncates an over-large overrides array to the cap with a warning', () => {
      const warnings: string[] = [];
      const huge = Array.from({ length: 1001 }, () => override({ id: 'byName', options: 'cpu' }, [{ id: 'unit', value: 'bytes' }]));
      const out = mapOverrides(huge, warnings);
      expect(out).toHaveLength(1000);
      expect(warnings.join('\n')).toContain('1001 field overrides; only the first 1000');
    });

    it('truncates an over-large properties array to the cap with a warning', () => {
      const warnings: string[] = [];
      const manyProps = Array.from({ length: 65 }, () => ({ id: 'unit', value: 'bytes' }));
      const out = mapOverrides([override({ id: 'byName', options: 'cpu' }, manyProps)], warnings);
      expect(out[0]?.properties).toHaveLength(64);
      expect(warnings.join('\n')).toContain('65 properties; only the first 64');
    });
  });
});
