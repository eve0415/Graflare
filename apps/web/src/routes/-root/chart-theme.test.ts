import { describe, expect, it } from 'vitest';

import { chartThemeColors, themedAxis } from './chart-theme';

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
