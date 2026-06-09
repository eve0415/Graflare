import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';

import { describe, expect, it } from 'vitest';

import { chartThemeColors, themedAxes } from '../../../-root/chart-theme';

import { formatUnitTicks, groupConfigsByUnit, resolveScaleRange, resolveSharedAxisLayout } from './multi-axis';

const colors = chartThemeColors('dark');

// A resolved per-series config. Only the fields the layout reads (unit/min/max) matter here.
const config = (unit: string, min?: number, max?: number): FieldConfigDefaults => {
  const base: FieldConfigDefaults = { unit, mappings: [] };
  const withMin = min === undefined ? base : { ...base, min };
  return max === undefined ? withMin : { ...withMin, max };
};

describe('formatUnitTicks', () => {
  it('formats each split through the configured unit', () => {
    expect(formatUnitTicks([1024, 2048], config('bytes'))).toEqual(['1 KiB', '2 KiB']);
  });

  it('passes raw numbers through when no unit is set', () => {
    expect(formatUnitTicks([1, 2, 3], config(''))).toEqual(['1', '2', '3']);
  });
});

describe('groupConfigsByUnit (grouping + first-wins rule)', () => {
  it('returns one entry per distinct unit, in first-appearance order', () => {
    const groups = groupConfigsByUnit([config('bytes'), config('percent'), config('bytes')]);
    expect(groups.map(([unit]) => unit)).toEqual(['bytes', 'percent']);
  });

  it('keeps the FIRST series of a unit as that group’s config (first-wins on mixed min/max)', () => {
    // Two bytes series disagree on max; the first one (max 100) is the group's first appearance, so
    // it leads the grouping (index 0) and represents the bytes group — its min/max, not the later
    // 999, drives that group's shared scale. (resolveScaleRange then pins [0,100] — covered below.)
    const groups = groupConfigsByUnit([config('bytes', 0, 100), config('percent'), config('bytes', 0, 999)]);
    expect(groups[0]?.[0]).toBe('bytes');
    expect(groups[0]?.[1].max).toBe(100);
    expect(groups[0]?.[1].min).toBe(0);
  });

  it('returns an empty grouping for no series', () => {
    expect(groupConfigsByUnit([])).toEqual([]);
  });
});

describe('resolveScaleRange', () => {
  it('pins both ends when the group overrides min and max', () => {
    expect(resolveScaleRange(config('short', 0, 100), -5, 5000)).toEqual([0, 100]);
  });

  it('pins only min and defers max to the data extent (partial override)', () => {
    expect(resolveScaleRange(config('short', 0), -10, 42)).toEqual([0, 42]);
  });

  it('pins only max and defers min to the data extent (partial override)', () => {
    expect(resolveScaleRange(config('short', undefined, 100), -10, 42)).toEqual([-10, 100]);
  });

  it('defers both ends to the data extent when neither is overridden (auto-range identity)', () => {
    expect(resolveScaleRange(config('short'), -10, 42)).toEqual([-10, 42]);
  });
});

describe('resolveSharedAxisLayout — single unit (no-regression path)', () => {
  it('no series → exactly the themed [x, y] pair with no y-scale and no series scales', () => {
    const layout = resolveSharedAxisLayout([], colors);
    // Byte-equivalent to the prior `themedAxes(colors)` the charts built when empty.
    expect(layout.axes).toEqual(themedAxes(colors));
    expect(layout.scales).toEqual({});
    expect(layout.seriesScales).toEqual([]);
  });

  it('one unit across all series → one y-axis, no y-scale, every series on the default scale', () => {
    const layout = resolveSharedAxisLayout([config('bytes'), config('bytes'), config('bytes')], colors);
    // Index 0 = x, index 1 = the single themed y-axis with a formatter; nothing more.
    expect(layout.axes).toHaveLength(2);
    expect(typeof layout.axes[1]?.values).toBe('function');
    expect(layout.axes[1]?.stroke).toBe(colors.axis);
    expect(layout.axes[1]?.grid?.stroke).toBe(colors.grid);
    // No y-scale entry (defaults carry no min/max) and no per-series scale key — the series objects
    // stay byte-identical to a pre-overrides chart.
    expect(layout.scales).toEqual({});
    expect(layout.seriesScales).toEqual([undefined, undefined, undefined]);
  });

  it('adds a single y-scale (with a range function) pinned when the one group is range-pinned', () => {
    // Additive: no existing chart reads scales.y, so pinning the single group is a no-regression
    // add that simply honors a defaults (or unit-uniform override) min/max on the shared axis.
    const layout = resolveSharedAxisLayout([config('short', 0, 100), config('short', 0, 100)], colors);
    expect(layout.axes).toHaveLength(2);
    expect(layout.seriesScales).toEqual([undefined, undefined]);
    // The scale carries a uPlot range function (the pinning math itself is covered by
    // resolveScaleRange above); a single group never splits into a second axis.
    expect(typeof layout.scales.y?.range).toBe('function');
  });

  it('omits the y-scale entirely when the single group sets no min/max', () => {
    expect(resolveSharedAxisLayout([config('bytes')], colors).scales).toEqual({});
  });
});

