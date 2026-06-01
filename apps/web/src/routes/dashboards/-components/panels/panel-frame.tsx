import { Button } from '@graflare/ui/components/button';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { AlertCircle, MoreVertical, Table2 } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';

interface PanelFrameProps {
  title: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  children: React.ReactNode;
  dataTableContent?: React.ReactNode;
}

export const PanelFrame = ({ title, loading, error, onRetry, children, dataTableContent }: PanelFrameProps) => {
  const [showDataTable, setShowDataTable] = useState(false);

  const toggleDataTable = useCallback(() => {
    setShowDataTable(v => !v);
  }, []);

  const suspenseFallback = useMemo(() => <Skeleton className='h-full w-full' />, []);

  return (
    <div className='border-border bg-card flex h-full flex-col overflow-hidden rounded-lg border'>
      <div className='flex items-center justify-between border-b px-3 py-1.5'>
        <h3 className='text-sm font-medium'>{title}</h3>
        <div className='flex items-center gap-1'>
          {dataTableContent !== undefined && (
            <Button
              variant='ghost'
              size='icon'
              className='h-6 w-6'
              onClick={toggleDataTable}
              aria-label={showDataTable ? 'Show visualization' : 'Show data table'}
            >
              <Table2 className='h-3.5 w-3.5' />
            </Button>
          )}
          <Button variant='ghost' size='icon' className='h-6 w-6' aria-label='Panel options'>
            <MoreVertical className='h-3.5 w-3.5' />
          </Button>
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
          <Suspense fallback={suspenseFallback}>
            {showDataTable && dataTableContent !== undefined ? dataTableContent : children}
          </Suspense>
        )}
      </div>
    </div>
  );
};
