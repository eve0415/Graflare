import type { AdhocFilter, AdhocOperator, Variable } from '@graflare/shared/schemas/variable';

import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { labelValuesQueryOptions, labelsQueryOptions } from '../../-root/introspection-queries';

const OPERATORS: AdhocOperator[] = ['=', '!=', '=~', '!~'];
const OPERATOR_SET = new Set<string>(OPERATORS);
const OPERATOR_ITEMS = OPERATORS.map(op => ({ value: op, label: op }));

const isAdhocOperator = (value: string | null): value is AdhocOperator => value !== null && OPERATOR_SET.has(value);

// A regex operator wants a free-text value (e.g. `prod|staging`), so the value control falls back
// to a plain input for `=~`/`!~`; equality operators offer the label's known values as a dropdown.
const isRegexOperator = (op: AdhocOperator): boolean => op === '=~' || op === '!~';

interface AdhocFilterRowProps {
  /** The adhoc variable this row belongs to (carries the live filters + datasource scope). */
  variable: Variable;
  onFiltersChange: (name: string, filters: AdhocFilter[]) => void;
}

/**
 * The control for one `adhoc` template variable: a label, its current filters rendered as editable
 * `{key} {op} {value}` segments (each a Select, value free-text for regex), and a "+" to add a new
 * filter. Key/value options come from the variable's OWN datasource via the labels / label-values
 * introspection — so an adhoc variable with no datasource offers no suggestions and stays inert,
 * matching how the injection engine scopes filters by datasource.
 */
export const AdhocFilterRow = ({ variable, onFiltersChange }: AdhocFilterRowProps) => {
  const datasourceId = variable.datasourceId ?? '';
  const { filters } = variable;
  const label = variable.label || variable.name;

  const labelsQuery = useQuery(labelsQueryOptions(datasourceId));
  const labelItems = useMemo(() => (labelsQuery.data?.labels ?? []).map(l => ({ value: l, label: l })), [labelsQuery.data?.labels]);
  const labelsError = labelsQuery.data?.error !== undefined;

  const handleChangeAt = useCallback(
    (index: number, filter: AdhocFilter) => {
      onFiltersChange(
        variable.name,
        filters.map((f, i) => (i === index ? filter : f)),
      );
    },
    [variable.name, filters, onFiltersChange],
  );

  const handleRemoveAt = useCallback(
    (index: number) => {
      onFiltersChange(
        variable.name,
        filters.filter((_, i) => i !== index),
      );
    },
    [variable.name, filters, onFiltersChange],
  );

  const handleAdd = useCallback(() => {
    // Seed the key from the first known label so the value dropdown has something to resolve;
    // empty when introspection has nothing (the user can still pick once labels load).
    const firstKey = labelItems[0]?.value ?? '';
    onFiltersChange(variable.name, [...filters, { key: firstKey, operator: '=', value: '' }]);
  }, [variable.name, filters, labelItems, onFiltersChange]);

  return (
    <div className='flex items-center gap-1.5'>
      <span className='text-muted-foreground text-xs'>{label}:</span>
      {/* The <ul> is the labelled group of filters; its implicit list role needs no `role` attr. */}
      <ul className='flex flex-wrap items-center gap-1.5' aria-label={`Ad hoc filters: ${label}`}>
        {filters.map((filter, index) => (
          <IndexedFilterSegment
            key={`${String(index)}:${filter.key}`}
            index={index}
            filter={filter}
            datasourceId={datasourceId}
            labelItems={labelItems}
            labelsError={labelsError}
            onChange={handleChangeAt}
            onRemove={handleRemoveAt}
          />
        ))}
      </ul>
      <Button variant='ghost' size='icon-sm' onClick={handleAdd} aria-label={`Add filter to ${label}`}>
        <Plus className='h-3.5 w-3.5' />
      </Button>
    </div>
  );
};

interface IndexedFilterSegmentProps {
  index: number;
  filter: AdhocFilter;
  datasourceId: string;
  labelItems: { value: string; label: string }[];
  labelsError: boolean;
  onChange: (index: number, filter: AdhocFilter) => void;
  onRemove: (index: number) => void;
}

