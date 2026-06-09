import type { Transformation } from '../schemas/transformation';
import type { ResultSeries } from './series';

import { filterFieldsByName } from './filter-fields';
import { limit } from './limit';
import { organize } from './organize';
import { reduce } from './reduce';
import { sortBy } from './sort-by';

// Run one transform. Narrows the union on `id` so each branch passes exactly its own options shape
// to the matching pure fn — no casts, no `any`. A new transform is one new case here plus its branch
// in the schema union; the exhaustiveness guard at the end forces this case to be added.
const applyOne = (series: ResultSeries[], transform: Transformation): ResultSeries[] => {
  switch (transform.id) {
    case 'reduce':
      return reduce(series, transform.options);
    case 'filterFieldsByName':
      return filterFieldsByName(series, transform.options);
    case 'organize':
      return organize(series, transform.options);
    case 'sortBy':
      return sortBy(series, transform.options);
    case 'limit':
      return limit(series, transform.options);
    default: {
      // Exhaustiveness guard: a new transformation id must add a case above.
      const _exhaustive: never = transform;
      throw new Error(`Unknown transformation: ${JSON.stringify(_exhaustive)}`);
    }
  }
};

/**
 * Run a panel's transformations over its extracted series, in array order — each transform takes the
 * previous one's output (Grafana's pipeline semantics). Pure, deterministic, no React.
 *
 * Empty transforms → IDENTITY: returns the exact same array reference, byte-for-byte unchanged. This
 * is the no-transform common case (every current panel), so wiring this in front of the viz leaves
 * those panels — and the refId pairing the override layer depends on — completely unchanged.
 *
 * The transforms never mutate the input rows (they build new series or pass rows through by
 * reference), so it's safe to call directly on react-query cache data.
 */
export const applyTransformations = (series: ResultSeries[], transformations: readonly Transformation[]): ResultSeries[] => {
  if (transformations.length === 0) return series;
  let result = series;
  for (const transform of transformations) {
    result = applyOne(result, transform);
  }
  return result;
};
