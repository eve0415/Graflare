import type { DatasourceRow } from '../../datasources/-api';
import type { NameError } from './variable-form-helpers';
import type { Variable, VariableSort, VariableType } from '@graflare/shared/schemas/variable';

import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { useCallback, useId, useMemo, useState } from 'react';

import { blankVariable, resetForType, splitCsv, validateVariable } from './variable-form-helpers';

const TYPE_OPTIONS = [
  { value: 'query', label: 'Query' },
  { value: 'custom', label: 'Custom' },
  { value: 'constant', label: 'Constant' },
  { value: 'textbox', label: 'Text box' },
  { value: 'interval', label: 'Interval' },
  { value: 'datasource', label: 'Data source' },
] as const;

const SORT_OPTIONS = [
  { value: 'disabled', label: 'Disabled' },
  { value: 'alphabetical-asc', label: 'Alphabetical (asc)' },
  { value: 'alphabetical-desc', label: 'Alphabetical (desc)' },
  { value: 'numerical-asc', label: 'Numerical (asc)' },
  { value: 'numerical-desc', label: 'Numerical (desc)' },
] as const;

const isVariableType = (v: string | null): v is VariableType =>
  v === 'query' || v === 'custom' || v === 'constant' || v === 'textbox' || v === 'interval' || v === 'datasource';

const isVariableSort = (v: string | null): v is VariableSort =>
  v === 'disabled' || v === 'alphabetical-asc' || v === 'alphabetical-desc' || v === 'numerical-asc' || v === 'numerical-desc';

const nameErrorMessage = (error: NameError): string => {
  switch (error) {
    case 'empty':
      return 'Name is required.';
    case 'invalid':
      return 'Use only letters, numbers, and underscores.';
    case 'duplicate':
      return 'A variable with this name already exists.';
  }
};

interface VariableFormProps {
  /** The variable being edited, or `undefined` to add a new one. */
  initial?: Variable | undefined;
  /** Names of the OTHER variables in the dashboard, for the uniqueness check. */
  existingNames: readonly string[];
  /** The dashboard's datasources, for the query/datasource pickers. */
  datasources: readonly DatasourceRow[];
  onSubmit: (variable: Variable) => void;
  onCancel: () => void;
}

/**
 * The add/edit form for a single dashboard template variable. Mirrors Grafana's Settings →
 * Variables editor: common fields (name, label, type) plus only the fields relevant to the chosen
 * type. Switching type preserves the common fields and resets the type-specific ones. Validation
 * (name format + uniqueness via {@link validateVariable}, then `variableSchema`) runs on submit and
 * blocks an invalid save with an inline message.
 */
