import { describe, expect, it } from 'vitest';

import { histogramBuckets } from './histogram-data';

describe('histogramBuckets', () => {
  it('returns an empty array for no values', () => {
    expect(histogramBuckets([], { bucketCount: 10 })).toEqual([]);
  });

  it('drops non-finite values before bucketing', () => {
    const buckets = histogramBuckets([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY], { bucketCount: 5 });
    expect(buckets).toEqual([]);
  });

  it('collapses a single value into one zero-width bucket', () => {
    expect(histogramBuckets([42], { bucketCount: 10 })).toEqual([{ start: 42, end: 42, count: 1 }]);
  });

  it('collapses all-equal values into one bucket holding every value', () => {
    expect(histogramBuckets([7, 7, 7, 7], { bucketCount: 8 })).toEqual([{ start: 7, end: 7, count: 4 }]);
  });

  it('derives bucketSize from bucketCount and bins each value, clamping the max to the last bin', () => {
    // min 0, max 4, range 4, bucketCount 5 -> bucketSize 0.8. The maximum (4) would
    // floor to index 5 (one past the last bin) and must clamp to index 4.
    const buckets = histogramBuckets([0, 1, 2, 3, 4], { bucketCount: 5 });
    expect(buckets).toHaveLength(5);
    expect(buckets.map(b => b.count)).toEqual([1, 1, 1, 1, 1]);
    expect(buckets[0]).toEqual({ start: 0, end: 0.8, count: 1 });
    expect(buckets[4]?.start).toBeCloseTo(3.2, 10);
    expect(buckets[4]?.end).toBeCloseTo(4, 10);
    expect(buckets[4]?.count).toBe(1);
  });

  it('counts multiple values landing in the same bin', () => {
    // min 0, max 10, bucketCount 2 -> bucketSize 5. Bins [0,5) and [5,10].
    const buckets = histogramBuckets([0, 1, 4, 5, 9, 10], { bucketCount: 2 });
    expect(buckets).toEqual([
      { start: 0, end: 5, count: 3 },
      { start: 5, end: 10, count: 3 },
    ]);
  });

  it('puts a value on a bin edge into the upper bin', () => {
    // min 0, max 10, bucketCount 2 -> bucketSize 5. The edge value 5 belongs to the
    // second bin (floor(5/5) = 1), not the first.
    const buckets = histogramBuckets([0, 5, 10], { bucketCount: 2 });
    expect(buckets[0]?.count).toBe(1);
    expect(buckets[1]?.count).toBe(2);
  });

  it('honours an explicit bucketSize over bucketCount', () => {
    // min 0, max 5, bucketSize 2 -> bins [0,2), [2,4), [4,6); bucketCount is ignored.
    const buckets = histogramBuckets([0, 1, 2, 3, 4, 5], { bucketCount: 99, bucketSize: 2 });
    expect(buckets).toEqual([
      { start: 0, end: 2, count: 2 },
      { start: 2, end: 4, count: 2 },
      { start: 4, end: 6, count: 2 },
    ]);
  });

  it('clamps the max to the last bin with an explicit bucketSize that divides the range evenly', () => {
    // min 0, max 6, bucketSize 3 -> floor(6/3) = 2 would be one past [0,3),[3,6); the
    // max (6) must clamp into the second bin.
    const buckets = histogramBuckets([0, 3, 6], { bucketCount: 20, bucketSize: 3 });
    expect(buckets).toEqual([
      { start: 0, end: 3, count: 1 },
      { start: 3, end: 6, count: 2 },
    ]);
  });

  it('falls back to the default bucketCount of 20 when neither option is given', () => {
    // 20 evenly spread values over [0,19] -> 20 bins of width ~0.95, one value each.
    const values = Array.from({ length: 20 }, (_, i) => i);
    const buckets = histogramBuckets(values, {});
    expect(buckets).toHaveLength(20);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(20);
  });

  it('handles negative ranges', () => {
    // min -10, max 10, bucketCount 2 -> bucketSize 10. Bins [-10,0) and [0,10].
    const buckets = histogramBuckets([-10, -5, 0, 5, 10], { bucketCount: 2 });
    expect(buckets).toEqual([
      { start: -10, end: 0, count: 2 },
      { start: 0, end: 10, count: 3 },
    ]);
  });

  it('ignores a non-positive explicit bucketSize and derives from bucketCount instead', () => {
    // A zero/negative bucketSize is meaningless; fall back to the bucketCount split.
    const buckets = histogramBuckets([0, 5, 10], { bucketCount: 2, bucketSize: 0 });
    expect(buckets).toHaveLength(2);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(3);
  });
});
