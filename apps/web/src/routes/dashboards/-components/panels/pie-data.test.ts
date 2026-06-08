import type { PanelDataResult } from './use-panel-data';

import { describe, expect, it } from 'vitest';

import { pieSlices } from './pie-data';

// Minimal Prometheus instant-vector success shape, one entry per series.
const vector = (samples: { metric: Record<string, string>; value: number }[]): PanelDataResult[] => [
  {
    status: 'success',
    data: {
      resultType: 'vector',
      result: samples.map((s): { metric: Record<string, string>; value: [number, string] } => ({ metric: s.metric, value: [0, String(s.value)] })),
    },
  },
];

// Matrix shape — the latest sample of each series is what the slice reads.
const matrix = (series: { metric: Record<string, string>; values: number[] }[]): PanelDataResult[] => [
  {
    status: 'success',
    data: {
      resultType: 'matrix',
      result: series.map((s): { metric: Record<string, string>; values: [number, string][] } => ({
        metric: s.metric,
        values: s.values.map((v, i): [number, string] => [i, String(v)]),
      })),
    },
  },
];

const palette = ['#aaa', '#bbb', '#ccc'];

describe('pieSlices', () => {
  it('returns one slice per series with fraction and cumulative angles', () => {
    const slices = pieSlices(
      vector([
        { metric: { __name__: 'a' }, value: 60 },
        { metric: { __name__: 'b' }, value: 40 },
      ]),
      palette,
    );

    expect(slices).toHaveLength(2);
    expect(slices[0]).toEqual({ label: 'a', value: 60, fraction: 0.6, startAngle: 0, endAngle: 216, color: '#aaa' });
    expect(slices[1]).toEqual({ label: 'b', value: 40, fraction: 0.4, startAngle: 216, endAngle: 360, color: '#bbb' });
  });

  it('reads the latest sample of a matrix series', () => {
    const slices = pieSlices(matrix([{ metric: { __name__: 'load' }, values: [1, 2, 9] }]), palette);
    expect(slices).toEqual([{ label: 'load', value: 9, fraction: 1, startAngle: 0, endAngle: 360, color: '#aaa' }]);
  });

  it('gives a single series the full circle', () => {
    const slices = pieSlices(vector([{ metric: { __name__: 'only' }, value: 5 }]), palette);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.fraction).toBe(1);
    expect(slices[0]?.startAngle).toBe(0);
    expect(slices[0]?.endAngle).toBe(360);
  });

  it('returns an empty array for null data', () => {
    expect(pieSlices(null, palette)).toEqual([]);
  });

  it('returns an empty array when there are no results', () => {
    expect(pieSlices([{ status: 'success', data: { resultType: 'vector', result: [] } }], palette)).toEqual([]);
  });

  it('avoids divide-by-zero when the total is zero', () => {
    const slices = pieSlices(
      vector([
        { metric: { __name__: 'a' }, value: 0 },
        { metric: { __name__: 'b' }, value: 0 },
      ]),
      palette,
    );

    // A zero total yields finite 0 fractions and collapsed angles, never NaN.
    expect(slices).toEqual([
      { label: 'a', value: 0, fraction: 0, startAngle: 0, endAngle: 0, color: '#aaa' },
      { label: 'b', value: 0, fraction: 0, startAngle: 0, endAngle: 0, color: '#bbb' },
    ]);
  });

  it('drops non-finite latest samples so angles never run backward', () => {
    const slices = pieSlices(
      vector([
        { metric: { __name__: 'good' }, value: 10 },
        { metric: { __name__: 'bad' }, value: Number.NaN },
      ]),
      palette,
    );

    expect(slices).toHaveLength(1);
    expect(slices[0]?.label).toBe('good');
    expect(slices[0]?.fraction).toBe(1);
  });

  it('cycles the palette when there are more series than colors', () => {
    const slices = pieSlices(
      vector([
        { metric: { __name__: 'a' }, value: 1 },
        { metric: { __name__: 'b' }, value: 1 },
        { metric: { __name__: 'c' }, value: 1 },
        { metric: { __name__: 'd' }, value: 1 },
      ]),
      palette,
    );

    expect(slices.map(s => s.color)).toEqual(['#aaa', '#bbb', '#ccc', '#aaa']);
  });

  it('labels from __name__, then another label, then a positional fallback', () => {
    const slices = pieSlices(
      vector([
        { metric: { __name__: 'named' }, value: 1 },
        { metric: { instance: 'web-1' }, value: 1 },
        { metric: {}, value: 1 },
      ]),
      palette,
    );

    expect(slices.map(s => s.label)).toEqual(['named', 'web-1', 'Series 3']);
  });

  it('keeps cumulative angles continuous across kept slices when a sample is dropped', () => {
    const slices = pieSlices(
      vector([
        { metric: { __name__: 'a' }, value: 30 },
        { metric: { __name__: 'skip' }, value: Number.POSITIVE_INFINITY },
        { metric: { __name__: 'b' }, value: 10 },
      ]),
      palette,
    );

    // 'skip' is dropped; the two kept slices split the total (40) as 75% / 25% with
    // no gap, and the positional palette index tracks kept slices (b -> '#bbb').
    expect(slices).toHaveLength(2);
    expect(slices[0]).toEqual({ label: 'a', value: 30, fraction: 0.75, startAngle: 0, endAngle: 270, color: '#aaa' });
    expect(slices[1]).toEqual({ label: 'b', value: 10, fraction: 0.25, startAngle: 270, endAngle: 360, color: '#bbb' });
  });
});
