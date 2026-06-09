import type { PanelDataResult } from './use-panel-data';
import type { Transformation } from '@graflare/shared/schemas/transformation';

import { describe, expect, it } from 'vitest';

import {
  extractResultSeries,
  extractTransformedSeries,
  extractTransformedSeriesWithQuery,
  firstScalar,
  getThresholdColor,
  latestSample,
  readableTextColor,
} from './panel-data-extract';

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

// Matrix shape — each series carries a `values` array, most recent last.
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

describe('extractResultSeries', () => {
  it('pulls one series per result row from a vector response, keeping metric and value', () => {
    const series = extractResultSeries(
      vector([
        { metric: { __name__: 'up', instance: 'a' }, value: 1 },
        { metric: { __name__: 'up', instance: 'b' }, value: 0 },
      ]),
    );
    expect(series).toHaveLength(2);
    expect(series[0]?.metric).toEqual({ __name__: 'up', instance: 'a' });
    expect(series[0]?.value).toEqual([0, '1']);
    expect(series[1]?.value).toEqual([0, '0']);
  });

  it('pulls every series with its full values array from a matrix response, in order', () => {
    const series = extractResultSeries(
      matrix([
        { metric: { __name__: 'a' }, values: [10, 20, 30] },
        { metric: { __name__: 'b' }, values: [40, 50] },
      ]),
    );
    expect(series).toHaveLength(2);
    expect(series[0]?.values).toEqual([
      [0, '10'],
      [1, '20'],
      [2, '30'],
    ]);
    expect(series[1]?.values).toEqual([
      [0, '40'],
      [1, '50'],
    ]);
  });

  it('returns an empty array for null/undefined data', () => {
    const missing: PanelDataResult[] | undefined = undefined;
    expect(extractResultSeries(null)).toEqual([]);
    expect(extractResultSeries(missing)).toEqual([]);
  });

  it('skips error responses', () => {
    expect(extractResultSeries([{ status: 'error', errorType: 'bad', error: 'nope' }])).toEqual([]);
  });

  it('skips SQL (columns/rows) responses, which have no status', () => {
    expect(extractResultSeries([{ columns: [{ name: 'c' }], rows: [['x']] }])).toEqual([]);
  });

  it('skips a scalar result whose `result` is a bare tuple rather than an array of rows', () => {
    // resultType 'scalar'/'string' carry `result` as a single [number, string] tuple;
    // the per-row object check must reject its number/string elements.
    expect(extractResultSeries([{ status: 'success', data: { resultType: 'scalar', result: [0, '42'] } }])).toEqual([]);
  });

  it('continues past an empty success response to the next response with data', () => {
    const data: PanelDataResult[] = [{ status: 'success', data: { resultType: 'vector', result: [] } }, ...vector([{ metric: { __name__: 'up' }, value: 7 }])];
    const series = extractResultSeries(data);
    expect(series).toHaveLength(1);
    expect(series[0]?.value).toEqual([0, '7']);
  });

  it('flattens rows across multiple responses, preserving order', () => {
    const data: PanelDataResult[] = [...vector([{ metric: { q: '1' }, value: 1 }]), ...vector([{ metric: { q: '2' }, value: 2 }])];
    const series = extractResultSeries(data);
    expect(series.map(s => s.metric.q)).toEqual(['1', '2']);
  });
});

describe('latestSample', () => {
  it('returns the instant `value` tuple when present', () => {
    expect(latestSample({ metric: {}, value: [3, '9'] })).toEqual([3, '9']);
  });

  it('returns the last entry of a `values` array when there is no `value`', () => {
    expect(
      latestSample({
        metric: {},
        values: [
          [0, '1'],
          [1, '2'],
          [2, '3'],
        ],
      }),
    ).toEqual([2, '3']);
  });

  it('prefers `value` over `values` when both are present', () => {
    expect(latestSample({ metric: {}, value: [9, 'instant'], values: [[0, 'matrix']] })).toEqual([9, 'instant']);
  });

  it('returns undefined for an empty values array', () => {
    expect(latestSample({ metric: {}, values: [] })).toBeUndefined();
  });

  it('returns undefined when neither value nor values is present', () => {
    expect(latestSample({ metric: {} })).toBeUndefined();
  });
});

describe('firstScalar', () => {
  it('returns the raw string token of the first series (instant)', () => {
    expect(firstScalar(vector([{ metric: {}, value: 1536 }]))).toBe('1536');
  });

  it('returns the raw token of the latest matrix sample', () => {
    expect(firstScalar(matrix([{ metric: {}, values: [1, 2, 9] }]))).toBe('9');
  });

  it('preserves a non-numeric token verbatim (no Number coercion)', () => {
    expect(firstScalar([{ status: 'success', data: { resultType: 'vector', result: [{ metric: {}, value: [0, 'NaN'] }] } }])).toBe('NaN');
  });

  it('returns the first series only, ignoring later series', () => {
    expect(
      firstScalar(
        vector([
          { metric: { a: '1' }, value: 11 },
          { metric: { a: '2' }, value: 22 },
        ]),
      ),
    ).toBe('11');
  });

  it('skips an empty first response and reads the next', () => {
    const data: PanelDataResult[] = [{ status: 'success', data: { resultType: 'vector', result: [] } }, ...vector([{ metric: {}, value: 5 }])];
    expect(firstScalar(data)).toBe('5');
  });

  it('returns null for null data, error data, and no results', () => {
    expect(firstScalar(null)).toBeNull();
    expect(firstScalar([{ status: 'error', errorType: 'x', error: 'y' }])).toBeNull();
    expect(firstScalar([{ status: 'success', data: { resultType: 'vector', result: [] } }])).toBeNull();
  });
});

