import type { SortByOptions } from '../schemas/transformation';
import type { ResultSeries } from './series';

import { deriveSeriesLabel, latestSample } from './series';

// The numeric latest value of a series, or NaN when it has no sample / a non-numeric token. NaN
// sorts to the end (see the comparator) so series without a comparable value don't jump to the top.
const seriesValue = (series: ResultSeries): number => {
  const token = latestSample(series)?.[1];
  return token === undefined ? Number.NaN : Number(token);
};

/**
 * sortBy — order the SERIES LIST by derived label ('name') or latest sample value ('value'),
 * ascending by default, descending when `desc`. This diverges from Grafana's sortBy (which sorts
 * rows within a frame by a named field); a Prometheus ResultSeries has no row table, so we sort the
 * list of series instead — the equivalent operation on our data shape. Pure and non-mutating:
 * sorts a shallow copy, returns it; the series rows themselves are passed through by reference.
 *
 * The sort is stable (Array.prototype.sort is stable per spec), so equal keys keep input order.
 * NaN values (no/garbage sample) always sort last regardless of direction, so they never crowd out
 * real values at the top of a descending sort.
 */
export const sortBy = (series: ResultSeries[], options: SortByOptions): ResultSeries[] => {
  const dir = options.desc ? -1 : 1;
  const decorated = series.map((s, i) => ({ s, label: deriveSeriesLabel(s.metric, i), value: seriesValue(s) }));

  decorated.sort((a, b) => {
    if (options.by === 'name') return dir * a.label.localeCompare(b.label);
    const an = Number.isNaN(a.value);
    const bn = Number.isNaN(b.value);
    if (an && bn) return 0;
    if (an) return 1; // a is NaN → after b, regardless of direction
    if (bn) return -1; // b is NaN → after a
    return dir * (a.value - b.value);
  });

  return decorated.map(d => d.s);
};
