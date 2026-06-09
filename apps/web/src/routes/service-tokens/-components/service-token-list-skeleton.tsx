import { Skeleton } from '@graflare/ui/components/skeleton';

export const ServiceTokenListSkeleton = () => (
  <div className='space-y-4'>
    <div className='flex items-center justify-between'>
      <Skeleton className='h-7 w-40' />
      <Skeleton className='h-8 w-28 rounded-md' />
    </div>
    <div className='space-y-2'>
      <Skeleton className='h-10 w-full rounded-md' />
      <Skeleton className='h-12 w-full rounded-md' />
      <Skeleton className='h-12 w-full rounded-md' />
      <Skeleton className='h-12 w-full rounded-md' />
    </div>
  </div>
);
