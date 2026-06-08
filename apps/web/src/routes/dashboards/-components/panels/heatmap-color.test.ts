import { describe, expect, it } from 'vitest';

import { HEATMAP_SCHEMES, heatColor } from './heatmap-color';

// Pull the integer channels back out of an `rgb(r, g, b)` string so the ramp can be
// asserted numerically. Throws on anything that isn't that exact shape, so callers get
// a non-nullable result and the tests stay free of conditionals.
const channels = (color: string): { r: number; g: number; b: number } => {
  const m = /^rgb\((\d{1,3}), (\d{1,3}), (\d{1,3})\)$/.exec(color);
  if (m === null) throw new Error(`not an rgb() string: ${color}`);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
};

const inRange = (c: number): boolean => Number.isInteger(c) && c >= 0 && c <= 255;

describe('heatColor', () => {
  it('exposes the four supported schemes', () => {
    expect(HEATMAP_SCHEMES).toEqual(['blues', 'greens', 'reds', 'turbo']);
  });

  it('returns a parseable rgb() string for every scheme at the endpoints', () => {
    for (const scheme of HEATMAP_SCHEMES) {
      expect(() => channels(heatColor(0, scheme))).not.toThrow();
      expect(() => channels(heatColor(1, scheme))).not.toThrow();
    }
  });

  it('keeps all channels integers within 0..255 across the whole ramp for every scheme', () => {
    // Flatten every channel of every sampled stop into one list, then assert the whole
    // list is in range — no per-sample conditional, just a single predicate over all.
    const allChannels = HEATMAP_SCHEMES.flatMap(scheme =>
      Array.from({ length: 21 }, (_, i) => channels(heatColor(i / 20, scheme))).flatMap(({ r, g, b }) => [r, g, b]),
    );
    expect(allChannels.every(c => inRange(c))).toBe(true);
  });

  it('darkens the blues ramp as density rises (low t is lighter than high t)', () => {
    const low = channels(heatColor(0, 'blues'));
    const high = channels(heatColor(1, 'blues'));
    // The light end is near-white (channels sum high); the saturated end is a deep
    // blue, so its total is lower and its blue channel dominates its red.
    expect(low.r + low.g + low.b).toBeGreaterThan(high.r + high.g + high.b);
    expect(high.b).toBeGreaterThan(high.r);
  });

  it('emphasises the green channel at the saturated end of the greens ramp', () => {
    const high = channels(heatColor(1, 'greens'));
    expect(high.g).toBeGreaterThan(high.r);
    expect(high.g).toBeGreaterThan(high.b);
  });

  it('emphasises the red channel at the saturated end of the reds ramp', () => {
    const high = channels(heatColor(1, 'reds'));
    expect(high.r).toBeGreaterThan(high.g);
    expect(high.r).toBeGreaterThan(high.b);
  });

  it('moves turbo from a cool low end to a warm high end', () => {
    const low = channels(heatColor(0, 'turbo'));
    const high = channels(heatColor(1, 'turbo'));
    // Turbo starts in the blue/purple range and ends in deep red: blue leads at the
    // bottom, red leads at the top.
    expect(low.b).toBeGreaterThan(low.r);
    expect(high.r).toBeGreaterThan(high.b);
  });

  it('clamps t below 0 to the t=0 color and above 1 to the t=1 color', () => {
    for (const scheme of HEATMAP_SCHEMES) {
      expect(heatColor(-5, scheme)).toBe(heatColor(0, scheme));
      expect(heatColor(5, scheme)).toBe(heatColor(1, scheme));
    }
  });

  it('treats a non-finite t as the floor of the ramp rather than producing NaN channels', () => {
    for (const scheme of HEATMAP_SCHEMES) {
      expect(heatColor(Number.NaN, scheme)).toBe(heatColor(0, scheme));
    }
  });
});
