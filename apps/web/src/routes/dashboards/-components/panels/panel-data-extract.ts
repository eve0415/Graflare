import type { PanelDataResult } from './use-panel-data';
import type { FieldDescriptor } from '@graflare/shared/format/resolve-field-config';
import type { PanelQuery } from '@graflare/shared/schemas/panel';
import type { Transformation } from '@graflare/shared/schemas/transformation';
import type { ResultSeries } from '@graflare/shared/transform/series';

import { applyTransformations } from '@graflare/shared/transform/apply';
import { deriveSeriesLabel, latestSample } from '@graflare/shared/transform/series';

// `ResultSeries`, `deriveSeriesLabel` and `latestSample` are defined once in `@graflare/shared`
// (the transform pipeline operates on the same row shape and the same label rule the panels render
// with). They are re-exported here so every panel keeps importing them from this local module —
// the long-standing import path — rather than reaching into shared directly.
export type { ResultSeries };
export { latestSample };

// A result row paired with the refId of the query that produced it. `data[i]` is
// index-aligned with `queries[i]` (both come from the same `Promise.all(queries.map(…))` in
// usePanelData), so every series of response `i` carries `queries[i].refId` — the key a
// byFrameRefID override matches. `refId` is optional: a caller that omits `queries` (or a
// stray response past the query list) yields an untagged row, so byFrameRefID simply can't
// match it — the pre-refId behavior.
export interface QueriedSeries {
  series: ResultSeries;
  refId?: string;
}

/**
 * Pull every Prometheus result row out of a `PanelDataResult[]`, in order, each tagged with
 * the refId of the query that produced it (when `queries` is supplied).
 *
 * Walks the union exactly the way the panels did inline: `'status' in res` selects the
 * Prometheus responses (SQL `columns/rows` responses have no `status`), then
 * `status === 'success'` + a `result` array narrows to the query-data member, and the
 * per-row `object`/`metric` check rejects the bare `[number, string]` tuple a scalar/string
 * `resultType` carries. Error and empty responses contribute nothing. The response index is
 * the query index (Promise.all preserves order), so `queries?.[i]?.refId` is the source
 * query's refId — undefined when `queries` is omitted, leaving byFrameRefID unmatchable.
 */
export const extractResultSeriesWithQuery = (data: PanelDataResult[] | null | undefined, queries?: readonly PanelQuery[]): QueriedSeries[] => {
  if (data === null || data === undefined) return [];

  const out: QueriedSeries[] = [];
  for (const [i, res] of data.entries()) {
    if (!('status' in res)) continue;
    if (res.status !== 'success' || res.data === undefined || !('result' in res.data) || !Array.isArray(res.data.result)) continue;
    const refId = queries?.[i]?.refId;
    for (const row of res.data.result) {
      if (typeof row === 'object' && row !== null && 'metric' in row) {
        out.push(refId === undefined ? { series: row } : { series: row, refId });
      }
    }
  }
  return out;
};

/**
 * Pull every Prometheus result row out of a `PanelDataResult[]`, in order — the refId-free
 * view of `extractResultSeriesWithQuery`. Panels that don't resolve per-field overrides
 * (bar-chart/histogram/heatmap) and the scalar/table readers keep this flat shape, so there
 * stays exactly one union-walker.
 */
export const extractResultSeries = (data: PanelDataResult[] | null | undefined): ResultSeries[] => extractResultSeriesWithQuery(data).map(q => q.series);

/**
 * Extract the flat series and run the panel's transformations over them (Grafana's transform step,
 * applied before the viz). This is the transform-aware replacement for `extractResultSeries` at the
 * panel data path: panels that read the refId-free series (bar-chart/histogram/heatmap/table) call
 * THIS so transformations feed the viz.
 *
 * When `transformations` is empty (every current panel), `applyTransformations` returns the same
 * array reference `extractResultSeries` produced — byte-for-byte identical output, no behavior
 * change. Only a panel that actually configures transformations sees transformed series.
 */
export const extractTransformedSeries = (data: PanelDataResult[] | null | undefined, transformations: readonly Transformation[]): ResultSeries[] =>
  applyTransformations(extractResultSeries(data), transformations);

/**
 * The refId-carrying counterpart of `extractTransformedSeries`, for panels that resolve per-field
 * overrides (pie/bar-gauge/gauge/state-timeline/status-history/bar-chart-configs).
 *
 * With NO transformations the original `QueriedSeries[]` is returned untouched — same references,
 * refId pairing intact — so byFrameRefID overrides keep matching exactly as before. With
 * transformations, the structural operations (filter/sort/reorder/reduce) break the 1:1 series↔query
 * association, so each transformed row is returned WITHOUT a refId — byFrameRefID then can't match it
 * (the long-standing "undefined refId leaves byFrameRefID unmatchable" path, which the override
 * resolver already handles). This matches Grafana, where overrides apply after transforms and
 * structural transforms likewise sever the refId link. Re-pairing refId through structural transforms
 * is deferred with the transform editor (Phase 2).
 */
