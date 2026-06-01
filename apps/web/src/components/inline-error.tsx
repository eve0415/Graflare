import { Button } from '@graflare/ui/components/button';
import { AlertCircle } from 'lucide-react';

interface InlineErrorProps {
  error: Error;
  resetErrorBoundary: () => void;
}

export const InlineError = ({ error, resetErrorBoundary }: InlineErrorProps) => (
  <div className='bg-destructive/10 flex items-center gap-2 rounded-md p-3' role='alert'>
    <AlertCircle className='text-destructive h-4 w-4 shrink-0' />
    <span className='text-destructive text-sm'>{error.message}</span>
    <Button variant='outline' size='xs' onClick={resetErrorBoundary} className='ml-auto'>
      Retry
    </Button>
  </div>
);
