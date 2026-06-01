import { Skeleton } from '@graflare/ui/components/skeleton';

export const DatasourceEditSkeleton = () => (
  <div className='space-y-4'>
    <Skeleton className='h-7 w-40' />
    <div className='space-y-3'>
      <Skeleton className='h-5 w-16' />
      <Skeleton className='h-9 w-full rounded-md' />
      <Skeleton className='h-5 w-16' />
      <Skeleton className='h-9 w-full rounded-md' />
      <Skeleton className='h-5 w-16' />
      <Skeleton className='h-9 w-full rounded-md' />
      <Skeleton className='h-5 w-24' />
      <Skeleton className='h-9 w-full rounded-md' />
    </div>
    <div className='flex gap-2 pt-4'>
      <Skeleton className='h-9 w-20 rounded-md' />
      <Skeleton className='h-9 w-24 rounded-md' />
    </div>
  </div>
);
