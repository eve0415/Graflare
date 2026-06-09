import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig, FieldConfigDefaults } from '@graflare/shared/schemas/field-config';

import { resolveFieldConfig } from '@graflare/shared/format/resolve-field-config';

import { extractResultSeries, latestSample } from './panel-data-extract';

// One horizontal/vertical bar of a bar gauge: a labelled series, its latest value,
// the fill fraction (0..1, clamped) used to size the bar against the series' own
// [min, max], and the effective field config resolved for that series. Each bar is an
// independent scale, so min/max are per-series — a byName/byRegexp override can give
// one series a different range, unit or mappings without touching the others.
export interface BarGaugeSegment {
  label: string;
  value: number;
  fraction: number;
  config: FieldConfigDefaults;
}

// Default gauge range when the resolved config sets none, mirroring the gauge panel.
const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;

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
 * formatting — the renderer formats `value` and colours the bar from `config`. Each
 * series resolves its own effective config against the panel overrides (matched by the
 * label this helper derives — the same name the bar displays), so `fraction` is
 * `(value - min) / (max - min)` against THAT series' range, clamped to [0, 1]; a
 * zero-width range yields 0. With no matching override every series resolves to the
 * defaults reference, so the fraction and config are identical to a defaults-only panel.
 * Non-finite latest samples are dropped, so the positional label index tracks the count
 * of kept segments rather than the raw row position.
 */
export const barGaugeSegments = (data: PanelDataResult[] | null | undefined, fieldConfig: FieldConfig): BarGaugeSegment[] => {
  const segments: BarGaugeSegment[] = [];

  for (const series of extractResultSeries(data)) {
    const sample = latestSample(series);
    if (sample === undefined) continue;
    const value = Number(sample[1]);
    if (!Number.isFinite(value)) continue;
    const label = seriesLabel(series.metric, segments.length);
    const config = resolveFieldConfig({ name: label }, fieldConfig);
    const min = config.min ?? DEFAULT_MIN;
    const max = config.max ?? DEFAULT_MAX;
    const span = max - min;
    const fraction = span <= 0 ? 0 : Math.max(0, Math.min(1, (value - min) / span));
    segments.push({ label, value, fraction, config });
  }

  return segments;
};
