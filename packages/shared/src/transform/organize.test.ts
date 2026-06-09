import type { ResultSeries } from './series';

import { describe, expect, it } from 'vitest';

import { organize } from './organize';
import { deriveSeriesLabel } from './series';

const named = (name: string): ResultSeries => ({ metric: { __name__: name }, value: [0, '1'] });
const labels = (series: ResultSeries[]): string[] => series.map((s, i) => deriveSeriesLabel(s.metric, i));

describe('organize', () => {
  const empty = { excludeByName: {}, renameByName: {}, indexByName: {} };

  describe('exclude', () => {
    it('drops series whose label maps to true', () => {
      const out = organize([named('a'), named('b'), named('c')], { ...empty, excludeByName: { b: true } });
      expect(labels(out)).toEqual(['a', 'c']);
    });
    it('a false (or absent) entry keeps the series', () => {
      const out = organize([named('a'), named('b')], { ...empty, excludeByName: { a: false } });
      expect(labels(out)).toEqual(['a', 'b']);
    });
  });

  describe('rename', () => {
    it('rewrites __name__ so the new label drives display and matching', () => {
      const out = organize([named('old')], { ...empty, renameByName: { old: 'new' } });
      expect(out[0]?.metric.__name__).toBe('new');
      // The renamed metric derives the new label through the shared rule (so it flows to display).
      expect(labels(out)).toEqual(['new']);
    });
    it('an empty-string rename is treated as no rename', () => {
      const out = organize([named('a')], { ...empty, renameByName: { a: '' } });
      expect(out[0]?.metric.__name__).toBe('a');
    });
    it('preserves other metric labels when renaming', () => {
      const out = organize([{ metric: { __name__: 'a', instance: 'x' }, value: [0, '1'] }], { ...empty, renameByName: { a: 'b' } });
      expect(out[0]?.metric).toEqual({ __name__: 'b', instance: 'x' });
    });
  });

  describe('reorder (indexByName)', () => {
    it('orders indexed series by their index ascending', () => {
      const out = organize([named('a'), named('b'), named('c')], { ...empty, indexByName: { a: 2, b: 0, c: 1 } });
      expect(labels(out)).toEqual(['b', 'c', 'a']);
    });
    it('unindexed series sort after indexed ones, keeping input order (stable)', () => {
      const out = organize([named('a'), named('b'), named('c'), named('d')], { ...empty, indexByName: { c: 0 } });
      // c first (indexed), then a, b, d in their original relative order.
      expect(labels(out)).toEqual(['c', 'a', 'b', 'd']);
    });
    it('ties on the same index keep input order', () => {
      const out = organize([named('a'), named('b')], { ...empty, indexByName: { a: 0, b: 0 } });
      expect(labels(out)).toEqual(['a', 'b']);
    });
  });

  describe('order of operations: exclude → rename → reorder by ORIGINAL label', () => {
    it('reorder keys on the pre-rename label', () => {
      const out = organize([named('a'), named('b')], { excludeByName: {}, renameByName: { a: 'z' }, indexByName: { a: 1, b: 0 } });
      // b (index 0) then the renamed a→z (index 1). Reorder matched on original 'a'.
      expect(labels(out)).toEqual(['b', 'z']);
    });
    it('an excluded series is gone before rename/reorder', () => {
      const out = organize([named('a'), named('b')], { excludeByName: { a: true }, renameByName: { a: 'z' }, indexByName: {} });
      expect(labels(out)).toEqual(['b']);
    });
  });

  describe('immutability', () => {
    it('does not mutate the input metric on rename', () => {
      const a = named('a');
      organize([a], { ...empty, renameByName: { a: 'b' } });
      expect(a.metric.__name__).toBe('a');
    });
    it('passes a non-renamed series through by reference', () => {
      const a = named('a');
      const out = organize([a], empty);
      expect(out[0]).toBe(a);
    });
  });

  it('all-empty maps → same series in input order (a no-op organize)', () => {
    const out = organize([named('a'), named('b')], empty);
    expect(labels(out)).toEqual(['a', 'b']);
  });
});
