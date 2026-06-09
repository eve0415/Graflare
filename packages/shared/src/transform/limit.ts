import type { LimitOptions } from '../schemas/transformation';
import type { ResultSeries } from './series';

/**
 * limit — keep the first `count` series (after any preceding sort), dropping the rest. A `count` at
 * or beyond the list length returns the list unchanged (the same reference), so a generous limit is
 * a true no-op rather than a needless copy. Pure: never mutates; `slice` returns a new array of the
 * same series references.
 */
export const limit = (series: ResultSeries[], options: LimitOptions): ResultSeries[] =>
  options.count >= series.length ? series : series.slice(0, options.count);
