import { Skeleton } from '@graflare/ui/components/skeleton';

export const DashboardViewSkeleton = () => (
  <div className='-m-6 flex flex-col'>
    <Skeleton className='h-12 w-full rounded-none' />
    <div className='grid grid-cols-2 gap-4 p-4'>
      <Skeleton className='h-48 rounded-lg' />
      <Skeleton className='h-48 rounded-lg' />
      <Skeleton className='h-48 rounded-lg' />
      <Skeleton className='h-48 rounded-lg' />
    </div>
  </div>
);
