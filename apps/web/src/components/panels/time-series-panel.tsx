import type { Panel } from '@graflare/shared/schemas/panel';

import { useCallback, useMemo } from 'react';
import type uPlot from 'uplot';

import { QueryResultTable, formatPrometheusToTable } from '../query-result-table';
import { UPlotChart } from '../uplot-chart';

import { PanelFrame } from './panel-frame';
import { usePanelData } from './use-panel-data';

interface TimeSeriesPanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
  width: number;
  height: number;
}

export const TimeSeriesPanel = ({ panel, timeRange, refetchInterval, width, height }: TimeSeriesPanelProps) => {
  const { data, isLoading, error, refetch } = usePanelData(
    panel.datasourceId,
    panel.queries,
    timeRange,
    refetchInterval,
  );

  const chartResult = useMemo(() => {
    if (data === null || data === undefined) return null;

    const allResults: { metric: Record<string, string>; values?: [number, string][] }[] = [];
    for (const res of data) {
      if (res.status === 'success' && res.data !== undefined && 'result' in res.data && Array.isArray(res.data.result)) {
        for (const r of res.data.result) {
          if (typeof r === 'object' && r !== null && 'metric' in r) {
            allResults.push(r);
          }
        }
      }
    }
    return allResults;
  }, [data]);

  const chartData = useMemo((): uPlot.AlignedData => {
    if (chartResult === null || chartResult.length === 0) return [[]];

    const first = chartResult[0];
    if (first?.values === undefined) return [[]];

    const timestamps = first.values.map(v => v[0]);
    const series = chartResult.map(r => (r.values ?? []).map(v => Number(v[1])));

    return [timestamps, ...series];
  }, [chartResult]);

  const chartOptions = useMemo((): uPlot.Options => {
    const thresholdBands: uPlot.Band[] = [];
    const sorted = [...panel.thresholds].sort((a, b) => a.value - b.value);

    return {
      width: Math.max(100, width - 16),
      height: Math.max(80, height - 60),
      series: [
        {},
        ...(chartResult ?? []).map((r, i) => ({
          label: r.metric.__name__ ?? panel.queries[i]?.legendFormat ?? `Series ${String(i + 1)}`,
          stroke: `hsl(${String(i * 60)}, 70%, 50%)`,
          width: panel.displayOptions.timeseries?.lineWidth ?? 1,
          fill: `hsla(${String(i * 60)}, 70%, 50%, ${String((panel.displayOptions.timeseries?.fillOpacity ?? 10) / 100)})`,
        })),
      ],
      bands: thresholdBands,
      plugins: sorted.length > 0 ? [{
        hooks: {
          drawSeries: (u: uPlot) => {
            const {ctx} = u;
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
      }] : [],
    };
  }, [width, height, chartResult, panel]);

  const tableData = useMemo(() => {
    if (chartResult === null) return { columns: [], rows: [] };
    return formatPrometheusToTable(chartResult);
  }, [chartResult]);

  const handleRetry = useCallback(() => { void refetch(); }, [refetch]);

  const dataTable = useMemo(() => <QueryResultTable data={tableData} />, [tableData]);

  return (
    <PanelFrame
      title={panel.title}
      loading={isLoading}
      error={error instanceof Error ? error.message : null}
      onRetry={handleRetry}
      dataTableContent={dataTable}
    >
      {chartData[0] !== undefined && chartData[0].length > 0 ? (
        <UPlotChart options={chartOptions} data={chartData} />
      ) : (
        <p className='text-muted-foreground text-sm'>No data</p>
      )}
    </PanelFrame>
  );
};
