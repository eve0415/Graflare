import type { AdhocFilter } from '../schemas/variable';

/**
 * Inject adhoc label filters into every vector selector of a PromQL expression.
 *
 * Grafana's adhoc filters add the same label matchers to every metric in a query (the matchers
 * land on each vector-selector node of the parsed query). We don't ship a full PromQL parser; this
 * is a careful, string-aware single-pass scanner that finds metric-name vector selectors and
 * either inserts a fresh `{…}` after the name or merges into an existing one.
 *
 * ## Cases handled
 * - bare metric `up` → `up{key=op"value"}`
 * - existing matchers `up{job="api"}` → `up{job="api",key=op"value"}` (comma-joined)
 * - empty matcher set `up{}` → `up{key=op"value"}` (no leading comma)
 * - range/instant vectors: matchers go before `[5m]` (`m[5m]` → `m{…}[5m]`)
 * - multiple selectors in one expression (`rate(a[5m]) / b`) — every metric gets the matchers
 * - the four operators `=` `!=` `=~` `!~`
 * - value escaping: `\` → `\\` and `"` → `\"` inside the matcher value (the operator carries the
 *   regex semantics, so values are string-escaped, never regex-escaped)
 * - string-awareness: never injects inside `"…"`/`'…'`, and when merging into an existing `{…}` it
 *   scans to the real closing `}` skipping string literals (values may contain `}`)
 *
 * ## Deliberate punts (the query is returned UNCHANGED for these fragments, never mangled)
 * The fail-safe rule: when a token can't be confidently classified as a metric-name vector
 * selector, it is left untouched. Under-injecting (a missing filter) is recoverable; corrupting a
 * query is not. Specifically skipped:
 * - **function calls** — an identifier immediately followed (mod whitespace) by `(` is a function
 *   (`rate`, `sum`, `histogram_quantile`, …), not a metric.
 * - **grouping/matching clauses** — the `(…)` after `by`/`without`/`on`/`ignoring`/`group_left`/
 *   `group_right` is a label list, not selectors, so its contents are never injected into.
 * - **operator/modifier keywords** — `and`/`or`/`unless`/`bool`/`offset`/`by`/`without`/`on`/
 *   `ignoring`/`group_left`/`group_right`/`atan2`/`inf`/`nan` standing alone are not metrics.
 * - **name-less selectors** — a leading `{…}` with no metric name (e.g. `{__name__="up"}`) is left
 *   as-is rather than risk mis-ordering an injected matcher.
 * - **subquery/`@`/offset suffixes** — `[1h:5m]`, `@ <ts>`, `offset <dur>` are durations/modifiers,
 *   not selectors; the inner metric is still injected, the suffix is left intact.
 *
 * Empty `filters` (or filters with only blank keys) returns the input string reference unchanged
 * (a true identity / no-op).
 */
export const injectAdhocFilters = (promql: string, filters: readonly AdhocFilter[]): string => {
  // A blank-key filter would render an invalid matcher (`{="v"}`), so drop those before injecting.
  // This is the runtime guard for an in-progress chip whose key hasn't been chosen yet (the bar
  // keeps the partial chip visible); a fully-blank set is then a no-op identity.
  const active = filters.filter(filter => filter.key !== '');
  if (active.length === 0) return promql;

  const matchers = active.map(filter => renderMatcher(filter)).join(',');
  let out = '';
  let i = 0;
  const n = promql.length;

  while (i < n) {
    const ch = promql[i];

    // --- string literals: copy verbatim, honoring backslash escapes ---
    if (ch === '"' || ch === "'") {
      const end = scanString(promql, i);
      out += promql.slice(i, end);
      i = end;
      continue;
    }

    // --- bracket group `[…]`: range/subquery durations live here, never selectors. Copy whole. ---
    if (ch === '[') {
      const bracketEnd = scanBracketGroup(promql, i);
      out += promql.slice(i, bracketEnd);
      i = bracketEnd;
      continue;
    }

    // --- identifier (potential metric name or keyword) ---
    if (isIdentStart(ch)) {
      const wordEnd = scanIdent(promql, i);
      const word = promql.slice(i, wordEnd);

      // A digit/`.` immediately before the identifier means this is the unit suffix of a number or
      // duration (the `m` in `5m`, `ms` in `100ms`), not a metric name. Copy it through.
      const prev = promql[i - 1];
      if (prev !== undefined && /[0-9.]/.test(prev)) {
        out += word;
        i = wordEnd;
        continue;
      }

      const afterWord = skipWhitespace(promql, wordEnd);

      // A grouping/matching keyword consumes its following `(…)` label list untouched, so the
      // labels inside `by (instance)` are never mistaken for selectors.
      if (GROUPING_KEYWORDS.has(word) && promql[afterWord] === '(') {
        const groupEnd = scanParenGroup(promql, afterWord);
        out += promql.slice(i, groupEnd);
        i = groupEnd;
        continue;
      }

      // A bare operator/modifier keyword (and/or/unless/offset/bool/…) is not a metric.
      // A function call (identifier directly followed by `(`) is not a metric either.
      // An aggregation whose grouping clause precedes its args (`sum without (job) (up)`) is also
      // not a metric — detect it by a grouping keyword as the next bareword.
      const nextWordIsGrouping = isIdentStart(promql[afterWord]) && GROUPING_KEYWORDS.has(promql.slice(afterWord, scanIdent(promql, afterWord)));
      if (KEYWORDS.has(word) || promql[afterWord] === '(' || nextWordIsGrouping) {
        out += word;
        i = wordEnd;
        continue;
      }

      // It's a metric-name vector selector. Emit the name, then inject/merge matchers.
      out += word;
      if (promql[afterWord] === '{') {
        // Merge into the existing matcher set. `afterWord` may include whitespace between the
        // name and `{`; copy that through so formatting is preserved.
        out += promql.slice(wordEnd, afterWord);
        const braceEnd = scanBrace(promql, afterWord);
        const inner = promql.slice(afterWord + 1, braceEnd - 1);
        const trimmed = inner.trim();
        out += trimmed === '' ? `{${matchers}}` : `{${inner},${matchers}}`;
        i = braceEnd;
      } else {
        out += `{${matchers}}`;
        i = wordEnd;
      }
      continue;
    }

    // --- a leading `{…}` with no metric name: punt (copy the whole group untouched) ---
    if (ch === '{') {
      const braceEnd = scanBrace(promql, i);
      out += promql.slice(i, braceEnd);
      i = braceEnd;
      continue;
    }

    // --- ordinary character ---
    out += ch;
    i++;
  }

  return out;
};

