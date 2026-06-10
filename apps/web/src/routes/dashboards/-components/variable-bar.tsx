import type { DatasourceItem } from './variable-defaults';
import type { AdhocFilter, Variable } from '@graflare/shared/schemas/variable';
import type { FocusEvent, KeyboardEvent, ReactNode } from 'react';

import { Input } from '@graflare/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useId, useMemo } from 'react';

import { datasourcesQueryOptions } from '../../datasources/-queries';

import { AdhocFilterRow } from './variable-adhoc-bar';
import { ALL_VALUE, filterDatasourceItems } from './variable-defaults';

interface VariableBarProps {
  variables: Variable[];
  /** DISPLAY values (see buildDisplayValues): the `$__all` sentinel is kept so All shows selected. */
  values: ReadonlyMap<string, string | string[]>;
  onChange: (name: string, value: string | string[]) => void;
  /** Adhoc variables with their LIVE filters folded in (the bar renders/edits these). */
  adhocVariables: readonly Variable[];
  onAdhocFiltersChange: (name: string, filters: AdhocFilter[]) => void;
}

export const VariableBar = ({ variables, values, onChange, adhocVariables, onAdhocFiltersChange }: VariableBarProps) => {
  // Resolve each adhoc variable to its live-filter version so a bar edit shows immediately; the
  // base `variables` list carries the saved (stale) filters, so adhoc controls read from here.
  const adhocByName = useMemo(() => new Map(adhocVariables.map(v => [v.name, v])), [adhocVariables]);

  if (variables.length === 0) return null;

  return (
    <div className='flex flex-wrap items-center gap-2 border-b px-4 py-2' role='toolbar' aria-label='Template variables'>
      {variables.map(v =>
        v.type === 'adhoc' ? (
          <AdhocFilterRow key={v.name} variable={adhocByName.get(v.name) ?? v} onFiltersChange={onAdhocFiltersChange} />
        ) : (
          <VariableControl key={v.name} variable={v} value={values.get(v.name) ?? v.current} onChange={onChange} />
        ),
      )}
    </div>
  );
};

interface VariableControlProps {
  variable: Variable;
  value: string | string[];
  onChange: (name: string, value: string | string[]) => void;
}

/** The single-choice controls take one value; a (multi-shaped) array collapses to its first entry. */
const toSingleValue = (value: string | string[]): string => (typeof value === 'string' ? value : (value[0] ?? ''));

