import type uPlot from 'uplot';

/**
 * Theme-aware colors for uPlot chart chrome (axis labels, grid lines, tick marks).
 *
 * uPlot draws on a `<canvas>`, so it can't read the CSS custom properties that
 * theme the rest of the app — every color must be a concrete literal. Left to its
 * defaults uPlot paints near-black axis text and grid lines, which vanish against
 * the mauve dark background. These values mirror the design-system tokens as
 * canvas-safe forms: the axis label is `muted-foreground` (light/dark), and the
 * grid/tick lines echo the subtle `border` token. Series stroke colors are
 * deliberately NOT themed here — they stay a distinct per-series hue rainbow so
 * multiple series remain distinguishable in both themes.
 */
export interface ChartThemeColors {
  /** Axis tick-label text color (`Axis.stroke`). */
  axis: string;
  /** Grid line color (`Axis.grid.stroke`). */
  grid: string;
  /** Tick mark color (`Axis.ticks.stroke`). */
  ticks: string;
}

type ResolvedTheme = 'light' | 'dark';

const CHART_THEME: Record<ResolvedTheme, ChartThemeColors> = {
  // Light: muted-foreground oklch(0.542 0.034 322.5) → #8e868f; subtle black lines.
  light: {
    axis: '#8e868f',
    grid: 'rgba(0, 0, 0, 0.07)',
    ticks: 'rgba(0, 0, 0, 0.15)',
  },
  // Dark: muted-foreground oklch(0.711 0.019 323.02) → #b4acb7; subtle white lines.
  dark: {
    axis: '#b4acb7',
    grid: 'rgba(255, 255, 255, 0.07)',
    ticks: 'rgba(255, 255, 255, 0.15)',
  },
};

/** The chart-chrome palette for the resolved theme. */
export const chartThemeColors = (resolved: ResolvedTheme): ChartThemeColors => CHART_THEME[resolved];

/**
 * A single uPlot axis pre-filled with the theme palette. For the common `[x, y]` pair reach for
 * `themedAxes`; use this directly only when one axis needs a non-standard arrangement (e.g. the
 * histogram, whose formatter sits on the x-axis): `{ ...themedAxis(colors), values: fmt }`.
 * Keeps the chart builders from each repeating the stroke/grid/ticks wiring.
 */
export const themedAxis = (colors: ChartThemeColors): uPlot.Axis => ({
  stroke: colors.axis,
  grid: { stroke: colors.grid, width: 1 },
  ticks: { stroke: colors.ticks, width: 1 },
});

/**
 * The `[x, y]` axis pair every time-domain chart uses: both themed, with an optional unit
 * formatter on the y-axis. `themedAxis` already returns fresh objects, so this needs no extra
 * spread — it just assembles the pair the time-series, bar-chart, and explore charts each built
 * inline. Pass `yValues` to format the y splits (`buildBarChartOptions`, the time-series panel);
 * omit it for a default-formatted y (explore). The x-axis keeps uPlot's default time formatting.
 */
export const themedAxes = (colors: ChartThemeColors, yValues?: uPlot.Axis.DynamicValues): [uPlot.Axis, uPlot.Axis] => [
  themedAxis(colors),
  yValues === undefined ? themedAxis(colors) : { ...themedAxis(colors), values: yValues },
];

/**
 * The x-scale every time-domain chart pins: a temporal axis whose range is fixed to the resolved
 * `[from, to]` query window (epoch seconds). Pinning the range stops uPlot's data-driven auto-range
 * from ballooning the x domain across years when a series carries a stray out-of-window sample (the
 * audit saw a multi-year axis). Returns just the `Scale` so the caller owns `scales: { x: … }` and
 * a future `y` scale can sit alongside it.
 */
export const timeScaleX = (from: number, to: number): uPlot.Scale => ({ time: true, range: [from, to] });
