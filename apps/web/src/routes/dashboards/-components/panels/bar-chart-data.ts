import type { PanelDataResult } from './use-panel-data';
import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';
import type { PanelQuery } from '@graflare/shared/schemas/panel';
import type uPlotNs from 'uplot';

import { formatValue } from '@graflare/shared/format/value-format';
import uPlot from 'uplot';

// A single plotted series: its label set plus the per-bucket samples. Mirrors the
// extraction the time-series panel does, kept pure so it carries the test weight.
export interface BarChartSeries {
  metric: Record<string, string>;
  values?: [number, string][];
}

interface BuildBarChartOptionsArgs {
  series: BarChartSeries[];
  queries: PanelQuery[];
  defaults: FieldConfigDefaults;
  width: number;
  height: number;
  vertical: boolean;
}

// Bar geometry: 60% of the available slot, capped at 60px, centred. A named
// constant so a future displayOptions control can override it without surgery.
const BAR_SIZE: [factor: number, max: number] = [0.6, 60];

/**
 * Reduce panel query results to one series per result row. Pure: no DOM. Error
 * results and non-object rows are skipped, matching the time-series extraction.
 */
export const barChartSeries = (data: PanelDataResult[] | null | undefined): BarChartSeries[] => {
  if (data === null || data === undefined) return [];

  const series: BarChartSeries[] = [];
  for (const res of data) {
    if (!('status' in res)) continue;
    if (res.status !== 'success' || res.data === undefined || !('result' in res.data) || !Array.isArray(res.data.result)) continue;
    for (const row of res.data.result) {
      if (typeof row === 'object' && row !== null && 'metric' in row) {
        series.push('values' in row ? { metric: row.metric, values: row.values } : { metric: row.metric });
      }
    }
  }
  return series;
};

/**
 * Build uPlot AlignedData: `[timestamps, ...perSeriesValues]`. The bucket axis is
 * taken from the first series; empty input yields a single empty band so the
 * caller can detect "no data" cheaply.
 */
export const barChartAlignedData = (series: BarChartSeries[]): uPlotNs.AlignedData => {
  if (series.length === 0) return [[]];

  const [first] = series;
  if (first?.values === undefined) return [[]];

  const timestamps = first.values.map(v => v[0]);
  const columns = series.map(s => (s.values ?? []).map(v => Number(v[1])));
  return [timestamps, ...columns];
};

/**
 * Format y-axis split values through the field-config unit. Pure and independent
 * of uPlot so the formatting is testable without a chart instance.
 */
export const formatBarChartTicks = (splits: number[], defaults: FieldConfigDefaults): string[] => splits.map(v => formatValue(v, defaults));

/**
 * Build the uPlot options for a bar chart: a bars path-builder on every data
 * series and a formatted y-axis. `vertical` is accepted for forward-compat; uPlot
 * 1.6 renders value bars vertically, so it currently has no visual branch.
 */
export const buildBarChartOptions = ({ series, queries, defaults, width, height }: BuildBarChartOptionsArgs): uPlotNs.Options => {
  // `paths` is optional on Series and uPlot.paths.bars is itself optional in the
  // types; build it once and include the key only when present (no undefined writes).
  const barsPaths = uPlot.paths.bars?.({ size: BAR_SIZE, align: 0 });

  // Index 0 = x/bucket axis (default formatting). Index 1 = y, formatted via unit.
  const formatYTicks: uPlotNs.Axis.DynamicValues = (_u, splits) => formatBarChartTicks(splits, defaults);

  return {
    width: Math.max(100, width - 16),
    height: Math.max(80, height - 60),
    axes: [{}, { values: formatYTicks }],
    series: [
      {},
      ...series.map((s, i): uPlotNs.Series => {
        const base: uPlotNs.Series = {
          label: s.metric.__name__ ?? queries[i]?.legendFormat ?? `Series ${String(i + 1)}`,
          stroke: `hsl(${String(i * 60)}, 70%, 50%)`,
          fill: `hsla(${String(i * 60)}, 70%, 50%, 0.7)`,
        };
        return barsPaths === undefined ? base : { ...base, paths: barsPaths };
      }),
    ],
  };
};