// One control per variable, picked by type. `constant` shows static text; `textbox` is a free
// text input; `datasource` resolves its options from the live datasource list; `query`/`custom`/
// `interval` are a dropdown driven by the variable's `options` — multi-select for a `multi`
// query/custom variable, single-select otherwise. (`adhoc` is handled upstream by the bar, which
// renders an AdhocFilterRow instead — so it never reaches this switch.)
const VariableControl = ({ variable, value, onChange }: VariableControlProps) => {
  switch (variable.type) {
    case 'constant':
      return <VariableConstant variable={variable} value={toSingleValue(value)} />;
    case 'textbox':
      return <VariableTextbox variable={variable} value={toSingleValue(value)} onChange={onChange} />;
    case 'datasource':
      return <VariableDatasourceSelect variable={variable} value={toSingleValue(value)} onChange={onChange} />;
    case 'query':
    case 'custom':
      return variable.multi ? (
        <VariableMultiSelect variable={variable} value={value} onChange={onChange} />
      ) : (
        <VariableOptionsSelect variable={variable} value={toSingleValue(value)} onChange={onChange} />
      );
    case 'interval':
      return <VariableOptionsSelect variable={variable} value={toSingleValue(value)} onChange={onChange} />;
    case 'adhoc':
      // Unreachable: the bar routes adhoc variables to AdhocFilterRow before this switch. Return
      // null defensively so the union stays exhaustive without a non-null assertion or cast.
      return null;
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

// The concrete single-value controls: the parent collapses any multi-shaped value before
// rendering these, so they only ever see (and emit) plain strings.
interface SingleControlProps {
  variable: Variable;
  value: string;
  onChange: (name: string, value: string) => void;
}

const VariableConstant = ({ variable, value }: { variable: Variable; value: string }) => (
  <div className='flex items-center gap-1.5'>
    <span className='text-muted-foreground text-xs'>{variable.label || variable.name}:</span>
    <span className='text-xs font-medium'>{value}</span>
  </div>
);

const VariableTextbox = ({ variable, value, onChange }: SingleControlProps) => {
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

const VariableOptionsSelect = ({ variable, value, onChange }: SingleControlProps) => {
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
  const { options: varOptions } = variable;
  const items = useMemo(() => {
    // With no configured options, fall back to the resolved display value so the trigger still
    // shows something selectable instead of an empty dropdown.
    const opts = varOptions.length > 0 ? varOptions : [value].filter(Boolean);
    return [...(allowAll ? [{ value: ALL_VALUE, label: 'All' }] : []), ...opts.map(opt => ({ value: opt, label: opt }))];
  }, [varOptions, value, allowAll]);

  return (
    <VariableField label={label}>
      <VariableSelectControl items={items} value={value} onValueChange={handleChange} label={label} />
    </VariableField>
  );
};

// Multi-select for a `multi` query/custom variable: Base UI's native `multiple` Select with the
// variable's options (plus an "All" entry when `includeAll`). Selection semantics mirror Grafana:
// choosing All clears the concrete selections, choosing a concrete value drops All, and clearing
// everything leaves an EMPTY selection (it does not snap back to All).
const VariableMultiSelect = ({ variable, value, onChange }: VariableControlProps) => {
  const label = variable.label || variable.name;
  const { name, options: varOptions, includeAll } = variable;

  // Normalize the display value to the Select's array shape ('' means nothing selected).
  const selected = useMemo((): string[] => {
    if (Array.isArray(value)) return value;
    return value === '' ? [] : [value];
  }, [value]);

  const items = useMemo(() => {
    // With no configured options, fall back to the concrete selected values so the dropdown
    // still lists (and can deselect) what is currently chosen.
    const opts = varOptions.length > 0 ? varOptions : selected.filter(v => v !== ALL_VALUE);
    return [...(includeAll ? [{ value: ALL_VALUE, label: 'All' }] : []), ...opts.map(opt => ({ value: opt, label: opt }))];
  }, [varOptions, selected, includeAll]);

  const handleChange = useCallback(
    (next: string[]) => {
      const hadAll = selected.includes(ALL_VALUE);
      const hasAll = next.includes(ALL_VALUE);
      if (hasAll && !hadAll) {
        // All was just chosen — it replaces any concrete selection.
        onChange(name, [ALL_VALUE]);
        return;
      }
      // A concrete choice drops All; unchecking All (or a value) just passes through. An empty
      // result stays empty — Grafana keeps an explicit none-selected state.
      onChange(
        name,
        next.filter(v => v !== ALL_VALUE),
      );
    },
    [onChange, name, selected],
  );

  // Trigger label: 'All' / the lone value / 'a, b' for two / 'N selected' beyond that.
  const renderTriggerLabel = useCallback(() => {
    if (selected.includes(ALL_VALUE)) return 'All';
    if (selected.length === 0) return 'None';
    if (selected.length <= 2) return selected.join(', ');
    return `${String(selected.length)} selected`;
  }, [selected]);

  return (
    <VariableField label={label}>
      <Select multiple value={selected} onValueChange={handleChange} items={items}>
        <SelectTrigger className='h-7 w-auto min-w-24 text-xs' aria-label={`Variable ${label}`}>
          <SelectValue>{renderTriggerLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {items.map(o => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </VariableField>
  );
};

const VariableDatasourceSelect = ({ variable, value, onChange }: SingleControlProps) => {
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