export const VariableForm = ({ initial, existingNames, datasources, onSubmit, onCancel }: VariableFormProps) => {
  const [draft, setDraft] = useState<Variable>(() => initial ?? blankVariable());
  // Comma-joined mirror of `options[]` for the custom/interval text inputs, so the user can type a
  // trailing comma or spaces without the value collapsing mid-edit.
  const [optionsText, setOptionsText] = useState<string>(() => (initial?.options ?? []).join(', '));
  const [nameError, setNameError] = useState<NameError | null>(null);
  // A non-name schema failure (e.g. an over-long query/regex). Shown at the form footer so it
  // isn't mistaken for a name problem.
  const [formError, setFormError] = useState<string | null>(null);

  const nameId = useId();
  const labelId = useId();
  const queryId = useId();
  const regexId = useId();
  const valueId = useId();
  const optionsId = useId();
  const multiId = useId();
  const includeAllId = useId();
  const nameErrorId = useId();
  const formErrorId = useId();

  const dsItems = useMemo(() => datasources.map(ds => ({ value: ds.id, label: ds.name || ds.id })), [datasources]);

  const updateField = useCallback(<K extends keyof Variable>(key: K, value: Variable[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateField('name', e.target.value);
      setNameError(null);
      setFormError(null);
    },
    [updateField],
  );

  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateField('label', e.target.value);
    },
    [updateField],
  );

  const handleTypeChange = useCallback((val: string | null) => {
    if (!isVariableType(val)) return;
    setDraft(prev => resetForType(prev, val));
    setOptionsText('');
  }, []);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateField('query', e.target.value);
    },
    [updateField],
  );

  const handleRegexChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateField('regex', e.target.value);
    },
    [updateField],
  );

  const handleSortChange = useCallback(
    (val: string | null) => {
      if (isVariableSort(val)) updateField('sort', val);
    },
    [updateField],
  );

  const handleDatasourceChange = useCallback(
    (val: string | null) => {
      updateField('datasourceId', val ?? undefined);
    },
    [updateField],
  );

  const handleOptionsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setOptionsText(e.target.value);
  }, []);

  const handleMultiChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateField('multi', e.currentTarget.checked);
    },
    [updateField],
  );

  const handleIncludeAllChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateField('includeAll', e.currentTarget.checked);
    },
    [updateField],
  );

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      // Fold the per-type UI fields back into the schema shape before validating: custom/interval
      // choices live in `options[]`; textbox seeds both `query` and `current`.
      let candidate: Variable = draft;
      if (draft.type === 'custom' || draft.type === 'interval') {
        candidate = { ...draft, options: splitCsv(optionsText) };
      } else if (draft.type === 'textbox') {
        candidate = { ...draft, current: draft.query };
      }

      const result = validateVariable(candidate, existingNames);
      if (!result.ok) {
        if ('nameError' in result) {
          setNameError(result.nameError);
          setFormError(null);
        } else {
          setFormError(result.fieldError);
        }
        return;
      }
      onSubmit(result.variable);
    },
    [draft, optionsText, existingNames, onSubmit],
  );

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={draft.name}
          onChange={handleNameChange}
          placeholder='my_variable'
          aria-invalid={nameError !== null}
          aria-describedby={nameError === null ? undefined : nameErrorId}
        />
        {nameError !== null && (
          <p id={nameErrorId} role='alert' className='text-destructive text-xs'>
            {nameErrorMessage(nameError)}
          </p>
        )}
      </div>

      <div className='space-y-2'>
        <Label htmlFor={labelId}>Label</Label>
        <Input id={labelId} value={draft.label} onChange={handleLabelChange} placeholder='Display name (optional)' />
      </div>

      <div className='space-y-2'>
        <Label htmlFor={`${nameId}-type`}>Type</Label>
        <Select value={draft.type} onValueChange={handleTypeChange} items={TYPE_OPTIONS}>
          <SelectTrigger id={`${nameId}-type`} className='w-full' aria-label='Type'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {draft.type === 'query' && (
        <>
          <div className='space-y-2'>
            <Label htmlFor={`${nameId}-ds`}>Data source</Label>
            <Select value={draft.datasourceId ?? ''} onValueChange={handleDatasourceChange} items={dsItems}>
              <SelectTrigger id={`${nameId}-ds`} className='w-full' aria-label='Data source'>
                <SelectValue placeholder='Select a data source' />
              </SelectTrigger>
              <SelectContent>
                {dsItems.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor={queryId}>Query</Label>
            <Input id={queryId} value={draft.query} onChange={handleQueryChange} placeholder='label_values(up, instance)' />
          </div>

          <div className='space-y-2'>
            <Label htmlFor={regexId}>Regex</Label>
            <Input id={regexId} value={draft.regex} onChange={handleRegexChange} placeholder='/.*-(.*)/  (optional)' />
          </div>

          <div className='space-y-2'>
            <Label htmlFor={`${nameId}-sort`}>Sort</Label>
            <Select value={draft.sort} onValueChange={handleSortChange} items={SORT_OPTIONS}>
              <SelectTrigger id={`${nameId}-sort`} className='w-full' aria-label='Sort'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <MultiAndIncludeAll
            multi={draft.multi}
            includeAll={draft.includeAll}
            multiId={multiId}
            includeAllId={includeAllId}
            onMultiChange={handleMultiChange}
            onIncludeAllChange={handleIncludeAllChange}
          />
        </>
      )}

      {draft.type === 'custom' && (
        <>
          <div className='space-y-2'>
            <Label htmlFor={optionsId}>Values</Label>
            <Input id={optionsId} value={optionsText} onChange={handleOptionsChange} placeholder='value1, value2, value3' />
            <p className='text-muted-foreground text-xs'>Comma-separated list of choices.</p>
          </div>

          <MultiAndIncludeAll
            multi={draft.multi}
            includeAll={draft.includeAll}
            multiId={multiId}
            includeAllId={includeAllId}
            onMultiChange={handleMultiChange}
            onIncludeAllChange={handleIncludeAllChange}
          />
        </>
      )}

      {draft.type === 'constant' && (
        <div className='space-y-2'>
          <Label htmlFor={valueId}>Value</Label>
          <Input id={valueId} value={draft.query} onChange={handleQueryChange} placeholder='constant value' />
        </div>
      )}

      {draft.type === 'textbox' && (
        <div className='space-y-2'>
          <Label htmlFor={valueId}>Default value</Label>
          <Input id={valueId} value={draft.query} onChange={handleQueryChange} placeholder='default text (optional)' />
        </div>
      )}

      {draft.type === 'interval' && (
        <div className='space-y-2'>
          <Label htmlFor={optionsId}>Intervals</Label>
          <Input id={optionsId} value={optionsText} onChange={handleOptionsChange} placeholder='1m, 5m, 10m, 30m, 1h' />
          <p className='text-muted-foreground text-xs'>Comma-separated list of intervals.</p>
        </div>
      )}

      {draft.type === 'datasource' && (
        <>
          <div className='space-y-2'>
            <Label htmlFor={queryId}>Data source type filter</Label>
            <Input id={queryId} value={draft.query} onChange={handleQueryChange} placeholder='prometheus (optional)' />
            <p className='text-muted-foreground text-xs'>Leave blank to list every data source.</p>
          </div>

          <label htmlFor={multiId} className='flex cursor-pointer items-center gap-2 text-sm'>
            <input
              id={multiId}
              type='checkbox'
              checked={draft.multi}
              onChange={handleMultiChange}
              aria-label='Multi-value'
              className='border-input text-primary focus-visible:ring-ring/30 size-4 rounded-sm border focus-visible:ring-3 focus-visible:outline-none'
            />
            <span className='text-muted-foreground'>Multi-value</span>
          </label>
        </>
      )}

      {formError !== null && (
        <p id={formErrorId} role='alert' className='text-destructive text-xs'>
          {formError}
        </p>
      )}

      <div className='flex justify-end gap-2'>
        <Button type='button' variant='outline' onClick={onCancel}>
          Cancel
        </Button>
        <Button type='submit'>{initial === undefined ? 'Add' : 'Save'}</Button>
      </div>
    </form>
  );
};

