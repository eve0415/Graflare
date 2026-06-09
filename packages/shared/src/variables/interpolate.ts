import type { PanelQuery } from '../schemas/panel';
import type { AdhocFilter } from '../schemas/variable';

import { injectAdhocFilters } from './inject-adhoc';

/**
 * Replace template variables (`$var`, `${var}`, legacy `[[var]]`) in a PromQL expression.
 *
 * - Multi-value variables are joined with `|` (regex alternation).
 * - Content inside single-quoted strings is left untouched.
 * - `$$` is an escape for a literal `$`.
 * - Unknown variables are left as-is.
 */
export const interpolateVariables = (expr: string, variables: ReadonlyMap<string, string | string[]>): string => {
  let result = '';
  let i = 0;
  let inQuote = false;

  while (i < expr.length) {
    const ch = expr[i];

    // --- single-quoted string (PromQL string literal) ---
    if (inQuote) {
      result += ch;
      if (ch === "'") {
        inQuote = false;
      }
      i++;
      continue;
    }

    if (ch === "'") {
      inQuote = true;
      result += ch;
      i++;
      continue;
    }

    // --- dollar sign ---
    if (ch === '$') {
      const next = expr[i + 1];

      // escaped $$  →  literal $
      if (next === '$') {
        result += '$';
        i += 2;
        continue;
      }

      // braced: ${name}
      if (next === '{') {
        const close = expr.indexOf('}', i + 2);
        if (close === -1) {
          // unclosed brace — emit literally
          result += ch;
          i++;
          continue;
        }
        const name = expr.slice(i + 2, close);
        const value = variables.get(name);
        if (value === undefined) {
          // unknown variable — leave original text
          result += expr.slice(i, close + 1);
        } else {
          result += Array.isArray(value) ? value.join('|') : value;
        }
        i = close + 1;
        continue;
      }

      // bare: $name  (word chars: [A-Za-z0-9_])
      const match = /^\w+/.exec(expr.slice(i + 1));
      if (match === null) {
        // lone $ with no identifier following
        result += ch;
        i++;
        continue;
      }

      const [name] = match;
      const end = i + 1 + name.length;
      const value = variables.get(name);
      if (value === undefined) {
        result += expr.slice(i, end);
      } else {
        result += Array.isArray(value) ? value.join('|') : value;
      }
      i = end;
      continue;
    }

    // --- legacy [[name]] syntax ---
    if (ch === '[' && expr[i + 1] === '[') {
      const close = expr.indexOf(']]', i + 2);
      if (close !== -1) {
        const name = expr.slice(i + 2, close);
        const value = variables.get(name);
        if (value === undefined) {
          result += expr.slice(i, close + 2);
        } else {
          result += Array.isArray(value) ? value.join('|') : value;
        }
        i = close + 2;
        continue;
      }
    }

    // --- ordinary character ---
    result += ch;
    i++;
  }

  return result;
};

/**
 * Interpolate dashboard variables into a panel's queries at execution time.
 * Only the query expression is templated — the rest of each query (refId,
 * legendFormat, format) is preserved, and the original panel queries are left
 * untouched so editing/saving keeps the raw `$var` form.
 */
export const interpolateQueries = (queries: readonly PanelQuery[], variables: ReadonlyMap<string, string | string[]>): PanelQuery[] =>
  queries.map(q => ({ ...q, expr: interpolateVariables(q.expr, variables) }));

/**
 * Interpolate template variables AND inject adhoc label filters into a panel's queries, in that
 * order (so a `$var` that expands to a metric name still receives the adhoc matchers).
 *
 * When `adhocFilters` is empty this is byte-identical to {@link interpolateQueries}: the injection
 * step is skipped entirely (not just a no-op call), so a dashboard with no adhoc variable produces
 * exactly the same queries it did before adhoc existed. The original panel queries are never
 * mutated — only the templated copy handed to the data hook is transformed.
 */
export const interpolateAndInjectQueries = (
  queries: readonly PanelQuery[],
  variables: ReadonlyMap<string, string | string[]>,
  adhocFilters: readonly AdhocFilter[],
): PanelQuery[] => {
  const interpolated = interpolateQueries(queries, variables);
  if (adhocFilters.length === 0) return interpolated;
  return interpolated.map(q => ({ ...q, expr: injectAdhocFilters(q.expr, adhocFilters) }));
};
