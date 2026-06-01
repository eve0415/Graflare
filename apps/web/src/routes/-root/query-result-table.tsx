import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@graflare/ui/components/table';

interface QueryResultTableProps {
  data: {
    columns: string[];
    rows: string[][];
  };
}

export const QueryResultTable = ({ data }: QueryResultTableProps) => {
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
              {row.map((cell, j) => (
                <TableCell key={`${String(i)}-${String(j)}`} className='font-mono text-xs'>
                  {cell}
                </TableCell>
              ))}
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
