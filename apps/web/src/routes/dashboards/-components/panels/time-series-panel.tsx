import type { Annotation } from '@graflare/shared/schemas/annotation';
import type { Panel } from '@graflare/shared/schemas/panel';
import type uPlot from 'uplot';

import { formatValue } from '@graflare/shared/format/value-format';
import { seriesLabel } from '@graflare/shared/legend/resolve';
import { resolveRange } from '@graflare/shared/time/resolve';
import { useMemo } from 'react';

import { chartThemeColors, themedAxis } from '../../../-root/chart-theme';
import { QueryResultTable, formatPrometheusToTable } from '../../../-root/query-result-table';
import { useTheme } from '../../../-root/theme-provider';

import { annotationMarkers } from './annotations-plugin';
import { extractResultSeriesWithQuery } from './panel-data-extract';
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
  const queried = useMemo(() => extractResultSeriesWithQuery(data, panel.queries), [data, panel.queries]);
  const chartResult = useMemo(() => queried.map(q => q.series), [queried]);

  const seriesLabels = useMemo(
    () => queried.map((q, i) => seriesLabel(panel.queries.find(x => x.refId === q.refId)?.legendFormat, q.series.metric, i)),
    [queried, panel.queries],
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
    const { defaults } = panel.fieldConfig;
    const colors = chartThemeColors(resolved);

    // y-axis tick formatting only — uPlot's DynamicValues hook over the y splits.
    // Tooltip/legend and value-mappings (which don't apply to a continuous series)
    // are intentionally left alone. Index 0 = x/time axis (default), index 1 = y.
    const formatYTicks: uPlot.Axis.DynamicValues = (_u, splits) => splits.map(v => formatValue(v, defaults));

    // Pin the x domain to the selected query window so the axis tracks the chosen
    // range rather than uPlot's data-driven auto-range (which balloons when a series
    // carries a stray out-of-window sample — the audit saw a multi-year x-axis).
    const { from: fromSec, to: toSec } = resolveRange(timeRange.from, timeRange.to);
    const xRange = (): [number, number] => [fromSec, toSec];

    return {
      width: Math.max(100, width - 16),
      height: Math.max(80, height - 60),
      scales: { x: { time: true, range: xRange } },
      axes: [{ ...themedAxis(colors) }, { ...themedAxis(colors), values: formatYTicks }],
      series: [
        {},
        ...chartResult.map((_r, i) => ({
          label: seriesLabels[i] ?? `Series ${String(i + 1)}`,
          stroke: `hsl(${String(i * 60)}, 70%, 50%)`,
          width: panel.displayOptions.timeseries?.lineWidth ?? 1,
          fill: `hsla(${String(i * 60)}, 70%, 50%, ${String((panel.displayOptions.timeseries?.fillOpacity ?? 10) / 100)})`,
        })),
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
  }, [width, height, chartResult, seriesLabels, panel, resolved, timeRange.from, timeRange.to]);

  const tableData = useMemo(() => formatPrometheusToTable(chartResult), [chartResult]);
  const dataTable = useMemo(() => <QueryResultTable data={tableData} scrollRegionLabel={`${panel.title} data table`} />, [tableData, panel.title]);

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