export const extractTransformedSeriesWithQuery = (
  data: PanelDataResult[] | null | undefined,
  queries: readonly PanelQuery[] | undefined,
  transformations: readonly Transformation[],
): QueriedSeries[] => {
  const queried = extractResultSeriesWithQuery(data, queries);
  if (transformations.length === 0) return queried;
  return applyTransformations(
    queried.map(q => q.series),
    transformations,
  ).map(series => ({ series }));
};

/**
 * Describe a series as a field for override matching: its derived label as `name` (the shared
 * `deriveSeriesLabel` rule) plus the source query's `refId` when known (so byFrameRefID can match).
 * Prometheus series carry no data type, so `type` is omitted and byType can't match them.
 *
 * `index` is caller-supplied because the panels count positions differently: bar-gauge/pie
 * index by KEPT (post-finite-filter) series, while state-timeline/status-history index by raw
 * enumerate position. Passing it in preserves each panel's existing `Series N` numbering.
 */
export const seriesDescriptor = (series: ResultSeries, index: number, refId?: string): FieldDescriptor => {
  const name = deriveSeriesLabel(series.metric, index);
  return refId === undefined ? { name } : { name, refId };
};

/**
 * Raw value token of the first series' latest sample (after the panel's transformations), or `null`
 * when there is no series. Kept as the verbatim Prometheus string — callers coerce as they need
 * (stat keeps the string, gauge wraps it in `Number`), so a non-numeric token like `"NaN"` survives
 * unchanged. With no transformations the first series is the untransformed first series, so the
 * scalar is byte-identical to before; a `reduce` transform lets stat/gauge show e.g. the series mean
 * instead of its last sample.
 */
export const firstScalar = (data: PanelDataResult[] | null | undefined, transformations: readonly Transformation[] = []): string | null => {
  const [first] = extractTransformedSeries(data, transformations);
  if (first === undefined) return null;
  return latestSample(first)?.[1] ?? null;
};

// Highest threshold whose `value` the input meets or exceeds wins; `noMatch` is the
// caller-supplied default when the value falls below every threshold (stat and
// gauge use different defaults). Sorts a copy, so the input order is irrelevant.
export const getThresholdColor = (value: number, thresholds: { value: number; color: string }[], noMatch: string): string => {
  const sorted = [...thresholds].sort((a, b) => b.value - a.value);
  for (const t of sorted) {
    if (value >= t.value) return t.color;
  }
  return noMatch;
};

// Parse `#rgb`/`#rrggbb` into 0..255 sRGB channels. Returns null for anything that
// isn't a clean 3- or 6-digit hex (e.g. a CSS var like `var(--color-foreground)`),
// so the caller can fall back rather than read NaN channels. 3-digit shorthand is
// expanded by doubling each nibble (`.replace`, no indexed access), then channels
// are read off fixed 2-char slices and re-checked for NaN to stay fully typed.
const parseHexRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const [digits] = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())?.slice(1) ?? [];
  if (digits === undefined) return null;
  const expanded = digits.length === 3 ? digits.replaceAll(/./g, nibble => `${nibble}${nibble}`) : digits;
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
};

// Linearise one 0..255 sRGB channel to its 0..1 light-intensity value.
const linearizeChannel = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

// WCAG relative luminance: linearise each sRGB channel, then weight by the standard
// coefficients. https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
const relativeLuminance = (r: number, g: number, b: number): number =>
  0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);

/**
 * Readable text color (`'#000'` or `'#fff'`) for text laid over `bgHex`, chosen so
 * the pair clears the higher WCAG contrast ratio. Used when a stat panel paints a
 * threshold/mapping color as its background — black text on light fills (e.g. a
 * yellow threshold), white on dark ones. Falls back to black for any value that
 * isn't a parseable hex (a CSS `var(...)` fallback, an empty string), never NaN.
 */
export const readableTextColor = (bgHex: string): '#000' | '#fff' => {
  const rgb = parseHexRgb(bgHex);
  if (rgb === null) return '#000';
  const bgLum = relativeLuminance(rgb.r, rgb.g, rgb.b);
  // Contrast ratio is (lighter + 0.05) / (darker + 0.05). Compare white (lum 1)
  // against black (lum 0) over this background and pick whichever scores higher.
  const contrastWithWhite = 1.05 / (bgLum + 0.05);
  const contrastWithBlack = (bgLum + 0.05) / 0.05;
  return contrastWithBlack >= contrastWithWhite ? '#000' : '#fff';
};
