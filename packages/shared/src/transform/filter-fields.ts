import type { FilterFieldsByNameOptions } from '../schemas/transformation';
import type { ResultSeries } from './series';

import { deriveSeriesLabel } from './series';

// Compile the option's RegExp once (byRegexp), or null if the source is invalid — an invalid pattern
// matches nothing rather than throwing, so a bad import can't crash render. byName needs no compile.
const compileMatcher = (options: FilterFieldsByNameOptions): ((label: string) => boolean) => {
  if (options.match === 'byName') {
    const target = options.value;
    return label => label === target;
  }
  // byRegexp: test the derived label against the pattern. An empty source compiles to /(?:)/, which
  // matches everything — but we treat an empty value as "match nothing" (below) so an unconfigured
  // filter is a no-op, never a silent drop-all/keep-all surprise.
  let re: RegExp | null = null;
  try {
    re = new RegExp(options.value);
  } catch {
    re = null;
  }
  const compiled = re;
  return label => (compiled === null ? false : compiled.test(label));
};

/**
 * filterFieldsByName — keep (include) or drop (exclude) series whose derived label matches the
 * configured name/regexp. The label is the SAME one the panel displays (deriveSeriesLabel), so the
 * filter matches what the user sees. An empty `value` matches nothing: include → keeps nothing,
 * exclude → drops nothing (an unconfigured filter is inert, never an accidental drop-all). Pure and
 * non-mutating: returns a filtered view of the same series references (rows are passed through
 * unchanged, so this composes with reduce/organize without copying).
 *
 * Index for the label fallback is the series' position in the INPUT list (matching how the panels
 * number `Series N`), so a positional label is stable regardless of what the filter keeps.
 */
export const filterFieldsByName = (series: ResultSeries[], options: FilterFieldsByNameOptions): ResultSeries[] => {
  if (options.value === '') return options.mode === 'include' ? [] : series.slice();
  const matches = compileMatcher(options);
  return series.filter((s, i) => {
    const hit = matches(deriveSeriesLabel(s.metric, i));
    return options.mode === 'include' ? hit : !hit;
  });
};
