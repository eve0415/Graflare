import type { PanelDataResult } from './use-panel-data';
import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';

import { formatValue } from '@graflare/shared/format/value-format';

import { extractResultSeries } from './panel-data-extract';

// One discrete status sample: its timestamp (unix seconds), the numeric state `value`,
// and its formatted `displayValue`. Unlike a state-timeline segment, a cell is a single
// point in time — equal consecutive values are NOT merged.
export interface StatusCell {
  time: number;
  value: number;
  displayValue: string;
}

// One horizontal lane of the status history: a labelled series and its per-sample cells,
// in time order. A series with no finite samples still emits a lane (empty cells) so the
// renderer can show its label.
export interface StatusHistoryLane {
  label: string;
  cells: StatusCell[];
}

// Derive a human label for a series: the metric name wins, else the first other label
// value (e.g. instance), else a 1-based positional fallback. Mirrors the pie/bar-gauge
// and state-timeline labelling so every panel reads series the same way.
const seriesLabel = (metric: Record<string, string>, index: number): string => {
  const name = metric.__name__;
  if (name !== undefined && name !== '') return name;
  for (const [key, value] of Object.entries(metric)) {
    if (key !== '__name__' && value !== '') return value;
  }
  return `Series ${String(index + 1)}`;
};

/**
 * Map panel query results to one lane per series, emitting one cell per sample with no
 * merging. Pure: no DOM, no color — the renderer maps value → color and time → x.
 *
 * Each series' `values` (`[time, val][]`) are walked in order; non-finite values are
 * dropped, and every remaining sample becomes its own cell (so a run of equal values
 * stays a row of distinct boxes, the defining difference from the state-timeline). The
 * numeric value is formatted to `displayValue` through the panel's field config so the
 * renderer respects the configured unit/decimals.
 */
export const statusHistoryCells = (data: PanelDataResult[] | null | undefined, defaults: FieldConfigDefaults): StatusHistoryLane[] => {
  const lanes: StatusHistoryLane[] = [];

  for (const [index, series] of extractResultSeries(data).entries()) {
    const label = seriesLabel(series.metric, index);
    const cells: StatusCell[] = [];

    for (const [time, token] of series.values ?? []) {
      const value = Number(token);
      if (!Number.isFinite(value)) continue;
      cells.push({ time, value, displayValue: formatValue(value, defaults) });
    }

    lanes.push({ label, cells });
  }

  return lanes;
};
