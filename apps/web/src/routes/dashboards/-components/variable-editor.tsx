import type { DatasourceRow } from '../../datasources/-api';
import type { Variable } from '@graflare/shared/schemas/variable';

import { Badge } from '@graflare/ui/components/badge';
import { Button } from '@graflare/ui/components/button';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { VariableForm } from './variable-form';

interface VariableEditorProps {
  variables: readonly Variable[];
  datasources: readonly DatasourceRow[];
  onChange: (variables: Variable[]) => void;
}

// Sentinel for "the add-new form is open" — distinct from an index so the list can tell adding
// apart from editing an existing row.
const ADD = 'add';

type Editing = number | typeof ADD | null;

/**
 * The body of the Settings → Variables tab. Renders the dashboard's template variables as a list
 * and an inline add/edit {@link VariableForm}. Operates on the parent's draft array via `onChange`
 * — it never persists; the dialog's Save is what writes the array back through `updateDashboard`.
 */
export const VariableEditor = ({ variables, datasources, onChange }: VariableEditorProps) => {
  const [editing, setEditing] = useState<Editing>(null);

  const handleAdd = useCallback(() => {
    setEditing(ADD);
  }, []);

  const handleCancel = useCallback(() => {
    setEditing(null);
  }, []);

  const handleDelete = useCallback(
    (index: number) => {
      onChange(variables.filter((_, i) => i !== index));
    },
    [variables, onChange],
  );

  const handleSubmit = useCallback(
    (variable: Variable) => {
      if (editing === ADD) {
        onChange([...variables, variable]);
      } else if (editing !== null) {
        onChange(variables.map((v, i) => (i === editing ? variable : v)));
      }
      setEditing(null);
    },
    [editing, variables, onChange],
  );

  if (editing !== null) {
    return <EditingForm variables={variables} editing={editing} datasources={datasources} onSubmit={handleSubmit} onCancel={handleCancel} />;
  }

  return (
    <div className='space-y-3'>
      {variables.length === 0 ? (
        <p className='text-muted-foreground py-4 text-center text-sm'>No variables yet. Add one to parameterize this dashboard.</p>
      ) : (
        <ul className='space-y-1'>
          {variables.map((variable, index) => (
            <VariableRow key={variable.name} variable={variable} index={index} onEdit={setEditing} onDelete={handleDelete} />
          ))}
        </ul>
      )}

      <Button variant='outline' size='sm' onClick={handleAdd}>
        <Plus className='mr-1 h-3.5 w-3.5' />
        Add variable
      </Button>
    </div>
  );
};

interface EditingFormProps {
  variables: readonly Variable[];
  editing: number | typeof ADD;
  datasources: readonly DatasourceRow[];
  onSubmit: (variable: Variable) => void;
  onCancel: () => void;
}

// Wraps VariableForm for the add/edit branch, deriving the seed variable and the sibling-name list
// once via useMemo so the form's array props keep a stable identity across re-renders.
const EditingForm = ({ variables, editing, datasources, onSubmit, onCancel }: EditingFormProps) => {
  const initial = editing === ADD ? undefined : variables[editing];
  // The uniqueness check must ignore the row being edited so renaming to its own value is allowed.
  const existingNames = useMemo(() => variables.filter((_, i) => i !== editing).map(v => v.name), [variables, editing]);
  return <VariableForm initial={initial} existingNames={existingNames} datasources={datasources} onSubmit={onSubmit} onCancel={onCancel} />;
};

interface VariableRowProps {
  variable: Variable;
  index: number;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}

const VariableRow = ({ variable, index, onEdit, onDelete }: VariableRowProps) => {
  const handleEdit = useCallback(() => {
    onEdit(index);
  }, [onEdit, index]);

  const handleDelete = useCallback(() => {
    onDelete(index);
  }, [onDelete, index]);

  return (
    <li className='flex items-center justify-between gap-2 rounded-md border px-3 py-2'>
      <div className='flex min-w-0 items-center gap-2'>
        <span className='truncate text-sm font-medium'>{variable.name}</span>
        <Badge variant='secondary'>{variable.type}</Badge>
        {variable.label !== '' && <span className='text-muted-foreground truncate text-xs'>{variable.label}</span>}
      </div>
      <div className='flex shrink-0 items-center gap-1'>
        <Button variant='ghost' size='icon-sm' onClick={handleEdit} aria-label={`Edit variable ${variable.name}`}>
          <Pencil className='h-3.5 w-3.5' />
        </Button>
        <Button variant='ghost' size='icon-sm' onClick={handleDelete} aria-label={`Delete variable ${variable.name}`}>
          <Trash2 className='h-3.5 w-3.5' />
        </Button>
      </div>
    </li>
  );
};
