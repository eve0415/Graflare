import type { LabelMatchOperator, LabelMatcher } from '@graflare/shared/promql/types';

import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, XIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { labelValuesQueryOptions, labelsQueryOptions } from '../../-root/introspection-queries';

const OPERATORS: LabelMatchOperator[] = ['=', '!=', '=~', '!~'];
const OPERATOR_SET = new Set<string>(OPERATORS);

const isLabelMatchOperator = (value: string): value is LabelMatchOperator => OPERATOR_SET.has(value);

const OPERATOR_ITEMS = OPERATORS.map(op => ({ value: op, label: op }));

interface LabelRowProps {
  datasourceId: string;
  metric: string;
  matcher: LabelMatcher;
  onChange: (matcher: LabelMatcher) => void;
  onRemove: () => void;
}

const LabelRow = ({ datasourceId, metric, matcher, onChange, onRemove }: LabelRowProps) => {
  const labelsQuery = useQuery(labelsQueryOptions(datasourceId, metric));
  const valuesQuery = useQuery(labelValuesQueryOptions(datasourceId, matcher.label, metric));
  const labelItems = useMemo(() => (labelsQuery.data?.labels ?? []).map(l => ({ value: l, label: l })), [labelsQuery.data?.labels]);
  const valueItems = useMemo(() => (valuesQuery.data?.values ?? []).map(v => ({ value: v, label: v })), [valuesQuery.data?.values]);
  const labelsError = labelsQuery.data?.error !== undefined;
  const valuesError = valuesQuery.data?.error !== undefined;

  const handleLabelInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...matcher, label: e.target.value });
    },
    [matcher, onChange],
  );

  const handleLabelSelectChange = useCallback(
    (label: string | null) => {
      if (label !== null) {
        onChange({ ...matcher, label });
      }
    },
    [matcher, onChange],
  );

  const handleOperatorChange = useCallback(
    (op: string | null) => {
      if (op !== null && isLabelMatchOperator(op)) {
        onChange({ ...matcher, operator: op });
      }
    },
    [matcher, onChange],
  );

  const handleValueInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...matcher, value: e.target.value });
    },
    [matcher, onChange],
  );

  const handleValueSelectChange = useCallback(
    (value: string | null) => {
      if (value !== null) {
        onChange({ ...matcher, value });
      }
    },
    [matcher, onChange],
  );

  return (
    <div className='flex items-center gap-1.5'>
      {labelsError ? (
        <Input value={matcher.label} onChange={handleLabelInputChange} placeholder='Label' className='h-7 w-36' aria-label='Label name' />
      ) : (
        <Select value={matcher.label} onValueChange={handleLabelSelectChange} items={labelItems}>
          <SelectTrigger aria-label='Label name' className='w-36'>
            <SelectValue placeholder='Label' />
          </SelectTrigger>
          <SelectContent>
            {labelItems.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={matcher.operator} onValueChange={handleOperatorChange} items={OPERATOR_ITEMS}>
        <SelectTrigger aria-label='Match operator' className='w-16'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATOR_ITEMS.map(o => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {valuesError ? (
        <Input value={matcher.value} onChange={handleValueInputChange} placeholder='Value' className='h-7 w-40' aria-label='Label value' />
      ) : (
        <Select value={matcher.value} onValueChange={handleValueSelectChange} items={valueItems}>
          <SelectTrigger aria-label='Label value' className='w-40'>
            <SelectValue placeholder='Value' />
          </SelectTrigger>
          <SelectContent>
            {valueItems.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button variant='ghost' size='icon-xs' onClick={onRemove} aria-label='Remove label filter'>
        <XIcon />
      </Button>
    </div>
  );
};

interface IndexedLabelRowProps {
  index: number;
  datasourceId: string;
  metric: string;
  matcher: LabelMatcher;
  onChange: (index: number, matcher: LabelMatcher) => void;
  onRemove: (index: number) => void;
}

const IndexedLabelRow = ({ index, datasourceId, metric, matcher, onChange, onRemove }: IndexedLabelRowProps) => {
  const handleChange = useCallback(
    (m: LabelMatcher) => {
      onChange(index, m);
    },
    [index, onChange],
  );

  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  return <LabelRow datasourceId={datasourceId} metric={metric} matcher={matcher} onChange={handleChange} onRemove={handleRemove} />;
};

interface PromqlLabelFiltersProps {
  datasourceId: string;
  metric: string;
  labels: LabelMatcher[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, matcher: LabelMatcher) => void;
}

export const PromqlLabelFilters = ({ datasourceId, metric, labels, onAdd, onRemove, onChange }: PromqlLabelFiltersProps) => (
  <div className='flex flex-col gap-1.5'>
    {labels.map((matcher, i) => (
      <IndexedLabelRow key={matcher.id} index={i} datasourceId={datasourceId} metric={metric} matcher={matcher} onChange={onChange} onRemove={onRemove} />
    ))}
    <Button variant='ghost' size='xs' onClick={onAdd}>
      <PlusIcon data-icon='inline-start' />
      Add label filter
    </Button>
  </div>
);
