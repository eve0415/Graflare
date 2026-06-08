import type { PanelDataResult } from './use-panel-data';

// One Prometheus result row, flattened out of the `PanelDataResult` union: a label
// set plus either an instant `value` tuple (vector) or a `values` array (matrix).
// `value`/`values` are both optional so vector and matrix rows share one shape.
export interface ResultSeries {
  metric: Record<string, string>;
  values?: [number, string][];
  value?: [number, string];
}

/**
 * Pull every Prometheus result row out of a `PanelDataResult[]`, in order.
 *
 * Walks the union exactly the way the panels did inline: `'status' in res` selects
 * the Prometheus responses (SQL `columns/rows` responses have no `status`), then
 * `status === 'success'` + a `result` array narrows to the query-data member, and
 * the per-row `object`/`metric` check rejects the bare `[number, string]` tuple a
 * scalar/string `resultType` carries. Error and empty responses contribute nothing.
 */
export const extractResultSeries = (data: PanelDataResult[] | null | undefined): ResultSeries[] => {
  if (data === null || data === undefined) return [];

  const series: ResultSeries[] = [];
  for (const res of data) {
    if (!('status' in res)) continue;
    if (res.status !== 'success' || res.data === undefined || !('result' in res.data) || !Array.isArray(res.data.result)) continue;
    for (const row of res.data.result) {
      if (typeof row === 'object' && row !== null && 'metric' in row) {
        series.push(row);
      }
    }
  }
  return series;
};

// Latest sample of a series: an instant vector carries a single `value` tuple; a
// matrix carries a `values` array whose last entry is the most recent.
export const latestSample = (series: ResultSeries): [number, string] | undefined => series.value ?? series.values?.at(-1);

/**
 * Raw value token of the first series' latest sample, or `null` when there is no
 * series. Kept as the verbatim Prometheus string — callers coerce as they need
 * (stat keeps the string, gauge wraps it in `Number`), so a non-numeric token like
 * `"NaN"` survives unchanged.
 */
export const firstScalar = (data: PanelDataResult[] | null | undefined): string | null => {
  const [first] = extractResultSeries(data);
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
