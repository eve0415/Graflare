import type { AdhocFilter, Variable } from '../schemas/variable';

import { adhocOperatorSchema } from '../schemas/variable';

// The structural shape of a raw Grafana adhoc filter, shared by the classic and v2 input schemas
// (both expose `{ key, operator, value }`). Typed here rather than importing one adapter's schema
// type so neither import path is coupled to the other's.
interface RawAdhocFilter {
  key: string;
  operator: string;
  value: string;
}

// Grafana variable type → Graflare variable type. `adhoc` now maps to a real adhoc variable
// (its filters are carried through by mapAdhocFilters). An unmodeled type falls back to `custom`.
// Shared by the classic and v2 import adapters so both honor the same mapping.
const VARIABLE_TYPE_MAP: Record<string, Variable['type']> = {
  query: 'query',
  custom: 'custom',
  constant: 'constant',
  textbox: 'textbox',
  interval: 'interval',
  datasource: 'datasource',
  adhoc: 'adhoc',
};

/**
 * Resolve a Grafana variable type to a Graflare one. An unmodeled type falls back
 * to `custom` and pushes a warning (so the import is honest) — except a literal
 * `custom`, which is the expected fallthrough and never warns.
 */
export const resolveVariableType = (grafanaType: string, name: string, warnings: string[]): Variable['type'] => {
  const mapped = VARIABLE_TYPE_MAP[grafanaType];
  if (mapped !== undefined) return mapped;
  if (grafanaType !== 'custom') {
    warnings.push(`Variable "${name}" has unsupported type "${grafanaType}" — imported as a custom variable`);
  }
  return 'custom';
};

/**
 * Convert a Grafana adhoc variable's raw `filters[]` to Graflare {@link AdhocFilter}s. Only the
 * four operators Graflare supports (`=`/`!=`/`=~`/`!~`) survive; a filter with any other operator
 * (e.g. Grafana's `<`/`>` or a multi-value `one of`) is dropped with a warning, so the import is
 * honest rather than silently mangling the query. Grafana's deprecated `condition` and its
 * multi-value `values[]` are ignored — the single `value` is kept.
 */
export const mapAdhocFilters = (filters: readonly RawAdhocFilter[], name: string, warnings: string[]): AdhocFilter[] => {
  const result: AdhocFilter[] = [];
  for (const filter of filters) {
    if (filter.key === '') continue;
    const operator = adhocOperatorSchema.safeParse(filter.operator);
    if (!operator.success) {
      warnings.push(`Variable "${name}" has an ad hoc filter with unsupported operator "${filter.operator}" — dropped`);
      continue;
    }
    result.push({ key: filter.key, operator: operator.data, value: filter.value });
  }
  return result;
};

/** Split a comma-separated string into trimmed, non-empty parts (interval steps, custom values). */
export const splitCsv = (raw: string): string[] =>
  raw
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0);
