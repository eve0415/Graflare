import type { Row, SortFn, TableState } from '@tanstack/react-table';

import {
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from '@tanstack/react-table';

// The single surface where the TanStack Table v9 (beta) API is configured: features, row
// models, the column helper, and the sort fn all live here so the next beta rename is a
// one-file fix. The query-result table is the only consumer; the other tables in the app
// are small static lists that don't need a table engine.

/** Result rows are positional string arrays — one cell per column (legal `RowData` in v9). */
export type ResultRow = string[];

const resultTableFeatures = tableFeatures({ rowPaginationFeature, rowSortingFeature });

export type ResultTableFeatures = typeof resultTableFeatures;

/** Range queries emit one row per series×timestamp, so results run into the thousands. */
export const RESULT_TABLE_PAGE_SIZE = 100;

export const resultTableInitialState = {
  pagination: { pageIndex: 0, pageSize: RESULT_TABLE_PAGE_SIZE },
} satisfies Partial<TableState<ResultTableFeatures>>;

/**
 * Column ids must be stable AND unique, but duplicate header names are legal in query
 * results (the same label value can repeat across series), so the position is baked in.
 */
export const resultColumnId = (index: number, name: string): string => `${String(index)}:${name}`;

const readCell = (row: Row<ResultTableFeatures, ResultRow>, columnId: string): string => {
  const value = row.getValue(columnId);
  return typeof value === 'string' ? value : '';
};

/**
 * Sorts numerically when both cells parse as finite numbers (Prometheus sample values),
 * falling back to plain string comparison otherwise (labels, ISO timestamps). `Number('')`
 * is 0, so blank cells are explicitly non-numeric and compare as strings. The built-in
 * `alphanumeric` sort fn is wrong for metric values: it splits on digit runs and parses
 * with `parseInt`, so decimals and scientific notation ("9.5", "1e3") misorder.
 */
export const numericAwareSortFn: SortFn<ResultTableFeatures, ResultRow> = (rowA, rowB, columnId) => {
  const a = readCell(rowA, columnId);
  const b = readCell(rowB, columnId);
  const aNum = a.trim() === '' ? Number.NaN : Number(a);
  const bNum = b.trim() === '' ? Number.NaN : Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    if (aNum === bNum) return 0;
    return aNum < bNum ? -1 : 1;
  }
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

export const { useAppTable: useResultTable, createAppColumnHelper: createResultColumnHelper } = createTableHook({
  features: resultTableFeatures,
  rowModels: {
    paginatedRowModel: createPaginatedRowModel(),
    sortedRowModel: createSortedRowModel(sortFns),
  },
  // Pin the toggle cycle to asc → desc → none for every column. Without this the first
  // direction is inferred per column from the data, so numeric-looking columns would
  // start at desc while label columns start at asc.
  sortDescFirst: false,
});

export const resultColumnHelper = createResultColumnHelper<ResultRow>();
