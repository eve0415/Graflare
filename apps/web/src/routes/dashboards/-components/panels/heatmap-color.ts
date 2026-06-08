// Color ramps for the heatmap panel. Pure and dependency-free (no d3-scale-chromatic):
// each scheme is a short list of RGB stops the panel interpolates over, so the cell
// fill is a deterministic, testable function of the normalized density `t` in [0, 1].

// The selectable color schemes. `as const` so the schema enum and the renderer share
// exactly one source of truth; adding a scheme here surfaces the missing ramp below as
// a type error rather than a silent fallback.
export const HEATMAP_SCHEMES = ['blues', 'greens', 'reds', 'turbo'] as const;

export type HeatmapScheme = (typeof HEATMAP_SCHEMES)[number];

interface Rgb {
  r: number;
  g: number;
  b: number;
}

// Sequential single-hue ramps run from a near-white low-density tint to a saturated
// dark stop, matching the usual heatmap "more = darker" reading. Turbo is Google's
// perceptually-uniform rainbow, sampled at a handful of anchor stops (cool → warm) so
// the full ramp interpolates without pulling in a colormap dependency.
const RAMPS: Record<HeatmapScheme, Rgb[]> = {
  blues: [
    { r: 247, g: 251, b: 255 },
    { r: 8, g: 48, b: 107 },
  ],
  greens: [
    { r: 247, g: 252, b: 245 },
    { r: 0, g: 68, b: 27 },
  ],
  reds: [
    { r: 255, g: 245, b: 240 },
    { r: 103, g: 0, b: 13 },
  ],
  turbo: [
    { r: 48, g: 18, b: 59 },
    { r: 70, g: 134, b: 251 },
    { r: 27, g: 217, b: 153 },
    { r: 165, g: 254, b: 49 },
    { r: 250, g: 186, b: 57 },
    { r: 230, g: 89, b: 17 },
    { r: 122, g: 4, b: 3 },
  ],
};

const clamp01 = (t: number): number => {
  if (!Number.isFinite(t)) return 0;
  return Math.min(1, Math.max(0, t));
};

// Linear blend between two stops at fraction `f` in [0, 1], rounded to integer
// channels so the output is a stable, comparable `rgb()` string.
const lerp = (a: Rgb, b: Rgb, f: number): Rgb => ({
  r: Math.round(a.r + (b.r - a.r) * f),
  g: Math.round(a.g + (b.g - a.g) * f),
  b: Math.round(a.b + (b.b - a.b) * f),
});

/**
 * Map a normalized density `t` (0 = lowest, 1 = peak) to a CSS `rgb()` color in the
 * given scheme. `t` is clamped to [0, 1] (non-finite → 0), then projected onto the
 * scheme's stop list and linearly interpolated between the two surrounding stops, so a
 * two-stop scheme is a straight gradient and turbo walks its anchor colors in order.
 */
export const heatColor = (t: number, scheme: HeatmapScheme): string => {
  const stops = RAMPS[scheme];
  const clamped = clamp01(t);

  // Scale onto the stop intervals: `segments = stops.length - 1`. The floor picks the
  // lower stop; `index + 1` is guarded to the last stop so `t === 1` reads the final
  // color instead of stepping past the array.
  const segments = stops.length - 1;
  const scaled = clamped * segments;
  const lowerIndex = Math.min(segments - 1, Math.floor(scaled));
  const frac = scaled - lowerIndex;

  const lower = stops[lowerIndex] ?? stops[0];
  const upper = stops[lowerIndex + 1] ?? stops.at(-1);
  if (lower === undefined || upper === undefined) return 'rgb(0, 0, 0)';

  const { r, g, b } = lerp(lower, upper, frac);
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
};
