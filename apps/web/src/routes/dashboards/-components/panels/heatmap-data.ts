import type { PanelDataResult } from './use-panel-data';
import type { Transformation } from '@graflare/shared/schemas/transformation';

import { extractTransformedSeries } from './panel-data-extract';

// One occupied grid cell: integer bucket coordinates (`x` = time bucket, `y` = value
// bucket) and how many samples fell in it. Empty cells are omitted from the grid, so a
// sparse heatmap stays small.
export interface HeatmapCell {
  x: number;
  y: number;
  count: number;
}

// The bucketed density grid: the bin boundaries on each axis (`xBuckets + 1` /
// `yBuckets + 1` entries, or a degenerate 2-entry pair when an axis has no spread),
// the occupied cells, and the busiest cell's count for normalizing the color ramp.
export interface HeatmapGrid {
  xEdges: number[];
  yEdges: number[];
  cells: HeatmapCell[];
  maxCount: number;
}

export interface HeatmapGridOptions {
  xBuckets: number;
  yBuckets: number;
}

/**
 * Flatten every sample (all series, all points) out of the panel results into
 * `[time, value]` pairs — the 2D point cloud the heatmap buckets. Pure: error and
 * non-prometheus responses are skipped via the shared `extractResultSeries`. Both the
 * instant `value` tuple and the matrix `values` array are read; the raw value token
 * coerces through `Number`, and any pair with a non-finite time or value is dropped.
 */
export const heatmapSamples = (data: PanelDataResult[] | null | undefined, transformations: readonly Transformation[] = []): [number, number][] => {
  const samples: [number, number][] = [];
  const push = (sample: [number, string]): void => {
    const time = Number(sample[0]);
    const value = Number(sample[1]);
    if (Number.isFinite(time) && Number.isFinite(value)) samples.push([time, value]);
  };
  for (const series of extractTransformedSeries(data, transformations)) {
    if (series.value !== undefined) push(series.value);
    for (const point of series.values ?? []) push(point);
  }
  return samples;
};

// Min/max of a numeric list. The caller only invokes this on a non-empty list, so the
// seed is the first element; `Math.min/max` fold the rest.
const extent = (values: number[]): { min: number; max: number } => {
  let min = values[0] ?? 0;
  let max = min;
  for (const v of values) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return { min, max };
};

// Bin edges for one axis: `count + 1` evenly spaced boundaries from min to max. A
// degenerate axis (span 0 — every sample shares the coordinate) collapses to a single
// bucket, returned as the 2-entry pair [min, min] so downstream length checks still see
// "one bucket" without a zero-width division.
const axisEdges = (min: number, max: number, count: number): number[] => {
  if (max <= min) return [min, min];
  const width = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, i) => min + i * width);
};

// Bucket index for `value` on an axis with the given domain and bucket count. A
// degenerate axis has exactly one bucket (index 0). Otherwise the value floors into its
// bin and is clamped to the last bucket, so the maximum (which would land one past the
// end) is counted rather than dropped.
const bucketIndex = (value: number, min: number, max: number, count: number): number => {
  if (max <= min) return 0;
  const width = (max - min) / count;
  return Math.min(count - 1, Math.floor((value - min) / width));
};

/**
 * Bucket a `[time, value][]` point cloud into a `xBuckets × yBuckets` density grid.
 * Pure: no DOM, no color. The x-domain is the sample time extent, the y-domain the
 * value extent; each axis is split into equal-width bins (a zero-span axis collapses to
 * one bucket, avoiding any divide-by-zero), and each sample increments its cell. Only
 * occupied cells are returned. Empty input yields an empty grid (`maxCount` 0).
 */
export const heatmapGrid = (samples: [number, number][], options: HeatmapGridOptions): HeatmapGrid => {
  if (samples.length === 0) return { xEdges: [], yEdges: [], cells: [], maxCount: 0 };

  const xs = samples.map(s => s[0]);
  const ys = samples.map(s => s[1]);
  const x = extent(xs);
  const y = extent(ys);

  const xEdges = axisEdges(x.min, x.max, options.xBuckets);
  const yEdges = axisEdges(y.min, y.max, options.yBuckets);

  // Accumulate counts keyed by "x,y" so only touched cells are materialized; the key is
  // built from integer indices, so it round-trips back to numbers cleanly.
  const counts = new Map<string, number>();
  let maxCount = 0;
  for (const [time, value] of samples) {
    const xi = bucketIndex(time, x.min, x.max, options.xBuckets);
    const yi = bucketIndex(value, y.min, y.max, options.yBuckets);
    const key = `${String(xi)},${String(yi)}`;
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    maxCount = Math.max(maxCount, next);
  }

  const cells: HeatmapCell[] = [];
  for (const [key, count] of counts) {
    const [xPart, yPart] = key.split(',');
    cells.push({ x: Number(xPart), y: Number(yPart), count });
  }

  return { xEdges, yEdges, cells, maxCount };
};
