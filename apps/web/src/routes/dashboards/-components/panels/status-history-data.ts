import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig, FieldConfigDefaults } from '@graflare/shared/schemas/field-config';
import type { PanelQuery } from '@graflare/shared/schemas/panel';
import type { Transformation } from '@graflare/shared/schemas/transformation';

import { resolveFieldConfig } from '@graflare/shared/format/resolve-field-config';
import { formatValue } from '@graflare/shared/format/value-format';

import { extractTransformedSeriesWithQuery, seriesDescriptor } from './panel-data-extract';

// One discrete status sample: its timestamp (unix seconds), the numeric state `value`,
// and its formatted `displayValue`. Unlike a state-timeline segment, a cell is a single
// point in time — equal consecutive values are NOT merged.
export interface StatusCell {
  time: number;
  value: number;
  displayValue: string;
}

// One horizontal lane of the status history: a labelled series, its per-sample cells in
// time order, and the effective field config resolved for that series. The lane's
// `config` drives BOTH its cells' formatted values and the renderer's value→colour
// mapping, so a per-field override changes only the matched lane. A series with no finite
// samples still emits a lane (empty cells) so the renderer can show its label.
export interface StatusHistoryLane {
  label: string;
  cells: StatusCell[];
  config: FieldConfigDefaults;
}

/**
 * Map panel query results to one lane per series, emitting one cell per sample with no
 * merging. Pure: no DOM, no color — the renderer maps value → color and time → x.
 *
 * Each series' `values` (`[time, val][]`) are walked in order; non-finite values are
 * dropped, and every remaining sample becomes its own cell (so a run of equal values
 * stays a row of distinct boxes, the defining difference from the state-timeline). Each
 * series resolves its own effective config against the panel overrides via the shared
 * `seriesDescriptor` (matched by the lane label, and by query refId when `queries` is
 * passed), so the numeric value is formatted to `displayValue` through THAT config and the
 * lane carries it for the renderer's value→colour mapping. With no matching override the
 * lane resolves to the defaults reference (byte-identical to before overrides).
 */
export const statusHistoryCells = (
  data: PanelDataResult[] | null | undefined,
  fieldConfig: FieldConfig,
  queries?: readonly PanelQuery[],
  transformations: readonly Transformation[] = [],
): StatusHistoryLane[] => {
  const lanes: StatusHistoryLane[] = [];

  for (const [index, { series, refId }] of extractTransformedSeriesWithQuery(data, queries, transformations).entries()) {
    const descriptor = seriesDescriptor(series, index, refId);
    const config = resolveFieldConfig(descriptor, fieldConfig);
    const cells: StatusCell[] = [];

    for (const [time, token] of series.values ?? []) {
      const value = Number(token);
      if (!Number.isFinite(value)) continue;
      cells.push({ time, value, displayValue: formatValue(value, config) });
    }

    lanes.push({ label: descriptor.name, cells, config });
  }

  return lanes;
};
