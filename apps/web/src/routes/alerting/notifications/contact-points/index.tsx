import { Badge } from '@graflare/ui/components/badge';
import { Button, buttonVariants } from '@graflare/ui/components/button';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@graflare/ui/components/table';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { deleteContactPoint } from '../../-api';
import { contactPointsQueryOptions } from '../../-queries';

const ContactPointsSkeleton = () => (
  <div className='space-y-4'>
    <Skeleton className='h-8 w-48' />
    <Skeleton className='h-64 w-full rounded-lg' />
  </div>
);

const ContactPointsPage = () => {
  const { data: contactPoints } = useSuspenseQuery(contactPointsQueryOptions());
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      contactPoints.map(cp => ({
        id: cp.id,
        name: cp.name,
        type: cp.type,
        params: { id: cp.id },
        onDelete: () => {
          const run = async () => {
            setDeleting(cp.id);
            try {
              await deleteContactPoint({ data: cp.id });
              await router.invalidate();
            } finally {
              setDeleting(null);
            }
          };
          void run();
        },
      })),
    [contactPoints, router],
  );

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-lg font-semibold'>Contact Points</h2>
        <Link to='/alerting/notifications/contact-points/new'>
          <Button size='sm'>
            <Plus className='mr-2 h-4 w-4' />
            New Contact Point
          </Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className='text-muted-foreground text-sm'>No contact points configured yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className='w-[120px]'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.id}>
                <TableCell className='font-medium'>{row.name}</TableCell>
                <TableCell>
                  <Badge variant='secondary'>{row.type}</Badge>
                </TableCell>
                <TableCell>
                  <div className='flex gap-1'>
                    <Link to='/alerting/notifications/contact-points/$id' params={row.params} className={buttonVariants({ variant: 'ghost', size: 'xs' })}>
                      Edit
                    </Link>
                    <Button variant='ghost' size='xs' onClick={row.onDelete} disabled={deleting === row.id}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

export const Route = createFileRoute('/alerting/notifications/contact-points/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(contactPointsQueryOptions()),
  pendingComponent: ContactPointsSkeleton,
  component: ContactPointsPage,
});
