import type { Annotation } from '@graflare/shared/schemas/annotation';
import type { Panel } from '@graflare/shared/schemas/panel';
import type { Variable } from '@graflare/shared/schemas/variable';

import { resolveAdhocFilters } from '@graflare/shared/variables/adhoc';
import { interpolateAndInjectQueries } from '@graflare/shared/variables/interpolate';
import { useMemo } from 'react';

import { BarChartPanel } from './bar-chart-panel';
import { BarGaugePanel } from './bar-gauge-panel';
import { GaugePanel } from './gauge-panel';
import { HeatmapPanel } from './heatmap-panel';
import { HistogramPanel } from './histogram-panel';
import { PanelFrame } from './panel-frame';
import { PiePanel } from './pie-panel';
import { StatPanel } from './stat-panel';
import { StateTimelinePanel } from './state-timeline-panel';
import { StatusHistoryPanel } from './status-history-panel';
import { TablePanel } from './table-panel';
import { TextPanel } from './text-panel';
import { TimeSeriesPanel } from './time-series-panel';

interface PanelRendererProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
  width: number;
  height: number;
  variables: ReadonlyMap<string, string | string[]>;
  /** Adhoc variables with their live filters; scoped to this panel's datasource at render. */
  adhocVariables: readonly Variable[];
  annotations: readonly Annotation[];
}

export const PanelRenderer = ({ panel, timeRange, refetchInterval, width, height, variables, adhocVariables, annotations }: PanelRendererProps) => {
  // Interpolate dashboard variables into the queries at render time, then inject any adhoc filters
  // scoped to this panel's datasource. The panel's own queries keep their raw `$var` form
  // (editing/saving is unaffected); only the copy handed to the data hook is transformed. When no
  // adhoc filter targets this datasource the injection step is skipped, so the queries are
  // byte-identical to the interpolation-only result.
  const resolvedPanel = useMemo(() => {
    const adhocFilters = resolveAdhocFilters(adhocVariables, panel.datasourceId);
    return { ...panel, queries: interpolateAndInjectQueries(panel.queries, variables, adhocFilters) };
  }, [panel, variables, adhocVariables]);

  // Only the time-based chart panels overlay annotations; other panel types ignore them.
  switch (resolvedPanel.type) {
    case 'timeseries':
      return (
        <TimeSeriesPanel
          panel={resolvedPanel}
          timeRange={timeRange}
          refetchInterval={refetchInterval}
          width={width}
          height={height}
          annotations={annotations}
        />
      );
    case 'stat':
      return <StatPanel panel={resolvedPanel} timeRange={timeRange} refetchInterval={refetchInterval} />;
    case 'table':
      return <TablePanel panel={resolvedPanel} timeRange={timeRange} refetchInterval={refetchInterval} />;
    case 'gauge':
      return <GaugePanel panel={resolvedPanel} timeRange={timeRange} refetchInterval={refetchInterval} />;
    case 'bargauge':
      return <BarGaugePanel panel={resolvedPanel} timeRange={timeRange} refetchInterval={refetchInterval} />;
    case 'barchart':
      return (
        <BarChartPanel panel={resolvedPanel} timeRange={timeRange} refetchInterval={refetchInterval} width={width} height={height} annotations={annotations} />
      );
    case 'pie':
      return <PiePanel panel={resolvedPanel} timeRange={timeRange} refetchInterval={refetchInterval} />;
    case 'histogram':
      return (
        <HistogramPanel panel={resolvedPanel} timeRange={timeRange} refetchInterval={refetchInterval} width={width} height={height} annotations={annotations} />
      );
    case 'heatmap':
      return <HeatmapPanel panel={resolvedPanel} timeRange={timeRange} refetchInterval={refetchInterval} width={width} height={height} />;
    case 'state-timeline':
      return <StateTimelinePanel panel={resolvedPanel} timeRange={timeRange} refetchInterval={refetchInterval} width={width} height={height} />;
    case 'status-history':
      return <StatusHistoryPanel panel={resolvedPanel} timeRange={timeRange} refetchInterval={refetchInterval} width={width} height={height} />;
    case 'text':
      // No data query: the text panel renders author content from displayOptions.text
      // and ignores timeRange/refetch/width/height.
      return <TextPanel panel={resolvedPanel} />;
    default:
      return (
        <PanelFrame title={resolvedPanel.title}>
          <p className='text-muted-foreground text-sm'>Unknown panel type: {resolvedPanel.type}</p>
        </PanelFrame>
      );
  }
};
