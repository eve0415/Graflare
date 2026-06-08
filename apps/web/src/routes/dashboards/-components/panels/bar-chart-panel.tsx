import type { Panel } from '@graflare/shared/schemas/panel';

import { useMemo } from 'react';

import { QueryResultTable, formatPrometheusToTable } from '../../../-root/query-result-table';

import { barChartAlignedData, barChartSeries, buildBarChartOptions } from './bar-chart-data';
import { UPlotPanel } from './uplot-panel';
import { usePanelQuery } from './use-panel-query';

interface BarChartPanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
  width: number;
  height: number;
}

export const BarChartPanel = ({ panel, timeRange, refetchInterval, width, height }: BarChartPanelProps) => {
  const { data, isLoading, error, handleRetry } = usePanelQuery(panel, timeRange, refetchInterval);

  const series = useMemo(() => barChartSeries(data), [data]);
  const chartData = useMemo(() => barChartAlignedData(series), [series]);

  const chartOptions = useMemo(() => {
    const vertical = panel.displayOptions.barchart?.orientation !== 'horizontal';
    return buildBarChartOptions({ series, queries: panel.queries, defaults: panel.fieldConfig.defaults, width, height, vertical });
  }, [series, panel.queries, panel.fieldConfig.defaults, panel.displayOptions.barchart?.orientation, width, height]);

  const tableData = useMemo(() => formatPrometheusToTable(series), [series]);
  const dataTable = useMemo(() => <QueryResultTable data={tableData} />, [tableData]);

  return (
    <UPlotPanel panel={panel} data={chartData} options={chartOptions} isLoading={isLoading} error={error} onRetry={handleRetry} dataTableContent={dataTable} />
  );
};
