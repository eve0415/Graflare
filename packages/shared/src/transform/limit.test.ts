import type { ResultSeries } from './series';

import { describe, expect, it } from 'vitest';

import { limit } from './limit';

const named = (name: string): ResultSeries => ({ metric: { __name__: name }, value: [0, '1'] });

describe('limit', () => {
  const series = [named('a'), named('b'), named('c'), named('d')];

  it('keeps the first N series', () => {
    expect(limit(series, { count: 2 }).map(s => s.metric.__name__)).toEqual(['a', 'b']);
  });

  it('count 0 keeps none', () => {
    expect(limit(series, { count: 0 })).toEqual([]);
  });

  it('count >= length returns the SAME reference (no needless copy)', () => {
    expect(limit(series, { count: 4 })).toBe(series);
    expect(limit(series, { count: 99 })).toBe(series);
  });

  it('passes kept rows through by reference', () => {
    const out = limit(series, { count: 2 });
    expect(out[0]).toBe(series[0]);
    expect(out[1]).toBe(series[1]);
  });

  it('does not mutate the input', () => {
    const snapshot = [...series];
    limit(series, { count: 1 });
    expect(series).toEqual(snapshot);
  });

  it('an empty list stays empty', () => {
    expect(limit([], { count: 3 })).toEqual([]);
  });
});
