import { Separator } from '@graflare/ui/components/separator';
import { Toggle } from '@graflare/ui/components/toggle';
import { createFileRoute } from '@tanstack/react-router';
import { Columns2 } from 'lucide-react';
import { useState } from 'react';

import { QueryBoundary } from '../-root/query-boundary';
import { TimeRangePicker } from '../-root/time-range-picker';

import { ExplorePane } from './-components/explore-pane';
import { ExplorePaneSkeleton } from './-components/explore-pane-skeleton';

interface TimeRange {
  from: string;
  to: string;
}

const defaultRange: TimeRange = { from: 'now-1h', to: 'now' };
const explorePaneFallback = <ExplorePaneSkeleton />;

const ExplorePage = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>(defaultRange);
  const [split, setSplit] = useState(false);

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold tracking-tight'>Explore</h1>
        <div className='flex items-center gap-2'>
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
          <Separator orientation='vertical' className='!h-6' />
          <Toggle size='sm' pressed={split} onPressedChange={setSplit} aria-label='Split view'>
            <Columns2 className='h-4 w-4' />
          </Toggle>
        </div>
      </div>

      <div className={split ? 'grid grid-cols-1 gap-4 lg:grid-cols-2' : ''}>
        <QueryBoundary pendingFallback={explorePaneFallback}>
          <ExplorePane timeRange={timeRange} label='Explore pane 1' />
        </QueryBoundary>

        {split && (
          <QueryBoundary pendingFallback={explorePaneFallback}>
            <ExplorePane timeRange={timeRange} label='Explore pane 2' />
          </QueryBoundary>
        )}
      </div>
    </div>
  );
};

export const Route = createFileRoute('/explore/')({
  component: ExplorePage,
});
