// Matches a single `{{label}}` token: double braces around a label name, with
// optional surrounding whitespace inside the braces (Grafana trims it, e.g.
// `{{ job }}`). The label name itself is any run of non-`}` characters, trimmed.
const TOKEN = /\{\{\s*([^}]*?)\s*\}\}/g;

/**
 * Resolve a Grafana-style `legendFormat` template against a series' metric labels.
 *
 * Each `{{label}}` token is replaced by `metric[label]`; an unknown label resolves to
 * the empty string (Grafana's behavior), so a template referencing only missing labels
 * collapses to whitespace/empty. Literal text between tokens is preserved verbatim.
 *
 * Returns `null` when the template is absent or resolves to nothing meaningful (empty or
 * whitespace-only), so the caller can fall back (typically to `__name__`, then a positional
 * `Series N`). Keeping the fallback decision in the caller lets each panel choose its own
 * chain without this helper hard-coding one.
 *
 * @example resolveLegendFormat('{{job}} {{method}}', { job: 'api', method: 'GET' }) // 'api GET'
 * @example resolveLegendFormat('', { __name__: 'up' })                              // null
 * @example resolveLegendFormat('{{missing}}', { job: 'api' })                       // null
 */
export const resolveLegendFormat = (format: string | undefined, metric: Record<string, string>): string | null => {
  if (format === undefined || format.trim() === '') return null;

  const resolved = format.replaceAll(TOKEN, (_match, label: string) => metric[label] ?? '');

  return resolved.trim() === '' ? null : resolved;
};

/**
 * Pick a display label for a series, preferring a resolved `legendFormat` template, then the
 * metric `__name__`, then a 1-based positional `Series N`. The single place panels resolve a
 * legend label so the fallback chain (and any future addition to it) can't drift between them.
 *
 * `index` is the series' position among its siblings; callers that render the label as a React
 * key must still disambiguate, since two distinct series can resolve to the same label.
 */
export const seriesLabel = (format: string | undefined, metric: Record<string, string>, index: number): string => {
  const fromFormat = resolveLegendFormat(format, metric);
  if (fromFormat !== null) return fromFormat;

  const name = metric.__name__;
  if (name !== undefined && name !== '') return name;

  return `Series ${String(index + 1)}`;
};
