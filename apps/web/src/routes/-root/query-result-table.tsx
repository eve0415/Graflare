import type { CSSProperties } from 'react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@graflare/ui/components/table';
import { useMemo } from 'react';

// Optional per-cell transform: panels use it to format numeric cells and apply
// value-mapping text/color. Absent = render the raw string (the Explore default).
export type CellRenderer = (cell: string, rowIndex: number, colIndex: number) => { text: string; color?: string };

interface QueryResultTableProps {
  data: {
    columns: string[];
    rows: string[][];
  };
  renderCell?: CellRenderer;
}

// Leaf cell: the style object is built here from primitive props so the parent's
// map scope never passes a freshly-created object down (react-perf).
const DataCell = ({ text, color }: { text: string; color: string | undefined }) => {
  const style = useMemo<CSSProperties | undefined>(() => (color === undefined ? undefined : { color }), [color]);
  return (
    <TableCell className='font-mono text-xs' style={style}>
      {text}
    </TableCell>
  );
};

export const QueryResultTable = ({ data, renderCell }: QueryResultTableProps) => {
  const { columns, rows } = data;

  if (columns.length === 0) {
    return <p className='text-muted-foreground text-sm'>No data</p>;
  }

  return (
    <div className='max-h-96 overflow-auto rounded-md border'>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map(col => (
              <TableHead key={col}>{col}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={String(i)}>
              {row.map((cell, j) => {
                const rendered = renderCell?.(cell, i, j);
                return <DataCell key={`${String(i)}-${String(j)}`} text={rendered?.text ?? cell} color={rendered?.color} />;
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export const formatPrometheusToTable = (
  result: { metric: Record<string, string>; values?: [number, string][]; value?: [number, string] }[],
): { columns: string[]; rows: string[][] } => {
  if (result.length === 0) return { columns: [], rows: [] };

  const metricKeys = new Set<string>();
  for (const r of result) {
    for (const key of Object.keys(r.metric)) {
      metricKeys.add(key);
    }
  }

  const columns = [...metricKeys, 'Timestamp', 'Value'];
  const rows: string[][] = [];

  for (const r of result) {
    if (r.values !== undefined) {
      for (const [ts, val] of r.values) {
        const row = [...metricKeys].map(k => r.metric[k] ?? '');
        row.push(new Date(ts * 1000).toISOString(), val);
        rows.push(row);
      }
    } else if (r.value !== undefined) {
      const [ts, val] = r.value;
      const row = [...metricKeys].map(k => r.metric[k] ?? '');
      row.push(new Date(ts * 1000).toISOString(), val);
      rows.push(row);
    }
  }

  return { columns, rows };
};
