import type { PanelDataResult } from './use-panel-data';
import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';

import { formatValue } from '@graflare/shared/format/value-format';

import { extractResultSeries } from './panel-data-extract';

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

// One horizontal lane of the timeline: a labelled series and its merged segments, in
// time order. A series with no finite samples still emits a lane (empty segments) so
// the renderer can show its label.
export interface StateTimelineLane {
  label: string;
  segments: StateSegment[];
}

// Derive a human label for a series: the metric name wins, else the first other label
// value (e.g. instance), else a 1-based positional fallback. Mirrors the pie/bar-gauge
// labelling so every panel reads series the same way.
const seriesLabel = (metric: Record<string, string>, index: number): string => {
  const name = metric.__name__;
  if (name !== undefined && name !== '') return name;
  for (const [key, value] of Object.entries(metric)) {
    if (key !== '__name__' && value !== '') return value;
  }
  return `Series ${String(index + 1)}`;
};

/**
 * Map panel query results to one lane per series, merging consecutive equal values into
 * segments. Pure: no DOM, no color — the renderer maps value → color and time → x.
 *
 * Each series' `values` (`[time, val][]`) are walked in order: non-finite values are
 * dropped (so a transient gap doesn't split an otherwise-continuous run), and a new
 * segment opens whenever the value differs from the open run. Each segment's `endTime`
 * is the time of the next differing sample; the last open run closes at the series'
 * final kept sample time, yielding a zero-width segment for a single-sample series. The
 * numeric value is formatted to `displayValue` through the panel's field config so the
 * renderer's value labels respect the configured unit/decimals.
 */
export const stateTimelineLanes = (data: PanelDataResult[] | null | undefined, defaults: FieldConfigDefaults): StateTimelineLane[] => {
  const lanes: StateTimelineLane[] = [];

  for (const [index, series] of extractResultSeries(data).entries()) {
    const label = seriesLabel(series.metric, index);
    const segments: StateSegment[] = [];

    // The currently-open run, or null before the first finite sample is seen.
    let open: StateSegment | null = null;

    for (const [time, token] of series.values ?? []) {
      const value = Number(token);
      if (!Number.isFinite(value)) continue;

      if (open === null) {
        open = { startTime: time, endTime: time, value, displayValue: formatValue(value, defaults) };
      } else if (value === open.value) {
        // Same state continues: extend the open run to this sample's time.
        open.endTime = time;
      } else {
        // State changed: the open run ends where this new sample begins, then a fresh
        // run opens at this sample.
        open.endTime = time;
        segments.push(open);
        open = { startTime: time, endTime: time, value, displayValue: formatValue(value, defaults) };
      }
    }

    if (open !== null) segments.push(open);
    lanes.push({ label, segments });
  }

  return lanes;
};
