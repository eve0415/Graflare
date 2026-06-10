import type { Annotation } from '@graflare/shared/schemas/annotation';
import type { Panel } from '@graflare/shared/schemas/panel';
import type uPlot from 'uplot';

import { resolveFieldConfig } from '@graflare/shared/format/resolve-field-config';
import { seriesLabel } from '@graflare/shared/legend/resolve';
import { resolveRange } from '@graflare/shared/time/resolve';
import { useMemo } from 'react';

import { chartThemeColors, timeScaleX } from '../../../-root/chart-theme';
import { useTheme } from '../../../-root/theme-provider';

import { annotationMarkers } from './annotations-plugin';
import { resolveSharedAxisLayout } from './multi-axis';
import { extractTransformedSeriesWithQuery, seriesDescriptor } from './panel-data-extract';
import { PanelDataTable } from './panel-data-table';
import { UPlotPanel } from './uplot-panel';
import { usePanelQuery } from './use-panel-query';

interface TimeSeriesPanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
  width: number;
  height: number;
  annotations: readonly Annotation[];
}

export const TimeSeriesPanel = ({ panel, timeRange, refetchInterval, width, height, annotations }: TimeSeriesPanelProps) => {
  const { data, isLoading, error, handleRetry } = usePanelQuery(panel, timeRange, refetchInterval);
  const { resolved } = useTheme();

  // Keep each series tagged with the refId of the query that produced it, so the legend label
  // resolves against that query's `legendFormat` even when ONE query yields multiple series
  // (the canonical Prometheus case `{{job}} {{method}}` is built for). `chartResult` stays the
  // flat `ResultSeries[]` the data/table readers already consume.
  const queried = useMemo(() => extractTransformedSeriesWithQuery(data, panel.queries, panel.transformations), [data, panel.queries, panel.transformations]);
  const chartResult = useMemo(() => queried.map(q => q.series), [queried]);

  // refId→legendFormat once, instead of an O(series × queries) find inside the map.
  const legendFormats = useMemo(() => new Map(panel.queries.map(q => [q.refId, q.legendFormat])), [panel.queries]);
  const seriesLabels = useMemo(
    () => queried.map((q, i) => seriesLabel(q.refId === undefined ? undefined : legendFormats.get(q.refId), q.series.metric, i)),
    [queried, legendFormats],
  );

  // Effective field config per series (unit/min/max), resolved against the panel overrides keyed on
  // the derived series label + the producing query's refId — the same descriptor path the bar-gauge
  // panel uses. Index-aligned with `chartResult`; the chart groups by resolved unit into y-axes.
  // With no overrides every series resolves to the defaults reference → one y-axis, as before.
  const seriesConfigs = useMemo(
    () => queried.map((q, i) => resolveFieldConfig(seriesDescriptor(q.series, i, q.refId), panel.fieldConfig)),
    [queried, panel.fieldConfig],
  );

  const markers = useMemo(() => {
    const { from, to } = resolveRange(timeRange.from, timeRange.to);
    return annotationMarkers(annotations, from, to);
  }, [annotations, timeRange.from, timeRange.to]);

  const chartData = useMemo((): uPlot.AlignedData => {
    if (chartResult.length === 0) return [[]];

    const [first] = chartResult;
    if (first?.values === undefined) return [[]];

    const timestamps = first.values.map(v => v[0]);
    const series = chartResult.map(r => (r.values ?? []).map(v => Number(v[1])));

    return [timestamps, ...series];
  }, [chartResult]);

  const chartOptions = useMemo((): uPlot.Options => {
    const thresholdBands: uPlot.Band[] = [];
    const sorted = [...panel.thresholds].sort((a, b) => a.value - b.value);
    const colors = chartThemeColors(resolved);

    // Build the y-axis layout from each series' resolved unit: one y-axis on the default 'y' scale
    // when every series shares a unit (the common case — byte-equivalent to before), or one
    // left/right y-axis per distinct unit when overrides split them. Each axis formats its ticks
    // with its own unit; the threshold lines below stay on the primary 'y' scale.
    const layout = resolveSharedAxisLayout(seriesConfigs, colors);

    const { from: fromSec, to: toSec } = resolveRange(timeRange.from, timeRange.to);

    return {
      width: Math.max(100, width - 16),
      height: Math.max(80, height - 60),
      // Pin the x domain to the selected query window so the axis tracks the chosen range rather
      // than uPlot's auto-range (which balloons on a stray out-of-window sample — see `timeScaleX`).
      // The y-scales the layout introduces (one per unit when multi-axis) merge in alongside.
      scales: { x: timeScaleX(fromSec, toSec), ...layout.scales },
      axes: layout.axes,
      series: [
        {},
        ...chartResult.map((_r, i): uPlot.Series => {
          const scale = layout.seriesScales[i];
          const base: uPlot.Series = {
            label: seriesLabels[i] ?? `Series ${String(i + 1)}`,
            stroke: `hsl(${String(i * 60)}, 70%, 50%)`,
            width: panel.displayOptions.timeseries?.lineWidth ?? 1,
            fill: `hsla(${String(i * 60)}, 70%, 50%, ${String((panel.displayOptions.timeseries?.fillOpacity ?? 10) / 100)})`,
          };
          // Assign a scale key only when the layout splits units; single-unit series stay on the
          // default 'y' scale with no `scale` key (byte-identical to before).
          return scale === undefined ? base : { ...base, scale };
        }),
      ],
      bands: thresholdBands,
      plugins:
        sorted.length > 0
          ? [
              {
                hooks: {
                  drawSeries: (u: uPlot) => {
                    const { ctx } = u;
                    for (const threshold of sorted) {
                      const y = u.valToPos(threshold.value, 'y', true);
                      ctx.save();
                      ctx.strokeStyle = threshold.color;
                      ctx.lineWidth = 1;
                      ctx.setLineDash([4, 4]);
                      ctx.beginPath();
                      ctx.moveTo(u.bbox.left, y);
                      ctx.lineTo(u.bbox.left + u.bbox.width, y);
                      ctx.stroke();
                      ctx.restore();
                    }
                  },
                },
              },
            ]
          : [],
    };
  }, [width, height, chartResult, seriesLabels, seriesConfigs, panel, resolved, timeRange.from, timeRange.to]);

  // A cheap element — PanelDataTable formats the series only when PanelFrame mounts it
  // (data-table toggle on), not on every refresh.
  const dataTable = useMemo(() => <PanelDataTable series={chartResult} scrollRegionLabel={`${panel.title} data table`} />, [chartResult, panel.title]);

  return (
    <UPlotPanel
      panel={panel}
      data={chartData}
      options={chartOptions}
      isLoading={isLoading}
      error={error}
      onRetry={handleRetry}
      dataTableContent={dataTable}
      annotationMarkers={markers}
    />
  );
};
