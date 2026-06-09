import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig, FieldConfigDefaults } from '@graflare/shared/schemas/field-config';

import { resolveFieldConfig } from '@graflare/shared/format/resolve-field-config';

import { extractResultSeries, latestSample } from './panel-data-extract';

// One wedge of a pie/donut: a labelled series, its latest value, that value's share
// of the total (0..1), the cumulative sweep [startAngle, endAngle) in degrees
// (0 at the top of the circle, clockwise to 360), the slice colour, and the effective
// field config resolved for that series (so its value label respects per-field
// unit/decimals/mappings overrides). The wedge colour stays palette-driven — `color`
// is not an overridable field property.
export interface PieSlice {
  label: string;
  value: number;
  fraction: number;
  startAngle: number;
  endAngle: number;
  color: string;
  config: FieldConfigDefaults;
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
 * the renderer formats `value` (through each slice's resolved `config`) and draws the
 * arc. Each series contributes its latest sample; non-finite samples are dropped (so the
 * positional label/colour index tracks kept slices, and the arcs never run backward).
 * Each kept series resolves its own effective config against the panel overrides (keyed
 * on the label this helper derives — the same name the legend shows); with no matching
 * override that is the defaults reference, so the value labels are byte-identical to a
 * defaults-only panel. `fraction` is the value's share of the kept total; a zero (or
 * non-positive) total collapses every slice to a finite 0 fraction with zero-width angles
 * rather than dividing by zero. Angles are cumulative from 0, and the last kept slice
 * closes exactly on 360.
 */
export const pieSlices = (data: PanelDataResult[] | null | undefined, palette: readonly string[], fieldConfig: FieldConfig): PieSlice[] => {
  // First pass: keep finite latest samples with their label/colour/config, so the total
  // is taken over exactly the slices that will be drawn.
  const kept: { label: string; value: number; color: string; config: FieldConfigDefaults }[] = [];
  for (const series of extractResultSeries(data)) {
    const sample = latestSample(series);
    if (sample === undefined) continue;
    const value = Number(sample[1]);
    if (!Number.isFinite(value)) continue;
    const color = palette.length === 0 ? '' : (palette[kept.length % palette.length] ?? '');
    const label = seriesLabel(series.metric, kept.length);
    kept.push({ label, value, color, config: resolveFieldConfig({ name: label }, fieldConfig) });
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
    slices.push({ label: slice.label, value: slice.value, fraction, startAngle, endAngle, color: slice.color, config: slice.config });
  }

  return slices;
};
