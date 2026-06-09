import type { Transformation } from '../schemas/transformation';
import type { ResultSeries } from './series';

import { describe, expect, it } from 'vitest';

import { applyTransformations } from './apply';

// A matrix series with the given metric and numeric samples (timestamps 0,1,2…).
const matrix = (metric: Record<string, string>, values: number[]): ResultSeries => ({
  metric,
  values: values.map((v, i): [number, string] => [i, String(v)]),
});

// An instant series (single value tuple).
const vector = (metric: Record<string, string>, value: number): ResultSeries => ({ metric, value: [0, String(value)] });

describe('applyTransformations', () => {
  describe('empty transforms → identity', () => {
    it('returns the SAME array reference when transforms is empty (no copy)', () => {
      const series = [matrix({ __name__: 'a' }, [1, 2, 3]), matrix({ __name__: 'b' }, [4, 5])];
      const out = applyTransformations(series, []);
      // Reference identity is the contract: a no-transform panel feeds the exact same array to the
      // viz, so nothing about its render can change.
      expect(out).toBe(series);
    });

    it('leaves the series objects untouched (byte-identical) with empty transforms', () => {
      const a = matrix({ __name__: 'a' }, [1, 2, 3]);
      const out = applyTransformations([a], []);
      expect(out[0]).toBe(a);
    });
  });

  describe('ordering — transforms run left to right', () => {
    it('sortBy then limit keeps the top-N by the sorted order', () => {
      const series = [vector({ __name__: 'a' }, 5), vector({ __name__: 'b' }, 30), vector({ __name__: 'c' }, 10)];
      const transforms: Transformation[] = [
        { id: 'sortBy', options: { by: 'value', desc: true } },
        { id: 'limit', options: { count: 2 } },
      ];
      const out = applyTransformations(series, transforms);
      expect(out.map(s => s.metric.__name__)).toEqual(['b', 'c']); // 30, 10 — the two largest
    });

    it('limit then sortBy sorts only the first-N slice (order matters)', () => {
      const series = [vector({ __name__: 'a' }, 5), vector({ __name__: 'b' }, 30), vector({ __name__: 'c' }, 10)];
      const transforms: Transformation[] = [
        { id: 'limit', options: { count: 2 } }, // keeps a(5), b(30)
        { id: 'sortBy', options: { by: 'value', desc: true } }, // → b(30), a(5)
      ];
      const out = applyTransformations(series, transforms);
      expect(out.map(s => s.metric.__name__)).toEqual(['b', 'a']);
    });

    it('chains filter → reduce: filter narrows the set, reduce collapses each survivor', () => {
      const series = [matrix({ __name__: 'cpu' }, [10, 20, 30]), matrix({ __name__: 'mem' }, [1, 2, 3]), matrix({ __name__: 'cpu_total' }, [5, 5])];
      const transforms: Transformation[] = [
        { id: 'filterFieldsByName', options: { mode: 'include', match: 'byRegexp', value: '^cpu' } },
        { id: 'reduce', options: { calc: 'sum' } },
      ];
      const out = applyTransformations(series, transforms);
      expect(out.map(s => s.metric.__name__)).toEqual(['cpu', 'cpu_total']);
      expect(out[0]?.value).toEqual([0, '60']); // 10+20+30
      expect(out[1]?.value).toEqual([0, '10']); // 5+5
      expect(out[0]?.values).toBeUndefined(); // reduced to an instant value
    });

    it('organize rename then filter matches the RENAMED label (composition)', () => {
      const series = [matrix({ __name__: 'old' }, [1, 2]), matrix({ __name__: 'keep' }, [3, 4])];
      const transforms: Transformation[] = [
        { id: 'organize', options: { renameByName: { old: 'renamed' }, excludeByName: {}, indexByName: {} } },
        { id: 'filterFieldsByName', options: { mode: 'include', match: 'byName', value: 'renamed' } },
      ];
      const out = applyTransformations(series, transforms);
      // Only the renamed series survives — proving the rename flowed through to the filter's label.
      expect(out).toHaveLength(1);
      expect(out[0]?.metric.__name__).toBe('renamed');
    });
  });

  describe('immutability — never mutate the input rows', () => {
    it('does not mutate the input metric when organize renames', () => {
      const a = matrix({ __name__: 'a', instance: 'x' }, [1, 2]);
      applyTransformations([a], [{ id: 'organize', options: { renameByName: { a: 'b' }, excludeByName: {}, indexByName: {} } }]);
      // The original cache row is untouched — its __name__ is still 'a'.
      expect(a.metric.__name__).toBe('a');
    });

    it('does not mutate the input when reduce collapses values', () => {
      const a = matrix({ __name__: 'a' }, [1, 2, 3]);
      applyTransformations([a], [{ id: 'reduce', options: { calc: 'last' } }]);
      expect(a.values).toEqual([
        [0, '1'],
        [1, '2'],
        [2, '3'],
      ]);
      expect(a.value).toBeUndefined();
    });
  });

  it('an empty input series list stays empty under any transform', () => {
    expect(applyTransformations([], [{ id: 'reduce', options: { calc: 'mean' } }])).toEqual([]);
    expect(applyTransformations([], [{ id: 'limit', options: { count: 5 } }])).toEqual([]);
  });
});
