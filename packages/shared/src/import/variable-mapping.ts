import type { Variable } from '../schemas/variable';

// Grafana variable type → Graflare variable type. Types Graflare doesn't model
// (notably `adhoc`) fall back to `custom`. Shared by the classic and v2 import
// adapters so both honor the same mapping.
const VARIABLE_TYPE_MAP: Record<string, Variable['type']> = {
  query: 'query',
  custom: 'custom',
  constant: 'constant',
  textbox: 'textbox',
  interval: 'interval',
  datasource: 'datasource',
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

/** Split a comma-separated string into trimmed, non-empty parts (interval steps, custom values). */
export const splitCsv = (raw: string): string[] =>
  raw
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0);