interface MultiAndIncludeAllProps {
  multi: boolean;
  includeAll: boolean;
  multiId: string;
  includeAllId: string;
  onMultiChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onIncludeAllChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// The Multi-value + Include-All pair shared by the query and custom forms. Uses the native
// checkbox + <label htmlFor> pattern (mirroring reveal-secret-panel) for a real labelled control.
const MultiAndIncludeAll = ({ multi, includeAll, multiId, includeAllId, onMultiChange, onIncludeAllChange }: MultiAndIncludeAllProps) => (
  <div className='space-y-2'>
    <label htmlFor={multiId} className='flex cursor-pointer items-center gap-2 text-sm'>
      <input
        id={multiId}
        type='checkbox'
        checked={multi}
        onChange={onMultiChange}
        aria-label='Multi-value'
        className='border-input text-primary focus-visible:ring-ring/30 size-4 rounded-sm border focus-visible:ring-3 focus-visible:outline-none'
      />
      <span className='text-muted-foreground'>Multi-value</span>
    </label>
    <label htmlFor={includeAllId} className='flex cursor-pointer items-center gap-2 text-sm'>
      <input
        id={includeAllId}
        type='checkbox'
        checked={includeAll}
        onChange={onIncludeAllChange}
        aria-label='Include All option'
        className='border-input text-primary focus-visible:ring-ring/30 size-4 rounded-sm border focus-visible:ring-3 focus-visible:outline-none'
      />
      <span className='text-muted-foreground'>Include All option</span>
    </label>
  </div>
);
