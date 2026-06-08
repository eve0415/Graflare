import type { CellRenderer } from '../../../-root/query-result-table';
import type { PanelDataResult } from './use-panel-data';
import type { Panel } from '@graflare/shared/schemas/panel';

import { formatValue } from '@graflare/shared/format/value-format';
import { applyValueMappings } from '@graflare/shared/format/value-mappings';
import { useCallback, useMemo } from 'react';

import { QueryResultTable, formatPrometheusToTable } from '../../../-root/query-result-table';

import { extractResultSeries } from './panel-data-extract';
import { PanelFrame } from './panel-frame';
import { usePanelData } from './use-panel-data';

interface TablePanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
}

const toTableData = (data: PanelDataResult[] | null | undefined): { columns: string[]; rows: string[][] } => {
  if (data === null || data === undefined) return { columns: [], rows: [] };

  // A SQL data source returns its own columns/rows shape (no `status`); render it
  // directly. Prometheus responses fall through to the shared series extraction.
  for (const res of data) {
    if ('columns' in res && 'rows' in res && !('status' in res)) {
      return {
        columns: res.columns.map(c => c.name),
        rows: res.rows.map(row => row.map(v => (v === null ? '' : String(v)))),
      };
    }
  }

  return formatPrometheusToTable(extractResultSeries(data));
};

export const TablePanel = ({ panel, timeRange, refetchInterval }: TablePanelProps) => {
  const { data, isLoading, error, refetch } = usePanelData(panel.datasourceId, panel.queries, timeRange, refetchInterval);

  const tableData = useMemo(() => toTableData(data), [data]);

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // Column-level field config (defaults only — no per-column overrides yet): map
  // a cell, else format numeric cells; label cells (non-numeric) fall through raw.
  const { defaults } = panel.fieldConfig;
  const renderCell = useCallback<CellRenderer>(
    (cell): { text: string; color?: string } => {
      const mapping = applyValueMappings(cell, defaults.mappings);
      if (mapping !== null) {
        const text = mapping.text ?? cell;
        return mapping.color === undefined ? { text } : { text, color: mapping.color };
      }
      const num = Number(cell);
      if (cell.trim() !== '' && Number.isFinite(num)) return { text: formatValue(num, defaults) };
      return { text: cell };
    },
    [defaults],
  );

  return (
    <PanelFrame title={panel.title} panelId={panel.id} loading={isLoading} error={error instanceof Error ? error.message : null} onRetry={handleRetry}>
      <QueryResultTable data={tableData} renderCell={renderCell} />
    </PanelFrame>
  );
};
