import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { dashboardQueryOptions } from '../../../lib/query-options';

const DashboardViewPage = () => {
  const { id } = Route.useParams();
  const { data: dashboard } = useSuspenseQuery(dashboardQueryOptions(id));

  if (dashboard === null) {
    return <p className='text-muted-foreground'>Dashboard not found.</p>;
  }

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold tracking-tight'>{dashboard.title}</h1>
      {dashboard.description && <p className='text-muted-foreground'>{dashboard.description}</p>}
      <p className='text-muted-foreground text-sm'>Dashboard view — panels coming in Phase 1f.</p>
    </div>
  );
};

export const Route = createFileRoute('/dashboards/$id/')({
  loader: ({ params, context }) => context.queryClient.ensureQueryData(dashboardQueryOptions(params.id)),
  component: DashboardViewPage,
});
