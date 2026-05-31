import type { Panel } from '@graflare/shared/schemas/panel';

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
}

export const PanelRenderer = ({ panel, timeRange, refetchInterval, width, height }: PanelRendererProps) => {
  switch (panel.type) {
    case 'timeseries':
      return <TimeSeriesPanel panel={panel} timeRange={timeRange} refetchInterval={refetchInterval} width={width} height={height} />;
    case 'stat':
      return <StatPanel panel={panel} timeRange={timeRange} refetchInterval={refetchInterval} />;
    case 'table':
      return <TablePanel panel={panel} timeRange={timeRange} refetchInterval={refetchInterval} />;
    case 'gauge':
      return <GaugePanel panel={panel} timeRange={timeRange} refetchInterval={refetchInterval} />;
    default:
      return (
        <PanelFrame title={panel.title}>
          <p className='text-muted-foreground text-sm'>Unknown panel type: {panel.type}</p>
        </PanelFrame>
      );
  }
};
