import type { FunctionParam } from './types';

export interface CatalogParamSpec {
  kind: 'range' | 'scalar' | 'grouping';
  label: string;
  defaultValue?: string;
}

export type CatalogEntryKind = 'function' | 'aggregation';

export interface CatalogEntry {
  kind: CatalogEntryKind;
  name: string;
  description: string;
  params: CatalogParamSpec[];
  requiresRange: boolean;
  render: (inner: string, params: FunctionParam[]) => string;
}

const findParam = <K extends FunctionParam['kind']>(params: FunctionParam[], kind: K): Extract<FunctionParam, { kind: K }> | undefined =>
  params.find((p): p is Extract<FunctionParam, { kind: K }> => p.kind === kind);

const renderGrouping = (params: FunctionParam[]): string => {
  const g = findParam(params, 'grouping');
  if (g === undefined || g.labels.length === 0) return '';
  return ` ${g.mode} (${g.labels.join(', ')})`;
};

const rangeFunction = (name: string, description: string): CatalogEntry => ({
  kind: 'function',
  name,
  description,
  params: [{ kind: 'range', label: 'Range', defaultValue: '5m' }],
  requiresRange: true,
  render(inner, params) {
    const range = findParam(params, 'range');
    const rv = range?.value ?? '5m';
    const hasWrapper = inner.includes('(');
    if (hasWrapper) return `${name}(${inner}[${rv}:])`;
    return `${name}(${inner}[${rv}])`;
  },
});

const simpleFunction = (name: string, description: string): CatalogEntry => ({
  kind: 'function',
  name,
  description,
  params: [],
  requiresRange: false,
  render(inner) {
    return `${name}(${inner})`;
  },
});

const aggregation = (name: string, description: string): CatalogEntry => ({
  kind: 'aggregation',
  name,
  description,
  params: [{ kind: 'grouping', label: 'Grouping' }],
  requiresRange: false,
  render(inner, params) {
    return `${name}${renderGrouping(params)}(${inner})`;
  },
});

const scalarFirstAggregation = (name: string, description: string, scalarLabel: string, defaultValue: string): CatalogEntry => ({
  kind: 'aggregation',
  name,
  description,
  params: [
    { kind: 'scalar', label: scalarLabel, defaultValue },
    { kind: 'grouping', label: 'Grouping' },
  ],
  requiresRange: false,
  render(inner, params) {
    const s = findParam(params, 'scalar');
    const sv = s?.value ?? defaultValue;
    return `${name}${renderGrouping(params)}(${sv}, ${inner})`;
  },
});

export const FUNCTION_CATALOG: CatalogEntry[] = [
  // Range functions
  rangeFunction('rate', 'Per-second average rate of increase'),
  rangeFunction('irate', 'Per-second instant rate of increase'),
  rangeFunction('increase', 'Total increase over range'),
  rangeFunction('delta', 'Difference between first and last value'),
  rangeFunction('deriv', 'Per-second derivative using linear regression'),

  // Simple functions
  simpleFunction('abs', 'Absolute value'),
  simpleFunction('ceil', 'Round up to nearest integer'),
  simpleFunction('floor', 'Round down to nearest integer'),
  {
    kind: 'function',
    name: 'round',
    description: 'Round to nearest integer or specified precision',
    params: [{ kind: 'scalar', label: 'Precision', defaultValue: '1' }],
    requiresRange: false,
    render(inner, params) {
      const s = findParam(params, 'scalar');
      if (s !== undefined && s.value !== '' && s.value !== '1') {
        return `round(${inner}, ${s.value})`;
      }
      return `round(${inner})`;
    },
  },
  {
    kind: 'function',
    name: 'clamp',
    description: 'Clamp values between min and max',
    params: [
      { kind: 'scalar', label: 'Min', defaultValue: '0' },
      { kind: 'scalar', label: 'Max', defaultValue: '1' },
    ],
    requiresRange: false,
    render(inner, params) {
      const scalars = params.filter((p): p is Extract<FunctionParam, { kind: 'scalar' }> => p.kind === 'scalar');
      const min = scalars[0]?.value ?? '0';
      const max = scalars[1]?.value ?? '1';
      return `clamp(${inner}, ${min}, ${max})`;
    },
  },
  {
    kind: 'function',
    name: 'histogram_quantile',
    description: 'Calculate quantile from histogram buckets',
    params: [{ kind: 'scalar', label: 'Quantile (φ)', defaultValue: '0.99' }],
    requiresRange: false,
    render(inner, params) {
      const s = findParam(params, 'scalar');
      const phi = s?.value ?? '0.99';
      return `histogram_quantile(${phi}, ${inner})`;
    },
  },

  // Aggregations
  aggregation('sum', 'Sum of values'),
  aggregation('avg', 'Average of values'),
  aggregation('min', 'Minimum value'),
  aggregation('max', 'Maximum value'),
  aggregation('count', 'Count of elements'),
  aggregation('stddev', 'Standard deviation'),
  aggregation('stdvar', 'Standard variance'),
  aggregation('group', 'Group elements (value 1 per group)'),

  // Scalar-first aggregations
  scalarFirstAggregation('topk', 'Top K elements by value', 'K', '10'),
  scalarFirstAggregation('bottomk', 'Bottom K elements by value', 'K', '10'),
  scalarFirstAggregation('quantile', 'Calculate quantile across dimensions', 'Quantile (φ)', '0.99'),
];

export const catalogByName = new Map(FUNCTION_CATALOG.map(e => [e.name, e]));
