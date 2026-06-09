import type { ReduceCalc, ReduceOptions } from '../schemas/transformation';
import type { ResultSeries } from './series';

import { latestSample } from './series';

// Every numeric sample of a series, as numbers. A matrix series carries `values`; an instant vector
// carries a single `value`; a series with neither contributes no samples. Non-finite tokens (e.g.
// the Prometheus "NaN" string) are dropped so the aggregates ignore them rather than poison the math
// — except `last`/`first`, which read the raw endpoint token directly (below) so they survive.
const numericSamples = (series: ResultSeries): number[] => {
  const tuples = series.values ?? (series.value === undefined ? [] : [series.value]);
  const out: number[] = [];
  for (const [, token] of tuples) {
    const n = Number(token);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
};

// Compute one calc over a series. `last`/`first` return the raw endpoint token (verbatim, like the
// panels' latestSample — so a non-numeric "NaN" survives, matching how stat reads it); the
// aggregates fold the finite numeric samples and return a formatted number. An empty/finite-less
// series yields undefined, which the caller renders as a no-sample series (no `value`).
const computeCalc = (series: ResultSeries, calc: ReduceCalc): string | undefined => {
  if (calc === 'last') return latestSample(series)?.[1];
  if (calc === 'first') {
    const tuples = series.values ?? (series.value === undefined ? [] : [series.value]);
    return tuples[0]?.[1];
  }
  if (calc === 'count') {
    // count is over the raw sample slots (matrix points / the single vector sample), NOT the
    // finite-only set — it answers "how many samples", the same as Grafana's count reducer.
    const tuples = series.values ?? (series.value === undefined ? [] : [series.value]);
    return String(tuples.length);
  }

  const nums = numericSamples(series);
  if (nums.length === 0) return undefined;
  switch (calc) {
    case 'min':
      return String(Math.min(...nums));
    case 'max':
      return String(Math.max(...nums));
    case 'sum':
      return String(nums.reduce((a, b) => a + b, 0));
    case 'mean':
      return String(nums.reduce((a, b) => a + b, 0) / nums.length);
    default: {
      // Exhaustiveness guard: a new reduce calc must add a branch above (last/first/count handled
      // before this switch).
      const _exhaustive: never = calc;
      throw new Error(`Unknown reduce calc: ${String(_exhaustive)}`);
    }
  }
};

/**
 * reduce — collapse each series' samples to a single value (Grafana's reduce, modelled as one calc
 * because a ResultSeries holds one `value`). Each output series keeps its `metric` (so its label and
 * any override matching are unchanged) and carries an instant `value` of `[0, <calc>]`; its `values`
 * array is dropped (it's now a single reduced point). A series the calc can't compute over (no
 * finite samples for an aggregate) drops to a no-sample series — neither `value` nor `values` — so a
 * downstream stat/gauge reads it as "No data" rather than a bogus 0. Pure: builds new series, never
 * mutates the input rows.
 */
export const reduce = (series: ResultSeries[], options: ReduceOptions): ResultSeries[] =>
  series.map(s => {
    const token = computeCalc(s, options.calc);
    return token === undefined ? { metric: s.metric } : { metric: s.metric, value: [0, token] };
  });
