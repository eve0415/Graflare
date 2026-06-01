import type { ErrorComponentProps } from '@tanstack/react-router';

import { Button } from '@graflare/ui/components/button';
import { AlertCircle } from 'lucide-react';

export const RouteError = ({ error, reset }: ErrorComponentProps) => (
  <div className='flex flex-col items-center justify-center py-16'>
    <div className='bg-destructive/10 flex max-w-md flex-col items-center gap-4 rounded-lg p-8' role='alert'>
      <AlertCircle className='text-destructive h-8 w-8' />
      <div className='text-center'>
        <h2 className='text-lg font-semibold'>Something went wrong</h2>
        <p className='text-muted-foreground mt-1 text-sm'>{error.message}</p>
      </div>
      <Button variant='outline' onClick={reset}>
        Try again
      </Button>
    </div>
  </div>
);
