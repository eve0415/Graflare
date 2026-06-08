import type { Annotation } from '@graflare/shared/schemas/annotation';
import type { Panel } from '@graflare/shared/schemas/panel';

import { resolveTime } from '@graflare/shared/time/resolve';
import { useMemo } from 'react';

import { annotationMarkers } from './annotations-plugin';
import { buildHistogramOptions, histogramAlignedData, histogramBuckets, histogramValues } from './histogram-data';
import { UPlotPanel } from './uplot-panel';
import { usePanelQuery } from './use-panel-query';

interface HistogramPanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
  width: number;
  height: number;
  annotations: readonly Annotation[];
}

export const HistogramPanel = ({ panel, timeRange, refetchInterval, width, height, annotations }: HistogramPanelProps) => {
  const { data, isLoading, error, handleRetry } = usePanelQuery(panel, timeRange, refetchInterval);

  const buckets = useMemo(() => {
    const values = histogramValues(data);
    const display = panel.displayOptions.histogram;
    // Build opts by only assigning keys that are set, so the helper's own defaults
    // apply and `exactOptionalPropertyTypes` never sees an `undefined` write.
    const opts: { bucketCount?: number; bucketSize?: number } = {};
    if (display?.bucketCount !== undefined) opts.bucketCount = display.bucketCount;
    if (display?.bucketSize !== undefined) opts.bucketSize = display.bucketSize;
    return histogramBuckets(values, opts);
  }, [data, panel.displayOptions.histogram]);

  const chartData = useMemo(() => histogramAlignedData(buckets), [buckets]);

  const chartOptions = useMemo(
    () => buildHistogramOptions({ defaults: panel.fieldConfig.defaults, width, height }),
    [panel.fieldConfig.defaults, width, height],
  );

  // The histogram x-axis is bucket-value, not time, so epoch-second markers fall
  // outside the scale and the plugin's bbox clip makes them a no-op. Threaded for
  // consistency with the other chart panels; effectively inert here.
  const markers = useMemo(
    () => annotationMarkers(annotations, resolveTime(timeRange.from), resolveTime(timeRange.to)),
    [annotations, timeRange.from, timeRange.to],
  );

  return (
    <UPlotPanel panel={panel} data={chartData} options={chartOptions} isLoading={isLoading} error={error} onRetry={handleRetry} annotationMarkers={markers} />
  );
};
