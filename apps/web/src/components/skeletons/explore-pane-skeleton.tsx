import { Skeleton } from '@graflare/ui/components/skeleton';

export const ExplorePaneSkeleton = () => (
  <div className='space-y-3'>
    <div className='flex items-center gap-2'>
      <Skeleton className='h-9 w-48 rounded-md' />
      <Skeleton className='h-9 flex-1 rounded-md' />
      <Skeleton className='h-8 w-16 rounded-md' />
    </div>
    <Skeleton className='h-64 w-full rounded-md' />
  </div>
);
