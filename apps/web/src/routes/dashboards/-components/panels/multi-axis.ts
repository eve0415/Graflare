import type { ChartThemeColors } from '../../../-root/chart-theme';
import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';
import type uPlot from 'uplot';

import { formatValue } from '@graflare/shared/format/value-format';

import { themedAxes, themedAxis } from '../../../-root/chart-theme';

/**
 * The y-axis layout for a shared-axis chart (time-series / bar-chart), resolved from each
 * series' effective field config.
 *
 * `axes` is the FULL uPlot axes array — index 0 is always the themed x-axis, followed by one
 * y-axis per distinct unit. `scales` holds only the y-scales this layout introduces (the caller
 * owns the x-scale and merges these in). `seriesScales[i]` is the scale key series `i` belongs
 * to, or `undefined` when it rides uPlot's default 'y' scale — index-aligned with the input
 * configs so the caller assigns `series[i].scale` only when defined (mirrors the conditional
 * `paths` spread), keeping single-unit series objects byte-identical to before.
 */
export interface SharedAxisLayout {
  axes: uPlot.Axis[];
  scales: uPlot.Scales;
  seriesScales: (string | undefined)[];
}

// uPlot Axis.Side: 0 top, 1 right, 2 bottom, 3 left. Left/right are the y-sides; we alternate
// first-unit→left, second→right, then stack the rest back on the left (a pragmatic MVP — see the
// >2-units note in the panel docs). The const-enum members are type-only at runtime, so the
// numeric literals are the values; both satisfy `uPlot.Axis['side']`.
const SIDE_LEFT = 3 satisfies NonNullable<uPlot.Axis['side']>;
const SIDE_RIGHT = 1 satisfies NonNullable<uPlot.Axis['side']>;

// Stable scale key for the nth distinct unit. The first unit keeps uPlot's default 'y' so the
// single-unit layout needs no scale entry at all and the series stay on the default scale; later
// units get a positional key. Keys are layout-internal (never user-visible), so positional is fine.
const scaleKeyFor = (unitIndex: number): string => (unitIndex === 0 ? 'y' : `y${String(unitIndex)}`);

/**
 * Format one axis' tick splits through a unit-group's config — the same per-unit `formatValue` the
 * single-axis charts used, exposed as a pure (uPlot-free) function so the per-axis formatting is
 * testable without a chart instance. Each multi-axis y-axis binds this to its own group's config.
 */
export const formatUnitTicks = (splits: readonly number[], config: FieldConfigDefaults): string[] => splits.map(v => formatValue(v, config));

/**
 * Resolve a unit-group's effective `[min, max]` scale range for a given data extent: pin each end
 * that the group overrides, defer the other to the data. Pure (uPlot-free) so the min/max routing
 * is testable directly. Covers both-set, partial (min OR max), and neither in one typed function —
 * no null-tuple, no cast. When neither is set the identity `[dataMin, dataMax]` reproduces uPlot's
 * default auto-range, so a no-override group behaves exactly as an un-pinned scale.
 */
export const resolveScaleRange = (config: FieldConfigDefaults, dataMin: number, dataMax: number): [number, number] => [
  config.min ?? dataMin,
  config.max ?? dataMax,
];

// Bind `formatUnitTicks` to a group's config as the uPlot y-axis tick formatter.
const formatTicksFor =
  (config: FieldConfigDefaults): uPlot.Axis.DynamicValues =>
  (_u, splits) =>
    formatUnitTicks(splits, config);

// Bind `resolveScaleRange` to a group's config as the uPlot scale range function. uPlot passes the
// instance + data extent; we forward only the extent to the pure resolver.
const rangeFor =
  (config: FieldConfigDefaults): uPlot.Scale.Range =>
  (_u, dataMin, dataMax) =>
    resolveScaleRange(config, dataMin, dataMax);

// Does this group constrain its scale at all? Only then do we emit a y-scale entry; a group with
// neither min nor max needs no scale (the default auto-range applies), which is what keeps the
// single-unit / no-override layout byte-identical to before.
const hasRange = (config: FieldConfigDefaults): boolean => config.min !== undefined || config.max !== undefined;

/**
 * Group per-series configs by their resolved `unit`, in first-appearance order, returning one
 * `[unit, config]` per distinct unit. The config kept for a unit is the FIRST series that carried
 * it — series of a unit share one y-scale, so a single config must speak for the whole group, and
 * first-wins keeps the group's min/max deterministic when same-unit series disagree. Insertion
 * order is appearance order (a Map preserves it), which drives left/right axis placement downstream.
 * Pure and uPlot-free so the grouping + first-wins rule is testable on its own.
 */
