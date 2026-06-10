import type { CSSProperties } from 'react';

import { Button } from '@graflare/ui/components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@graflare/ui/components/table';
import { ArrowDownNarrowWide, ArrowUpNarrowWide, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { useMemo } from 'react';

import { RESULT_TABLE_PAGE_SIZE, numericAwareSortFn, resultColumnHelper, resultColumnId, resultTableInitialState, useResultTable } from './result-table-hook';

// Optional per-cell transform: panels use it to format numeric cells and apply
// value-mapping text/color. Absent = render the raw string (the Explore default).
export type CellRenderer = (cell: string, rowIndex: number, colIndex: number) => { text: string; color?: string };

interface QueryResultTableProps {
  data: {
    columns: string[];
    rows: string[][];
  };
  renderCell?: CellRenderer;
  /**
   * Accessible name for the table's horizontal-scroll region (WAI-ARIA scrollable-region pattern,
   * so keyboard users can scroll a wide table). Pass a value UNIQUE per on-screen table — e.g. the
   * panel title — since the region is a landmark and duplicate names trip axe `landmark-unique`.
   * Omitted in inline/non-scrolling contexts where a focusable landmark would just be noise.
   */
  scrollRegionLabel?: string;
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

const SORT_ICONS = {
  asc: <ArrowUpNarrowWide className='size-3.5 shrink-0' aria-hidden='true' />,
  desc: <ArrowDownNarrowWide className='size-3.5 shrink-0' aria-hidden='true' />,
  none: <ChevronsUpDown className='text-muted-foreground/60 size-3.5 shrink-0' aria-hidden='true' />,
} as const;

export const QueryResultTable = ({ data, renderCell, scrollRegionLabel }: QueryResultTableProps) => {
  const { columns, rows } = data;

  // Column defs are positional: one accessor per index over the row array (array rows are a
  // legal v9 RowData). The raw cell value flows through the v9 cell context so sorting and
  // pagination always see the unformatted string while renderCell controls presentation.
  const columnDefs = useMemo(
    () =>
      // The columns() wrapper is required, not cosmetic: TableOptions wants
      // ColumnDef<…, unknown> and the accessor defs are invariant in TValue.
      resultColumnHelper.columns(
        columns.map((name, index) =>
          resultColumnHelper.accessor(row => row[index] ?? '', {
            id: resultColumnId(index, name),
            header: name,
            sortFn: numericAwareSortFn,
            cell: info => {
              const raw = info.getValue();
              // info.row.index is the row's index in the ORIGINAL data (v9 sorting reorders
              // row objects without reassigning it), so rowIndex is a stable row identity
              // that diverges from the displayed position once the table is sorted.
              const rendered = renderCell?.(raw, info.row.index, index);
              return <DataCell text={rendered?.text ?? raw} color={rendered?.color} />;
            },
          }),
        ),
      ),
    [columns, renderCell],
  );

  const table = useResultTable({ columns: columnDefs, data: rows, initialState: resultTableInitialState });

  if (columns.length === 0) {
    return <p className='text-muted-foreground text-sm'>No data</p>;
  }

  const { pageIndex } = table.state.pagination;
  const showPagination = rows.length > RESULT_TABLE_PAGE_SIZE;

  return (
    <>
      <div className='max-h-96 overflow-auto rounded-md border'>
        <Table scrollRegionLabel={scrollRegionLabel}>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} aria-sort={sorted === false ? undefined : sorted === 'asc' ? 'ascending' : 'descending'} className='p-0'>
                      <button
                        type='button'
                        onClick={header.column.getToggleSortingHandler()}
                        className='hover:text-foreground flex h-10 w-full items-center gap-1 px-2 text-left font-medium'
                      >
                        <table.FlexRender header={header} />
                        {SORT_ICONS[sorted === false ? 'none' : sorted]}
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map(row => (
              <TableRow key={row.id}>
                {row.getAllCells().map(cell => (
                  <table.FlexRender key={cell.id} cell={cell} />
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {showPagination && (
        <div className='flex items-center justify-between pt-2'>
          <span className='text-muted-foreground text-xs'>{rows.length} rows</span>
          <div className='flex items-center gap-2'>
            <Button variant='outline' size='icon-xs' onClick={table.previousPage} disabled={!table.getCanPreviousPage()} aria-label='Previous page'>
              <ChevronLeft />
            </Button>
            <span className='text-muted-foreground text-xs'>
              Page {pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button variant='outline' size='icon-xs' onClick={table.nextPage} disabled={!table.getCanNextPage()} aria-label='Next page'>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </>
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
