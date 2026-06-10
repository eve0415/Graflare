import type { FunctionApplication, FunctionParam, LabelMatcher, PromQLBuilderState } from '@graflare/shared/promql/types';
import type { Dispatch } from 'react';

import { catalogByName } from '@graflare/shared/promql/catalog';
import { Label } from '@graflare/ui/components/label';
import { useCallback } from 'react';

import { PromqlFunctionComposer } from './promql-function-composer';
import { PromqlLabelFilters } from './promql-label-filters';
import { PromqlMetricSelector } from './promql-metric-selector';

export type PromqlBuilderAction =
  | { type: 'SET_METRIC'; metric: string }
  | { type: 'ADD_LABEL' }
  | { type: 'REMOVE_LABEL'; index: number }
  | { type: 'UPDATE_LABEL'; index: number; matcher: LabelMatcher }
  | { type: 'ADD_FUNCTION'; name: string }
  | { type: 'REMOVE_FUNCTION'; index: number }
  | { type: 'REORDER_FUNCTION'; fromIndex: number; toIndex: number }
  | { type: 'UPDATE_FUNCTION_PARAM'; fnIndex: number; paramIndex: number; param: FunctionParam }
  | { type: 'RESET' };

let nextLabelId = 0;
let nextFnId = 0;

const makeDefaultParams = (name: string): FunctionParam[] => {
  const entry = catalogByName.get(name);
  if (entry === undefined) return [];
  return entry.params.map(spec => {
    if (spec.kind === 'range') return { kind: 'range' as const, value: spec.defaultValue ?? '5m' };
    if (spec.kind === 'scalar') return { kind: 'scalar' as const, value: spec.defaultValue ?? '' };
    return { kind: 'grouping' as const, mode: 'by' as const, labels: [] };
  });
};

export const promqlBuilderReducer = (state: PromQLBuilderState, action: PromqlBuilderAction): PromQLBuilderState => {
  switch (action.type) {
    case 'SET_METRIC':
      return { ...state, metric: action.metric };
    case 'ADD_LABEL':
      return {
        ...state,
        labels: [...state.labels, { id: String(++nextLabelId), label: '', operator: '=', value: '' }],
      };
    case 'REMOVE_LABEL':
      return { ...state, labels: state.labels.filter((_, i) => i !== action.index) };
    case 'UPDATE_LABEL': {
      const labels = [...state.labels];
      labels[action.index] = action.matcher;
      return { ...state, labels };
    }
    case 'ADD_FUNCTION': {
      const fn: FunctionApplication = {
        id: String(++nextFnId),
        name: action.name,
        params: makeDefaultParams(action.name),
      };
      return { ...state, functions: [...state.functions, fn] };
    }
    case 'REMOVE_FUNCTION':
      return { ...state, functions: state.functions.filter((_, i) => i !== action.index) };
    case 'REORDER_FUNCTION': {
      const fns = [...state.functions];
      const { fromIndex, toIndex } = action;
      if (toIndex < 0 || toIndex >= fns.length) return state;
      const item = fns[fromIndex];
      if (item === undefined) return state;
      fns.splice(fromIndex, 1);
      fns.splice(toIndex, 0, item);
      return { ...state, functions: fns };
    }
    case 'UPDATE_FUNCTION_PARAM': {
      const fns = [...state.functions];
      const fn = fns[action.fnIndex];
      if (fn === undefined) return state;
      const params = [...fn.params];
      params[action.paramIndex] = action.param;
      fns[action.fnIndex] = { ...fn, params };
      return { ...state, functions: fns };
    }
    case 'RESET':
      return { metric: '', labels: [], functions: [] };
  }
};

export const initialPromqlBuilderState: PromQLBuilderState = {
  metric: '',
  labels: [],
  functions: [],
};

interface PromqlBuilderProps {
  datasourceId: string;
  state: PromQLBuilderState;
  dispatch: Dispatch<PromqlBuilderAction>;
}

export const PromqlBuilder = ({ datasourceId, state, dispatch }: PromqlBuilderProps) => {
  const handleMetricChange = useCallback(
    (metric: string) => {
      dispatch({ type: 'SET_METRIC', metric });
    },
    [dispatch],
  );

  const handleAddLabel = useCallback(() => {
    dispatch({ type: 'ADD_LABEL' });
  }, [dispatch]);

  const handleRemoveLabel = useCallback(
    (index: number) => {
      dispatch({ type: 'REMOVE_LABEL', index });
    },
    [dispatch],
  );

  const handleChangeLabel = useCallback(
    (index: number, matcher: LabelMatcher) => {
      dispatch({ type: 'UPDATE_LABEL', index, matcher });
    },
    [dispatch],
  );

  const handleAddFunction = useCallback(
    (name: string) => {
      dispatch({ type: 'ADD_FUNCTION', name });
    },
    [dispatch],
  );

  const handleRemoveFunction = useCallback(
    (index: number) => {
      dispatch({ type: 'REMOVE_FUNCTION', index });
    },
    [dispatch],
  );

  const handleReorderFunction = useCallback(
    (fromIndex: number, toIndex: number) => {
      dispatch({ type: 'REORDER_FUNCTION', fromIndex, toIndex });
    },
    [dispatch],
  );

  const handleParamChange = useCallback(
    (fnIndex: number, paramIndex: number, param: FunctionParam) => {
      dispatch({ type: 'UPDATE_FUNCTION_PARAM', fnIndex, paramIndex, param });
    },
    [dispatch],
  );

  return (
    <div className='flex flex-col gap-3'>
      {/* Metric */}
      <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2'>
        <Label className='w-24 shrink-0 text-xs font-medium'>Metric</Label>
        <PromqlMetricSelector datasourceId={datasourceId} value={state.metric} onChange={handleMetricChange} />
      </div>

      {/* Labels */}
      <div className='flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2'>
        <Label className='w-24 shrink-0 text-xs font-medium sm:mt-1.5'>Labels</Label>
        <PromqlLabelFilters
          datasourceId={datasourceId}
          metric={state.metric}
          labels={state.labels}
          onAdd={handleAddLabel}
          onRemove={handleRemoveLabel}
          onChange={handleChangeLabel}
        />
      </div>

      {/* Functions */}
      <div className='flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2'>
        <Label className='w-24 shrink-0 text-xs font-medium sm:mt-1.5'>Functions</Label>
        <PromqlFunctionComposer
          functions={state.functions}
          onAdd={handleAddFunction}
          onRemove={handleRemoveFunction}
          onReorder={handleReorderFunction}
          onParamChange={handleParamChange}
        />
      </div>
    </div>
  );
};
