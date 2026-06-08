import type { PanelDataResult } from './use-panel-data';

import { describe, expect, it } from 'vitest';

import { heatmapGrid, heatmapSamples } from './heatmap-data';

// Build a Prometheus matrix response (the shape usePanelData returns for a range
// query). Values are stringified the way the wire format delivers them.
const matrix = (rows: { metric: Record<string, string>; values: [number, number][] }[]): PanelDataResult[] => [
  {
    status: 'success',
    data: { resultType: 'matrix', result: rows.map(r => ({ metric: r.metric, values: r.values.map(([t, v]): [number, string] => [t, String(v)]) })) },
  },
];

// An instant vector carries a single `value` tuple rather than a `values` array.
const vector = (rows: { metric: Record<string, string>; value: [number, number] }[]): PanelDataResult[] => [
  {
    status: 'success',
    data: { resultType: 'vector', result: rows.map(r => ({ metric: r.metric, value: [r.value[0], String(r.value[1])] })) },
  },
];

// Sum every cell count — total points placed must equal the finite sample count.
const totalCount = (cells: { count: number }[]): number => cells.reduce((sum, c) => sum + c.count, 0);

// Find the count at a given bucket coordinate (0 when the cell is absent/empty).
const countAt = (cells: { x: number; y: number; count: number }[], x: number, y: number): number => cells.find(c => c.x === x && c.y === y)?.count ?? 0;

describe('heatmapSamples', () => {
  it('returns an empty list for null/undefined data', () => {
    const missing: PanelDataResult[] | undefined = undefined;
    expect(heatmapSamples(null)).toEqual([]);
    expect(heatmapSamples(missing)).toEqual([]);
  });

  it('flattens every matrix sample across all series into [time, value] pairs', () => {
    const samples = heatmapSamples(
      matrix([
        {
          metric: { __name__: 'a' },
          values: [
            [1, 10],
            [2, 20],
          ],
        },
        { metric: { __name__: 'b' }, values: [[1, 5]] },
      ]),
    );
    expect(samples).toEqual([
      [1, 10],
      [2, 20],
      [1, 5],
    ]);
  });

  it('reads the instant value tuple of a vector series', () => {
    const samples = heatmapSamples(vector([{ metric: { __name__: 'a' }, value: [3, 42] }]));
    expect(samples).toEqual([[3, 42]]);
  });

  it('drops samples whose value or time is not finite', () => {
    const samples = heatmapSamples(
      matrix([
        {
          metric: { __name__: 'a' },
          values: [
            [1, 10],
            [2, Number.NaN],
          ],
        },
      ]),
    );
    expect(samples).toEqual([[1, 10]]);
  });
});

