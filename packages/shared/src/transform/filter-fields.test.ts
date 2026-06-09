import type { ResultSeries } from './series';

import { describe, expect, it } from 'vitest';

import { filterFieldsByName } from './filter-fields';

const named = (name: string): ResultSeries => ({ metric: { __name__: name }, value: [0, '1'] });

describe('filterFieldsByName', () => {
  const series = [named('cpu'), named('mem'), named('cpu_total')];

  describe('byName (exact label equality)', () => {
    it('include keeps only the exactly-named series', () => {
      const out = filterFieldsByName(series, { mode: 'include', match: 'byName', value: 'cpu' });
      expect(out.map(s => s.metric.__name__)).toEqual(['cpu']);
    });
    it('exclude drops the exactly-named series', () => {
      const out = filterFieldsByName(series, { mode: 'exclude', match: 'byName', value: 'cpu' });
      expect(out.map(s => s.metric.__name__)).toEqual(['mem', 'cpu_total']);
    });
  });

  describe('byRegexp (pattern test on the label)', () => {
    it('include keeps series whose label matches the pattern', () => {
      const out = filterFieldsByName(series, { mode: 'include', match: 'byRegexp', value: '^cpu' });
      expect(out.map(s => s.metric.__name__)).toEqual(['cpu', 'cpu_total']);
    });
    it('exclude drops series whose label matches the pattern', () => {
      const out = filterFieldsByName(series, { mode: 'exclude', match: 'byRegexp', value: '^cpu' });
      expect(out.map(s => s.metric.__name__)).toEqual(['mem']);
    });
    it('an invalid regexp matches nothing (no throw): include keeps none, exclude keeps all', () => {
      expect(filterFieldsByName(series, { mode: 'include', match: 'byRegexp', value: '[' })).toEqual([]);
      expect(filterFieldsByName(series, { mode: 'exclude', match: 'byRegexp', value: '[' })).toHaveLength(3);
    });
  });

  describe('label derivation (matches what the panel displays)', () => {
    it('matches the derived label from a non-__name__ metric (first other label)', () => {
      const s = [{ metric: { instance: 'web-1' }, value: [0, '1'] satisfies [number, string] }, named('cpu')];
      const out = filterFieldsByName(s, { mode: 'include', match: 'byName', value: 'web-1' });
      expect(out).toHaveLength(1);
      expect(out[0]?.metric.instance).toBe('web-1');
    });

    it('matches the positional fallback label (Series N) when a metric is empty', () => {
      const s = [{ metric: {}, value: [0, '1'] satisfies [number, string] }, named('cpu')];
      // The empty-metric series is index 0 → "Series 1".
      const out = filterFieldsByName(s, { mode: 'include', match: 'byName', value: 'Series 1' });
      expect(out).toHaveLength(1);
      expect(out[0]?.metric).toEqual({});
    });
  });

  describe('empty value (unconfigured filter is inert)', () => {
    it('include with empty value keeps nothing', () => {
      expect(filterFieldsByName(series, { mode: 'include', match: 'byName', value: '' })).toEqual([]);
    });
    it('exclude with empty value keeps everything (a fresh copy)', () => {
      const out = filterFieldsByName(series, { mode: 'exclude', match: 'byName', value: '' });
      expect(out).toHaveLength(3);
      expect(out).not.toBe(series); // copied, not the same ref
    });
  });

  it('passes surviving series through by reference (no copy of the rows)', () => {
    const out = filterFieldsByName(series, { mode: 'include', match: 'byRegexp', value: '^cpu' });
    expect(out[0]).toBe(series[0]);
  });

  it('no match → empty for include', () => {
    expect(filterFieldsByName(series, { mode: 'include', match: 'byName', value: 'nope' })).toEqual([]);
  });
});
