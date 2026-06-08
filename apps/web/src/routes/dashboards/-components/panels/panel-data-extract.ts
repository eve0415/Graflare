import type { PanelDataResult } from './use-panel-data';

// One Prometheus result row, flattened out of the `PanelDataResult` union: a label
// set plus either an instant `value` tuple (vector) or a `values` array (matrix).
// `value`/`values` are both optional so vector and matrix rows share one shape.
export interface ResultSeries {
  metric: Record<string, string>;
  values?: [number, string][];
  value?: [number, string];
}

/**
 * Pull every Prometheus result row out of a `PanelDataResult[]`, in order.
 *
 * Walks the union exactly the way the panels did inline: `'status' in res` selects
 * the Prometheus responses (SQL `columns/rows` responses have no `status`), then
 * `status === 'success'` + a `result` array narrows to the query-data member, and
 * the per-row `object`/`metric` check rejects the bare `[number, string]` tuple a
 * scalar/string `resultType` carries. Error and empty responses contribute nothing.
 */
export const extractResultSeries = (data: PanelDataResult[] | null | undefined): ResultSeries[] => {
  if (data === null || data === undefined) return [];

  const series: ResultSeries[] = [];
  for (const res of data) {
    if (!('status' in res)) continue;
    if (res.status !== 'success' || res.data === undefined || !('result' in res.data) || !Array.isArray(res.data.result)) continue;
    for (const row of res.data.result) {
      if (typeof row === 'object' && row !== null && 'metric' in row) {
        series.push(row);
      }
    }
  }
  return series;
};

// Latest sample of a series: an instant vector carries a single `value` tuple; a
// matrix carries a `values` array whose last entry is the most recent.
export const latestSample = (series: ResultSeries): [number, string] | undefined => series.value ?? series.values?.at(-1);

/**
 * Raw value token of the first series' latest sample, or `null` when there is no
 * series. Kept as the verbatim Prometheus string — callers coerce as they need
 * (stat keeps the string, gauge wraps it in `Number`), so a non-numeric token like
 * `"NaN"` survives unchanged.
 */
export const firstScalar = (data: PanelDataResult[] | null | undefined): string | null => {
  const [first] = extractResultSeries(data);
  if (first === undefined) return null;
  return latestSample(first)?.[1] ?? null;
};

// Highest threshold whose `value` the input meets or exceeds wins; `noMatch` is the
// caller-supplied default when the value falls below every threshold (stat and
// gauge use different defaults). Sorts a copy, so the input order is irrelevant.
export const getThresholdColor = (value: number, thresholds: { value: number; color: string }[], noMatch: string): string => {
  const sorted = [...thresholds].sort((a, b) => b.value - a.value);
  for (const t of sorted) {
    if (value >= t.value) return t.color;
  }
  return noMatch;
};
