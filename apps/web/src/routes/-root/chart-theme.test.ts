import { describe, expect, it } from 'vitest';

import { chartThemeColors, themedAxes, themedAxis, timeScaleX } from './chart-theme';

// Hoisted so the formatter identity is stable across the assertion (and to satisfy
// consistent-function-scoping — it captures nothing).
const yValuesFixture = (): string[] => ['1', '2'];

describe('chartThemeColors', () => {
  it('returns light-theme chrome colors readable on a white background', () => {
    expect(chartThemeColors('light')).toEqual({
      axis: '#8e868f',
      grid: 'rgba(0, 0, 0, 0.07)',
      ticks: 'rgba(0, 0, 0, 0.15)',
    });
  });

  it('returns dark-theme chrome colors readable on the mauve dark background', () => {
    expect(chartThemeColors('dark')).toEqual({
      axis: '#b4acb7',
      grid: 'rgba(255, 255, 255, 0.07)',
      ticks: 'rgba(255, 255, 255, 0.15)',
    });
  });

  it('distinguishes the two themes (dark is not light)', () => {
    expect(chartThemeColors('dark')).not.toEqual(chartThemeColors('light'));
  });
});

describe('themedAxis', () => {
  it('maps the palette onto a uPlot axis (stroke + grid.stroke + ticks.stroke)', () => {
    const colors = chartThemeColors('dark');
    const axis = themedAxis(colors);
    expect(axis.stroke).toBe('#b4acb7');
    expect(axis.grid?.stroke).toBe('rgba(255, 255, 255, 0.07)');
    expect(axis.ticks?.stroke).toBe('rgba(255, 255, 255, 0.15)');
  });

  it('produces a fresh object each call so spreading into per-axis configs is safe', () => {
    const colors = chartThemeColors('light');
    expect(themedAxis(colors)).not.toBe(themedAxis(colors));
  });
});

describe('themedAxes', () => {
  it('builds an [x, y] pair, both themed, with a default-formatted y when no formatter is given', () => {
    const colors = chartThemeColors('dark');
    const [x, y] = themedAxes(colors);
    expect(x.stroke).toBe(colors.axis);
    expect(y.stroke).toBe(colors.axis);
    expect(y.values).toBeUndefined();
  });

  it('puts the y-axis formatter on index 1 only, leaving the x-axis (index 0) default', () => {
    const colors = chartThemeColors('light');
    const [x, y] = themedAxes(colors, yValuesFixture);
    expect(x.values).toBeUndefined();
    expect(y.values).toBe(yValuesFixture);
    // The themed chrome still applies to both axes alongside the formatter.
    expect(x.grid?.stroke).toBe(colors.grid);
    expect(y.grid?.stroke).toBe(colors.grid);
  });

  it('returns two distinct axis objects so per-axis mutation never aliases', () => {
    const [x, y] = themedAxes(chartThemeColors('dark'));
    expect(x).not.toBe(y);
  });
});

describe('timeScaleX', () => {
  it('pins a temporal x-scale to the [from, to] window as a static tuple range', () => {
    const scale = timeScaleX(1000, 2000);
    expect(scale.time).toBe(true);
    expect(scale.range).toEqual([1000, 2000]);
  });
});
