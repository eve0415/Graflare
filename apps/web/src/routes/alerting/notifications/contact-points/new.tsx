import type { CreateContactPoint } from '@graflare/shared/schemas/contact-point';

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';

import { createContactPoint } from '../../-api';

import { ContactPointForm, defaultContactPointForm } from './-components/contact-point-form';

const NewContactPointPage = () => {
  const navigate = useNavigate();

  const handleSubmit = useCallback(
    async (data: CreateContactPoint) => {
      await createContactPoint({ data });
      await navigate({ to: '/alerting/notifications/contact-points' });
    },
    [navigate],
  );

  return <ContactPointForm initialForm={defaultContactPointForm} mode='create' submitLabel='Create Contact Point' onSubmit={handleSubmit} />;
};

export const Route = createFileRoute('/alerting/notifications/contact-points/new')({
  component: NewContactPointPage,
});
