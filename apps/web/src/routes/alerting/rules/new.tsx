import { Button } from '@graflare/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@graflare/ui/components/card';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { createAlertRule } from '../-api';
import { alertRuleGroupsQueryOptions } from '../-queries';

type ConditionReducer = 'last' | 'avg' | 'min' | 'max' | 'sum' | 'count';
type ConditionOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq';
type NoDataState = 'Alerting' | 'OK' | 'KeepLastState';
type ExecErrState = 'Alerting' | 'KeepLastState';

interface AlertQuery {
  refId: string;
  datasourceId: string;
  expr: string;
  legendFormat: string;
}

interface FormState {
  groupId: string;
  title: string;
  queries: AlertQuery[];
  conditionRefId: string;
  conditionReducer: ConditionReducer;
  conditionOperator: ConditionOperator;
  conditionThreshold: string;
  forDurationS: string;
  noDataState: NoDataState;
  execErrState: ExecErrState;
  labels: { key: string; value: string }[];
  annotations: { key: string; value: string }[];
}

const isConditionReducer = (v: string): v is ConditionReducer => v === 'last' || v === 'avg' || v === 'min' || v === 'max' || v === 'sum' || v === 'count';

const isConditionOperator = (v: string): v is ConditionOperator => v === 'gt' || v === 'lt' || v === 'gte' || v === 'lte' || v === 'eq' || v === 'neq';

const isNoDataState = (v: string): v is NoDataState => v === 'Alerting' || v === 'OK' || v === 'KeepLastState';

const isExecErrState = (v: string): v is ExecErrState => v === 'Alerting' || v === 'KeepLastState';

const REDUCER_OPTIONS = [
  { value: 'last', label: 'Last' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'sum', label: 'Sum' },
  { value: 'count', label: 'Count' },
] as const;

const OPERATOR_OPTIONS = [
  { value: 'gt', label: 'Greater than' },
  { value: 'lt', label: 'Less than' },
  { value: 'gte', label: 'Greater or equal' },
  { value: 'lte', label: 'Less or equal' },
  { value: 'eq', label: 'Equal' },
  { value: 'neq', label: 'Not equal' },
] as const;

const NO_DATA_STATE_OPTIONS = [
  { value: 'Alerting', label: 'Alerting' },
  { value: 'OK', label: 'OK' },
  { value: 'KeepLastState', label: 'Keep Last State' },
] as const;

const EXEC_ERR_STATE_OPTIONS = [
  { value: 'Alerting', label: 'Alerting' },
  { value: 'KeepLastState', label: 'Keep Last State' },
] as const;

const QueryRow = ({
  query,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  query: AlertQuery;
  index: number;
  canRemove: boolean;
  onChange: (index: number, field: keyof AlertQuery, value: string) => void;
  onRemove: (index: number) => void;
}) => {
  const handleDsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(index, 'datasourceId', e.target.value);
    },
    [index, onChange],
  );
  const handleExprChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(index, 'expr', e.target.value);
    },
    [index, onChange],
  );
  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  return (
    <div className='space-y-2 rounded-md border p-3'>
      <div className='flex items-center justify-between'>
        <span className='text-sm font-medium'>{query.refId}</span>
        {canRemove && (
          <Button type='button' variant='ghost' size='xs' onClick={handleRemove}>
            <Trash2 className='h-3 w-3' />
          </Button>
        )}
      </div>
      <div className='space-y-2'>
        <Label htmlFor={`ds-${query.refId}`}>Datasource ID</Label>
        <Input id={`ds-${query.refId}`} value={query.datasourceId} onChange={handleDsChange} placeholder='Datasource UUID' />
      </div>
      <div className='space-y-2'>
        <Label htmlFor={`expr-${query.refId}`}>Expression</Label>
        <Input id={`expr-${query.refId}`} value={query.expr} onChange={handleExprChange} placeholder='up{job="prometheus"}' />
      </div>
    </div>
  );
};

const KvRow = ({
  index,
  keyValue,
  valueValue,
  onChange,
  onRemove,
}: {
  index: number;
  keyValue: string;
  valueValue: string;
  onChange: (index: number, field: 'key' | 'value', value: string) => void;
  onRemove: (index: number) => void;
}) => {
  const handleKeyChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(index, 'key', e.target.value);
    },
    [index, onChange],
  );
  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(index, 'value', e.target.value);
    },
    [index, onChange],
  );
  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  return (
    <div className='flex items-center gap-2'>
      <Input value={keyValue} onChange={handleKeyChange} placeholder='Key' className='flex-1' />
      <Input value={valueValue} onChange={handleValueChange} placeholder='Value' className='flex-1' />
      <Button type='button' variant='ghost' size='xs' onClick={handleRemove}>
        <Trash2 className='h-3 w-3' />
      </Button>
    </div>
  );
};

