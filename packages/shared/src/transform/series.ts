// The series primitives shared by the transformation pipeline (this package) and the panel
// data-extract layer (apps/web). They live here, in `shared`, because the pure transforms must
// operate on the same `ResultSeries` shape the panels render and reuse the same label-derivation
// rule — a structural twin defined in apps/web would drift. apps/web re-exports these from its
// panel-data-extract module, so panel code keeps importing them from its existing local path.

// One Prometheus result row: a label set plus either an instant `value` tuple (vector) or a
// `values` array (matrix). Both are optional so vector and matrix rows share one shape.
export interface ResultSeries {
  metric: Record<string, string>;
  values?: [number, string][];
  value?: [number, string];
}

/**
 * The label-derivation rule every per-series panel shares: the metric `__name__` wins, else the
 * first other non-empty label value (e.g. instance), else a 1-based positional fallback.
 *
 * The pipeline reuses this so a transform that matches/sorts/renames series sees exactly the label
 * the panel displays. `organize`'s rename rewrites `metric.__name__`, which this returns first — so
 * the renamed label flows through unchanged to override matching and display.
 */
export const deriveSeriesLabel = (metric: Record<string, string>, index: number): string => {
  const name = metric.__name__;
  if (name !== undefined && name !== '') return name;
  for (const [key, value] of Object.entries(metric)) {
    if (key !== '__name__' && value !== '') return value;
  }
  return `Series ${String(index + 1)}`;
};

// Latest sample of a series: an instant vector carries a single `value` tuple; a matrix carries a
// `values` array whose last entry is the most recent.
export const latestSample = (series: ResultSeries): [number, string] | undefined => series.value ?? series.values?.at(-1);
