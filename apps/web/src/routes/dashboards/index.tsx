import { Badge } from '@graflare/ui/components/badge';
import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Plus, Search } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { dashboardsQueryOptions } from '../../lib/query-options';

const DashboardListPage = () => {
  const { data: dashboards } = useSuspenseQuery(dashboardsQueryOptions());

  const [search, setSearch] = useState('');

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return dashboards;
    const lower = search.toLowerCase();
    return dashboards.filter(d => d.title.toLowerCase().includes(lower));
  }, [dashboards, search]);

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold tracking-tight'>Dashboards</h1>
        <Button render={<Link to='/dashboards/new' />}>
          <Plus className='mr-2 h-4 w-4' />
          New Dashboard
        </Button>
      </div>

      <div className='relative'>
        <Search className='text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2' />
        <Input
          placeholder='Search dashboards...'
          value={search}
          onChange={handleSearch}
          className='pl-9'
          aria-label='Search dashboards'
        />
      </div>

      {filtered.length === 0 && (
        <div className='text-muted-foreground flex flex-col items-center justify-center py-12'>
          <p className='text-lg'>No dashboards yet</p>
          <p className='text-sm'>Create a new dashboard or import one from Grafana.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <DashboardGrid dashboards={filtered} />
      )}
    </div>
  );
};

const DashboardGrid = ({ dashboards }: { dashboards: readonly { id: string; title: string; description: string; tags: string[]; version: number }[] }) => (
  <div className='grid gap-3'>
    {dashboards.map(d => (
      <DashboardCard key={d.id} dashboard={d} />
    ))}
  </div>
);

const DashboardCard = ({ dashboard: d }: { dashboard: { id: string; title: string; description: string; tags: string[]; version: number } }) => {
  const params = useMemo(() => ({ id: d.id }), [d.id]);

  return (
    <Link
      to='/dashboards/$id'
      params={params}
      className='border-border hover:bg-accent/50 flex items-center justify-between rounded-lg border p-4 transition-colors'
    >
      <div className='space-y-1'>
        <h3 className='font-medium'>{d.title}</h3>
        {d.description && <p className='text-muted-foreground text-sm'>{d.description}</p>}
        {d.tags.length > 0 && (
          <div className='flex gap-1'>
            {d.tags.map(tag => (
              <Badge key={tag} variant='secondary' className='text-xs'>
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <span className='text-muted-foreground text-xs'>v{d.version}</span>
    </Link>
  );
};

export const Route = createFileRoute('/dashboards/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardsQueryOptions()),
  component: DashboardListPage,
});
