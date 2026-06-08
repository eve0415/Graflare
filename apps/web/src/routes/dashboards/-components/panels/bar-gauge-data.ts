import type { PanelDataResult } from './use-panel-data';

import { extractResultSeries, latestSample } from './panel-data-extract';

// One horizontal/vertical bar of a bar gauge: a labelled series, its latest value,
// and the fill fraction (0..1, clamped) used to size the bar against [min, max].
export interface BarGaugeSegment {
  label: string;
  value: number;
  fraction: number;
}

// Derive a human label for a series: the metric name wins, else the first other
// label value (e.g. instance), else a 1-based positional fallback.
const seriesLabel = (metric: Record<string, string>, index: number): string => {
  const name = metric.__name__;
  if (name !== undefined && name !== '') return name;
  for (const [key, value] of Object.entries(metric)) {
    if (key !== '__name__' && value !== '') return value;
  }
  return `Series ${String(index + 1)}`;
};

/**
 * Map panel query results to one bar-gauge segment per series. Pure: no DOM, no
 * formatting — the renderer formats `value` and colours the bar. `fraction` is
 * `(value - min) / (max - min)` clamped to [0, 1]; a zero-width range yields 0.
 * Non-finite latest samples are dropped, so the positional label index tracks the
 * count of kept segments rather than the raw row position.
 */
export const barGaugeSegments = (data: PanelDataResult[] | null | undefined, min: number, max: number): BarGaugeSegment[] => {
  const span = max - min;
  const segments: BarGaugeSegment[] = [];

  for (const series of extractResultSeries(data)) {
    const sample = latestSample(series);
    if (sample === undefined) continue;
    const value = Number(sample[1]);
    if (!Number.isFinite(value)) continue;
    const fraction = span <= 0 ? 0 : Math.max(0, Math.min(1, (value - min) / span));
    segments.push({ label: seriesLabel(series.metric, segments.length), value, fraction });
  }

  return segments;
};
