import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { InlineError } from './inline-error';

interface QueryBoundaryProps {
  pendingFallback: React.ReactNode;
  children: React.ReactNode;
}

export const QueryBoundary = ({ pendingFallback, children }: QueryBoundaryProps) => (
  <QueryErrorResetBoundary>
    {({ reset }) => (
      <ErrorBoundary onReset={reset} FallbackComponent={InlineError}>
        <Suspense fallback={pendingFallback}>{children}</Suspense>
      </ErrorBoundary>
    )}
  </QueryErrorResetBoundary>
);