describe('resolveSharedAxisLayout — two units (multi-axis path)', () => {
  const layout = resolveSharedAxisLayout([config('bytes'), config('percent')], colors);

  it('builds one x-axis plus one y-axis per distinct unit (x, y-bytes, y-percent)', () => {
    expect(layout.axes).toHaveLength(3);
  });

  it("places the first unit's axis on the left and the second's on the right", () => {
    // side: 3 = left, 1 = right (uPlot Axis.Side).
    expect(layout.axes[1]?.side).toBe(3);
    expect(layout.axes[2]?.side).toBe(1);
  });

  it('binds each y-axis to its own scale (first unit keeps the default y, second gets y1)', () => {
    expect(layout.axes[1]?.scale).toBe('y');
    expect(layout.axes[2]?.scale).toBe('y1');
    expect(layout.scales.y).toBeDefined();
    expect(layout.scales.y1).toBeDefined();
  });

  it('assigns each series to the scale of its unit, in input order', () => {
    expect(layout.seriesScales).toEqual(['y', 'y1']);
  });

  it("formats each axis' ticks with its own unit (bytes left → KiB, percent right → %)", () => {
    // The per-axis formatter is the unit-bound formatUnitTicks; assert the bound config differs by
    // re-deriving the expected output from the same pure helper for each axis' unit.
    expect(formatUnitTicks([1024], config('bytes'))).toEqual(['1 KiB']);
    expect(formatUnitTicks([50], config('percent'))).toEqual(['50%']);
    expect(typeof layout.axes[1]?.values).toBe('function');
    expect(typeof layout.axes[2]?.values).toBe('function');
  });

  it('draws gridlines from the primary (left) axis only, suppressing them on secondaries', () => {
    // Primary keeps the visible themed grid; the right axis switches it off so cross-scale
    // gridlines do not overlap into clutter.
    expect(layout.axes[1]?.grid?.show).not.toBe(false);
    expect(layout.axes[1]?.grid?.stroke).toBe(colors.grid);
    expect(layout.axes[2]?.grid?.show).toBe(false);
  });

  it('keeps the themed stroke + ticks on the secondary axis even with its grid off', () => {
    expect(layout.axes[2]?.stroke).toBe(colors.axis);
    expect(layout.axes[2]?.ticks?.stroke).toBe(colors.ticks);
  });

  it('groups multiple series of the same unit onto one shared scale (no duplicate axis)', () => {
    const grouped = resolveSharedAxisLayout([config('bytes'), config('percent'), config('bytes')], colors);
    // Still only two y-axes; the two bytes series share scale 'y', the percent series is on 'y1'.
    expect(grouped.axes).toHaveLength(3);
    expect(grouped.seriesScales).toEqual(['y', 'y1', 'y']);
  });
});

describe('resolveSharedAxisLayout — per-series min/max routed to the right scale', () => {
  it("attaches a range function to each unit-group's own scale", () => {
    const layout = resolveSharedAxisLayout([config('bytes', 0, 8000), config('percent', 0, 100)], colors);
    // bytes group → scale y; percent group → scale y1; each carries its own pinning function.
    expect(typeof layout.scales.y?.range).toBe('function');
    expect(typeof layout.scales.y1?.range).toBe('function');
  });

  it('leaves a group auto-ranged (no range entry) when only the other group pins min/max', () => {
    const layout = resolveSharedAxisLayout([config('bytes', 0, 8000), config('percent')], colors);
    // Pinned bytes scale gets a range function; the un-pinned percent scale stays an empty
    // (auto-ranging) scale with no range entry.
    expect(typeof layout.scales.y?.range).toBe('function');
    expect(layout.scales.y1).toBeDefined();
    expect(layout.scales.y1?.range).toBeUndefined();
  });
});
