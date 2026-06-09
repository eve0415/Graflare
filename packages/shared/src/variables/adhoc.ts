import type { AdhocFilter, Variable } from '../schemas/variable';

/**
 * Collect the adhoc filters that apply to a panel querying `datasourceId`.
 *
 * An adhoc variable's filters only inject into queries against the variable's own datasource
 * (`variable.datasourceId`), mirroring Grafana's per-datasource adhoc scoping. A panel with no
 * datasource, or an adhoc variable with no datasource, contributes nothing — an unscoped adhoc
 * variable is inert by design (we don't guess which datasource the user meant). Filters from every
 * matching adhoc variable are concatenated in declaration order.
 */
export const resolveAdhocFilters = (variables: readonly Variable[], datasourceId?: string): AdhocFilter[] => {
  if (datasourceId === undefined) return [];
  const result: AdhocFilter[] = [];
  for (const variable of variables) {
    if (variable.type !== 'adhoc') continue;
    if (variable.datasourceId !== datasourceId) continue;
    result.push(...variable.filters);
  }
  return result;
};

/** The adhoc variables in a list, narrowed to those that actually carry a datasource scope. */
export const adhocVariables = (variables: readonly Variable[]): Variable[] => variables.filter(v => v.type === 'adhoc');
