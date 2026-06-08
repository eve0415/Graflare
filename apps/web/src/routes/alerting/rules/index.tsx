import { Badge } from '@graflare/ui/components/badge';
import { Button, buttonVariants } from '@graflare/ui/components/button';
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
    const map = new Map<string, { id: string; title: string; isPaused: boolean; forDurationS: number; params: { id: string } }[]>();
    for (const rule of rules) {
      const row = { id: rule.id, title: rule.title, isPaused: rule.isPaused, forDurationS: rule.forDurationS, params: { id: rule.id } };
      const existing = map.get(rule.groupId);
      if (existing === undefined) {
        map.set(rule.groupId, [row]);
      } else {
        existing.push(row);
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
            <h3 className='text-muted-foreground text-sm font-medium'>{groupMap.get(groupId) ?? 'Unknown Group'}</h3>
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
                      <Badge variant={rule.isPaused ? 'secondary' : 'default'}>{rule.isPaused ? 'Paused' : 'Active'}</Badge>
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>{rule.forDurationS}s</TableCell>
                    <TableCell>
                      <Link to='/alerting/rules/$id' params={rule.params} className={buttonVariants({ variant: 'ghost', size: 'xs' })}>
                        Edit
                      </Link>
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
    Promise.all([context.queryClient.ensureQueryData(alertRulesQueryOptions()), context.queryClient.ensureQueryData(alertRuleGroupsQueryOptions())]),
  pendingComponent: AlertRulesListSkeleton,
  component: AlertRulesListPage,
});