describe('heatmapGrid', () => {
  it('returns an empty grid for no samples', () => {
    expect(heatmapGrid([], { xBuckets: 10, yBuckets: 5 })).toEqual({ xEdges: [], yEdges: [], cells: [], maxCount: 0 });
  });

  it('places a single sample into one cell with the full bucket grid', () => {
    const grid = heatmapGrid([[5, 50]], { xBuckets: 4, yBuckets: 3 });
    // A single point has a degenerate domain on both axes, so it collapses to a 1x1
    // grid holding that one sample.
    expect(grid.cells).toEqual([{ x: 0, y: 0, count: 1 }]);
    expect(grid.maxCount).toBe(1);
    expect(grid.xEdges).toEqual([5, 5]);
    expect(grid.yEdges).toEqual([50, 50]);
  });

  it('builds xBuckets+1 / yBuckets+1 edges spanning the data domain', () => {
    const grid = heatmapGrid(
      [
        [0, 0],
        [10, 100],
      ],
      { xBuckets: 2, yBuckets: 4 },
    );
    expect(grid.xEdges).toEqual([0, 5, 10]);
    expect(grid.yEdges).toEqual([0, 25, 50, 75, 100]);
  });

  it('bins samples into the right cell and counts per cell', () => {
    // x domain [0,10] / 2 buckets -> width 5, columns [0,5) and [5,10].
    // y domain [0,10] / 2 buckets -> width 5, rows [0,5) and [5,10].
    const grid = heatmapGrid(
      [
        [0, 0], // col 0, row 0
        [1, 1], // col 0, row 0
        [6, 2], // col 1, row 0
        [2, 7], // col 0, row 1
      ],
      { xBuckets: 2, yBuckets: 2 },
    );
    expect(totalCount(grid.cells)).toBe(4);
    expect(countAt(grid.cells, 0, 0)).toBe(2);
    expect(countAt(grid.cells, 1, 0)).toBe(1);
    expect(countAt(grid.cells, 0, 1)).toBe(1);
    expect(grid.maxCount).toBe(2);
  });

  it('clamps the max value/time to the last bin instead of overflowing one past the end (off-by-one)', () => {
    // Both the max time (10) and max value (10) would floor to index 2 (one past the
    // last bin); they must clamp into the final column/row.
    const grid = heatmapGrid(
      [
        [0, 0],
        [10, 10],
      ],
      { xBuckets: 2, yBuckets: 2 },
    );
    expect(totalCount(grid.cells)).toBe(2);
    expect(countAt(grid.cells, 0, 0)).toBe(1); // min sample, first cell
    expect(countAt(grid.cells, 1, 1)).toBe(1); // max sample, last cell (clamped)
  });

  it('collapses a degenerate y-domain (all same value) into a single row without dividing by zero', () => {
    const grid = heatmapGrid(
      [
        [0, 7],
        [5, 7],
        [10, 7],
      ],
      { xBuckets: 2, yBuckets: 5 },
    );
    // One row only; every cell sits at y=0. x still spreads across its buckets.
    expect(grid.yEdges).toEqual([7, 7]);
    expect(grid.cells.every(c => c.y === 0)).toBe(true);
    expect(totalCount(grid.cells)).toBe(3);
    expect(grid.maxCount).toBeGreaterThanOrEqual(1);
  });

  it('collapses a degenerate x-domain (all same time) into a single column without dividing by zero', () => {
    const grid = heatmapGrid(
      [
        [4, 0],
        [4, 5],
        [4, 10],
      ],
      { xBuckets: 5, yBuckets: 2 },
    );
    expect(grid.xEdges).toEqual([4, 4]);
    expect(grid.cells.every(c => c.x === 0)).toBe(true);
    expect(totalCount(grid.cells)).toBe(3);
  });

  it('keeps both axes degenerate when every sample is identical', () => {
    const grid = heatmapGrid(
      [
        [3, 9],
        [3, 9],
      ],
      { xBuckets: 8, yBuckets: 8 },
    );
    expect(grid.cells).toEqual([{ x: 0, y: 0, count: 2 }]);
    expect(grid.maxCount).toBe(2);
  });

  it('merges samples from multiple series into the same grid', () => {
    const samples = heatmapSamples(
      matrix([
        {
          metric: { __name__: 'a' },
          values: [
            [0, 0],
            [10, 10],
          ],
        },
        {
          metric: { __name__: 'b' },
          values: [
            [0, 0],
            [5, 5],
          ],
        },
      ]),
    );
    const grid = heatmapGrid(samples, { xBuckets: 2, yBuckets: 2 });
    expect(totalCount(grid.cells)).toBe(4);
    // Both (0,0) samples share the first cell.
    expect(countAt(grid.cells, 0, 0)).toBe(2);
  });

  it('emits only non-empty cells', () => {
    // A sparse pair leaves most of a 5x5 grid empty; only the two occupied cells appear.
    const grid = heatmapGrid(
      [
        [0, 0],
        [10, 10],
      ],
      { xBuckets: 5, yBuckets: 5 },
    );
    expect(grid.cells).toHaveLength(2);
    expect(grid.cells.every(c => c.count > 0)).toBe(true);
  });
});
