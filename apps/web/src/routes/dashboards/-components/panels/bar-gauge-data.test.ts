import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig } from '@graflare/shared/schemas/field-config';

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

// A defaults-only config carrying the panel range; no overrides — the regression case.
const range = (min: number, max: number): FieldConfig => ({ defaults: { unit: '', mappings: [], min, max }, overrides: [] });

describe('barGaugeSegments', () => {
  it('returns one segment per series with label, value and clamped fraction', () => {
    const segments = barGaugeSegments(
      vector([
        { metric: { __name__: 'up', instance: 'a' }, value: 25 },
        { metric: { __name__: 'up', instance: 'b' }, value: 75 },
      ]),
      range(0, 100),
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ label: 'up', value: 25, fraction: 0.25 });
    expect(segments[1]).toMatchObject({ label: 'up', value: 75, fraction: 0.75 });
  });

  it('reads the latest sample of a matrix series', () => {
    const segments = barGaugeSegments(matrix([{ metric: { __name__: 'load' }, values: [1, 2, 9] }]), range(0, 10));
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ label: 'load', value: 9, fraction: 0.9 });
  });

  it('clamps fraction to [0,1] for values below min and above max', () => {
    const segments = barGaugeSegments(
      vector([
        { metric: { instance: 'low' }, value: -50 },
        { metric: { instance: 'high' }, value: 500 },
      ]),
      range(0, 100),
    );

    expect(segments[0]?.fraction).toBe(0);
    expect(segments[1]?.fraction).toBe(1);
    // The raw value is preserved even when the fraction clamps.
    expect(segments[0]?.value).toBe(-50);
    expect(segments[1]?.value).toBe(500);
  });

  it('handles a single series', () => {
    const segments = barGaugeSegments(vector([{ metric: { __name__: 'mem' }, value: 50 }]), range(0, 100));
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ label: 'mem', value: 50, fraction: 0.5 });
  });

  it('returns an empty array for null data', () => {
    expect(barGaugeSegments(null, range(0, 100))).toEqual([]);
  });

  it('returns an empty array when there are no results', () => {
    expect(barGaugeSegments([{ status: 'success', data: { resultType: 'vector', result: [] } }], range(0, 100))).toEqual([]);
  });

  it('falls back to a series index label when no metric name or instance label is present', () => {
    const segments = barGaugeSegments(vector([{ metric: {}, value: 10 }]), range(0, 100));
    expect(segments[0]?.label).toBe('Series 1');
  });

  it('prefers a non-__name__ label when __name__ is absent', () => {
    const segments = barGaugeSegments(vector([{ metric: { instance: 'web-1' }, value: 10 }]), range(0, 100));
    expect(segments[0]?.label).toBe('web-1');
  });

  it('avoids divide-by-zero when min equals max', () => {
    const segments = barGaugeSegments(vector([{ metric: {}, value: 5 }]), range(10, 10));
    // A zero-width range collapses to a finite 0 fraction, never NaN/Infinity.
    expect(segments[0]?.fraction).toBe(0);
  });

  it('defaults the range to [0,100] when the config sets no min/max (byte-identical to before overrides)', () => {
    // No overrides, no explicit range: every series resolves to the defaults reference,
    // so the implicit [0,100] gauge range applies exactly as the panel did before.
    const segments = barGaugeSegments(vector([{ metric: { __name__: 'cpu' }, value: 25 }]), { defaults: { unit: '', mappings: [] }, overrides: [] });
    expect(segments[0]?.fraction).toBe(0.25);
  });

  it('resolves the defaults config reference for every series when overrides is empty', () => {
    // The byte-equivalence guarantee at the data layer: a no-override resolve returns the
    // SAME defaults object for each segment, so formatting/colour downstream is unchanged.
    const config = range(0, 100);
    const segments = barGaugeSegments(
      vector([
        { metric: { __name__: 'a' }, value: 10 },
        { metric: { __name__: 'b' }, value: 20 },
      ]),
      config,
    );
    expect(segments[0]?.config).toBe(config.defaults);
    expect(segments[1]?.config).toBe(config.defaults);
  });

  it('applies a byName min/max override to its matched series only', () => {
    // `a` gets a 0..200 range via override (so 50 → 0.25); `b` keeps the 0..100 default
    // (50 → 0.5). The override changes only the matched bar's scale.
    const config: FieldConfig = {
      defaults: { unit: '', mappings: [], min: 0, max: 100 },
      overrides: [{ matcher: { id: 'byName', options: 'a' }, properties: [{ id: 'max', value: 200 }] }],
    };
    const segments = barGaugeSegments(
      vector([
        { metric: { __name__: 'a' }, value: 50 },
        { metric: { __name__: 'b' }, value: 50 },
      ]),
      config,
    );
    expect(segments[0]?.fraction).toBe(0.25);
    expect(segments[1]?.fraction).toBe(0.5);
    // The matched series carries the overridden config; the other keeps the defaults ref.
    expect(segments[0]?.config.max).toBe(200);
    expect(segments[1]?.config).toBe(config.defaults);
  });

  it('matches a byName override on the derived label, not the raw __name__, for an instance-only series', () => {
    // The bar shows `web-1` (no __name__), so an override authored against `web-1` matches
    // what the user sees — proving the descriptor name is the displayed label.
    const config: FieldConfig = {
      defaults: { unit: '', mappings: [], min: 0, max: 100 },
      overrides: [{ matcher: { id: 'byName', options: 'web-1' }, properties: [{ id: 'unit', value: 'bytes' }] }],
    };
    const segments = barGaugeSegments(vector([{ metric: { instance: 'web-1' }, value: 1536 }]), config);
    expect(segments[0]?.config.unit).toBe('bytes');
  });
});
