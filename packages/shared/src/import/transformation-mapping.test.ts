import type { GrafanaTransformation } from '../schemas/grafana-classic';
import type { Transformation } from '../schemas/transformation';

import { describe, expect, it } from 'vitest';

import { mapTransformations } from './transformation-mapping';

// A Grafana transformation in the loose import shape (options is unknown). Defaults keep each case to
// the field under test.
const tf = (id: string, options?: unknown, disabled?: boolean): GrafanaTransformation => ({ id, options, disabled });

// Narrow a mapped transform to the organize branch so a test can read its maps without a conditional.
const asOrganize = (t: Transformation | undefined): Extract<Transformation, { id: 'organize' }>['options'] => {
  if (t?.id !== 'organize') throw new Error('expected an organize transform');
  return t.options;
};

describe('mapTransformations', () => {
  it('returns an empty array for no transformations (no warnings)', () => {
    const warnings: string[] = [];
    expect(mapTransformations([], warnings)).toEqual([]);
    expect(warnings).toEqual([]);
  });

  describe('reduce', () => {
    it('maps the first supported reducer to our calc', () => {
      const out = mapTransformations([tf('reduce', { reducers: ['mean'] })], []);
      expect(out).toEqual([{ id: 'reduce', options: { calc: 'mean' } }]);
    });

    it('warn-drops an unsupported reducer id, defaulting to last', () => {
      const warnings: string[] = [];
      const out = mapTransformations([tf('reduce', { reducers: ['median'] })], warnings);
      expect(out).toEqual([{ id: 'reduce', options: { calc: 'last' } }]);
      expect(warnings.join('\n')).toContain('median');
    });

    it('keeps reducers[0] and warns when multiple reducers are listed', () => {
      const warnings: string[] = [];
      const out = mapTransformations([tf('reduce', { reducers: ['sum', 'max'] })], warnings);
      expect(out).toEqual([{ id: 'reduce', options: { calc: 'sum' } }]);
      expect(warnings.join('\n')).toContain('2 reducers');
    });

    it('falls back to last with no reducers array', () => {
      expect(mapTransformations([tf('reduce', {})], [])).toEqual([{ id: 'reduce', options: { calc: 'last' } }]);
    });
  });

  describe('filterFieldsByName', () => {
    it('maps include.names[0] to a byName filter', () => {
      const out = mapTransformations([tf('filterFieldsByName', { include: { names: ['cpu'] } })], []);
      expect(out).toEqual([{ id: 'filterFieldsByName', options: { mode: 'include', match: 'byName', value: 'cpu' } }]);
    });

    it('maps include.pattern to a byRegexp filter (pattern wins over names)', () => {
      const out = mapTransformations([tf('filterFieldsByName', { include: { pattern: '^cpu', names: ['ignored'] } })], []);
      expect(out).toEqual([{ id: 'filterFieldsByName', options: { mode: 'include', match: 'byRegexp', value: '^cpu' } }]);
    });

    it('maps exclude to an exclude-mode filter', () => {
      const out = mapTransformations([tf('filterFieldsByName', { exclude: { names: ['mem'] } })], []);
      expect(out).toEqual([{ id: 'filterFieldsByName', options: { mode: 'exclude', match: 'byName', value: 'mem' } }]);
    });

    it('keeps the include side and warns when both include and exclude are present', () => {
      const warnings: string[] = [];
      const out = mapTransformations([tf('filterFieldsByName', { include: { names: ['a'] }, exclude: { names: ['b'] } })], warnings);
      expect(out[0]?.options).toEqual({ mode: 'include', match: 'byName', value: 'a' });
      expect(warnings.join('\n')).toContain('both include and exclude');
    });

    it('warns when multiple names are listed (only the first imported)', () => {
      const warnings: string[] = [];
      mapTransformations([tf('filterFieldsByName', { include: { names: ['a', 'b', 'c'] } })], warnings);
      expect(warnings.join('\n')).toContain('3 names');
    });

    it('drops a filter with neither a pattern nor a name', () => {
      const out = mapTransformations([tf('filterFieldsByName', { include: {} })], []);
      expect(out).toEqual([]);
    });
  });

  describe('organize / organizeFields', () => {
    it('maps rename/exclude/index maps, keeping only well-typed entries', () => {
      const out = mapTransformations(
        [tf('organize', { renameByName: { a: 'A', bad: 5 }, excludeByName: { b: true, x: 'nope' }, indexByName: { c: 1, y: 'no' } })],
        [],
      );
      expect(out).toEqual([{ id: 'organize', options: { renameByName: { a: 'A' }, excludeByName: { b: true }, indexByName: { c: 1 } } }]);
    });

    it('treats the organizeFields alias the same as organize', () => {
      const out = mapTransformations([tf('organizeFields', { renameByName: { a: 'A' } })], []);
      expect(out).toEqual([{ id: 'organize', options: { renameByName: { a: 'A' }, excludeByName: {}, indexByName: {} } }]);
    });

    it('drops an organize whose every map is empty (a no-op)', () => {
      expect(mapTransformations([tf('organize', { renameByName: {} })], [])).toEqual([]);
    });
  });

  describe('sortBy', () => {
    it('maps to sort-by-value, preserving desc, with a divergence warning', () => {
      const warnings: string[] = [];
      const out = mapTransformations([tf('sortBy', { sort: [{ field: 'Value', desc: true }] })], warnings);
      expect(out).toEqual([{ id: 'sortBy', options: { by: 'value', desc: true } }]);
      expect(warnings.join('\n')).toContain('series-list ordering');
    });

    it('defaults desc to false when absent', () => {
      const out = mapTransformations([tf('sortBy', { sort: [{ field: 'Value' }] })], []);
      expect(out[0]?.options).toEqual({ by: 'value', desc: false });
    });

    it('drops a sortBy with an empty sort array', () => {
      expect(mapTransformations([tf('sortBy', { sort: [] })], [])).toEqual([]);
    });
  });

  describe('limit', () => {
    it('maps a numeric limitField to count', () => {
      expect(mapTransformations([tf('limit', { limitField: 5 })], [])).toEqual([{ id: 'limit', options: { count: 5 } }]);
    });
    it('parses a string limitField', () => {
      expect(mapTransformations([tf('limit', { limitField: '7' })], [])).toEqual([{ id: 'limit', options: { count: 7 } }]);
    });
    it('clamps an out-of-range limitField to the schema bound', () => {
      expect(mapTransformations([tf('limit', { limitField: 99999 })], [])).toEqual([{ id: 'limit', options: { count: 10000 } }]);
    });
    it('defaults to 10 with no/garbage limitField', () => {
      expect(mapTransformations([tf('limit', {})], [])).toEqual([{ id: 'limit', options: { count: 10 } }]);
      expect(mapTransformations([tf('limit', { limitField: 'abc' })], [])).toEqual([{ id: 'limit', options: { count: 10 } }]);
    });
  });

  describe('warn-drop unsupported / disabled', () => {
    it('warn-drops an unsupported transform id', () => {
      const warnings: string[] = [];
      const out = mapTransformations([tf('merge')], warnings);
      expect(out).toEqual([]);
      expect(warnings.join('\n')).toContain('merge');
    });

    it('drops a disabled transform silently (no warning)', () => {
      const warnings: string[] = [];
      const out = mapTransformations([tf('reduce', { reducers: ['sum'] }, true)], warnings);
      expect(out).toEqual([]);
      expect(warnings).toEqual([]);
    });

    it('keeps the order of supported transforms, skipping dropped ones', () => {
      const out = mapTransformations([tf('reduce', { reducers: ['sum'] }), tf('merge'), tf('limit', { limitField: 3 })], []);
      expect(out.map(t => t.id)).toEqual(['reduce', 'limit']);
    });
  });

  describe('import bounds (DoS hardening)', () => {
    it('truncates an over-large transformations array to the cap with a warning', () => {
      const warnings: string[] = [];
      const huge = Array.from({ length: 1001 }, () => tf('limit', { limitField: 1 }));
      const out = mapTransformations(huge, warnings);
      expect(out).toHaveLength(1000);
      expect(warnings.join('\n')).toContain('1001 transformations; only the first 1000');
    });

    it('truncates an over-large organize map with a warning, keeping the first 1000 entries', () => {
      const warnings: string[] = [];
      const renameByName = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`s${String(i)}`, `r${String(i)}`]));
      const [transform] = mapTransformations([tf('organize', { renameByName })], warnings);
      expect(Object.keys(asOrganize(transform).renameByName)).toHaveLength(1000);
      expect(warnings.join('\n')).toContain('1001 entries; only the first 1000');
    });
  });
});
