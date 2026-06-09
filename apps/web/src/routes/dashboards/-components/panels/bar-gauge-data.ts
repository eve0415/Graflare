import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig, FieldConfigDefaults } from '@graflare/shared/schemas/field-config';
import type { PanelQuery } from '@graflare/shared/schemas/panel';

import { resolveFieldConfig } from '@graflare/shared/format/resolve-field-config';

import { extractResultSeriesWithQuery, latestSample, seriesDescriptor } from './panel-data-extract';

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

/**
 * Map panel query results to one bar-gauge segment per series. Pure: no DOM, no
 * formatting — the renderer formats `value` and colours the bar from `config`. Each
 * series resolves its own effective config against the panel overrides via the shared
 * `seriesDescriptor` (matched by the displayed label, and by query refId when `queries` is
 * passed), so `fraction` is `(value - min) / (max - min)` against THAT series' range,
 * clamped to [0, 1]; a zero-width range yields 0. With no matching override every series
 * resolves to the defaults reference, so the fraction and config are identical to a
 * defaults-only panel. Non-finite latest samples are dropped, so the positional label index
 * tracks the count of kept segments rather than the raw row position.
 */
export const barGaugeSegments = (data: PanelDataResult[] | null | undefined, fieldConfig: FieldConfig, queries?: readonly PanelQuery[]): BarGaugeSegment[] => {
  const segments: BarGaugeSegment[] = [];

  for (const { series, refId } of extractResultSeriesWithQuery(data, queries)) {
    const sample = latestSample(series);
    if (sample === undefined) continue;
    const value = Number(sample[1]);
    if (!Number.isFinite(value)) continue;
    const descriptor = seriesDescriptor(series, segments.length, refId);
    const config = resolveFieldConfig(descriptor, fieldConfig);
    const min = config.min ?? DEFAULT_MIN;
    const max = config.max ?? DEFAULT_MAX;
    const span = max - min;
    const fraction = span <= 0 ? 0 : Math.max(0, Math.min(1, (value - min) / span));
    segments.push({ label: descriptor.name, value, fraction, config });
  }

  return segments;
};
