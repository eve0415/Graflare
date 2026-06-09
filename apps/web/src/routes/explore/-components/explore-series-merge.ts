/**
 * Merge the time series from one or more Explore query rows onto a single shared time axis for
 * uPlot. Different queries (and different series within a query) can return DIFFERENT timestamp
 * sets — gaps, different step alignment, ranges that only partly overlap — so the series are
 * NOT aligned by index. Instead we take the sorted union of every timestamp seen across all
 * series, then project each series' values onto that axis, filling `null` wherever a series has
 * no sample at a union timestamp (uPlot renders `null` as a gap).
 *
 * The input is the source-agnostic Prometheus matrix shape (`{ metric, values }[]`); SQL results
 * are converted to that shape via `sqlRowsToSeries` before reaching here, so this function never
 * has to know whether a query was SQL or PromQL.
 *
 * Timestamps stay in SECONDS (the unit Prometheus and the SQL adapter emit). The chart consumes
 * them as-is; only the table formatter multiplies by 1000 for display.
 */

/** A single series: a metric label set plus its [unixSeconds, valueString] samples. */
export interface MergeSeries {
  metric: Record<string, string>;
  values?: [number, string][] | undefined;
}

/** One query row's contribution: its positional ref id (A, B, C, …) and the series it returned. */
export interface MergeInput {
  refId: string;
  series: MergeSeries[];
}

/**
 * uPlot's aligned-data tuple: `[xValues, ...ySeries]`. The x array is the union timestamp axis;
 * each y array is one series projected onto it, with `null` for missing samples. Widened to
 * include `null` because gaps are expected once timestamp sets differ across queries.
 */
export type MergedChartData = [number[], ...(number | null)[][]];

export interface MergedSeries {
  /** uPlot aligned data: union timestamps followed by one value array per series. */
  data: MergedChartData;
  /** Series labels parallel to `data[1...]`, disambiguated by ref id, e.g. `A: up`. */
  labels: string[];
}

/** Human label for a series, prefixed by its query's ref id so overlaid queries are distinct. */
const seriesLabel = (refId: string, metric: Record<string, string>, indexWithinQuery: number): string => {
  const name = metric.__name__ ?? `Series ${String(indexWithinQuery + 1)}`;
  return `${refId}: ${name}`;
};

/**
 * Build the merged, gap-aware chart data + parallel labels for the given query rows.
 *
 * - Empty input (no rows, or rows with no series/samples) yields `{ data: [[]], labels: [] }` so
 *   the pane's `data[0].length > 0` render guard treats it as "nothing to draw".
 * - A single query whose series already share one timestamp axis produces exactly that axis with
 *   no `null`s — identical to the naive per-series mapping. When they don't share an axis, the
 *   union output is strictly more correct (no silent index misalignment).
 */
export const mergeSeries = (inputs: MergeInput[]): MergedSeries => {
  // Collect every series across all queries in stable order (query order, then series order),
  // tagging each with its ref id so labels stay aligned with the value arrays.
  const flat: { refId: string; metric: Record<string, string>; values: [number, string][]; indexWithinQuery: number }[] = [];
  for (const input of inputs) {
    for (const [i, s] of input.series.entries()) {
      flat.push({ refId: input.refId, metric: s.metric, values: s.values ?? [], indexWithinQuery: i });
    }
  }

  // Union of all timestamps, sorted numerically ascending (NOT lexicographically — these are
  // numbers, and a string sort would interleave them wrongly).
  const tsSet = new Set<number>();
  for (const s of flat) {
    for (const [ts] of s.values) tsSet.add(ts);
  }
  const unionTs = [...tsSet].sort((a, b) => a - b);

  if (unionTs.length === 0 || flat.length === 0) {
    return { data: [[]], labels: [] };
  }

  const labels: string[] = [];
  const seriesValues: (number | null)[][] = [];

  for (const s of flat) {
    // Index this series' samples by timestamp so the projection is O(union) not O(union×samples).
    const byTs = new Map<number, number>();
    for (const [ts, val] of s.values) byTs.set(ts, Number(val));
    // `?? null`, never `|| null`: a legitimate sample of 0 must survive, not become a gap.
    seriesValues.push(unionTs.map(ts => byTs.get(ts) ?? null));
    labels.push(seriesLabel(s.refId, s.metric, s.indexWithinQuery));
  }

  return { data: [unionTs, ...seriesValues], labels };
};
