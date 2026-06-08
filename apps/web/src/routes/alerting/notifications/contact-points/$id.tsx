import type { CreateContactPoint } from '@graflare/shared/schemas/contact-point';

import { Skeleton } from '@graflare/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';

import { updateContactPoint } from '../../-api';
import { contactPointQueryOptions } from '../../-queries';

import { ContactPointForm, contactPointToForm } from './-components/contact-point-form';

const EditContactPointSkeleton = () => (
  <div className='space-y-4'>
    <Skeleton className='h-8 w-64' />
    <Skeleton className='h-96 w-full rounded-lg' />
  </div>
);

const EditContactPointPage = () => {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: contactPoint } = useSuspenseQuery(contactPointQueryOptions(id));

  const handleSubmit = useCallback(
    async (data: CreateContactPoint) => {
      await updateContactPoint({ data: { id, data } });
      await navigate({ to: '/alerting/notifications/contact-points' });
    },
    [id, navigate],
  );

  if (contactPoint === null) {
    return <p className='text-muted-foreground text-sm'>Contact point not found.</p>;
  }

  return <ContactPointForm initialForm={contactPointToForm(contactPoint)} submitLabel='Save Changes' onSubmit={handleSubmit} />;
};

export const Route = createFileRoute('/alerting/notifications/contact-points/$id')({
  loader: ({ params, context }) => context.queryClient.ensureQueryData(contactPointQueryOptions(params.id)),
  pendingComponent: EditContactPointSkeleton,
  component: EditContactPointPage,
});
