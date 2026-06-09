import type { ChartThemeColors } from '../../../-root/chart-theme';
import type { ResultSeries } from './panel-data-extract';
import type { PanelDataResult } from './use-panel-data';
import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';
import type uPlotNs from 'uplot';

import { formatValue } from '@graflare/shared/format/value-format';
import uPlot from 'uplot';

import { themedAxes, timeScaleX } from '../../../-root/chart-theme';

import { extractResultSeries } from './panel-data-extract';

// A single plotted series: its label set plus the per-bucket samples. An instant
// `value` may ride along (shared `ResultSeries` shape); bar charts read `values`.
export type BarChartSeries = ResultSeries;

interface BuildBarChartOptionsArgs {
  series: BarChartSeries[];
  /**
   * Display label per series, index-aligned with `series`. Resolved by the caller (which has the
   * panel queries) so a `legendFormat` template applies even when one query yields many series.
   * A missing entry falls back to a positional `Series N`.
   */
  labels: readonly string[];
  defaults: FieldConfigDefaults;
  width: number;
  height: number;
  vertical: boolean;
  /** Theme-aware axis/grid/tick colors so the chart chrome is readable in dark mode. */
  colors: ChartThemeColors;
  /**
   * Resolved query window `[fromSec, toSec]` (epoch seconds). The bucket axis carries epoch
   * timestamps, so we pin `scales.x.range` to this window — otherwise uPlot auto-ranges the x
   * domain to fit every sample, and a stray out-of-window bucket balloons the axis across years
   * (the audit saw 2027–2028). Same pin the time-series panel uses.
   */
  range: readonly [from: number, to: number];
}

// Bar geometry: 60% of the available slot, capped at 60px, centred. A named
// constant so a future displayOptions control can override it without surgery.
const BAR_SIZE: [factor: number, max: number] = [0.6, 60];

/**
 * Reduce panel query results to one series per result row. Pure: no DOM. Error and
 * non-prometheus responses are skipped via the shared `extractResultSeries`.
 */
export const barChartSeries = (data: PanelDataResult[] | null | undefined): BarChartSeries[] => extractResultSeries(data);

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
export const buildBarChartOptions = ({ series, labels, defaults, width, height, colors, range }: BuildBarChartOptionsArgs): uPlotNs.Options => {
  // `paths` is optional on Series and uPlot.paths.bars is itself optional in the
  // types; build it once and include the key only when present (no undefined writes).
  const barsPaths = uPlot.paths.bars?.({ size: BAR_SIZE, align: 0 });

  // Index 0 = x/bucket axis (default formatting). Index 1 = y, formatted via unit.
  const formatYTicks: uPlotNs.Axis.DynamicValues = (_u, splits) => formatBarChartTicks(splits, defaults);

  // Pin the x domain to the resolved query window (epoch seconds). `time: true` is uPlot's default
  // for x so it doesn't change bar geometry; the explicit range is what stops auto-range from
  // ballooning the axis on a stray out-of-window sample (see `timeScaleX`).
  const [fromSec, toSec] = range;

  return {
    width: Math.max(100, width - 16),
    height: Math.max(80, height - 60),
    scales: { x: timeScaleX(fromSec, toSec) },
    axes: themedAxes(colors, formatYTicks),
    series: [
      {},
      ...series.map((_s, i): uPlotNs.Series => {
        const base: uPlotNs.Series = {
          label: labels[i] ?? `Series ${String(i + 1)}`,
          stroke: `hsl(${String(i * 60)}, 70%, 50%)`,
          fill: `hsla(${String(i * 60)}, 70%, 50%, 0.7)`,
        };
        return barsPaths === undefined ? base : { ...base, paths: barsPaths };
      }),
    ],
  };
};
