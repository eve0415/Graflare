import { Badge } from '@graflare/ui/components/badge';
import { Button, buttonVariants } from '@graflare/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@graflare/ui/components/card';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { deleteMuteTiming } from '../-api';
import { muteTimingsQueryOptions } from '../-queries';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const formatInterval = (interval: { weekdays: number[]; startTime: string; endTime: string; months: number[] }) => {
  const parts: string[] = [];
  if (interval.weekdays.length > 0) {
    parts.push(interval.weekdays.map(d => WEEKDAY_NAMES[d] ?? String(d)).join(', '));
  }
  parts.push(`${interval.startTime}-${interval.endTime}`);
  if (interval.months.length > 0) {
    parts.push(interval.months.map(m => MONTH_NAMES[m - 1] ?? String(m)).join(', '));
  }
  return parts.join(' | ');
};

const MuteTimingsSkeleton = () => (
  <div className='space-y-4'>
    <Skeleton className='h-8 w-48' />
    <Skeleton className='h-64 w-full rounded-lg' />
  </div>
);

const MuteTimingsPage = () => {
  const { data: muteTimings } = useSuspenseQuery(muteTimingsQueryOptions());
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      muteTimings.map(mt => ({
        ...mt,
        onDelete: () => {
          const run = async () => {
            setDeleting(mt.id);
            try {
              await deleteMuteTiming({ data: mt.id });
              await router.invalidate();
            } finally {
              setDeleting(null);
            }
          };
          void run();
        },
      })),
    [muteTimings, router],
  );

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-lg font-semibold'>Mute Timings</h2>
        <Link to='/alerting/mute-timings/new' className={buttonVariants({ size: 'sm' })}>
          <Plus className='mr-2 h-4 w-4' />
          New Mute Timing
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className='text-muted-foreground text-sm'>No mute timings configured.</p>
      ) : (
        <div className='space-y-3'>
          {rows.map(mt => (
            <Card key={mt.id}>
              <CardHeader className='flex flex-row items-center justify-between pb-2'>
                <CardTitle className='text-sm font-medium'>{mt.name}</CardTitle>
                <Button variant='ghost' size='xs' onClick={mt.onDelete} disabled={deleting === mt.id}>
                  <Trash2 className='h-3 w-3' />
                </Button>
              </CardHeader>
              <CardContent>
                {mt.intervals.length === 0 ? (
                  <p className='text-muted-foreground text-xs'>No intervals defined</p>
                ) : (
                  <div className='flex flex-wrap gap-1'>
                    {mt.intervals.map((interval, i) => (
                      <Badge key={i} variant='outline' className='text-xs'>
                        {formatInterval(interval)}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export const Route = createFileRoute('/alerting/mute-timings/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(muteTimingsQueryOptions()),
  pendingComponent: MuteTimingsSkeleton,
  component: MuteTimingsPage,
});
