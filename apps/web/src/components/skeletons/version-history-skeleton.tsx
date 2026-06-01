import { Skeleton } from '@graflare/ui/components/skeleton';

export const VersionHistorySkeleton = () => (
  <div className='space-y-2'>
    <Skeleton className='h-12 w-full' />
    <Skeleton className='h-12 w-full' />
    <Skeleton className='h-12 w-full' />
  </div>
);
