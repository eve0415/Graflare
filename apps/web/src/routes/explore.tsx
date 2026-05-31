import { Button } from '@graflare/ui/components/button';
import { Separator } from '@graflare/ui/components/separator';
import { createFileRoute } from '@tanstack/react-router';
import { Columns2 } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';

import { ExplorePane } from '../components/explore-pane';
import { TimeRangePicker } from '../components/time-range-picker';

interface TimeRange {
  from: string;
  to: string;
}

const defaultRange: TimeRange = { from: 'now-1h', to: 'now' };

const ExplorePage = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>(defaultRange);
  const [split, setSplit] = useState(false);

  const toggleSplit = useCallback(() => {
    setSplit(s => !s);
  }, []);

  const paneFallback = useMemo(() => <div className='text-muted-foreground'>Loading...</div>, []);

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold tracking-tight'>Explore</h1>
        <div className='flex items-center gap-2'>
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
          <Separator orientation='vertical' className='!h-6' />
          <Button
            variant={split ? 'secondary' : 'ghost'}
            size='sm'
            onClick={toggleSplit}
            aria-label={split ? 'Disable split view' : 'Enable split view'}
          >
            <Columns2 className='h-4 w-4' />
          </Button>
        </div>
      </div>

      <div className={split ? 'grid grid-cols-2 gap-4' : ''}>
        <Suspense fallback={paneFallback}>
          <ExplorePane timeRange={timeRange} label='Explore pane 1' />
        </Suspense>

        {split && (
          <Suspense fallback={paneFallback}>
            <ExplorePane timeRange={timeRange} label='Explore pane 2' />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export const Route = createFileRoute('/explore')({
  component: ExplorePage,
});
