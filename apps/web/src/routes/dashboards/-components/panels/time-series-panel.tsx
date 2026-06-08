import type { Annotation } from '@graflare/shared/schemas/annotation';
import type { Panel } from '@graflare/shared/schemas/panel';
import type uPlot from 'uplot';

import { formatValue } from '@graflare/shared/format/value-format';
import { resolveTime } from '@graflare/shared/time/resolve';
import { useMemo } from 'react';

import { QueryResultTable, formatPrometheusToTable } from '../../../-root/query-result-table';

import { annotationMarkers } from './annotations-plugin';
import { extractResultSeries } from './panel-data-extract';
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

  const chartResult = useMemo(() => extractResultSeries(data), [data]);

  const markers = useMemo(
    () => annotationMarkers(annotations, resolveTime(timeRange.from), resolveTime(timeRange.to)),
    [annotations, timeRange.from, timeRange.to],
  );

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

    // y-axis tick formatting only — uPlot's DynamicValues hook over the y splits.
    // Tooltip/legend and value-mappings (which don't apply to a continuous series)
    // are intentionally left alone. Index 0 = x/time axis (default), index 1 = y.
    const formatYTicks: uPlot.Axis.DynamicValues = (_u, splits) => splits.map(v => formatValue(v, defaults));

    return {
      width: Math.max(100, width - 16),
      height: Math.max(80, height - 60),
      axes: [{}, { values: formatYTicks }],
      series: [
        {},
        ...chartResult.map((r, i) => ({
          label: r.metric.__name__ ?? panel.queries[i]?.legendFormat ?? `Series ${String(i + 1)}`,
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
  }, [width, height, chartResult, panel]);

  const tableData = useMemo(() => formatPrometheusToTable(chartResult), [chartResult]);
  const dataTable = useMemo(() => <QueryResultTable data={tableData} />, [tableData]);

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
