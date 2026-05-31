import type { Panel } from '@graflare/shared/schemas/panel';

import { useCallback, useMemo } from 'react';

import { QueryResultTable, formatPrometheusToTable } from '../query-result-table';

import { PanelFrame } from './panel-frame';
import { usePanelData } from './use-panel-data';

interface TablePanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
}

export const TablePanel = ({ panel, timeRange, refetchInterval }: TablePanelProps) => {
  const { data, isLoading, error, refetch } = usePanelData(
    panel.datasourceId,
    panel.queries,
    timeRange,
    refetchInterval,
  );

  const tableData = useMemo(() => {
    if (data === null || data === undefined) return { columns: [], rows: [] };

    const allResults: { metric: Record<string, string>; values?: [number, string][]; value?: [number, string] }[] = [];
    for (const res of data) {
      if (res.status === 'success' && res.data !== undefined && 'result' in res.data && Array.isArray(res.data.result)) {
        for (const r of res.data.result) {
          if (typeof r === 'object' && r !== null && 'metric' in r) {
            allResults.push(r);
          }
        }
      }
    }

    return formatPrometheusToTable(allResults);
  }, [data]);

  const handleRetry = useCallback(() => { void refetch(); }, [refetch]);

  return (
    <PanelFrame
      title={panel.title}
      loading={isLoading}
      error={error instanceof Error ? error.message : null}
      onRetry={handleRetry}
    >
      <QueryResultTable data={tableData} />
    </PanelFrame>
  );
};