// Binds a single filter's editor to its index so the callbacks handed to the Selects stay stable
// across re-renders (react-perf): the parent's array-level handlers receive the index here.
const IndexedFilterSegment = ({ index, filter, datasourceId, labelItems, labelsError, onChange, onRemove }: IndexedFilterSegmentProps) => {
  const handleChange = useCallback(
    (next: AdhocFilter) => {
      onChange(index, next);
    },
    [index, onChange],
  );

  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  return (
    <li>
      <FilterSegment
        filter={filter}
        datasourceId={datasourceId}
        labelItems={labelItems}
        labelsError={labelsError}
        onChange={handleChange}
        onRemove={handleRemove}
      />
    </li>
  );
};

interface FilterSegmentProps {
  filter: AdhocFilter;
  datasourceId: string;
  labelItems: { value: string; label: string }[];
  labelsError: boolean;
  onChange: (filter: AdhocFilter) => void;
  onRemove: () => void;
}

// One `[key | op | value (x)]` pill: three compact segments + a remove button, visually grouped in
// a bordered container (the closest the codebase's Base UI Select gets to Grafana's segmented
// adhoc chip). Key/value fall back to a free-text Input when introspection errors; the value is
// also free-text for regex operators so `=~ "prod|staging"` is expressible.
const FilterSegment = ({ filter, datasourceId, labelItems, labelsError, onChange, onRemove }: FilterSegmentProps) => {
  const valuesQuery = useQuery(labelValuesQueryOptions(datasourceId, filter.key));
  const valueItems = useMemo(() => (valuesQuery.data?.values ?? []).map(v => ({ value: v, label: v })), [valuesQuery.data?.values]);
  const valuesError = valuesQuery.data?.error !== undefined;
  const useValueInput = valuesError || isRegexOperator(filter.operator);

  const handleKeyInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...filter, key: e.target.value });
    },
    [filter, onChange],
  );
  const handleKeySelect = useCallback(
    (key: string | null) => {
      if (key !== null) onChange({ ...filter, key });
    },
    [filter, onChange],
  );
  const handleOperator = useCallback(
    (op: string | null) => {
      if (isAdhocOperator(op)) onChange({ ...filter, operator: op });
    },
    [filter, onChange],
  );
  const handleValueInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...filter, value: e.target.value });
    },
    [filter, onChange],
  );
  const handleValueSelect = useCallback(
    (value: string | null) => {
      if (value !== null) onChange({ ...filter, value });
    },
    [filter, onChange],
  );

  const chipLabel = `${filter.key} ${filter.operator} ${filter.value}`;

  return (
    <div className='flex items-center gap-1 rounded-md border px-1 py-0.5'>
      {labelsError ? (
        <Input value={filter.key} onChange={handleKeyInput} placeholder='label' className='h-6 w-28 text-xs' aria-label='Filter key' />
      ) : (
        <Select value={filter.key} onValueChange={handleKeySelect} items={labelItems}>
          <SelectTrigger className='h-6 w-28 text-xs' aria-label='Filter key'>
            <SelectValue placeholder='label' />
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

      <Select value={filter.operator} onValueChange={handleOperator} items={OPERATOR_ITEMS}>
        <SelectTrigger className='h-6 w-14 text-xs' aria-label='Filter operator'>
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

      {useValueInput ? (
        <Input value={filter.value} onChange={handleValueInput} placeholder='value' className='h-6 w-32 text-xs' aria-label='Filter value' />
      ) : (
        <Select value={filter.value} onValueChange={handleValueSelect} items={valueItems}>
          <SelectTrigger className='h-6 w-32 text-xs' aria-label='Filter value'>
            <SelectValue placeholder='value' />
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

      <Button variant='ghost' size='icon-xs' onClick={onRemove} aria-label={`Remove filter ${chipLabel}`}>
        <X className='h-3 w-3' />
      </Button>
    </div>
  );
};
