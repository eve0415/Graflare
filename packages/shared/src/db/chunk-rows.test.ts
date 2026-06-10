import { describe, expect, it } from 'vitest';

import { D1_MAX_BOUND_PARAMS, chunkRowsForD1 } from './chunk-rows';

// A 9-column row (the metrics / annotations shape) → floor(100/9) = 11 rows per chunk.
const row9 = (n: number): Record<string, number> => ({ a: n, b: n, c: n, d: n, e: n, f: n, g: n, h: n, i: n });

describe('chunkRowsForD1', () => {
  it('exposes D1 100-bound-param ceiling', () => {
    expect(D1_MAX_BOUND_PARAMS).toBe(100);
  });

  it('returns no chunks for an empty input', () => {
    expect(chunkRowsForD1([], 9)).toEqual([]);
  });

  it('keeps rows in a single chunk when they fit under the param ceiling', () => {
    const rows = Array.from({ length: 5 }, (_, n) => row9(n));
    expect(chunkRowsForD1(rows, 9)).toEqual([rows]);
  });

  it('keeps a chunk exactly at the param ceiling whole (11 rows × 9 cols = 99 ≤ 100)', () => {
    const rows = Array.from({ length: 11 }, (_, n) => row9(n));
    const chunks = chunkRowsForD1(rows, 9);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(11);
  });

  it('splits one row past the ceiling into a second chunk (12 rows → 11 + 1)', () => {
    const rows = Array.from({ length: 12 }, (_, n) => row9(n));
    const chunks = chunkRowsForD1(rows, 9);
    expect(chunks.map(c => c.length)).toEqual([11, 1]);
  });

  it('splits a large array into ceiling-sized chunks preserving order and content', () => {
    const rows = Array.from({ length: 25 }, (_, n) => row9(n));
    const chunks = chunkRowsForD1(rows, 9);
    expect(chunks.map(c => c.length)).toEqual([11, 11, 3]);
    // flattening the chunks reproduces the original array, in order
    expect(chunks.flat()).toEqual(rows);
  });

  it('derives chunk size from the column count (2 cols → 50/chunk)', () => {
    const rows = Array.from({ length: 120 }, (_, n) => ({ a: n, b: n }));
    const chunks = chunkRowsForD1(rows, 2);
    expect(chunks.map(c => c.length)).toEqual([50, 50, 20]);
  });

  it('allows a single row per chunk at exactly 100 columns', () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 100; i++) wide[`c${String(i)}`] = i;
    const chunks = chunkRowsForD1([wide, wide], 100);
    expect(chunks.map(c => c.length)).toEqual([1, 1]);
  });

  it("throws when the first row's column count drifts from the declared count", () => {
    const rows = [{ a: 1, b: 2, c: 3 }];
    expect(() => chunkRowsForD1(rows, 9)).toThrow(/3 columns, expected 9/);
  });

  it('throws when a single row would exceed the param ceiling (> 100 columns)', () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 101; i++) wide[`c${String(i)}`] = i;
    expect(() => chunkRowsForD1([wide], 101)).toThrow(/cannot chunk/);
  });

  it('throws on a non-positive or non-integer column count', () => {
    expect(() => chunkRowsForD1([row9(0)], 0)).toThrow(/positive integer/);
    expect(() => chunkRowsForD1([row9(0)], -3)).toThrow(/positive integer/);
    expect(() => chunkRowsForD1([row9(0)], 2.5)).toThrow(/positive integer/);
  });
});
