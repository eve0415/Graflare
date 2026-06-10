import type { Row, SortFn } from '@tanstack/react-table';

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
type ResultRow = string[];

const resultTableFeatures = tableFeatures({ rowPaginationFeature, rowSortingFeature });

type ResultTableFeatures = typeof resultTableFeatures;

/** Default rows per page: range queries emit one row per series×timestamp, into the thousands. */
export const RESULT_TABLE_PAGE_SIZE = 100;

/**
 * Column ids must be stable AND unique, but duplicate header names are legal in query
 * results (the same label value can repeat across series), so the position is baked in.
 */
export const resultColumnId = (index: number, name: string): string => `${String(index)}:${name}`;

const readCell = (row: Row<ResultTableFeatures, ResultRow>, columnId: string): string => {
  const value = row.getValue(columnId);
  return typeof value === 'string' ? value : '';
};

/** Sort key per cell: regime (finite numbers → text → blanks, ascending) + the one parse. */
const cellSortKey = (cell: string): { regime: 0 | 1 | 2; num: number } => {
  // `Number('')` is 0, so blanks must be classified before the numeric parse.
  if (cell.trim() === '') return { regime: 2, num: Number.NaN };
  const num = Number(cell);
  return Number.isFinite(num) ? { regime: 0, num } : { regime: 1, num: Number.NaN };
};

/**
 * Total order over result cells: finite numbers numerically (Prometheus sample values),
 * then text lexically (labels, ISO timestamps), blanks last. Comparing regimes first keeps
 * the comparator transitive on mixed columns — a pairwise numeric-else-string fallback is
 * not ("10" < "2x" < "9" < "10" forms a cycle), and a non-transitive comparator makes the
 * sort order algorithm-dependent. The built-in `alphanumeric` sort fn is wrong for metric
 * values: it splits on digit runs and parses with `parseInt`, so decimals and scientific
 * notation ("9.5", "1e3") misorder. Keys are parsed per comparison (one parse per side) —
 * fine at on-click scales; a precomputed key cache only pays once sorts of ≫10k rows are
 * a real path.
 */
export const numericAwareSortFn: SortFn<ResultTableFeatures, ResultRow> = (rowA, rowB, columnId) => {
  const a = readCell(rowA, columnId);
  const b = readCell(rowB, columnId);
  const keyA = cellSortKey(a);
  const keyB = cellSortKey(b);
  if (keyA.regime !== keyB.regime) return keyA.regime - keyB.regime;
  if (keyA.regime === 0) {
    if (keyA.num === keyB.num) return 0;
    return keyA.num < keyB.num ? -1 : 1;
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
