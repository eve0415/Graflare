import type { CreateNotificationPolicy } from '@graflare/shared/schemas/notification-policy';

import { Skeleton } from '@graflare/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

import { createNotificationPolicy } from '../../-api';
import { contactPointsQueryOptions, muteTimingsQueryOptions, notificationPoliciesQueryOptions } from '../../-queries';

import { NotificationPolicyForm, defaultNotificationPolicyForm } from './-components/notification-policy-form';
import { buildParentOptions } from './-parent-options';

const NewPolicySkeleton = () => (
  <div className='space-y-4'>
    <Skeleton className='h-8 w-64' />
    <Skeleton className='h-96 w-full rounded-lg' />
  </div>
);

const NewPolicyPage = () => {
  const navigate = useNavigate();
  const { data: policies } = useSuspenseQuery(notificationPoliciesQueryOptions());
  const { data: contactPoints } = useSuspenseQuery(contactPointsQueryOptions());
  const { data: muteTimings } = useSuspenseQuery(muteTimingsQueryOptions());

  const parentOptions = useMemo(() => buildParentOptions(policies, contactPoints), [policies, contactPoints]);

  const handleSubmit = useCallback(
    async (data: CreateNotificationPolicy) => {
      await createNotificationPolicy({ data });
      await navigate({ to: '/alerting/notifications/policies' });
    },
    [navigate],
  );

  return (
    <NotificationPolicyForm
      initialForm={defaultNotificationPolicyForm}
      mode='create'
      submitLabel='Create Policy'
      contactPoints={contactPoints}
      muteTimings={muteTimings}
      parentOptions={parentOptions}
      onSubmit={handleSubmit}
    />
  );
};

export const Route = createFileRoute('/alerting/notifications/policies/new')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(notificationPoliciesQueryOptions()),
      context.queryClient.ensureQueryData(contactPointsQueryOptions()),
      context.queryClient.ensureQueryData(muteTimingsQueryOptions()),
    ]),
  pendingComponent: NewPolicySkeleton,
  component: NewPolicyPage,
});
