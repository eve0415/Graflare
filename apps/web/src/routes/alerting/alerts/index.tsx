import { Badge } from '@graflare/ui/components/badge';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@graflare/ui/components/table';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { alertInstancesQueryOptions, alertRulesQueryOptions } from '../-queries';

const stateVariant = (state: string) => {
  switch (state) {
    case 'Firing':
      return 'destructive' as const;
    case 'Pending':
      return 'secondary' as const;
    case 'Resolved':
      return 'outline' as const;
    default:
      return 'default' as const;
  }
};

const AlertInstancesSkeleton = () => (
  <div className='space-y-4'>
    <Skeleton className='h-8 w-48' />
    <Skeleton className='h-64 w-full rounded-lg' />
  </div>
);

const AlertInstancesPage = () => {
  const { data: instances } = useSuspenseQuery(alertInstancesQueryOptions());
  const { data: rules } = useSuspenseQuery(alertRulesQueryOptions());

  const ruleMap = new Map(rules.map(r => [r.id, r.title]));

  return (
    <div className='space-y-4'>
      <h2 className='text-lg font-semibold'>Alert Instances</h2>

      {instances.length === 0 ? (
        <p className='text-muted-foreground text-sm'>No alert instances.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>Labels</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Last Evaluated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.map(inst => (
              <TableRow key={inst.id}>
                <TableCell className='font-medium'>{ruleMap.get(inst.ruleId) ?? inst.ruleId}</TableCell>
                <TableCell>
                  <div className='flex flex-wrap gap-1'>
                    {Object.entries(inst.labels).map(([k, v]) => (
                      <Badge key={k} variant='outline' className='text-xs'>
                        {k}={v}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={stateVariant(inst.state)}>{inst.state}</Badge>
                </TableCell>
                <TableCell className='text-muted-foreground text-sm'>{inst.value}</TableCell>
                <TableCell className='text-muted-foreground text-sm'>{inst.lastEvalAt.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

export const Route = createFileRoute('/alerting/alerts/')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(alertInstancesQueryOptions()), context.queryClient.ensureQueryData(alertRulesQueryOptions())]),
  pendingComponent: AlertInstancesSkeleton,
  component: AlertInstancesPage,
});
