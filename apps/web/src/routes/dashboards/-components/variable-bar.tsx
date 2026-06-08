import type { Variable } from '@graflare/shared/schemas/variable';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { useCallback, useMemo } from 'react';

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
        <VariableSelect key={v.name} variable={v} value={values.get(v.name) ?? v.current} onChange={onChange} />
      ))}
    </div>
  );
};

const VariableSelect = ({ variable, value, onChange }: { variable: Variable; value: string; onChange: (name: string, value: string) => void }) => {
  const handleChange = useCallback(
    (val: string | null) => {
      if (val !== null) onChange(variable.name, val);
    },
    [onChange, variable.name],
  );

  const label = variable.label || variable.name;

  const { options: varOptions, current: varCurrent, includeAll } = variable;
  const variableItems = useMemo(() => {
    const opts = varOptions.length > 0 ? varOptions : [varCurrent].filter(Boolean);
    return [...(includeAll ? [{ value: '$__all', label: 'All' }] : []), ...opts.map(opt => ({ value: opt, label: opt }))];
  }, [varOptions, varCurrent, includeAll]);

  if (variable.type === 'constant') {
    return (
      <div className='flex items-center gap-1.5'>
        <span className='text-muted-foreground text-xs'>{label}:</span>
        <span className='text-xs font-medium'>{value}</span>
      </div>
    );
  }

  return (
    <div className='flex items-center gap-1.5'>
      <span className='text-muted-foreground text-xs'>{label}:</span>
      <Select value={value} onValueChange={handleChange} items={variableItems}>
        <SelectTrigger className='h-7 w-auto min-w-24 text-xs' aria-label={`Variable ${label}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {variableItems.map(o => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
