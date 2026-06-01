import { Badge } from '@graflare/ui/components/badge';
import { Button } from '@graflare/ui/components/button';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@graflare/ui/components/table';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';

import { alertRuleGroupsQueryOptions, alertRulesQueryOptions } from '../-queries';

const AlertRulesListSkeleton = () => (
  <div className='space-y-4'>
    <Skeleton className='h-8 w-48' />
    <Skeleton className='h-64 w-full rounded-lg' />
  </div>
);

const AlertRulesListPage = () => {
  const { data: rules } = useSuspenseQuery(alertRulesQueryOptions());
  const { data: groups } = useSuspenseQuery(alertRuleGroupsQueryOptions());

  const groupMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      map.set(g.id, g.name);
    }
    return map;
  }, [groups]);

  const rulesByGroup = useMemo(() => {
    const map = new Map<string, typeof rules>();
    for (const rule of rules) {
      const existing = map.get(rule.groupId);
      if (existing === undefined) {
        map.set(rule.groupId, [rule]);
      } else {
        map.set(rule.groupId, [...existing, rule]);
      }
    }
    return map;
  }, [rules]);

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <h2 className='text-lg font-semibold'>Alert Rules</h2>
        <Link to='/alerting/rules/new'>
          <Button size='sm'>
            <Plus className='mr-2 h-4 w-4' />
            New Alert Rule
          </Button>
        </Link>
      </div>

      {rules.length === 0 ? (
        <p className='text-muted-foreground text-sm'>No alert rules configured yet.</p>
      ) : (
        Array.from(rulesByGroup.entries()).map(([groupId, groupRules]) => (
          <div key={groupId} className='space-y-2'>
            <h3 className='text-sm font-medium text-muted-foreground'>
              {groupMap.get(groupId) ?? 'Unknown Group'}
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>For Duration</TableHead>
                  <TableHead className='w-[100px]'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupRules.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell className='font-medium'>{rule.title}</TableCell>
                    <TableCell>
                      <Badge variant={rule.isPaused ? 'secondary' : 'default'}>
                        {rule.isPaused ? 'Paused' : 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>
                      {rule.forDurationS}s
                    </TableCell>
                    <TableCell>
                      <Button variant='ghost' size='xs'>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))
      )}
    </div>
  );
};

export const Route = createFileRoute('/alerting/rules/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(alertRulesQueryOptions()),
      context.queryClient.ensureQueryData(alertRuleGroupsQueryOptions()),
    ]),
  pendingComponent: AlertRulesListSkeleton,
  component: AlertRulesListPage,
});
