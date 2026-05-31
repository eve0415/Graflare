import { createFileRoute } from '@tanstack/react-router';

const ImportPage = () => (
  <div className='space-y-6'>
    <h1 className='text-2xl font-semibold tracking-tight'>Import Dashboard</h1>
    <p className='text-muted-foreground'>Import dashboards from Grafana JSON (Classic, V1 Resource, or V2 Resource format).</p>
  </div>
);

export const Route = createFileRoute('/import')({
  component: ImportPage,
});
