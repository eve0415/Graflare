import type { CreateAlertRule } from '@graflare/shared/schemas/alert-rule';

import { Skeleton } from '@graflare/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

import { createAlertRule } from '../-api';
import { alertRuleGroupsQueryOptions } from '../-queries';

import { AlertRuleForm, defaultAlertRuleForm } from './-components/alert-rule-form';

const NewAlertRuleSkeleton = () => (
  <div className='space-y-4'>
    <Skeleton className='h-8 w-64' />
    <Skeleton className='h-96 w-full rounded-lg' />
  </div>
);

const NewAlertRulePage = () => {
  const navigate = useNavigate();
  const { data: groups } = useSuspenseQuery(alertRuleGroupsQueryOptions());
  const groupItems = useMemo(() => groups.map(g => ({ value: g.id, label: g.name })), [groups]);

  const handleSubmit = useCallback(
    async (data: CreateAlertRule) => {
      await createAlertRule({ data });
      await navigate({ to: '/alerting/rules' });
    },
    [navigate],
  );

  return <AlertRuleForm groups={groupItems} initialForm={defaultAlertRuleForm} mode='create' submitLabel='Create Alert Rule' onSubmit={handleSubmit} />;
};

export const Route = createFileRoute('/alerting/rules/new')({
  loader: ({ context }) => context.queryClient.ensureQueryData(alertRuleGroupsQueryOptions()),
  pendingComponent: NewAlertRuleSkeleton,
  component: NewAlertRulePage,
});
