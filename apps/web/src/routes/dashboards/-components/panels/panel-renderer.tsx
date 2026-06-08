import type { Panel } from '@graflare/shared/schemas/panel';

import { interpolateQueries } from '@graflare/shared/variables/interpolate';
import { useMemo } from 'react';

import { GaugePanel } from './gauge-panel';
import { PanelFrame } from './panel-frame';
import { StatPanel } from './stat-panel';
import { TablePanel } from './table-panel';
import { TimeSeriesPanel } from './time-series-panel';

interface PanelRendererProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
  width: number;
  height: number;
  variables: ReadonlyMap<string, string | string[]>;
}

export const PanelRenderer = ({ panel, timeRange, refetchInterval, width, height, variables }: PanelRendererProps) => {
  // Interpolate dashboard variables into the queries at render time. The panel's
  // own queries keep their raw `$var` form (editing/saving is unaffected); only
  // the copy handed to the data hook is templated.
  const resolvedPanel = useMemo(() => ({ ...panel, queries: interpolateQueries(panel.queries, variables) }), [panel, variables]);

  switch (resolvedPanel.type) {
    case 'timeseries':
      return <TimeSeriesPanel panel={resolvedPanel} timeRange={timeRange} refetchInterval={refetchInterval} width={width} height={height} />;
    case 'stat':
      return <StatPanel panel={resolvedPanel} timeRange={timeRange} refetchInterval={refetchInterval} />;
    case 'table':
      return <TablePanel panel={resolvedPanel} timeRange={timeRange} refetchInterval={refetchInterval} />;
    case 'gauge':
      return <GaugePanel panel={resolvedPanel} timeRange={timeRange} refetchInterval={refetchInterval} />;
    default:
      return (
        <PanelFrame title={resolvedPanel.title}>
          <p className='text-muted-foreground text-sm'>Unknown panel type: {resolvedPanel.type}</p>
        </PanelFrame>
      );
  }
};
