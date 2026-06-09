import { Button } from '@graflare/ui/components/button';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { Toggle } from '@graflare/ui/components/toggle';
import { AlertCircle, Pencil, Table2, Trash2 } from 'lucide-react';
import { Suspense, useCallback, useId, useMemo, useState } from 'react';

import { usePanelActions } from './panel-actions-context';

interface PanelFrameProps {
  title: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  children: React.ReactNode;
  dataTableContent?: React.ReactNode;
  panelId?: string;
}

export const PanelFrame = ({ title, loading, error, onRetry, children, dataTableContent, panelId }: PanelFrameProps) => {
  const [showDataTable, setShowDataTable] = useState(false);
  const actions = usePanelActions();
  // Names the panel's region landmark via its visible title so screen-reader users
  // can navigate to it; `react-grid-layout` items are bare divs with no semantics of
  // their own. The Edit/Delete/data-table controls are real <button>s, so they stay
  // in the tab order without making the non-interactive region itself a tab stop.
  const titleId = useId();

  const handleEdit = useCallback(() => {
    if (panelId !== undefined) actions?.onEdit(panelId);
  }, [actions, panelId]);

  const handleDelete = useCallback(() => {
    if (panelId !== undefined) actions?.onDelete(panelId);
  }, [actions, panelId]);

  const suspenseFallback = useMemo(() => <Skeleton className='h-full w-full' />, []);

  return (
    <section className='border-border bg-card flex h-full flex-col overflow-hidden rounded-lg border' aria-labelledby={titleId}>
      <div className='flex items-center justify-between border-b px-3 py-1.5'>
        <h3 id={titleId} className='text-sm font-medium'>
          {title}
        </h3>
        <div className='flex items-center gap-1'>
          {dataTableContent !== undefined && (
            <Toggle className='size-6 min-w-0 p-0' pressed={showDataTable} onPressedChange={setShowDataTable} aria-label='Show data table'>
              <Table2 className='h-3.5 w-3.5' />
            </Toggle>
          )}
          {actions !== null && panelId !== undefined && (
            <>
              <Button variant='ghost' size='icon' className='h-6 w-6' onClick={handleEdit} aria-label='Edit panel'>
                <Pencil className='h-3.5 w-3.5' />
              </Button>
              <Button variant='ghost' size='icon' className='h-6 w-6' onClick={handleDelete} aria-label='Delete panel'>
                <Trash2 className='h-3.5 w-3.5' />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className='relative flex-1 overflow-hidden p-2'>
        {loading === true && <Skeleton className='h-full w-full' />}

        {error !== undefined && error !== null && (
          <div className='bg-destructive/10 flex items-center gap-2 rounded-md p-3' role='alert'>
            <AlertCircle className='text-destructive h-4 w-4 shrink-0' />
            <span className='text-destructive text-sm'>{error}</span>
            {onRetry !== undefined && (
              <Button variant='outline' size='xs' onClick={onRetry}>
                Retry
              </Button>
            )}
          </div>
        )}

        {loading !== true && (error === undefined || error === null) && (
          <Suspense fallback={suspenseFallback}>{showDataTable && dataTableContent !== undefined ? dataTableContent : children}</Suspense>
        )}
      </div>
    </section>
  );
};
