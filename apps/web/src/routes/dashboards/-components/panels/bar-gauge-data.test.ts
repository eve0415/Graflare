import type { PanelDataResult } from './use-panel-data';

import { describe, expect, it } from 'vitest';

import { barGaugeSegments } from './bar-gauge-data';

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

// Matrix shape — the latest sample of each series is what the bar reads.
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

describe('barGaugeSegments', () => {
  it('returns one segment per series with label, value and clamped fraction', () => {
    const segments = barGaugeSegments(
      vector([
        { metric: { __name__: 'up', instance: 'a' }, value: 25 },
        { metric: { __name__: 'up', instance: 'b' }, value: 75 },
      ]),
      0,
      100,
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ label: 'up', value: 25, fraction: 0.25 });
    expect(segments[1]).toEqual({ label: 'up', value: 75, fraction: 0.75 });
  });

  it('reads the latest sample of a matrix series', () => {
    const segments = barGaugeSegments(matrix([{ metric: { __name__: 'load' }, values: [1, 2, 9] }]), 0, 10);
    expect(segments).toEqual([{ label: 'load', value: 9, fraction: 0.9 }]);
  });

  it('clamps fraction to [0,1] for values below min and above max', () => {
    const segments = barGaugeSegments(
      vector([
        { metric: { instance: 'low' }, value: -50 },
        { metric: { instance: 'high' }, value: 500 },
      ]),
      0,
      100,
    );

    expect(segments[0]?.fraction).toBe(0);
    expect(segments[1]?.fraction).toBe(1);
    // The raw value is preserved even when the fraction clamps.
    expect(segments[0]?.value).toBe(-50);
    expect(segments[1]?.value).toBe(500);
  });

  it('handles a single series', () => {
    const segments = barGaugeSegments(vector([{ metric: { __name__: 'mem' }, value: 50 }]), 0, 100);
    expect(segments).toEqual([{ label: 'mem', value: 50, fraction: 0.5 }]);
  });

  it('returns an empty array for null data', () => {
    expect(barGaugeSegments(null, 0, 100)).toEqual([]);
  });

  it('returns an empty array when there are no results', () => {
    expect(barGaugeSegments([{ status: 'success', data: { resultType: 'vector', result: [] } }], 0, 100)).toEqual([]);
  });

  it('falls back to a series index label when no metric name or instance label is present', () => {
    const segments = barGaugeSegments(vector([{ metric: {}, value: 10 }]), 0, 100);
    expect(segments[0]?.label).toBe('Series 1');
  });

  it('prefers a non-__name__ label when __name__ is absent', () => {
    const segments = barGaugeSegments(vector([{ metric: { instance: 'web-1' }, value: 10 }]), 0, 100);
    expect(segments[0]?.label).toBe('web-1');
  });

  it('avoids divide-by-zero when min equals max', () => {
    const segments = barGaugeSegments(vector([{ metric: {}, value: 5 }]), 10, 10);
    // A zero-width range collapses to a finite 0 fraction, never NaN/Infinity.
    expect(segments[0]?.fraction).toBe(0);
  });
});
