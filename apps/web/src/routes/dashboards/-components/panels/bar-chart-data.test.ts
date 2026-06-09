import type { PanelDataResult } from './use-panel-data';
import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';

import { describe, expect, it } from 'vitest';

import { chartThemeColors } from '../../../-root/chart-theme';

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
  const colors = chartThemeColors('dark');
  const range: readonly [number, number] = [1000, 2000];

  it('sets a bars path builder on each data series', () => {
    const options = buildBarChartOptions({
      series: sampleSeries,
      labels: [],
      defaults: defaults('short'),
      width: 400,
      height: 300,
      vertical: true,
      colors,
      range,
    });
    // Index 0 is the x series; data series start at 1 and carry a bars path builder.
    expect(options.series).toHaveLength(2);
    expect(typeof options.series[1]?.paths).toBe('function');
  });

  it('labels each data series from the supplied labels (index-aligned)', () => {
    const options = buildBarChartOptions({
      series: sampleSeries,
      labels: ['cpu'],
      defaults: defaults('short'),
      width: 400,
      height: 300,
      vertical: true,
      colors,
      range,
    });
    expect(options.series[1]?.label).toBe('cpu');
  });

  it('falls back to a positional label when none is supplied for a series', () => {
    const options = buildBarChartOptions({
      series: sampleSeries,
      labels: [],
      defaults: defaults('short'),
      width: 400,
      height: 300,
      vertical: true,
      colors,
      range,
    });
    expect(options.series[1]?.label).toBe('Series 1');
  });

  it('wires the formatted tick function onto the y-axis', () => {
    const options = buildBarChartOptions({
      series: sampleSeries,
      labels: [],
      defaults: defaults('bytes'),
      width: 400,
      height: 300,
      vertical: true,
      colors,
      range,
    });
    expect(typeof options.axes?.[1]?.values).toBe('function');
  });

  it('applies the theme palette to both axes (stroke + grid) so chrome is readable in dark mode', () => {
    const options = buildBarChartOptions({
      series: sampleSeries,
      labels: [],
      defaults: defaults('short'),
      width: 400,
      height: 300,
      vertical: true,
      colors,
      range,
    });
    // x axis (index 0) and y axis (index 1) both carry the themed chrome colors.
    expect(options.axes?.[0]?.stroke).toBe(colors.axis);
    expect(options.axes?.[0]?.grid?.stroke).toBe(colors.grid);
    expect(options.axes?.[0]?.ticks?.stroke).toBe(colors.ticks);
    expect(options.axes?.[1]?.stroke).toBe(colors.axis);
    expect(options.axes?.[1]?.grid?.stroke).toBe(colors.grid);
    expect(options.axes?.[1]?.ticks?.stroke).toBe(colors.ticks);
  });

  it('honours explicit width/height (clamped to a floor)', () => {
    const options = buildBarChartOptions({
      series: sampleSeries,
      labels: [],
      defaults: defaults('short'),
      width: 500,
      height: 400,
      vertical: true,
      colors,
      range,
    });
    expect(options.width).toBeGreaterThan(0);
    expect(options.height).toBeGreaterThan(0);
    expect(options.width).toBeLessThanOrEqual(500);
  });

  it('pins scales.x.range to the resolved query window so a stray sample cannot balloon the axis', () => {
    // Regression for the P1 follow-up: the bar chart x-axis spanned years (2027–2028) because it
    // auto-ranged to fit data instead of the selected window. The x scale must be time-based and
    // its range pinned to the resolved [from, to] window (a static min/max, not data-driven).
    const options = buildBarChartOptions({
      series: sampleSeries,
      labels: [],
      defaults: defaults('short'),
      width: 400,
      height: 300,
      vertical: true,
      colors,
      range,
    });
    expect(options.scales?.x?.time).toBe(true);
    expect(options.scales?.x?.range).toEqual([1000, 2000]);
  });
});
