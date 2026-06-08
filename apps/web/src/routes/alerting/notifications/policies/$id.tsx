import type { CreateNotificationPolicy } from '@graflare/shared/schemas/notification-policy';

import { Skeleton } from '@graflare/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

import { updateNotificationPolicy } from '../../-api';
import { contactPointsQueryOptions, muteTimingsQueryOptions, notificationPoliciesQueryOptions } from '../../-queries';

import { NotificationPolicyForm, policyToForm } from './-components/notification-policy-form';
import { buildParentOptions } from './-parent-options';

const EditPolicySkeleton = () => (
  <div className='space-y-4'>
    <Skeleton className='h-8 w-64' />
    <Skeleton className='h-96 w-full rounded-lg' />
  </div>
);

const EditPolicyPage = () => {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: policies } = useSuspenseQuery(notificationPoliciesQueryOptions());
  const { data: contactPoints } = useSuspenseQuery(contactPointsQueryOptions());
  const { data: muteTimings } = useSuspenseQuery(muteTimingsQueryOptions());

  const policy = useMemo(() => policies.find(p => p.id === id), [policies, id]);
  const parentOptions = useMemo(() => buildParentOptions(policies, contactPoints, id), [policies, contactPoints, id]);
  const initialForm = useMemo(() => (policy === undefined ? null : policyToForm(policy)), [policy]);

  const handleSubmit = useCallback(
    async (data: CreateNotificationPolicy) => {
      await updateNotificationPolicy({ data: { id, data } });
      await navigate({ to: '/alerting/notifications/policies' });
    },
    [id, navigate],
  );

  if (initialForm === null) {
    return <p className='text-muted-foreground text-sm'>Policy not found.</p>;
  }

  return (
    <NotificationPolicyForm
      initialForm={initialForm}
      submitLabel='Save Changes'
      contactPoints={contactPoints}
      muteTimings={muteTimings}
      parentOptions={parentOptions}
      onSubmit={handleSubmit}
    />
  );
};

export const Route = createFileRoute('/alerting/notifications/policies/$id')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(notificationPoliciesQueryOptions()),
      context.queryClient.ensureQueryData(contactPointsQueryOptions()),
      context.queryClient.ensureQueryData(muteTimingsQueryOptions()),
    ]),
  pendingComponent: EditPolicySkeleton,
  component: EditPolicyPage,
});