// Grouping/matching clauses whose following `(…)` is a label list, not a set of selectors.
const GROUPING_KEYWORDS = new Set(['by', 'without', 'on', 'ignoring', 'group_left', 'group_right']);

// Bareword keywords/modifiers that are never metric names. Function names are caught structurally
// (identifier followed by `(`), so they don't need listing here.
const KEYWORDS = new Set(['and', 'or', 'unless', 'bool', 'offset', 'atan2', 'inf', 'nan', ...GROUPING_KEYWORDS]);

const renderMatcher = (filter: AdhocFilter): string => `${filter.key}${filter.operator}"${escapeValue(filter.value)}"`;

// String-escape (NOT regex-escape) the matcher value: backslash first, then double-quote, so the
// emitted `"…"` is a valid PromQL string literal. The operator (`=~`/`!~`) decides regex semantics.
const escapeValue = (value: string): string => value.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`);

const isIdentStart = (ch: string | undefined): boolean => ch !== undefined && /[a-zA-Z_:]/.test(ch);

const isIdentPart = (ch: string | undefined): boolean => ch !== undefined && /[a-zA-Z0-9_:]/.test(ch);

/** Index just past the identifier starting at `start` (assumes `isIdentStart(promql[start])`). */
const scanIdent = (promql: string, start: number): number => {
  let i = start + 1;
  while (i < promql.length && isIdentPart(promql[i])) i++;
  return i;
};

/** Index of the first non-whitespace char at or after `start` (may be `promql.length`). */
const skipWhitespace = (promql: string, start: number): number => {
  let i = start;
  while (i < promql.length && /\s/.test(promql[i] ?? '')) i++;
  return i;
};

/**
 * Index just past a string literal starting at the quote `promql[start]`. Honors `\`-escapes; if
 * the string is unterminated, returns `promql.length` (the rest is copied verbatim).
 */
const scanString = (promql: string, start: number): number => {
  const quote = promql[start];
  let i = start + 1;
  while (i < promql.length) {
    const ch = promql[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i++;
  }
  return promql.length;
};

/**
 * Index just past the matching `}` for the `{` at `promql[start]`, skipping over string literals so
 * a `}` inside a matcher value doesn't end the set early. If unterminated, returns `promql.length`.
 */
const scanBrace = (promql: string, start: number): number => {
  let i = start + 1;
  while (i < promql.length) {
    const ch = promql[i];
    if (ch === '"' || ch === "'") {
      i = scanString(promql, i);
      continue;
    }
    if (ch === '}') return i + 1;
    i++;
  }
  return promql.length;
};

/**
 * Index just past the matching `]` for the `[` at `promql[start]`, tracking nesting. Range/subquery
 * brackets hold only durations (`[5m]`, `[1h:5m]`), so their contents are copied untouched. If
 * unterminated, returns `promql.length`.
 */
const scanBracketGroup = (promql: string, start: number): number => {
  let depth = 0;
  let i = start;
  while (i < promql.length) {
    const ch = promql[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return promql.length;
};

/**
 * Index just past the matching `)` for the `(` at `promql[start]`, tracking nesting and skipping
 * string literals. If unterminated, returns `promql.length`.
 */
const scanParenGroup = (promql: string, start: number): number => {
  let depth = 0;
  let i = start;
  while (i < promql.length) {
    const ch = promql[i];
    if (ch === '"' || ch === "'") {
      i = scanString(promql, i);
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return promql.length;
};
