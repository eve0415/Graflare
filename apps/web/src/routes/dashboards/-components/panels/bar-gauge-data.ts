import type { PanelDataResult } from './use-panel-data';

// One horizontal/vertical bar of a bar gauge: a labelled series, its latest value,
// and the fill fraction (0..1, clamped) used to size the bar against [min, max].
export interface BarGaugeSegment {
  label: string;
  value: number;
  fraction: number;
}

// Derive a human label for a series: the metric name wins, else the first other
// label value (e.g. instance), else a 1-based positional fallback.
const seriesLabel = (metric: Record<string, string>, index: number): string => {
  const name = metric.__name__;
  if (name !== undefined && name !== '') return name;
  for (const [key, value] of Object.entries(metric)) {
    if (key !== '__name__' && value !== '') return value;
  }
  return `Series ${String(index + 1)}`;
};

// Latest numeric sample of a result row: instant vectors carry a single `value`
// tuple; matrices carry a `values` array whose last entry is the most recent.
const latestSample = (row: { value?: [number, string]; values?: [number, string][] }): number | null => {
  if (row.value !== undefined && row.value.length >= 2) return Number(row.value[1]);
  if (row.values !== undefined && row.values.length > 0) {
    const last = row.values.at(-1);
    if (last !== undefined && last.length >= 2) return Number(last[1]);
  }
  return null;
};

/**
 * Map panel query results to one bar-gauge segment per series. Pure: no DOM, no
 * formatting — the renderer formats `value` and colours the bar. `fraction` is
 * `(value - min) / (max - min)` clamped to [0, 1]; a zero-width range yields 0.
 */
export const barGaugeSegments = (data: PanelDataResult[] | null | undefined, min: number, max: number): BarGaugeSegment[] => {
  if (data === null || data === undefined) return [];

  const span = max - min;
  const segments: BarGaugeSegment[] = [];

  for (const res of data) {
    if (!('status' in res)) continue;
    if (res.status !== 'success' || res.data === undefined || !('result' in res.data)) continue;
    const results = res.data.result;
    if (!Array.isArray(results)) continue;

    for (const row of results) {
      if (typeof row !== 'object' || row === null || !('metric' in row)) continue;
      const value = latestSample(row);
      if (value === null || !Number.isFinite(value)) continue;
      const fraction = span <= 0 ? 0 : Math.max(0, Math.min(1, (value - min) / span));
      segments.push({ label: seriesLabel(row.metric, segments.length), value, fraction });
    }
  }

  return segments;
};
