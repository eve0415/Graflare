import type { PrometheusQueryData } from '../schemas/prometheus';

import { describe, expect, it } from 'vitest';

import { evaluateCondition } from './evaluate';

const vectorData = (metric: Record<string, string>, value: number): PrometheusQueryData => ({
  resultType: 'vector',
  result: [{ metric, value: [1000, String(value)] }],
});

const matrixData = (metric: Record<string, string>, values: number[]): PrometheusQueryData => ({
  resultType: 'matrix',
  result: [{ metric, values: values.map((v, i) => [1000 + i, String(v)]) }],
});

const multiVectorData = (series: { metric: Record<string, string>; value: number }[]): PrometheusQueryData => ({
  resultType: 'vector',
  result: series.map(s => ({ metric: s.metric, value: [1000, String(s.value)] })),
});

describe('evaluateCondition', () => {
  describe('vector results', () => {
    it('fires on gt threshold', () => {
      const results = evaluateCondition(vectorData({ job: 'api' }, 90), 'last', 'gt', 80);
      expect(results).toHaveLength(1);
      expect(results[0].firing).toBe(true);
      expect(results[0].value).toBe(90);
    });

    it('does not fire below threshold', () => {
      const results = evaluateCondition(vectorData({ job: 'api' }, 50), 'last', 'gt', 80);
      expect(results[0].firing).toBe(false);
    });

    it('handles multi-series', () => {
      const results = evaluateCondition(
        multiVectorData([
          { metric: { job: 'api' }, value: 90 },
          { metric: { job: 'web' }, value: 70 },
        ]),
        'last',
        'gt',
        80,
      );
      expect(results).toHaveLength(2);
      expect(results[0].firing).toBe(true);
      expect(results[1].firing).toBe(false);
    });
  });

  describe('matrix results', () => {
    it('reduces with last', () => {
      const results = evaluateCondition(matrixData({ job: 'api' }, [10, 20, 30]), 'last', 'gt', 25);
      expect(results[0].value).toBe(30);
      expect(results[0].firing).toBe(true);
    });

    it('reduces with avg', () => {
      const results = evaluateCondition(matrixData({ job: 'api' }, [10, 20, 30]), 'avg', 'gt', 25);
      expect(results[0].value).toBe(20);
      expect(results[0].firing).toBe(false);
    });

    it('reduces with min', () => {
      const results = evaluateCondition(matrixData({ job: 'api' }, [10, 20, 30]), 'min', 'lte', 10);
      expect(results[0].value).toBe(10);
      expect(results[0].firing).toBe(true);
    });

    it('reduces with max', () => {
      const results = evaluateCondition(matrixData({ job: 'api' }, [10, 20, 30]), 'max', 'gte', 30);
      expect(results[0].value).toBe(30);
      expect(results[0].firing).toBe(true);
    });

    it('reduces with sum', () => {
      const results = evaluateCondition(matrixData({ job: 'api' }, [10, 20, 30]), 'sum', 'eq', 60);
      expect(results[0].value).toBe(60);
      expect(results[0].firing).toBe(true);
    });

    it('reduces with count', () => {
      const results = evaluateCondition(matrixData({ job: 'api' }, [10, 20, 30]), 'count', 'eq', 3);
      expect(results[0].value).toBe(3);
      expect(results[0].firing).toBe(true);
    });
  });

  describe('operators', () => {
    it('lt', () => {
      const results = evaluateCondition(vectorData({ job: 'api' }, 5), 'last', 'lt', 10);
      expect(results[0].firing).toBe(true);
    });

    it('lte at boundary', () => {
      const results = evaluateCondition(vectorData({ job: 'api' }, 10), 'last', 'lte', 10);
      expect(results[0].firing).toBe(true);
    });

    it('gte at boundary', () => {
      const results = evaluateCondition(vectorData({ job: 'api' }, 10), 'last', 'gte', 10);
      expect(results[0].firing).toBe(true);
    });

    it('eq', () => {
      const results = evaluateCondition(vectorData({ job: 'api' }, 42), 'last', 'eq', 42);
      expect(results[0].firing).toBe(true);
    });

    it('neq', () => {
      const results = evaluateCondition(vectorData({ job: 'api' }, 42), 'last', 'neq', 43);
      expect(results[0].firing).toBe(true);
    });

    it('gt not firing at boundary', () => {
      const results = evaluateCondition(vectorData({ job: 'api' }, 80), 'last', 'gt', 80);
      expect(results[0].firing).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns empty for scalar result type', () => {
      const data: PrometheusQueryData = { resultType: 'scalar', result: [1000, '42'] };
      const results = evaluateCondition(data, 'last', 'gt', 0);
      expect(results).toHaveLength(0);
    });

    it('returns empty for string result type', () => {
      const data: PrometheusQueryData = { resultType: 'string', result: [1000, 'hello'] };
      const results = evaluateCondition(data, 'last', 'gt', 0);
      expect(results).toHaveLength(0);
    });

    it('handles NaN value', () => {
      const results = evaluateCondition(vectorData({ job: 'api' }, Number.NaN), 'last', 'gt', 0);
      expect(results[0].firing).toBe(false);
      expect(Number.isNaN(results[0].value)).toBe(true);
    });

    it('empty matrix values returns NaN', () => {
      const data: PrometheusQueryData = {
        resultType: 'matrix',
        result: [{ metric: { job: 'api' }, values: [] }],
      };
      const results = evaluateCondition(data, 'avg', 'gt', 0);
      expect(results[0].firing).toBe(false);
    });

    it('deterministic labels hash', () => {
      const results1 = evaluateCondition(vectorData({ b: '2', a: '1' }, 90), 'last', 'gt', 80);
      const results2 = evaluateCondition(vectorData({ a: '1', b: '2' }, 90), 'last', 'gt', 80);
      expect(results1[0].labelsHash).toBe(results2[0].labelsHash);
    });
  });
});
