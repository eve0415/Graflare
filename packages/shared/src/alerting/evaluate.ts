import type { ConditionOperator, ConditionReducer } from '../schemas/alerting';
import type { PrometheusQueryData } from '../schemas/prometheus';

export interface EvaluationResult {
  labelsHash: string;
  labels: Record<string, string>;
  value: number;
  firing: boolean;
}

function reduce(values: number[], reducer: ConditionReducer): number {
  if (values.length === 0) return Number.NaN;
  switch (reducer) {
    case 'last':
      return values.at(-1);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'count':
      return values.length;
  }
}

function compare(value: number, operator: ConditionOperator, threshold: number): boolean {
  switch (operator) {
    case 'gt':
      return value > threshold;
    case 'lt':
      return value < threshold;
    case 'gte':
      return value >= threshold;
    case 'lte':
      return value <= threshold;
    case 'eq':
      return value === threshold;
    case 'neq':
      return value !== threshold;
  }
}

function hashLabels(labels: Record<string, string>): string {
  const sorted = Object.keys(labels)
    .sort()
    .map(k => `${k}=${labels[k]}`)
    .join(',');
  return sorted;
}

export function evaluateCondition(
  data: PrometheusQueryData,
  reducer: ConditionReducer,
  operator: ConditionOperator,
  threshold: number,
): EvaluationResult[] {
  const results: EvaluationResult[] = [];

  if (data.resultType === 'vector') {
    if (!Array.isArray(data.result)) return results;
    for (const item of data.result) {
      if (typeof item !== 'object' || item === null) continue;
      if (!('metric' in item) || !('value' in item)) continue;
      const {metric} = item;
      const {value} = item;
      if (typeof metric !== 'object' || metric === null) continue;
      if (!Array.isArray(value) || value.length < 2) continue;
      const numVal = Number.parseFloat(String(value[1]));
      const labels = metric;
      results.push({
        labelsHash: hashLabels(labels),
        labels,
        value: numVal,
        firing: !Number.isNaN(numVal) && compare(numVal, operator, threshold),
      });
    }
  } else if (data.resultType === 'matrix') {
    if (!Array.isArray(data.result)) return results;
    for (const item of data.result) {
      if (typeof item !== 'object' || item === null) continue;
      if (!('metric' in item) || !('values' in item)) continue;
      const {metric} = item;
      const {values} = item;
      if (typeof metric !== 'object' || metric === null) continue;
      if (!Array.isArray(values)) continue;
      const numValues = values
        .map((v: unknown) => {
          if (!Array.isArray(v) || v.length < 2) return Number.NaN;
          return Number.parseFloat(String(v[1]));
        })
        .filter((n: number) => !Number.isNaN(n));
      const reduced = reduce(numValues, reducer);
      const labels = metric;
      results.push({
        labelsHash: hashLabels(labels),
        labels,
        value: reduced,
        firing: !Number.isNaN(reduced) && compare(reduced, operator, threshold),
      });
    }
  }

  return results;
}
