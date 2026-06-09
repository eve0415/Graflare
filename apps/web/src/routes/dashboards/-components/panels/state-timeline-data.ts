import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig, FieldConfigDefaults } from '@graflare/shared/schemas/field-config';
import type { PanelQuery } from '@graflare/shared/schemas/panel';

import { resolveFieldConfig } from '@graflare/shared/format/resolve-field-config';
import { formatValue } from '@graflare/shared/format/value-format';

import { extractResultSeriesWithQuery, seriesDescriptor } from './panel-data-extract';

// One merged run of equal state values: the [startTime, endTime] span it covers (unix
// seconds), the numeric state `value`, and its formatted `displayValue`. A run ends
// where the next differing sample begins; the final run of a series ends at that
// series' last sample time (a zero-width span when the series has a single sample).
export interface StateSegment {
  startTime: number;
  endTime: number;
  value: number;
  displayValue: string;
}

// One horizontal lane of the timeline: a labelled series, its merged segments in time
// order, and the effective field config resolved for that series. The lane's `config`
// drives BOTH its segments' formatted values and the renderer's value→colour mapping, so
// a per-field override changes only the matched lane. A series with no finite samples
// still emits a lane (empty segments) so the renderer can show its label.
export interface StateTimelineLane {
  label: string;
  segments: StateSegment[];
  config: FieldConfigDefaults;
}

/**
 * Map panel query results to one lane per series, merging consecutive equal values into
 * segments. Pure: no DOM, no color — the renderer maps value → color and time → x.
 *
 * Each series' `values` (`[time, val][]`) are walked in order: non-finite values are
 * dropped (so a transient gap doesn't split an otherwise-continuous run), and a new
 * segment opens whenever the value differs from the open run. Each segment's `endTime`
 * is the time of the next differing sample; the last open run closes at the series'
 * final kept sample time, yielding a zero-width segment for a single-sample series. Each
 * series resolves its own effective config against the panel overrides via the shared
 * `seriesDescriptor` (matched by the lane label, and by query refId when `queries` is
 * passed), so the numeric value is formatted to `displayValue` through THAT config and the
 * lane carries it for the renderer's value→colour mapping. With no matching override the
 * lane resolves to the defaults reference (byte-identical to before overrides).
 */
export const stateTimelineLanes = (
  data: PanelDataResult[] | null | undefined,
  fieldConfig: FieldConfig,
  queries?: readonly PanelQuery[],
): StateTimelineLane[] => {
  const lanes: StateTimelineLane[] = [];

  for (const [index, { series, refId }] of extractResultSeriesWithQuery(data, queries).entries()) {
    const descriptor = seriesDescriptor(series, index, refId);
    const config = resolveFieldConfig(descriptor, fieldConfig);
    const segments: StateSegment[] = [];

    // The currently-open run, or null before the first finite sample is seen.
    let open: StateSegment | null = null;

    for (const [time, token] of series.values ?? []) {
      const value = Number(token);
      if (!Number.isFinite(value)) continue;

      if (open === null) {
        open = { startTime: time, endTime: time, value, displayValue: formatValue(value, config) };
      } else if (value === open.value) {
        // Same state continues: extend the open run to this sample's time.
        open.endTime = time;
      } else {
        // State changed: the open run ends where this new sample begins, then a fresh
        // run opens at this sample.
        open.endTime = time;
        segments.push(open);
        open = { startTime: time, endTime: time, value, displayValue: formatValue(value, config) };
      }
    }

    if (open !== null) segments.push(open);
    lanes.push({ label: descriptor.name, segments, config });
  }

  return lanes;
};
