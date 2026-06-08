import type { DatasourceItem } from './variable-defaults';
import type { Variable } from '@graflare/shared/schemas/variable';
import type { FocusEvent, KeyboardEvent, ReactNode } from 'react';

import { Input } from '@graflare/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useId, useMemo } from 'react';

import { datasourcesQueryOptions } from '../../datasources/-queries';

import { filterDatasourceItems } from './variable-defaults';

interface VariableBarProps {
  variables: Variable[];
  values: Map<string, string>;
  onChange: (name: string, value: string) => void;
}

export const VariableBar = ({ variables, values, onChange }: VariableBarProps) => {
  if (variables.length === 0) return null;

  return (
    <div className='flex flex-wrap items-center gap-2 border-b px-4 py-2' role='toolbar' aria-label='Template variables'>
      {variables.map(v => (
        <VariableControl key={v.name} variable={v} value={values.get(v.name) ?? v.current} onChange={onChange} />
      ))}
    </div>
  );
};

interface VariableControlProps {
  variable: Variable;
  value: string;
  onChange: (name: string, value: string) => void;
}

// One control per variable, picked by type. `constant` shows static text; `textbox` is a free
// text input; `datasource` resolves its options from the live datasource list; everything else
// (`query`/`custom`/`interval`) is a dropdown driven by the variable's `options`.
const VariableControl = ({ variable, value, onChange }: VariableControlProps) => {
  switch (variable.type) {
    case 'constant':
      return <VariableConstant variable={variable} value={value} />;
    case 'textbox':
      return <VariableTextbox variable={variable} value={value} onChange={onChange} />;
    case 'datasource':
      return <VariableDatasourceSelect variable={variable} value={value} onChange={onChange} />;
    case 'query':
    case 'custom':
    case 'interval':
      return <VariableOptionsSelect variable={variable} value={value} onChange={onChange} />;
  }
};

const VariableField = ({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) => (
  <div className='flex items-center gap-1.5'>
    <label className='text-muted-foreground text-xs' htmlFor={htmlFor}>
      {label}:
    </label>
    {children}
  </div>
);

const VariableConstant = ({ variable, value }: { variable: Variable; value: string }) => (
  <div className='flex items-center gap-1.5'>
    <span className='text-muted-foreground text-xs'>{variable.label || variable.name}:</span>
    <span className='text-xs font-medium'>{value}</span>
  </div>
);

const VariableTextbox = ({ variable, value, onChange }: VariableControlProps) => {
  const id = useId();
  const label = variable.label || variable.name;

  // Commit on blur and Enter rather than per keystroke: every committed value re-interpolates
  // and can refetch every panel, so we don't want that on each character. The input is
  // uncontrolled and keyed by the seed, so a fresh default (e.g. on dashboard reload) resets it
  // while in-progress typing is left alone.
  const handleCommit = useCallback(
    (next: string) => {
      if (next !== value) onChange(variable.name, next);
    },
    [onChange, variable.name, value],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      handleCommit(event.currentTarget.value);
    },
    [handleCommit],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        handleCommit(event.currentTarget.value);
      }
    },
    [handleCommit],
  );

  return (
    <VariableField label={label} htmlFor={id}>
      <Input
        key={value}
        id={id}
        type='text'
        defaultValue={value}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className='h-7 w-40 text-xs'
        aria-label={`Variable ${label}`}
      />
    </VariableField>
  );
};

const VariableOptionsSelect = ({ variable, value, onChange }: VariableControlProps) => {
  const label = variable.label || variable.name;

  const handleChange = useCallback(
    (val: string | null) => {
      if (val !== null) onChange(variable.name, val);
    },
    [onChange, variable.name],
  );

  // `includeAll` only applies to the multi-value list types (query/custom); interval is a single
  // choice, so it never shows an "All" entry even if the flag is set.
  const allowAll = variable.includeAll && variable.type !== 'interval';
  const { options: varOptions, current: varCurrent } = variable;
  const items = useMemo(() => {
    const opts = varOptions.length > 0 ? varOptions : [varCurrent].filter(Boolean);
    return [...(allowAll ? [{ value: '$__all', label: 'All' }] : []), ...opts.map(opt => ({ value: opt, label: opt }))];
  }, [varOptions, varCurrent, allowAll]);

  return (
    <VariableField label={label}>
      <VariableSelectControl items={items} value={value} onValueChange={handleChange} label={label} />
    </VariableField>
  );
};

const VariableDatasourceSelect = ({ variable, value, onChange }: VariableControlProps) => {
  const label = variable.label || variable.name;

  // Fetch the datasource list with useQuery (already prefetched/cached by the route loader)
  // rather than peeking the cache, mirroring the usePanelData fix so a direct dashboard load
  // still resolves options.
  const { data: datasources } = useQuery(datasourcesQueryOptions());

  const handleChange = useCallback(
    (val: string | null) => {
      if (val !== null) onChange(variable.name, val);
    },
    [onChange, variable.name],
  );

  const items = useMemo(() => filterDatasourceItems(datasources ?? [], variable.query), [datasources, variable.query]);

  return (
    <VariableField label={label}>
      <VariableSelectControl items={items} value={value} onValueChange={handleChange} label={label} />
    </VariableField>
  );
};

// Shared Base UI Select wiring: the `items` prop is required so the closed trigger resolves the
// selected option's label instead of showing the raw value.
const VariableSelectControl = ({
  items,
  value,
  onValueChange,
  label,
}: {
  items: DatasourceItem[];
  value: string;
  onValueChange: (value: string | null) => void;
  label: string;
}) => (
  <Select value={value} onValueChange={onValueChange} items={items}>
    <SelectTrigger className='h-7 w-auto min-w-24 text-xs' aria-label={`Variable ${label}`}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {items.map(o => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
