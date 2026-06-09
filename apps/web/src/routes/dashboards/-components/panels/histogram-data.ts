import type { ChartThemeColors } from '../../../-root/chart-theme';
import type { PanelDataResult } from './use-panel-data';
import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';
import type uPlotNs from 'uplot';

import { formatValue } from '@graflare/shared/format/value-format';
import uPlot from 'uplot';

import { themedAxis } from '../../../-root/chart-theme';

import { extractResultSeries } from './panel-data-extract';

// One histogram bar: the half-open bin [start, end) and how many samples fell in it.
// (The final bin is inclusive of the maximum — the max value is clamped into it.)
export interface HistogramBucket {
  start: number;
  end: number;
  count: number;
}

/**
 * Flatten every sample value (all series, all points) out of the panel results into a
 * single numeric list — the distribution the histogram buckets. Pure: error and
 * non-prometheus responses are skipped via the shared `extractResultSeries`. Both the
 * instant `value` tuple and matrix `values` array are read; raw tokens coerce through
 * `Number`, and `histogramBuckets` drops any that aren't finite.
 */
export const histogramValues = (data: PanelDataResult[] | null | undefined): number[] => {
  const values: number[] = [];
  for (const series of extractResultSeries(data)) {
    if (series.value !== undefined) values.push(Number(series.value[1]));
    for (const sample of series.values ?? []) {
      values.push(Number(sample[1]));
    }
  }
  return values;
};

interface HistogramOptions {
  bucketCount?: number;
  bucketSize?: number;
}

const DEFAULT_BUCKET_COUNT = 20;

/**
 * Bucket a flat list of sample values into equal-width bins. Pure: no DOM, no
 * formatting. The bin width comes from `bucketSize` when it is a positive number;
 * otherwise it is derived as `(max - min) / bucketCount`. Each value is placed at
 * `floor((value - min) / bucketSize)`, clamped to the last bin so the maximum (which
 * would otherwise land one bin past the end) is counted. Returns `[]` for no finite
 * values, and a single zero-width bucket when every value is equal (a derived width
 * of 0 has no meaningful bins).
 */
export const histogramBuckets = (values: number[], opts: HistogramOptions): HistogramBucket[] => {
  const finite = values.filter(v => Number.isFinite(v));
  if (finite.length === 0) return [];

  let min = finite[0] ?? 0;
  let max = min;
  for (const v of finite) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }

  const span = max - min;
  // All values equal (includes the single-value case): one bucket holds them all.
  if (span <= 0) return [{ start: min, end: max, count: finite.length }];

  const bucketCount = opts.bucketCount ?? DEFAULT_BUCKET_COUNT;
  const explicitSize = opts.bucketSize !== undefined && opts.bucketSize > 0 ? opts.bucketSize : undefined;

  // Explicit width: cover the span with as many bins as it takes (the last bin
  // absorbs the max). Otherwise split the span into exactly `bucketCount` bins.
  const bucketSize = explicitSize ?? span / bucketCount;
  const binCount = explicitSize === undefined ? bucketCount : Math.ceil(span / explicitSize);

  const buckets: HistogramBucket[] = Array.from(
    { length: binCount },
    (_, i): HistogramBucket => ({
      start: min + i * bucketSize,
      end: min + (i + 1) * bucketSize,
      count: 0,
    }),
  );

  const lastIndex = binCount - 1;
  for (const v of finite) {
    const index = Math.min(lastIndex, Math.floor((v - min) / bucketSize));
    const bucket = buckets[index];
    if (bucket !== undefined) bucket.count += 1;
  }

  return buckets;
};

interface BuildHistogramOptionsArgs {
  defaults: FieldConfigDefaults;
  width: number;
  height: number;
  /** Theme-aware axis/grid/tick colors so the chart chrome is readable in dark mode. */
  colors: ChartThemeColors;
}

// Bar geometry: full slot width (adjacent bins touch, the usual histogram look),
// capped at 80px. A named constant so a future displayOptions control can override it.
const BAR_SIZE: [factor: number, max: number] = [1, 80];

/**
 * Build uPlot AlignedData for a histogram: `[bucketMidpoints, counts]`. The x value
 * of each bar is its bin midpoint so the bar sits over its range; empty input yields
 * a single empty band so the caller can detect "no data" cheaply.
 */
export const histogramAlignedData = (buckets: HistogramBucket[]): uPlotNs.AlignedData => {
  if (buckets.length === 0) return [[]];
  const midpoints = buckets.map(b => (b.start + b.end) / 2);
  const counts = buckets.map(b => b.count);
  return [midpoints, counts];
};

/**
 * Format histogram x-axis split values (bin positions) through the field-config unit.
 * Pure and independent of uPlot so the formatting is testable without a chart.
 */
export const formatHistogramTicks = (splits: number[], defaults: FieldConfigDefaults): string[] => splits.map(v => formatValue(v, defaults));

/**
 * Build the uPlot options for a histogram: a bars path-builder on the count series and
 * a unit-formatted x-axis (the bucket bounds). The bars path is the same factory the
 * bar chart uses (verified against uplot@1.6.32: `uPlot.paths.bars?.(opts)`).
 */
export const buildHistogramOptions = ({ defaults, width, height, colors }: BuildHistogramOptionsArgs): uPlotNs.Options => {
  // `paths` is optional on Series and uPlot.paths.bars is itself optional in the
  // types; build it once and include the key only when present (no undefined writes).
  const barsPaths = uPlot.paths.bars?.({ size: BAR_SIZE, align: 0 });

  // Index 0 = x/bucket axis, formatted via the unit. Index 1 = y (count), default.
  const formatXTicks: uPlotNs.Axis.DynamicValues = (_u, splits) => formatHistogramTicks(splits, defaults);

  const countSeries: uPlotNs.Series = {
    label: 'Count',
    stroke: 'hsl(210, 70%, 50%)',
    fill: 'hsla(210, 70%, 50%, 0.7)',
  };

  return {
    width: Math.max(100, width - 16),
    height: Math.max(80, height - 60),
    axes: [{ ...themedAxis(colors), values: formatXTicks }, { ...themedAxis(colors) }],
    series: [{}, barsPaths === undefined ? countSeries : { ...countSeries, paths: barsPaths }],
  };
};