export const groupConfigsByUnit = (configs: readonly FieldConfigDefaults[]): [unit: string, config: FieldConfigDefaults][] => {
  const groups = new Map<string, FieldConfigDefaults>();
  for (const config of configs) {
    if (!groups.has(config.unit)) groups.set(config.unit, config);
  }
  return [...groups.entries()];
};

/**
 * Resolve the shared y-axis layout from per-series effective configs (index-aligned with the
 * series). Groups series by their resolved `unit`, in first-appearance order.
 *
 * - **0 or 1 distinct unit** (the overwhelmingly common case — no overrides, or overrides that
 *   don't change unit): exactly ONE y-axis on the default 'y' scale, byte-equivalent to the prior
 *   `themedAxes(colors, fmtForUnit)` output. A y-scale entry is added only when that single group
 *   carries a min/max override (no existing chart reads `scales.y`, so this is additive); series
 *   get no `scale` key, so they ride the default scale exactly as before.
 * - **≥2 distinct units**: one y-axis + y-scale per unit, placed left/right alternating (first
 *   unit left, second right, additional stacked left). Each axis formats ticks with its unit's
 *   `formatValue`; each scale pins that group's min/max (see `rangeFor`). Gridlines are drawn from
 *   the primary (left) axis only — secondary axes keep their stroke + ticks but drop the grid, so
 *   gridlines from different scales don't overlap into clutter (Grafana's behavior).
 *
 * **Mixed min/max within a unit-group**: the FIRST series of the group that carries the override
 * wins for the whole group's scale (simple + deterministic). Series share one scale per unit, so a
 * single range must represent the group; first-wins keeps it predictable and is what the tests pin.
 *
 * `configs` empty → an empty layout (no series, no axes): the caller renders its "no data" path
 * before reaching here, so this is just a total, side-effect-free base case.
 */
export const resolveSharedAxisLayout = (configs: readonly FieldConfigDefaults[], colors: ChartThemeColors): SharedAxisLayout => {
  // Distinct units in first-appearance order, each paired with the FIRST config that introduced it
  // (the first-wins rule for that group's min/max). Order is appearance order, so left/right
  // placement and scale keys follow it deterministically.
  const units = groupConfigsByUnit(configs);

  // Maps each unit to the scale key its series ride. Empty in the single-unit / no-series case, so
  // `.get(unit)` returns `undefined` there and no series gets a `scale` key — that empty-map lookup
  // is what keeps `seriesScales` all-undefined without writing a literal `undefined`.
  const unitToScaleKey = new Map<string, string>();

  // No series, or every series the same unit: the single-axis path. Return exactly the [x, y] pair
  // the charts built before — same themed x, same y with this unit's formatter — and add a y-scale
  // ONLY when the group is range-pinned. This is the no-regression branch; the existing chart tests
  // exercise it unchanged.
  if (units.length <= 1) {
    const [first] = units;
    const group = first?.[1];
    const formatTicks = group === undefined ? undefined : formatTicksFor(group);
    return {
      axes: themedAxes(colors, formatTicks),
      scales: group !== undefined && hasRange(group) ? { y: { range: rangeFor(group) } } : {},
      seriesScales: configs.map(config => unitToScaleKey.get(config.unit)),
    };
  }

  // ≥2 units: one scale + axis per unit. Index 0 axis is the themed x; the y-axes follow.
  const scales: uPlot.Scales = {};
  const axes: uPlot.Axis[] = [themedAxis(colors)];

  for (const [unitIndex, [unit, group]] of units.entries()) {
    const scaleKey = scaleKeyFor(unitIndex);
    unitToScaleKey.set(unit, scaleKey);

    // Pin this group's range only when it overrides min/max; otherwise leave it auto so the scale
    // ranges to its own series' data (each unit-group auto-ranges independently — that's the point
    // of separate scales). The default 'y' scale also needs an explicit entry now, because its
    // series no longer share the whole chart's auto-range.
    scales[scaleKey] = hasRange(group) ? { range: rangeFor(group) } : {};

    // First unit → left, second → right, rest stacked left. Grid only on the primary (left) axis;
    // secondaries keep stroke + ticks but switch the grid OFF (`show: false`), so gridlines from
    // different scales don't overlap into clutter (Grafana draws grid from one axis only).
    const side = unitIndex === 1 ? SIDE_RIGHT : SIDE_LEFT;
    const base = themedAxis(colors);
    const themed = unitIndex === 0 ? base : { ...base, grid: { stroke: colors.grid, width: 1, show: false } };
    axes.push({ ...themed, scale: scaleKey, side, values: formatTicksFor(group) });
  }

  return {
    axes,
    scales,
    // Every series is assigned to its unit's scale. Index-aligned with `configs`.
    seriesScales: configs.map(config => unitToScaleKey.get(config.unit)),
  };
};
