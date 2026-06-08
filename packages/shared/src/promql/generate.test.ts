import type { PromQLBuilderState } from './types';

import { describe, expect, it } from 'vitest';

import { generatePromQL } from './generate';

const empty: PromQLBuilderState = {
  metric: '',
  labels: [],
  functions: [],
};

describe('generatePromQL', () => {
  it('returns empty string when no metric or labels', () => {
    expect(generatePromQL(empty)).toBe('');
  });

  it('generates bare metric name', () => {
    expect(generatePromQL({ ...empty, metric: 'up' })).toBe('up');
  });

  it('generates metric with labels', () => {
    const result = generatePromQL({
      ...empty,
      metric: 'http_requests_total',
      labels: [
        { id: '1', label: 'job', operator: '=', value: 'api' },
        { id: '2', label: 'status', operator: '!=', value: '500' },
      ],
    });
    expect(result).toBe('http_requests_total{job="api", status!="500"}');
  });

  it('generates labels without metric', () => {
    const result = generatePromQL({
      ...empty,
      labels: [{ id: '1', label: 'job', operator: '=', value: 'api' }],
    });
    expect(result).toBe('{job="api"}');
  });

  it('handles regex match operators', () => {
    const result = generatePromQL({
      ...empty,
      metric: 'up',
      labels: [
        { id: '1', label: 'job', operator: '=~', value: 'api|web' },
        { id: '2', label: 'instance', operator: '!~', value: '.*test.*' },
      ],
    });
    expect(result).toBe('up{job=~"api|web", instance!~".*test.*"}');
  });

  it('skips labels with empty label name or value', () => {
    const result = generatePromQL({
      ...empty,
      metric: 'up',
      labels: [
        { id: '1', label: '', operator: '=', value: 'api' },
        { id: '2', label: 'job', operator: '=', value: '' },
        { id: '3', label: 'env', operator: '=', value: 'prod' },
      ],
    });
    expect(result).toBe('up{env="prod"}');
  });

  it('applies a single rate function', () => {
    const result = generatePromQL({
      ...empty,
      metric: 'http_requests_total',
      functions: [{ id: '1', name: 'rate', params: [{ kind: 'range', value: '5m' }] }],
    });
    expect(result).toBe('rate(http_requests_total[5m])');
  });

  it('applies rate with labels', () => {
    const result = generatePromQL({
      metric: 'http_requests_total',
      labels: [{ id: '1', label: 'job', operator: '=', value: 'api' }],
      functions: [{ id: '1', name: 'rate', params: [{ kind: 'range', value: '5m' }] }],
    });
    expect(result).toBe('rate(http_requests_total{job="api"}[5m])');
  });

  it('applies sum by after rate', () => {
    const result = generatePromQL({
      metric: 'http_requests_total',
      labels: [],
      functions: [
        { id: '1', name: 'rate', params: [{ kind: 'range', value: '5m' }] },
        { id: '2', name: 'sum', params: [{ kind: 'grouping', mode: 'by', labels: ['job'] }] },
      ],
    });
    expect(result).toBe('sum by (job)(rate(http_requests_total[5m]))');
  });

  it('nests rate inside sum with subquery form', () => {
    const result = generatePromQL({
      metric: 'http_requests_total',
      labels: [],
      functions: [
        { id: '1', name: 'sum', params: [{ kind: 'grouping', mode: 'by', labels: ['job'] }] },
        { id: '2', name: 'rate', params: [{ kind: 'range', value: '5m' }] },
      ],
    });
    expect(result).toBe('rate(sum by (job)(http_requests_total)[5m:])');
  });

  it('applies histogram_quantile with scalar', () => {
    const result = generatePromQL({
      metric: 'http_duration_bucket',
      labels: [],
      functions: [
        { id: '1', name: 'rate', params: [{ kind: 'range', value: '5m' }] },
        { id: '2', name: 'sum', params: [{ kind: 'grouping', mode: 'by', labels: ['le'] }] },
        { id: '3', name: 'histogram_quantile', params: [{ kind: 'scalar', value: '0.99' }] },
      ],
    });
    expect(result).toBe('histogram_quantile(0.99, sum by (le)(rate(http_duration_bucket[5m])))');
  });

  it('applies topk', () => {
    const result = generatePromQL({
      metric: 'up',
      labels: [],
      functions: [{ id: '1', name: 'topk', params: [{ kind: 'scalar', value: '10' }] }],
    });
    expect(result).toBe('topk(10, up)');
  });

  it('applies multiple nested functions', () => {
    const result = generatePromQL({
      metric: 'cpu_seconds_total',
      labels: [{ id: '1', label: 'mode', operator: '!=', value: 'idle' }],
      functions: [
        { id: '1', name: 'rate', params: [{ kind: 'range', value: '1m' }] },
        { id: '2', name: 'sum', params: [{ kind: 'grouping', mode: 'without', labels: ['cpu'] }] },
        { id: '3', name: 'avg', params: [{ kind: 'grouping', mode: 'by', labels: ['instance'] }] },
      ],
    });
    expect(result).toBe('avg by (instance)(sum without (cpu)(rate(cpu_seconds_total{mode!="idle"}[1m])))');
  });

  it('skips unknown function names', () => {
    const result = generatePromQL({
      ...empty,
      metric: 'up',
      functions: [{ id: '1', name: 'nonexistent', params: [] }],
    });
    expect(result).toBe('up');
  });
});
