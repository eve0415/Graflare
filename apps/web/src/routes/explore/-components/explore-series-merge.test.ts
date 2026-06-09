import type { MergeInput } from './explore-series-merge';

import { describe, expect, it } from 'vitest';

import { mergeSeries } from './explore-series-merge';

describe('mergeSeries', () => {
  it('returns an empty axis for no inputs', () => {
    expect(mergeSeries([])).toEqual({ data: [[]], labels: [] });
  });

  it('returns an empty axis when a query has no series', () => {
    expect(mergeSeries([{ refId: 'A', series: [] }])).toEqual({ data: [[]], labels: [] });
  });

  it('returns an empty axis when series carry no samples', () => {
    const inputs: MergeInput[] = [{ refId: 'A', series: [{ metric: { __name__: 'up' }, values: [] }] }];
    expect(mergeSeries(inputs)).toEqual({ data: [[]], labels: [] });
  });

  it('passes a single aligned series through unchanged (identity with old behavior)', () => {
    const inputs: MergeInput[] = [
      {
        refId: 'A',
        series: [
          {
            metric: { __name__: 'up' },
            values: [
              [100, '1'],
              [200, '2'],
              [300, '3'],
            ],
          },
        ],
      },
    ];

    const { data, labels } = mergeSeries(inputs);
    expect(data).toEqual([
      [100, 200, 300],
      [1, 2, 3],
    ]);
    expect(labels).toEqual(['A: up']);
  });

  it('builds the sorted union of timestamps across queries and fills gaps with null', () => {
    // A has 100, 300; B has 200, 300 — union is 100,200,300. Each series is null where it has
    // no sample at a union timestamp.
    const inputs: MergeInput[] = [
      {
        refId: 'A',
        series: [
          {
            metric: { __name__: 'a' },
            values: [
              [100, '10'],
              [300, '30'],
            ],
          },
        ],
      },
      {
        refId: 'B',
        series: [
          {
            metric: { __name__: 'b' },
            values: [
              [200, '20'],
              [300, '33'],
            ],
          },
        ],
      },
    ];

    const { data, labels } = mergeSeries(inputs);
    expect(data).toEqual([
      [100, 200, 300],
      [10, null, 30],
      [null, 20, 33],
    ]);
    expect(labels).toEqual(['A: a', 'B: b']);
  });

  it('sorts the union numerically, not lexicographically', () => {
    const inputs: MergeInput[] = [
      {
        refId: 'A',
        series: [
          {
            metric: { __name__: 'a' },
            values: [
              [9, '1'],
              [100, '2'],
              [20, '3'],
            ],
          },
        ],
      },
    ];

    const [timestamps] = mergeSeries(inputs).data;
    expect(timestamps).toEqual([9, 20, 100]);
  });

  it('preserves a legitimate 0 sample (uses ?? null, not || null)', () => {
    const inputs: MergeInput[] = [
      {
        refId: 'A',
        series: [
          {
            metric: { __name__: 'gauge' },
            values: [
              [100, '0'],
              [200, '5'],
            ],
          },
        ],
      },
    ];

    const { data } = mergeSeries(inputs);
    expect(data).toEqual([
      [100, 200],
      [0, 5],
    ]);
  });

  it('keeps multiple series within one query as separate value arrays, all ref-id prefixed', () => {
    const inputs: MergeInput[] = [
      {
        refId: 'A',
        series: [
          { metric: { __name__: 'cpu', host: 'h1' }, values: [[100, '1']] },
          { metric: { __name__: 'cpu', host: 'h2' }, values: [[100, '2']] },
        ],
      },
    ];

    const { data, labels } = mergeSeries(inputs);
    expect(data).toEqual([[100], [1], [2]]);
    expect(labels).toEqual(['A: cpu', 'A: cpu']);
  });

  it('falls back to a positional label when a series has no __name__', () => {
    const inputs: MergeInput[] = [
      {
        refId: 'B',
        series: [
          { metric: { job: 'api' }, values: [[100, '1']] },
          { metric: { job: 'web' }, values: [[100, '2']] },
        ],
      },
    ];

    expect(mergeSeries(inputs).labels).toEqual(['B: Series 1', 'B: Series 2']);
  });

  it('handles disjoint timestamp sets across two queries (no overlap)', () => {
    const inputs: MergeInput[] = [
      { refId: 'A', series: [{ metric: { __name__: 'a' }, values: [[100, '1']] }] },
      { refId: 'B', series: [{ metric: { __name__: 'b' }, values: [[200, '2']] }] },
    ];

    const { data } = mergeSeries(inputs);
    expect(data).toEqual([
      [100, 200],
      [1, null],
      [null, 2],
    ]);
  });

  it('treats a series with undefined values as empty', () => {
    const inputs: MergeInput[] = [
      {
        refId: 'A',
        series: [{ metric: { __name__: 'a' }, values: [[100, '1']] }, { metric: { __name__: 'b' } }],
      },
    ];

    const { data, labels } = mergeSeries(inputs);
    // 'b' contributes no timestamps; on the union [100] it is null.
    expect(data).toEqual([[100], [1], [null]]);
    expect(labels).toEqual(['A: a', 'A: b']);
  });
});