const NewAlertRuleSkeleton = () => (
  <div className='space-y-4'>
    <Skeleton className='h-8 w-64' />
    <Skeleton className='h-96 w-full rounded-lg' />
  </div>
);

const NewAlertRulePage = () => {
  const navigate = useNavigate();
  const { data: groups } = useSuspenseQuery(alertRuleGroupsQueryOptions());
  const groupItems = useMemo(() => groups.map(g => ({ value: g.id, label: g.name })), [groups]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({
    groupId: '',
    title: '',
    queries: [{ refId: 'A', datasourceId: '', expr: '', legendFormat: '' }],
    conditionRefId: 'A',
    conditionReducer: 'last',
    conditionOperator: 'gt',
    conditionThreshold: '0',
    forDurationS: '0',
    noDataState: 'Alerting',
    execErrState: 'Alerting',
    labels: [],
    annotations: [],
  });

  const queryRefItems = useMemo(() => form.queries.map(q => ({ value: q.refId, label: q.refId })), [form.queries]);

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      const run = async () => {
        setSubmitting(true);
        try {
          const labels: Record<string, string> = {};
          for (const l of form.labels) {
            if (l.key.trim() !== '') labels[l.key.trim()] = l.value;
          }
          const annotations: Record<string, string> = {};
          for (const a of form.annotations) {
            if (a.key.trim() !== '') annotations[a.key.trim()] = a.value;
          }
          await createAlertRule({
            data: {
              groupId: form.groupId,
              title: form.title,
              queries: form.queries.map(q => ({
                refId: q.refId,
                datasourceId: q.datasourceId,
                expr: q.expr,
                legendFormat: q.legendFormat,
              })),
              condition: {
                refId: form.conditionRefId,
                reducer: form.conditionReducer,
                operator: form.conditionOperator,
                threshold: Number(form.conditionThreshold),
              },
              forDurationS: Number(form.forDurationS),
              noDataState: form.noDataState,
              execErrState: form.execErrState,
              labels,
              annotations,
            },
          });
          await navigate({ to: '/alerting/rules' });
        } finally {
          setSubmitting(false);
        }
      };
      void run();
    },
    [form, navigate],
  );

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, title: value }));
  }, []);

  const handleGroupChange = useCallback((value: string | null) => {
    if (value !== null) setForm(prev => ({ ...prev, groupId: value }));
  }, []);

  const handleQueryChange = useCallback((index: number, field: keyof AlertQuery, value: string) => {
    setForm(prev => ({
      ...prev,
      queries: prev.queries.map((q, i) => (i === index ? { ...q, [field]: value } : q)),
    }));
  }, []);

  const handleAddQuery = useCallback(() => {
    setForm(prev => {
      const nextRef = String.fromCodePoint(65 + prev.queries.length);
      return { ...prev, queries: [...prev.queries, { refId: nextRef, datasourceId: '', expr: '', legendFormat: '' }] };
    });
  }, []);

  const handleRemoveQuery = useCallback((index: number) => {
    setForm(prev => ({ ...prev, queries: prev.queries.filter((_, i) => i !== index) }));
  }, []);

  const handleConditionReducerChange = useCallback((value: string | null) => {
    if (value !== null && isConditionReducer(value)) setForm(prev => ({ ...prev, conditionReducer: value }));
  }, []);

  const handleConditionOperatorChange = useCallback((value: string | null) => {
    if (value !== null && isConditionOperator(value)) setForm(prev => ({ ...prev, conditionOperator: value }));
  }, []);

  const handleConditionThresholdChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, conditionThreshold: value }));
  }, []);

  const handleConditionRefIdChange = useCallback((value: string | null) => {
    if (value !== null) setForm(prev => ({ ...prev, conditionRefId: value }));
  }, []);

  const handleForDurationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, forDurationS: value }));
  }, []);

  const handleNoDataStateChange = useCallback((value: string | null) => {
    if (value !== null && isNoDataState(value)) setForm(prev => ({ ...prev, noDataState: value }));
  }, []);

  const handleExecErrStateChange = useCallback((value: string | null) => {
    if (value !== null && isExecErrState(value)) setForm(prev => ({ ...prev, execErrState: value }));
  }, []);

  const handleAddLabel = useCallback(() => {
    setForm(prev => ({ ...prev, labels: [...prev.labels, { key: '', value: '' }] }));
  }, []);

  const handleRemoveLabel = useCallback((index: number) => {
    setForm(prev => ({ ...prev, labels: prev.labels.filter((_, i) => i !== index) }));
  }, []);

  const handleLabelChange = useCallback((index: number, field: 'key' | 'value', value: string) => {
    setForm(prev => ({ ...prev, labels: prev.labels.map((l, i) => (i === index ? { ...l, [field]: value } : l)) }));
  }, []);

  const handleAddAnnotation = useCallback(() => {
    setForm(prev => ({ ...prev, annotations: [...prev.annotations, { key: '', value: '' }] }));
  }, []);

  const handleRemoveAnnotation = useCallback((index: number) => {
    setForm(prev => ({ ...prev, annotations: prev.annotations.filter((_, i) => i !== index) }));
  }, []);

  const handleAnnotationChange = useCallback((index: number, field: 'key' | 'value', value: string) => {
    setForm(prev => ({ ...prev, annotations: prev.annotations.map((a, i) => (i === index ? { ...a, [field]: value } : a)) }));
  }, []);

  const handleCancel = useCallback(() => {
    void navigate({ to: '/alerting/rules' });
  }, [navigate]);

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>New Alert Rule</CardTitle>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='space-y-2'>
            <Label htmlFor='group'>Rule Group</Label>
            <Select value={form.groupId} onValueChange={handleGroupChange} items={groupItems}>
              <SelectTrigger id='group'>
                <SelectValue placeholder='Select a group' />
              </SelectTrigger>
              <SelectContent>
                {groupItems.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='title'>Title</Label>
            <Input id='title' value={form.title} onChange={handleTitleChange} placeholder='High CPU usage' required />
          </div>

          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <Label>Queries</Label>
              <Button type='button' variant='outline' size='sm' onClick={handleAddQuery}>
                <Plus className='mr-1 h-3 w-3' />
                Add Query
              </Button>
            </div>
            {form.queries.map((q, i) => (
              <QueryRow key={q.refId} query={q} index={i} canRemove={form.queries.length > 1} onChange={handleQueryChange} onRemove={handleRemoveQuery} />
            ))}
          </div>

          <div className='space-y-3'>
            <Label>Condition</Label>
            <div className='grid grid-cols-4 gap-3'>
              <div className='space-y-1'>
                <Label htmlFor='condRef' className='text-xs'>
                  Query
                </Label>
                <Select value={form.conditionRefId} onValueChange={handleConditionRefIdChange} items={queryRefItems}>
                  <SelectTrigger id='condRef'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {queryRefItems.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1'>
                <Label htmlFor='reducer' className='text-xs'>
                  Reducer
                </Label>
                <Select value={form.conditionReducer} onValueChange={handleConditionReducerChange} items={REDUCER_OPTIONS}>
                  <SelectTrigger id='reducer'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REDUCER_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1'>
                <Label htmlFor='operator' className='text-xs'>
                  Operator
                </Label>
                <Select value={form.conditionOperator} onValueChange={handleConditionOperatorChange} items={OPERATOR_OPTIONS}>
                  <SelectTrigger id='operator'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATOR_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1'>
                <Label htmlFor='threshold' className='text-xs'>
                  Threshold
                </Label>
                <Input id='threshold' type='number' value={form.conditionThreshold} onChange={handleConditionThresholdChange} />
              </div>
            </div>
          </div>

          <div className='grid grid-cols-3 gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='forDuration'>Pending period (seconds)</Label>
              <Input id='forDuration' type='number' min={0} max={86400} value={form.forDurationS} onChange={handleForDurationChange} />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='noData'>No data state</Label>
              <Select value={form.noDataState} onValueChange={handleNoDataStateChange} items={NO_DATA_STATE_OPTIONS}>
                <SelectTrigger id='noData'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NO_DATA_STATE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='execErr'>Error state</Label>
              <Select value={form.execErrState} onValueChange={handleExecErrStateChange} items={EXEC_ERR_STATE_OPTIONS}>
                <SelectTrigger id='execErr'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXEC_ERR_STATE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <Label>Labels</Label>
              <Button type='button' variant='outline' size='sm' onClick={handleAddLabel}>
                <Plus className='mr-1 h-3 w-3' />
                Add Label
              </Button>
            </div>
            {form.labels.map((l, i) => (
              <KvRow key={i} index={i} keyValue={l.key} valueValue={l.value} onChange={handleLabelChange} onRemove={handleRemoveLabel} />
            ))}
          </div>

          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <Label>Annotations</Label>
              <Button type='button' variant='outline' size='sm' onClick={handleAddAnnotation}>
                <Plus className='mr-1 h-3 w-3' />
                Add Annotation
              </Button>
            </div>
            {form.annotations.map((a, i) => (
              <KvRow key={i} index={i} keyValue={a.key} valueValue={a.value} onChange={handleAnnotationChange} onRemove={handleRemoveAnnotation} />
            ))}
          </div>
        </CardContent>
        <CardFooter className='flex gap-2'>
          <Button type='submit' disabled={submitting || form.title.trim() === '' || form.groupId === ''}>
            {submitting ? 'Creating...' : 'Create Alert Rule'}
          </Button>
          <Button type='button' variant='outline' onClick={handleCancel}>
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
};

export const Route = createFileRoute('/alerting/rules/new')({
  loader: ({ context }) => context.queryClient.ensureQueryData(alertRuleGroupsQueryOptions()),
  pendingComponent: NewAlertRuleSkeleton,
  component: NewAlertRulePage,
});
