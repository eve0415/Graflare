import type { PanelDataResult } from './use-panel-data';

import { extractResultSeries, latestSample } from './panel-data-extract';

// One wedge of a pie/donut: a labelled series, its latest value, that value's share
// of the total (0..1), the cumulative sweep [startAngle, endAngle) in degrees
// (0 at the top of the circle, clockwise to 360), and the slice colour.
export interface PieSlice {
  label: string;
  value: number;
  fraction: number;
  startAngle: number;
  endAngle: number;
  color: string;
}

// Derive a human label for a series: the metric name wins, else the first other
// label value (e.g. instance), else a 1-based positional fallback. Mirrors the
// bar-gauge labelling so the two panels read series the same way.
const seriesLabel = (metric: Record<string, string>, index: number): string => {
  const name = metric.__name__;
  if (name !== undefined && name !== '') return name;
  for (const [key, value] of Object.entries(metric)) {
    if (key !== '__name__' && value !== '') return value;
  }
  return `Series ${String(index + 1)}`;
};

const FULL_CIRCLE = 360;

/**
 * Map panel query results to one pie slice per series. Pure: no DOM, no formatting —
 * the renderer formats `value` and draws the arc. Each series contributes its latest
 * sample; non-finite samples are dropped (so the positional label/colour index
 * tracks kept slices, and the arcs never run backward). `fraction` is the value's
 * share of the kept total; a zero (or non-positive) total collapses every slice to a
 * finite 0 fraction with zero-width angles rather than dividing by zero. Angles are
 * cumulative from 0, and the last kept slice closes exactly on 360.
 */
export const pieSlices = (data: PanelDataResult[] | null | undefined, palette: readonly string[]): PieSlice[] => {
  // First pass: keep finite latest samples with their label/colour, so the total is
  // taken over exactly the slices that will be drawn.
  const kept: { label: string; value: number; color: string }[] = [];
  for (const series of extractResultSeries(data)) {
    const sample = latestSample(series);
    if (sample === undefined) continue;
    const value = Number(sample[1]);
    if (!Number.isFinite(value)) continue;
    const color = palette.length === 0 ? '' : (palette[kept.length % palette.length] ?? '');
    kept.push({ label: seriesLabel(series.metric, kept.length), value, color });
  }

  const total = kept.reduce((sum, slice) => sum + slice.value, 0);

  const slices: PieSlice[] = [];
  let cumulative = 0;
  for (const [i, slice] of kept.entries()) {
    const fraction = total <= 0 ? 0 : slice.value / total;
    const startAngle = cumulative;
    cumulative += fraction * FULL_CIRCLE;
    // Pin the final slice to a clean 360 so float accumulation never leaves a sliver
    // gap or overshoot at the seam.
    const endAngle = i === kept.length - 1 && total > 0 ? FULL_CIRCLE : cumulative;
    slices.push({ label: slice.label, value: slice.value, fraction, startAngle, endAngle, color: slice.color });
  }

  return slices;
};
