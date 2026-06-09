import type { ResultSeries } from './series';

import { describe, expect, it } from 'vitest';

import { reduce } from './reduce';

const matrix = (values: number[]): ResultSeries => ({
  metric: { __name__: 's' },
  values: values.map((v, i): [number, string] => [i, String(v)]),
});

describe('reduce', () => {
  describe('calc semantics on a matrix series', () => {
    const series = [matrix([2, 8, 4, 6])]; // sum 20, mean 5, min 2, max 8, count 4, first 2, last 6

    it('last → the final sample', () => {
      expect(reduce(series, { calc: 'last' })[0]?.value).toEqual([0, '6']);
    });
    it('first → the initial sample', () => {
      expect(reduce(series, { calc: 'first' })[0]?.value).toEqual([0, '2']);
    });
    it('min → the smallest sample', () => {
      expect(reduce(series, { calc: 'min' })[0]?.value).toEqual([0, '2']);
    });
    it('max → the largest sample', () => {
      expect(reduce(series, { calc: 'max' })[0]?.value).toEqual([0, '8']);
    });
    it('sum → the total', () => {
      expect(reduce(series, { calc: 'sum' })[0]?.value).toEqual([0, '20']);
    });
    it('mean → the average', () => {
      expect(reduce(series, { calc: 'mean' })[0]?.value).toEqual([0, '5']);
    });
    it('count → the number of samples', () => {
      expect(reduce(series, { calc: 'count' })[0]?.value).toEqual([0, '4']);
    });
  });

  it('collapses values to a single instant value and drops the values array', () => {
    const out = reduce([matrix([1, 2, 3])], { calc: 'sum' });
    expect(out[0]?.value).toEqual([0, '6']);
    expect(out[0]?.values).toBeUndefined();
  });

  it('keeps the metric so the label and override matching are unchanged', () => {
    const out = reduce([{ metric: { __name__: 'cpu', instance: 'a' }, values: [[0, '1']] }], { calc: 'last' });
    expect(out[0]?.metric).toEqual({ __name__: 'cpu', instance: 'a' });
  });

  describe('instant (vector) series — one sample', () => {
    const instant: ResultSeries = { metric: { __name__: 's' }, value: [0, '7'] };
    it('last/first/min/max/sum/mean all equal that single value', () => {
      for (const calc of ['last', 'first', 'min', 'max', 'sum', 'mean'] as const) {
        expect(reduce([instant], { calc })[0]?.value).toEqual([0, '7']);
      }
    });
    it('count of an instant series is 1', () => {
      expect(reduce([instant], { calc: 'count' })[0]?.value).toEqual([0, '1']);
    });
  });

  describe('edge cases', () => {
    it('a series with no samples reduces to a no-value series for an aggregate', () => {
      const out = reduce([{ metric: { __name__: 's' } }], { calc: 'mean' });
      expect(out[0]?.value).toBeUndefined();
      expect(out[0]?.values).toBeUndefined();
      expect(out[0]?.metric).toEqual({ __name__: 's' });
    });

    it('count of an empty series is 0', () => {
      expect(reduce([{ metric: { __name__: 's' } }], { calc: 'count' })[0]?.value).toEqual([0, '0']);
    });

    it('non-finite samples are ignored by aggregates (NaN token dropped)', () => {
      const out = reduce(
        [
          {
            metric: {},
            values: [
              [0, '10'],
              [1, 'NaN'],
              [2, '30'],
            ],
          },
        ],
        { calc: 'sum' },
      );
      expect(out[0]?.value).toEqual([0, '40']); // NaN sample skipped
    });

    it('last returns the raw token verbatim, even a non-numeric one', () => {
      const out = reduce(
        [
          {
            metric: {},
            values: [
              [0, '1'],
              [1, 'NaN'],
            ],
          },
        ],
        { calc: 'last' },
      );
      expect(out[0]?.value).toEqual([0, 'NaN']);
    });

    it('count over raw sample slots includes non-finite tokens', () => {
      const out = reduce(
        [
          {
            metric: {},
            values: [
              [0, '1'],
              [1, 'NaN'],
              [2, '3'],
            ],
          },
        ],
        { calc: 'count' },
      );
      expect(out[0]?.value).toEqual([0, '3']);
    });

    it('an aggregate over only non-finite samples yields no value', () => {
      const out = reduce([{ metric: {}, values: [[0, 'NaN']] }], { calc: 'max' });
      expect(out[0]?.value).toBeUndefined();
    });
  });

  it('reduces every series independently', () => {
    const out = reduce(
      [
        matrix([1, 2]),
        {
          metric: { __name__: 't' },
          values: [
            [0, '10'],
            [1, '20'],
          ],
        },
      ],
      { calc: 'sum' },
    );
    expect(out).toHaveLength(2);
    expect(out[0]?.value).toEqual([0, '3']);
    expect(out[1]?.value).toEqual([0, '30']);
  });
});
