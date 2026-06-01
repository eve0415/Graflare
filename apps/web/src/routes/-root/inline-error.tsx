import type { FallbackProps } from 'react-error-boundary';

import { Button } from '@graflare/ui/components/button';
import { AlertCircle } from 'lucide-react';

const getErrorMessage = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'An unexpected error occurred';
};

export const InlineError = ({ error, resetErrorBoundary }: FallbackProps) => (
  <div className='bg-destructive/10 flex items-center gap-2 rounded-md p-3' role='alert'>
    <AlertCircle className='text-destructive h-4 w-4 shrink-0' />
    <span className='text-destructive text-sm'>{getErrorMessage(error)}</span>
    <Button variant='outline' size='xs' onClick={resetErrorBoundary} className='ml-auto'>
      Retry
    </Button>
  </div>
);
