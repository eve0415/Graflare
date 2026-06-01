import { Navigate, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/alerting/')({
  component: () => <Navigate to='/alerting/rules' />,
});
