import { Outlet, createFileRoute } from '@tanstack/react-router';

const DatasourceLayout = () => <Outlet />;

export const Route = createFileRoute('/datasources/$id')({
  component: DatasourceLayout,
});
