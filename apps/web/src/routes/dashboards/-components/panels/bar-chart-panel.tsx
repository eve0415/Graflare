import type { Panel } from '@graflare/shared/schemas/panel';

import { useCallback, useMemo } from 'react';

import { QueryResultTable, formatPrometheusToTable } from '../../../-root/query-result-table';
import { UPlotChart } from '../../../-root/uplot-chart';

import { barChartAlignedData, barChartSeries, buildBarChartOptions } from './bar-chart-data';
import { PanelFrame } from './panel-frame';
import { usePanelData } from './use-panel-data';

interface BarChartPanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
  width: number;
  height: number;
}

export const BarChartPanel = ({ panel, timeRange, refetchInterval, width, height }: BarChartPanelProps) => {
  const { data, isLoading, error, refetch } = usePanelData(panel.datasourceId, panel.queries, timeRange, refetchInterval);

  const series = useMemo(() => barChartSeries(data), [data]);
  const chartData = useMemo(() => barChartAlignedData(series), [series]);

  const chartOptions = useMemo(() => {
    const vertical = panel.displayOptions.barchart?.orientation !== 'horizontal';
    return buildBarChartOptions({ series, queries: panel.queries, defaults: panel.fieldConfig.defaults, width, height, vertical });
  }, [series, panel.queries, panel.fieldConfig.defaults, panel.displayOptions.barchart?.orientation, width, height]);

  const tableData = useMemo(() => formatPrometheusToTable(series), [series]);
  const dataTable = useMemo(() => <QueryResultTable data={tableData} />, [tableData]);

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <PanelFrame
      title={panel.title}
      panelId={panel.id}
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
