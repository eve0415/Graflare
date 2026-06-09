import type { OrganizeOptions } from '../schemas/transformation';
import type { ResultSeries } from './series';

import { deriveSeriesLabel } from './series';

/**
 * organize — rename, reorder, and/or exclude series, all keyed by each series' CURRENT derived label
 * (Grafana keys organizeFields by field name; our key is the same display label deriveSeriesLabel
 * returns). Order of operations mirrors Grafana: exclude first, then rename, then reorder.
 *
 *   - exclude:  `excludeByName[label] === true` drops that series.
 *   - rename:   `renameByName[label]` (non-empty) becomes the series' new display label. We rewrite
 *               `metric.__name__` so the rename flows through the SAME label rule to override
 *               matching and the viz — no special-casing downstream. The rewrite is immutable
 *               (`{ ...series, metric: { ...metric, __name__ } }`); the input rows are react-query
 *               cache and must never be mutated.
 *   - reorder:  series are sorted by `indexByName[label]` ascending; a series with no entry sorts
 *               after all indexed ones, keeping its original relative order (stable). Matching is by
 *               the ORIGINAL label (pre-rename), since that's the key the user configured against.
 *
 * Pure: builds new series for renamed rows, passes others through by reference, returns a new array.
 */
export const organize = (series: ResultSeries[], options: OrganizeOptions): ResultSeries[] => {
  // Tag each surviving series with its original label + original input position before any rename, so
  // reorder keys off the configured (pre-rename) label and the stable fallback is deterministic.
  const tagged: { series: ResultSeries; label: string; order: number }[] = [];
  for (const [i, s] of series.entries()) {
    const label = deriveSeriesLabel(s.metric, i);
    if (options.excludeByName[label] === true) continue;

    const renamed = options.renameByName[label];
    const next = renamed !== undefined && renamed !== '' ? { ...s, metric: { ...s.metric, __name__: renamed } } : s;
    tagged.push({ series: next, label, order: i });
  }

  // Reorder: indexed series first (by their configured index asc), unindexed after, each group
  // keeping input order. A stable sort on (hasIndex, index, originalOrder) gives exactly that.
  const sorted = tagged
    .map((t, position) => ({ ...t, position }))
    .sort((a, b) => {
      const ai = a.label in options.indexByName ? options.indexByName[a.label] : undefined;
      const bi = b.label in options.indexByName ? options.indexByName[b.label] : undefined;
      if (ai !== undefined && bi !== undefined) return ai - bi || a.position - b.position;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return a.position - b.position;
    });

  return sorted.map(t => t.series);
};
