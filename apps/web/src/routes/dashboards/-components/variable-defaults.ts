import type { DatasourceRow } from '../../datasources/-api';
import type { Variable } from '@graflare/shared/schemas/variable';

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
 * Compute the initial value a template variable should hold on first render, so panels interpolate
 * against a real value before the user touches the bar (the working `variableValues` map starts
 * empty). Pure and synchronous — the caller supplies the already-fetched datasource list.
 *
 * - `textbox`/`constant`: the saved `current`, else the configured default in `query`.
 * - `interval`: the saved `current`, else the first configured interval in `options`.
 * - `datasource`: `current` if it still resolves to a datasource that passes the type filter,
 *   else the first matching datasource id, else empty.
 * - `query`/`custom`: the saved `current`, else the first available option.
 */
export const computeVariableDefault = (variable: Variable, datasources: readonly DatasourceRow[]): string => {
  switch (variable.type) {
    case 'textbox':
    case 'constant':
      return variable.current === '' ? variable.query : variable.current;
    case 'interval':
    case 'query':
    case 'custom':
      return variable.current === '' ? (variable.options[0] ?? '') : variable.current;
    case 'datasource': {
      const items = filterDatasourceItems(datasources, variable.query);
      if (variable.current !== '' && items.some(item => item.value === variable.current)) {
        return variable.current;
      }
      return items[0]?.value ?? '';
    }
  }
};

/**
 * Resolve the value map the panels actually interpolate against: each variable's computed default,
 * with any explicit user selection layered on top. The grid reads this map directly (unlike the
 * bar's display, it has no `current` fallback), so seeding here is what makes panels resolve real
 * values on first render rather than against an empty map.
 */
export const buildEffectiveValues = (
  variables: readonly Variable[],
  overrides: ReadonlyMap<string, string>,
  datasources: readonly DatasourceRow[],
): Map<string, string> => {
  const merged = new Map<string, string>();
  for (const variable of variables) {
    const override = overrides.get(variable.name);
    merged.set(variable.name, override ?? computeVariableDefault(variable, datasources));
  }
  return merged;
};
