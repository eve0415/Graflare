import { Navigate, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/alerting/notifications/')({
  component: () => <Navigate to='/alerting/notifications/contact-points' />,
});
