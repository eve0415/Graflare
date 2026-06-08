import type { PanelDataResult } from './use-panel-data';
import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';

import { describe, expect, it } from 'vitest';

import { barChartAlignedData, barChartSeries, buildBarChartOptions, formatBarChartTicks } from './bar-chart-data';

// Matrix success shape — bar charts plot the per-bucket values of each series.
const matrix = (series: { metric: Record<string, string>; values: [number, number][] }[]): PanelDataResult[] => [
  {
    status: 'success',
    data: { resultType: 'matrix', result: series.map(s => ({ metric: s.metric, values: s.values.map(([t, v]): [number, string] => [t, String(v)]) })) },
  },
];

const defaults = (unit: string): FieldConfigDefaults => ({ unit, mappings: [] });

describe('barChartSeries', () => {
  it('extracts one series per result row, keeping metric and values', () => {
    const series = barChartSeries(
      matrix([
        { metric: { __name__: 'a' }, values: [[1, 10]] },
        { metric: { __name__: 'b' }, values: [[1, 20]] },
      ]),
    );
    expect(series).toHaveLength(2);
    expect(series[0]?.metric.__name__).toBe('a');
    expect(series[1]?.values?.[0]).toEqual([1, '20']);
  });

  it('returns an empty array for null data', () => {
    expect(barChartSeries(null)).toEqual([]);
  });

  it('ignores error results', () => {
    expect(barChartSeries([{ status: 'error', errorType: 'bad', error: 'nope' }])).toEqual([]);
  });
});

describe('barChartAlignedData', () => {
  it('builds [timestamps, ...series] aligned data', () => {
    const series = barChartSeries(
      matrix([
        {
          metric: { __name__: 'a' },
          values: [
            [1, 10],
            [2, 30],
          ],
        },
        {
          metric: { __name__: 'b' },
          values: [
            [1, 20],
            [2, 40],
          ],
        },
      ]),
    );
    const aligned = barChartAlignedData(series);
    expect(aligned[0]).toEqual([1, 2]);
    expect(aligned[1]).toEqual([10, 30]);
    expect(aligned[2]).toEqual([20, 40]);
  });

  it('returns a single empty x band when there are no series', () => {
    expect(barChartAlignedData([])).toEqual([[]]);
  });
});

describe('formatBarChartTicks', () => {
  it('formats each split through the configured unit', () => {
    expect(formatBarChartTicks([1024, 2048], defaults('bytes'))).toEqual(['1 KiB', '2 KiB']);
  });

  it('passes raw numbers through when no unit is set', () => {
    expect(formatBarChartTicks([1, 2, 3], defaults(''))).toEqual(['1', '2', '3']);
  });
});

describe('buildBarChartOptions', () => {
  const sampleSeries = barChartSeries(matrix([{ metric: { __name__: 'cpu' }, values: [[1, 5]] }]));

  it('sets a bars path builder on each data series', () => {
    const options = buildBarChartOptions({ series: sampleSeries, queries: [], defaults: defaults('short'), width: 400, height: 300, vertical: true });
    // Index 0 is the x series; data series start at 1 and carry a bars path builder.
    expect(options.series).toHaveLength(2);
    expect(typeof options.series[1]?.paths).toBe('function');
  });

  it('labels each series from its metric name', () => {
    const options = buildBarChartOptions({ series: sampleSeries, queries: [], defaults: defaults('short'), width: 400, height: 300, vertical: true });
    expect(options.series[1]?.label).toBe('cpu');
  });

  it('wires the formatted tick function onto the y-axis', () => {
    const options = buildBarChartOptions({ series: sampleSeries, queries: [], defaults: defaults('bytes'), width: 400, height: 300, vertical: true });
    expect(typeof options.axes?.[1]?.values).toBe('function');
  });

  it('honours explicit width/height (clamped to a floor)', () => {
    const options = buildBarChartOptions({ series: sampleSeries, queries: [], defaults: defaults('short'), width: 500, height: 400, vertical: true });
    expect(options.width).toBeGreaterThan(0);
    expect(options.height).toBeGreaterThan(0);
    expect(options.width).toBeLessThanOrEqual(500);
  });
});
