import type { ResultSeries } from './series';

import { describe, expect, it } from 'vitest';

import { deriveSeriesLabel } from './series';
import { sortBy } from './sort-by';

const named = (name: string, value: number): ResultSeries => ({ metric: { __name__: name }, value: [0, String(value)] });
const labels = (series: ResultSeries[]): string[] => series.map((s, i) => deriveSeriesLabel(s.metric, i));

describe('sortBy', () => {
  describe('by name', () => {
    const series = [named('charlie', 1), named('alpha', 2), named('bravo', 3)];
    it('ascending sorts labels A→Z', () => {
      expect(labels(sortBy(series, { by: 'name', desc: false }))).toEqual(['alpha', 'bravo', 'charlie']);
    });
    it('descending sorts labels Z→A', () => {
      expect(labels(sortBy(series, { by: 'name', desc: true }))).toEqual(['charlie', 'bravo', 'alpha']);
    });
  });

  describe('by value (latest sample)', () => {
    const series = [named('a', 30), named('b', 10), named('c', 20)];
    it('ascending sorts smallest→largest', () => {
      expect(labels(sortBy(series, { by: 'value', desc: false }))).toEqual(['b', 'c', 'a']);
    });
    it('descending sorts largest→smallest', () => {
      expect(labels(sortBy(series, { by: 'value', desc: true }))).toEqual(['a', 'c', 'b']);
    });
    it('uses the LAST sample of a matrix series as the value', () => {
      const s: ResultSeries[] = [
        {
          metric: { __name__: 'a' },
          values: [
            [0, '1'],
            [1, '99'],
          ],
        },
        {
          metric: { __name__: 'b' },
          values: [
            [0, '50'],
            [1, '50'],
          ],
        },
      ];
      // a's latest is 99, b's is 50 → desc puts a first.
      expect(labels(sortBy(s, { by: 'value', desc: true }))).toEqual(['a', 'b']);
    });
  });

  describe('non-numeric / no-sample values sort last regardless of direction', () => {
    const series = [named('a', 10), { metric: { __name__: 'nan' }, value: [0, 'NaN'] satisfies [number, string] }, named('b', 20)];
    it('ascending: real values first, NaN at the end', () => {
      expect(labels(sortBy(series, { by: 'value', desc: false }))).toEqual(['a', 'b', 'nan']);
    });
    it('descending: real values first (desc), NaN still at the end', () => {
      expect(labels(sortBy(series, { by: 'value', desc: true }))).toEqual(['b', 'a', 'nan']);
    });
    it('a series with no sample at all also sorts last', () => {
      const s: ResultSeries[] = [{ metric: { __name__: 'empty' } }, named('a', 5)];
      expect(labels(sortBy(s, { by: 'value', desc: false }))).toEqual(['a', 'empty']);
    });
  });

  it('is stable for equal keys (input order preserved)', () => {
    const series = [named('a', 5), named('b', 5), named('c', 5)];
    expect(labels(sortBy(series, { by: 'value', desc: false }))).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const series = [named('b', 1), named('a', 2)];
    const snapshot = [...series];
    sortBy(series, { by: 'name', desc: false });
    expect(series).toEqual(snapshot);
  });

  it('passes the series rows through by reference', () => {
    const series = [named('b', 1), named('a', 2)];
    const out = sortBy(series, { by: 'name', desc: false });
    expect(out[0]).toBe(series[1]); // 'a' was index 1
  });
});
