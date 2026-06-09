import type { CellRenderer } from '../../../-root/query-result-table';
import type { PanelDataResult } from './use-panel-data';
import type { FieldDescriptor } from '@graflare/shared/format/resolve-field-config';
import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';
import type { Panel } from '@graflare/shared/schemas/panel';

import { resolveFieldConfig } from '@graflare/shared/format/resolve-field-config';
import { formatValue } from '@graflare/shared/format/value-format';
import { applyValueMappings } from '@graflare/shared/format/value-mappings';
import { useCallback, useMemo } from 'react';

import { QueryResultTable, formatPrometheusToTable } from '../../../-root/query-result-table';

import { extractResultSeries } from './panel-data-extract';
import { PanelFrame } from './panel-frame';
import { usePanelQuery } from './use-panel-query';

interface TablePanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
}

// One column described for override matching: its name (byName/byRegexp) and, for a SQL
// source, its declared type (byType). Prometheus-derived columns carry no type. `fields`
// is index-aligned with `columns`, so a cell's colIndex selects its descriptor directly.
interface TableData {
  columns: string[];
  rows: string[][];
  fields: FieldDescriptor[];
}

const toTableData = (data: PanelDataResult[] | null | undefined): TableData => {
  if (data === null || data === undefined) return { columns: [], rows: [], fields: [] };

  // A SQL data source returns its own columns/rows shape (no `status`); render it
  // directly. Prometheus responses fall through to the shared series extraction.
  for (const res of data) {
    if ('columns' in res && 'rows' in res && !('status' in res)) {
      return {
        columns: res.columns.map(c => c.name),
        rows: res.rows.map(row => row.map(v => (v === null ? '' : String(v)))),
        // SQL columns carry an optional type — pass it through so byType overrides match.
        fields: res.columns.map(c => (c.type === undefined ? { name: c.name } : { name: c.name, type: c.type })),
      };
    }
  }

  const prom = formatPrometheusToTable(extractResultSeries(data));
  return { ...prom, fields: prom.columns.map(name => ({ name })) };
};

export const TablePanel = ({ panel, timeRange, refetchInterval }: TablePanelProps) => {
  const { data, isLoading, error, handleRetry } = usePanelQuery(panel, timeRange, refetchInterval);

  const tableData = useMemo(() => toTableData(data), [data]);

  // Per-column effective config: resolve each column's field against the panel's overrides
  // once (not per cell — react-perf), index-aligned with the columns. With no matching
  // override, resolveFieldConfig returns the defaults reference, so this is the same object
  // every column shared before overrides existed.
  const { fieldConfig } = panel;
  const columnConfigs = useMemo<FieldConfigDefaults[]>(
    () => tableData.fields.map(field => resolveFieldConfig(field, fieldConfig)),
    [tableData.fields, fieldConfig],
  );

  // Format a cell against its column's resolved config: a value-mapping wins, else format
  // numeric cells, else the raw string falls through (label columns). colIndex selects the
  // column config; a stray index out of range falls back to defaults.
  const renderCell = useCallback<CellRenderer>(
    (cell, _rowIndex, colIndex): { text: string; color?: string } => {
      const config = columnConfigs[colIndex] ?? fieldConfig.defaults;
      const mapping = applyValueMappings(cell, config.mappings);
      if (mapping !== null) {
        const text = mapping.text ?? cell;
        return mapping.color === undefined ? { text } : { text, color: mapping.color };
      }
      const num = Number(cell);
      if (cell.trim() !== '' && Number.isFinite(num)) return { text: formatValue(num, config) };
      return { text: cell };
    },
    [columnConfigs, fieldConfig.defaults],
  );

  return (
    <PanelFrame title={panel.title} panelId={panel.id} loading={isLoading} error={error instanceof Error ? error.message : null} onRetry={handleRetry}>
      <QueryResultTable data={tableData} renderCell={renderCell} scrollRegionLabel={`${panel.title} data table`} />
    </PanelFrame>
  );
};
