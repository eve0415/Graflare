import type { CreateAlertRule } from '@graflare/shared/schemas/alert-rule';

import { Skeleton } from '@graflare/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

import { updateAlertRule } from '../-api';
import { alertRuleGroupsQueryOptions, alertRuleQueryOptions } from '../-queries';

import { AlertRuleForm, ruleToForm } from './-components/alert-rule-form';

const EditAlertRuleSkeleton = () => (
  <div className='space-y-4'>
    <Skeleton className='h-8 w-64' />
    <Skeleton className='h-96 w-full rounded-lg' />
  </div>
);

const EditAlertRulePage = () => {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: rule } = useSuspenseQuery(alertRuleQueryOptions(id));
  const { data: groups } = useSuspenseQuery(alertRuleGroupsQueryOptions());
  const groupItems = useMemo(() => groups.map(g => ({ value: g.id, label: g.name })), [groups]);

  const handleSubmit = useCallback(
    async (data: CreateAlertRule) => {
      await updateAlertRule({ data: { id, data } });
      await navigate({ to: '/alerting/rules' });
    },
    [id, navigate],
  );

  if (rule === null) {
    return <p className='text-muted-foreground text-sm'>Rule not found.</p>;
  }

  return <AlertRuleForm groups={groupItems} initialForm={ruleToForm(rule)} submitLabel='Save Changes' onSubmit={handleSubmit} />;
};

export const Route = createFileRoute('/alerting/rules/$id')({
  loader: ({ params, context }) =>
    Promise.all([context.queryClient.ensureQueryData(alertRuleQueryOptions(params.id)), context.queryClient.ensureQueryData(alertRuleGroupsQueryOptions())]),
  pendingComponent: EditAlertRuleSkeleton,
  component: EditAlertRulePage,
});
