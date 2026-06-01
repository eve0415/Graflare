import type { Variable } from '@graflare/shared/schemas/variable';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { useCallback } from 'react';

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
        <VariableSelect
          key={v.name}
          variable={v}
          value={values.get(v.name) ?? v.current}
          onChange={onChange}
        />
      ))}
    </div>
  );
};

const VariableSelect = ({
  variable,
  value,
  onChange,
}: {
  variable: Variable;
  value: string;
  onChange: (name: string, value: string) => void;
}) => {
  const handleChange = useCallback((val: string) => {
    onChange(variable.name, val);
  }, [onChange, variable.name]);

  const label = variable.label || variable.name;
  const options = variable.options.length > 0
    ? variable.options
    : [variable.current].filter(Boolean);

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
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger className='h-7 w-auto min-w-24 text-xs' aria-label={`Variable ${label}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {variable.includeAll && <SelectItem value='$__all'>All</SelectItem>}
          {options.map(opt => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
