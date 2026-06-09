import type { Annotation } from '@graflare/shared/schemas/annotation';
import type { Panel } from '@graflare/shared/schemas/panel';

import { seriesLabel } from '@graflare/shared/legend/resolve';
import { resolveRange } from '@graflare/shared/time/resolve';
import { useMemo } from 'react';

import { chartThemeColors } from '../../../-root/chart-theme';
import { QueryResultTable, formatPrometheusToTable } from '../../../-root/query-result-table';
import { useTheme } from '../../../-root/theme-provider';

import { annotationMarkers } from './annotations-plugin';
import { barChartAlignedData, barChartSeries, buildBarChartOptions } from './bar-chart-data';
import { extractResultSeriesWithQuery } from './panel-data-extract';
import { UPlotPanel } from './uplot-panel';
import { usePanelQuery } from './use-panel-query';

interface BarChartPanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
  width: number;
  height: number;
  annotations: readonly Annotation[];
}

export const BarChartPanel = ({ panel, timeRange, refetchInterval, width, height, annotations }: BarChartPanelProps) => {
  const { data, isLoading, error, handleRetry } = usePanelQuery(panel, timeRange, refetchInterval);
  const { resolved } = useTheme();

  const series = useMemo(() => barChartSeries(data), [data]);
  const chartData = useMemo(() => barChartAlignedData(series), [series]);

  // Resolve each series' legend label here (where the panel queries are in scope), tagging by the
  // refId of the producing query so `legendFormat` applies even when one query yields many series.
  // Index-aligned with `series` (both come from the same ordered extractor).
  const labels = useMemo(
    () =>
      extractResultSeriesWithQuery(data, panel.queries).map((q, i) =>
        seriesLabel(panel.queries.find(x => x.refId === q.refId)?.legendFormat, q.series.metric, i),
      ),
    [data, panel.queries],
  );

  // Resolve the visible window once (epoch seconds) — shared by the annotation markers and the
  // chart's x-axis range pin so both track the same `[from, to]`.
  const queryWindow = useMemo(() => resolveRange(timeRange.from, timeRange.to), [timeRange.from, timeRange.to]);

  const markers = useMemo(() => annotationMarkers(annotations, queryWindow.from, queryWindow.to), [annotations, queryWindow.from, queryWindow.to]);

  const chartOptions = useMemo(() => {
    const vertical = panel.displayOptions.barchart?.orientation !== 'horizontal';
    const colors = chartThemeColors(resolved);
    return buildBarChartOptions({
      series,
      labels,
      defaults: panel.fieldConfig.defaults,
      width,
      height,
      vertical,
      colors,
      range: [queryWindow.from, queryWindow.to],
    });
  }, [series, labels, panel.fieldConfig.defaults, panel.displayOptions.barchart?.orientation, width, height, resolved, queryWindow.from, queryWindow.to]);

  const tableData = useMemo(() => formatPrometheusToTable(series), [series]);
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
