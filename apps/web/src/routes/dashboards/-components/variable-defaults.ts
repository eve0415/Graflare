import type { DatasourceRow } from '../../datasources/-api';
import type { AdhocFilter, Variable } from '@graflare/shared/schemas/variable';

export interface DatasourceItem {
  value: string;
  label: string;
}

/**
 * Build the `{ value, label }` items for a `datasource` template variable's picker.
 *
 * The value is the datasource **id** (what panels reference via `panel.datasourceId`), so the
 * chosen value can later be wired straight into a panel without a name→id lookup. The label is
 * the human-facing name. An empty `typeFilter` lists every datasource; otherwise only datasources
 * whose `type` matches (case-insensitively) are kept — Grafana stashes this filter in the
 * variable's `query` (e.g. `'prometheus'`).
 */
export const filterDatasourceItems = (datasources: readonly DatasourceRow[], typeFilter: string): DatasourceItem[] => {
  const wanted = typeFilter.trim().toLowerCase();
  const matches = wanted === '' ? datasources : datasources.filter(ds => ds.type.toLowerCase() === wanted);
  return matches.map(ds => ({ value: ds.id, label: ds.name || ds.id }));
};

/**
 * Runtime sentinel for the "All" entry in a variable picker. It only ever lives in the bar's
 * display state — {@link buildEffectiveValues} resolves it before panels interpolate, so queries
 * never see the literal string.
 */
export const ALL_VALUE = '$__all';

/** Whether a selection (single or multi) is the "All" choice. */
const isAllSelection = (value: string | readonly string[]): boolean => (typeof value === 'string' ? value === ALL_VALUE : value.includes(ALL_VALUE));

/** Collapse a possibly-array selection to one value for the single-select variable types. */
const firstValue = (value: string | readonly string[]): string => (typeof value === 'string' ? value : (value[0] ?? ''));

/**
 * Compute the initial value a template variable should hold on first render, so panels interpolate
 * against a real value before the user touches the bar (the working `variableValues` map starts
 * empty). Pure and synchronous — the caller supplies the already-fetched datasource list.
 *
 * - `textbox`/`constant`: the saved `current`, else the configured default in `query`.
 * - `interval`: the saved `current`, else the first configured interval in `options`.
 * - `datasource`: `current` if it still resolves to a datasource that passes the type filter,
 *   else the first matching datasource id, else empty.
 * - `query`/`custom`: the saved `current` — an ARRAY passes through untouched (a multi-select
 *   selection, including an empty one) — else the first available option.
 * - `adhoc`: no scalar value (its state is the `filters` array, carried separately), so `''`.
 *
 * The single-choice types collapse an (off-type) array `current` to its first element.
 */
export const computeVariableDefault = (variable: Variable, datasources: readonly DatasourceRow[]): string | string[] => {
  switch (variable.type) {
    case 'textbox':
    case 'constant': {
      const current = firstValue(variable.current);
      return current === '' ? variable.query : current;
    }
    case 'interval': {
      const current = firstValue(variable.current);
      return current === '' ? (variable.options[0] ?? '') : current;
    }
    case 'query':
    case 'custom': {
      if (Array.isArray(variable.current)) return variable.current;
      return variable.current === '' ? (variable.options[0] ?? '') : variable.current;
    }
    case 'datasource': {
      const items = filterDatasourceItems(datasources, variable.query);
      const current = firstValue(variable.current);
      if (current !== '' && items.some(item => item.value === current)) {
        return current;
      }
      return items[0]?.value ?? '';
    }
    case 'adhoc':
      return '';
  }
};

/**
 * Resolve the adhoc variables with their LIVE filters folded in: each adhoc variable's saved
 * `filters` are the seed, replaced by any runtime override the user has applied via the bar. The
 * result is what the grid scopes per-panel and injects, so an edit in the bar re-runs the affected
 * panels without persisting back to the dashboard. Non-adhoc variables are dropped.
 */
export const resolveAdhocVariables = (variables: readonly Variable[], filterOverrides: ReadonlyMap<string, readonly AdhocFilter[]>): Variable[] => {
  const result: Variable[] = [];
  for (const variable of variables) {
    if (variable.type !== 'adhoc') continue;
    const override = filterOverrides.get(variable.name);
    result.push(override === undefined ? variable : { ...variable, filters: [...override] });
  }
  return result;
};

/**
 * Resolve the `$__all` sentinel to what queries actually interpolate:
 *
 * - a non-empty custom `allValue` wins and is used VERBATIM as a plain string — Grafana treats a
 *   custom all-value as interpolation-only, so it is pasted raw into the query, never escaped;
 * - otherwise the variable's full `options` list (an array, so the multi-value formatting
 *   RE2-escapes each option and joins with `|` downstream).
 *
 * Non-All selections pass through unchanged — including an EMPTY multi selection, which stays
 * `[]` (it interpolates to `''`) rather than falling back to All.
 */
const resolveAllSelection = (value: string | string[], variable: Variable): string | string[] => {
  if (!isAllSelection(value)) return value;
  if (variable.allValue !== '') return variable.allValue;
  return [...variable.options];
};

/**
 * Build the value map the VARIABLE BAR displays: each variable's computed default, with any
 * explicit user selection layered on top. The `$__all` sentinel is KEPT — the bar needs it to
 * show the "All" choice as selected, which the resolved options array could never round-trip.
 */
export const buildDisplayValues = (
  variables: readonly Variable[],
  overrides: ReadonlyMap<string, string | string[]>,
  datasources: readonly DatasourceRow[],
): Map<string, string | string[]> => {
  const merged = new Map<string, string | string[]>();
  for (const variable of variables) {
    const override = overrides.get(variable.name);
    merged.set(variable.name, override ?? computeVariableDefault(variable, datasources));
  }
  return merged;
};

/**
 * Resolve the value map the panels actually interpolate against: the merged display values (see
 * {@link buildDisplayValues}) with every `$__all` selection resolved — to the variable's full
 * `options` array, or to a non-empty custom `allValue` verbatim. The grid reads this map directly
 * (unlike the bar's display, it has no `current` fallback), so seeding here is what makes panels
 * resolve real values on first render, and resolving here is what keeps the literal `'$__all'`
 * out of every query.
 */
export const buildEffectiveValues = (
  variables: readonly Variable[],
  overrides: ReadonlyMap<string, string | string[]>,
  datasources: readonly DatasourceRow[],
): Map<string, string | string[]> => {
  const merged = buildDisplayValues(variables, overrides, datasources);
  for (const variable of variables) {
    const value = merged.get(variable.name);
    if (value !== undefined) merged.set(variable.name, resolveAllSelection(value, variable));
  }
  return merged;
};
