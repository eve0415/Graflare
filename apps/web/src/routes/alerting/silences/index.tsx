import { Badge } from '@graflare/ui/components/badge';
import { Button } from '@graflare/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@graflare/ui/components/card';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { deleteSilence } from '../-api';
import { silencesQueryOptions } from '../-queries';

const SilencesSkeleton = () => (
  <div className='space-y-4'>
    <Skeleton className='h-8 w-48' />
    <Skeleton className='h-64 w-full rounded-lg' />
  </div>
);

const SilencesPage = () => {
  const { data: silences } = useSuspenseQuery(silencesQueryOptions());
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  const [now] = useState(() => Date.now() / 1000);

  const handleDelete = useCallback(
    (id: string) => {
      const run = async () => {
        setDeleting(id);
        try {
          await deleteSilence({ data: id });
          await router.invalidate();
        } finally {
          setDeleting(null);
        }
      };
      void run();
    },
    [router],
  );

  const rows = useMemo(
    () =>
      silences.map(silence => ({
        ...silence,
        isActive: silence.startsAt <= now && silence.endsAt > now,
        onDelete: () => {
          handleDelete(silence.id);
        },
      })),
    [silences, now, handleDelete],
  );

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-lg font-semibold'>Silences</h2>
        <Link to='/alerting/silences/new'>
          <Button size='sm'>
            <Plus className='mr-2 h-4 w-4' />
            New Silence
          </Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className='text-muted-foreground text-sm'>No silences configured.</p>
      ) : (
        <div className='space-y-3'>
          {rows.map(row => (
            <Card key={row.id}>
              <CardHeader className='flex flex-row items-center justify-between pb-2'>
                <CardTitle className='flex items-center gap-2 text-sm font-medium'>
                  <Badge variant={row.isActive ? 'default' : 'secondary'}>{row.isActive ? 'Active' : 'Expired'}</Badge>
                  {row.comment === '' ? 'No comment' : row.comment}
                </CardTitle>
                <Button variant='ghost' size='xs' onClick={row.onDelete} disabled={deleting === row.id}>
                  <Trash2 className='h-3 w-3' />
                </Button>
              </CardHeader>
              <CardContent className='space-y-2'>
                <div className='flex flex-wrap gap-1'>
                  {row.matchers.map((m, i) => (
                    <Badge key={i} variant='outline' className='text-xs'>
                      {m.name} {m.operator} {m.value}
                    </Badge>
                  ))}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {new Date(row.startsAt * 1000).toLocaleString()} &mdash; {new Date(row.endsAt * 1000).toLocaleString()}
                  {row.createdBy !== '' && <> | Created by {row.createdBy}</>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export const Route = createFileRoute('/alerting/silences/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(silencesQueryOptions()),
  pendingComponent: SilencesSkeleton,
  component: SilencesPage,
});