describe('getThresholdColor', () => {
  const thresholds = [
    { value: 0, color: 'green' },
    { value: 50, color: 'yellow' },
    { value: 80, color: 'red' },
  ];

  it('returns the highest threshold the value meets or exceeds', () => {
    expect(getThresholdColor(90, thresholds, 'fallback')).toBe('red');
    expect(getThresholdColor(60, thresholds, 'fallback')).toBe('yellow');
    expect(getThresholdColor(10, thresholds, 'fallback')).toBe('green');
  });

  it('matches a threshold exactly at its boundary', () => {
    expect(getThresholdColor(80, thresholds, 'fallback')).toBe('red');
  });

  it('returns the supplied noMatch default when the value is below every threshold', () => {
    expect(getThresholdColor(-5, thresholds, 'var(--color-foreground)')).toBe('var(--color-foreground)');
    expect(getThresholdColor(-5, thresholds, '#4ade80')).toBe('#4ade80');
  });

  it('returns the noMatch default for an empty threshold list', () => {
    expect(getThresholdColor(100, [], 'fallback')).toBe('fallback');
  });

  it('does not depend on threshold ordering in the input', () => {
    const shuffled = [
      { value: 80, color: 'red' },
      { value: 0, color: 'green' },
      { value: 50, color: 'yellow' },
    ];
    expect(getThresholdColor(60, shuffled, 'fallback')).toBe('yellow');
  });
});

describe('readableTextColor', () => {
  it('picks black text on a light background', () => {
    expect(readableTextColor('#ffffff')).toBe('#000');
    expect(readableTextColor('#fafad2')).toBe('#000');
  });

  it('picks white text on a dark background', () => {
    expect(readableTextColor('#000000')).toBe('#fff');
    expect(readableTextColor('#1e3a5f')).toBe('#fff');
  });

  it('picks black text on a mid yellow (luminance-driven, not naive average)', () => {
    // #f1c40f is bright enough that black, not white, clears 4.5:1 — the classic
    // case that a non-linearised luminance calc gets wrong.
    expect(readableTextColor('#f1c40f')).toBe('#000');
  });

  it('accepts 3-digit shorthand hex', () => {
    expect(readableTextColor('#fff')).toBe('#000');
    expect(readableTextColor('#000')).toBe('#fff');
  });

  it('falls back to black for an unparseable (non-hex) color string', () => {
    // stat-panel feeds `bgStyle.backgroundColor`, which can be the CSS var fallback
    // `var(--color-foreground)` when the value is below every threshold — never throw.
    expect(readableTextColor('var(--color-foreground)')).toBe('#000');
    expect(readableTextColor('')).toBe('#000');
    expect(readableTextColor('#12')).toBe('#000');
    expect(readableTextColor('#zzzzzz')).toBe('#000');
  });
});

describe('extractTransformedSeries', () => {
  const data = vector([
    { metric: { __name__: 'cpu' }, value: 5 },
    { metric: { __name__: 'mem' }, value: 9 },
  ]);

  it('with NO transformations returns the same series the plain extractor produces', () => {
    expect(extractTransformedSeries(data, [])).toEqual(extractResultSeries(data));
  });

  it('applies the transformations to the extracted series', () => {
    const transforms: Transformation[] = [{ id: 'filterFieldsByName', options: { mode: 'include', match: 'byName', value: 'cpu' } }];
    const out = extractTransformedSeries(data, transforms);
    expect(out.map(s => s.metric.__name__)).toEqual(['cpu']);
  });

  it('handles null data (returns empty) under any transform', () => {
    expect(extractTransformedSeries(null, [{ id: 'limit', options: { count: 1 } }])).toEqual([]);
  });
});

describe('extractTransformedSeriesWithQuery', () => {
  const data = vector([
    { metric: { __name__: 'cpu' }, value: 5 },
    { metric: { __name__: 'mem' }, value: 9 },
  ]);
  const queries = [{ refId: 'A', expr: 'cpu', legendFormat: '', format: 'time_series' as const }];

  it('with NO transformations preserves the refId pairing (byte-identical to the plain extractor)', () => {
    const out = extractTransformedSeriesWithQuery(data, queries, []);
    // The first row keeps its producing query's refId — the override layer depends on this.
    expect(out[0]?.refId).toBe('A');
    expect(out).toHaveLength(2);
  });

  it('with transformations applies them and DROPS the refId (byFrameRefID then unmatchable)', () => {
    const transforms: Transformation[] = [{ id: 'sortBy', options: { by: 'value', desc: true } }];
    const out = extractTransformedSeriesWithQuery(data, queries, transforms);
    expect(out.map(q => q.series.metric.__name__)).toEqual(['mem', 'cpu']); // sorted by value desc
    expect(out.every(q => q.refId === undefined)).toBe(true);
  });
});
