import { Skeleton } from '@graflare/ui/components/skeleton';

export const DashboardListSkeleton = () => (
  <div className='space-y-6'>
    <div className='flex items-center justify-between'>
      <Skeleton className='h-8 w-40' />
      <Skeleton className='h-9 w-36 rounded-md' />
    </div>
    <Skeleton className='h-9 w-full rounded-md' />
    <div className='grid gap-3'>
      <Skeleton className='h-[72px] w-full rounded-lg' />
      <Skeleton className='h-[72px] w-full rounded-lg' />
      <Skeleton className='h-[72px] w-full rounded-lg' />
    </div>
  </div>
);
