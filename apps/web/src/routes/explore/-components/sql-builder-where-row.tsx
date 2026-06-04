import type { WhereClause, WhereOperator } from '@graflare/shared/sql/builder';

import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { XIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';

const OPERATORS: WhereOperator[] = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN', 'IS NULL', 'IS NOT NULL'];
const OPERATOR_SET = new Set<string>(OPERATORS);
const VALUELESS_OPERATORS = new Set<WhereOperator>(['IS NULL', 'IS NOT NULL']);

const isWhereOperator = (value: string): value is WhereOperator => OPERATOR_SET.has(value);

const WHERE_OPERATOR_ITEMS = OPERATORS.map(op => ({ value: op, label: op }));

interface SqlBuilderWhereRowProps {
  columns: string[];
  clause: WhereClause;
  onChange: (clause: WhereClause) => void;
  onRemove: () => void;
}

export const SqlBuilderWhereRow = ({ columns, clause, onChange, onRemove }: SqlBuilderWhereRowProps) => {
  const columnItems = useMemo(() => columns.map(c => ({ value: c, label: c })), [columns]);
  const handleColumnChange = useCallback(
    (column: string | null) => {
      if (column !== null) {
        onChange({ ...clause, column });
      }
    },
    [clause, onChange],
  );

  const handleOperatorChange = useCallback(
    (op: string | null) => {
      if (op !== null && isWhereOperator(op)) {
        onChange({ ...clause, operator: op });
      }
    },
    [clause, onChange],
  );

  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...clause, value: e.target.value });
    },
    [clause, onChange],
  );

  return (
    <div className='flex items-center gap-1.5'>
      <Select value={clause.column} onValueChange={handleColumnChange} items={columnItems}>
        <SelectTrigger aria-label='WHERE column' className='w-36'>
          <SelectValue placeholder='Column' />
        </SelectTrigger>
        <SelectContent>
          {columnItems.map(o => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={clause.operator} onValueChange={handleOperatorChange} items={WHERE_OPERATOR_ITEMS}>
        <SelectTrigger aria-label='WHERE operator' className='w-28'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WHERE_OPERATOR_ITEMS.map(o => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!VALUELESS_OPERATORS.has(clause.operator) && (
        <Input
          value={clause.value}
          onChange={handleValueChange}
          placeholder={clause.operator === 'IN' ? 'val1,val2,...' : 'Value'}
          className='h-7 w-40'
          aria-label='WHERE value'
        />
      )}

      <Button variant='ghost' size='icon-xs' onClick={onRemove} aria-label='Remove condition'>
        <XIcon />
      </Button>
    </div>
  );
};
