import type { ChartThemeColors } from '../../../-root/chart-theme';
import type { ResultSeries } from './panel-data-extract';
import type { PanelDataResult } from './use-panel-data';
import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';
import type uPlotNs from 'uplot';

import { formatValue } from '@graflare/shared/format/value-format';
import uPlot from 'uplot';

import { timeScaleX } from '../../../-root/chart-theme';

import { resolveSharedAxisLayout } from './multi-axis';
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
  /**
   * Effective field config per series, index-aligned with `series` — each resolved via
   * `resolveFieldConfig(seriesDescriptor(...), panel.fieldConfig)` by the caller (which holds the
   * panel queries, so refId-based overrides match). OPTIONAL and additive: when omitted, every
   * series falls back to `defaults`, which collapses to the prior single-y-axis layout (so callers
   * and tests that pass only `defaults` are unchanged). When supplied, series are grouped by their
   * resolved `unit` into multiple y-axes (see `resolveSharedAxisLayout`).
   */
  seriesConfigs?: readonly FieldConfigDefaults[];
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
 * Build the uPlot options for a bar chart: a bars path-builder on every data series and a y-axis
 * layout grouped by each series' resolved unit (see `resolveSharedAxisLayout`). `vertical` is
 * accepted for forward-compat; uPlot 1.6 renders value bars vertically, so it currently has no
 * visual branch.
 *
 * When `seriesConfigs` is omitted every series falls back to `defaults`, so the layout collapses to
 * the prior single themed y-axis (same scale key 'y', no series `scale` key) — byte-equivalent to
 * before overrides. Only ≥2 distinct resolved units split into multiple left/right y-axes.
 */
export const buildBarChartOptions = ({ series, labels, defaults, seriesConfigs, width, height, colors, range }: BuildBarChartOptionsArgs): uPlotNs.Options => {
  // `paths` is optional on Series and uPlot.paths.bars is itself optional in the
  // types; build it once and include the key only when present (no undefined writes).
  const barsPaths = uPlot.paths.bars?.({ size: BAR_SIZE, align: 0 });

  // Resolve the y-axis layout from each series' effective config. With no per-series configs every
  // series uses `defaults` → one unit → the single-axis path the chart built before.
  const configs = seriesConfigs ?? series.map(() => defaults);
  const layout = resolveSharedAxisLayout(configs, colors);

  // Pin the x domain to the resolved query window (epoch seconds). `time: true` is uPlot's default
  // for x so it doesn't change bar geometry; the explicit range is what stops auto-range from
  // ballooning the axis on a stray out-of-window sample (see `timeScaleX`). The y-scales the layout
  // introduces (one per unit when multi-axis) merge in alongside.
  const [fromSec, toSec] = range;

  return {
    width: Math.max(100, width - 16),
    height: Math.max(80, height - 60),
    scales: { x: timeScaleX(fromSec, toSec), ...layout.scales },
    axes: layout.axes,
    series: [
      {},
      ...series.map((_s, i): uPlotNs.Series => {
        const scale = layout.seriesScales[i];
        const base: uPlotNs.Series = {
          label: labels[i] ?? `Series ${String(i + 1)}`,
          stroke: `hsl(${String(i * 60)}, 70%, 50%)`,
          fill: `hsla(${String(i * 60)}, 70%, 50%, 0.7)`,
        };
        const withPaths = barsPaths === undefined ? base : { ...base, paths: barsPaths };
        // Assign a scale key only when the layout splits units; single-unit series stay on the
        // default 'y' scale with no `scale` key (byte-identical to before).
        return scale === undefined ? withPaths : { ...withPaths, scale };
      }),
    ],
  };
};
