import { Badge } from '@graflare/ui/components/badge';
import { Button, buttonVariants } from '@graflare/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@graflare/ui/components/card';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { deleteNotificationPolicy } from '../../-api';
import { contactPointsQueryOptions, notificationPoliciesQueryOptions } from '../../-queries';

const PoliciesSkeleton = () => (
  <div className='space-y-4'>
    <Skeleton className='h-8 w-48' />
    <Skeleton className='h-64 w-full rounded-lg' />
  </div>
);

const resolveCpName = (cpMap: Map<string, string>, id: string | null, fallback: string) => {
  if (id === null) return fallback;
  return cpMap.get(id) ?? 'Unknown';
};

const PoliciesPage = () => {
  const { data: policies } = useSuspenseQuery(notificationPoliciesQueryOptions());
  const { data: contactPoints } = useSuspenseQuery(contactPointsQueryOptions());
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  const cpMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cp of contactPoints) {
      map.set(cp.id, cp.name);
    }
    return map;
  }, [contactPoints]);

  const rootPolicies = useMemo(() => policies.filter(p => p.parentId === null), [policies]);
  const childPolicies = useMemo(() => {
    const map = new Map<string, typeof policies>();
    for (const p of policies) {
      if (p.parentId === null) continue;
      const existing = map.get(p.parentId);
      if (existing === undefined) {
        map.set(p.parentId, [p]);
      } else {
        map.set(p.parentId, [...existing, p]);
      }
    }
    return map;
  }, [policies]);

  const handleDelete = useCallback(
    (id: string) => {
      const run = async () => {
        setDeleting(id);
        try {
          await deleteNotificationPolicy({ data: id });
          await router.invalidate();
        } finally {
          setDeleting(null);
        }
      };
      void run();
    },
    [router],
  );

  const policyRows = useMemo(() => {
    const result = [];
    for (const policy of rootPolicies) {
      const childList = childPolicies.get(policy.id) ?? [];
      const children = [];
      for (const child of childList) {
        children.push({
          id: child.id,
          params: { id: child.id },
          matchers: child.matchers,
          contactPointId: child.contactPointId,
          cpName: resolveCpName(cpMap, child.contactPointId, 'No contact point'),
          onDelete: () => {
            handleDelete(child.id);
          },
        });
      }
      result.push({
        id: policy.id,
        params: { id: policy.id },
        contactPointId: policy.contactPointId,
        matchers: policy.matchers,
        groupBy: policy.groupBy,
        groupWaitS: policy.groupWaitS,
        groupIntervalS: policy.groupIntervalS,
        repeatIntervalS: policy.repeatIntervalS,
        cpName: resolveCpName(cpMap, policy.contactPointId, 'Default policy'),
        onDelete: () => {
          handleDelete(policy.id);
        },
        children,
      });
    }
    return result;
  }, [rootPolicies, cpMap, childPolicies, handleDelete]);

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-lg font-semibold'>Notification Policies</h2>
        <Link to='/alerting/notifications/policies/new' className={buttonVariants({ size: 'sm' })}>
          <Plus className='mr-1 h-3 w-3' />
          New Policy
        </Link>
      </div>

      {policies.length === 0 ? (
        <p className='text-muted-foreground text-sm'>No notification policies configured yet.</p>
      ) : (
        <div className='space-y-3'>
          {policyRows.map(policy => (
            <Card key={policy.id}>
              <CardHeader className='flex flex-row items-center justify-between pb-2'>
                <CardTitle className='text-sm font-medium'>{policy.cpName}</CardTitle>
                <div className='flex items-center gap-1'>
                  <Link to='/alerting/notifications/policies/$id' params={policy.params} className={buttonVariants({ variant: 'ghost', size: 'xs' })}>
                    Edit
                  </Link>
                  <Button variant='ghost' size='xs' onClick={policy.onDelete} disabled={deleting === policy.id}>
                    <Trash2 className='h-3 w-3' />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className='space-y-2'>
                <div className='flex flex-wrap gap-1'>
                  {policy.matchers.map((m, i) => (
                    <Badge key={i} variant='outline' className='text-xs'>
                      {m.name} {m.operator} {m.value}
                    </Badge>
                  ))}
                </div>
                <div className='text-muted-foreground text-xs'>
                  Group by: {policy.groupBy.join(', ')} | Wait: {policy.groupWaitS}s | Interval: {policy.groupIntervalS}s | Repeat: {policy.repeatIntervalS}s
                </div>
                {policy.children.length > 0 && (
                  <div className='ml-4 space-y-2 border-l pl-4'>
                    {policy.children.map(child => (
                      <div key={child.id} className='flex items-center justify-between rounded-md border p-2'>
                        <div className='space-y-1'>
                          <span className='text-sm font-medium'>{child.cpName}</span>
                          <div className='flex flex-wrap gap-1'>
                            {child.matchers.map((m, i) => (
                              <Badge key={i} variant='outline' className='text-xs'>
                                {m.name} {m.operator} {m.value}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className='flex items-center gap-1'>
                          <Link to='/alerting/notifications/policies/$id' params={child.params} className={buttonVariants({ variant: 'ghost', size: 'xs' })}>
                            Edit
                          </Link>
                          <Button variant='ghost' size='xs' onClick={child.onDelete} disabled={deleting === child.id}>
                            <Trash2 className='h-3 w-3' />
                          </Button>
                        </div>
                      </div>
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

export const Route = createFileRoute('/alerting/notifications/policies/')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(notificationPoliciesQueryOptions()), context.queryClient.ensureQueryData(contactPointsQueryOptions())]),
  pendingComponent: PoliciesSkeleton,
  component: PoliciesPage,
});
