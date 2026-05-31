import { createFileRoute } from '@tanstack/react-router';

const ExplorePage = () => (
  <div className='space-y-6'>
    <h1 className='text-2xl font-semibold tracking-tight'>Explore</h1>
    <p className='text-muted-foreground'>Query and visualize data from your data sources.</p>
  </div>
);

export const Route = createFileRoute('/explore')({
  component: ExplorePage,
});
