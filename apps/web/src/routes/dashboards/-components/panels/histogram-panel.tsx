import type { Panel } from '@graflare/shared/schemas/panel';

import { useCallback, useMemo } from 'react';

import { UPlotChart } from '../../../-root/uplot-chart';

import { buildHistogramOptions, histogramAlignedData, histogramBuckets, histogramValues } from './histogram-data';
import { PanelFrame } from './panel-frame';
import { usePanelData } from './use-panel-data';

interface HistogramPanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
  width: number;
  height: number;
}

export const HistogramPanel = ({ panel, timeRange, refetchInterval, width, height }: HistogramPanelProps) => {
  const { data, isLoading, error, refetch } = usePanelData(panel.datasourceId, panel.queries, timeRange, refetchInterval);

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

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <PanelFrame title={panel.title} panelId={panel.id} loading={isLoading} error={error instanceof Error ? error.message : null} onRetry={handleRetry}>
      {chartData[0] !== undefined && chartData[0].length > 0 ? (
        <UPlotChart options={chartOptions} data={chartData} />
      ) : (
        <p className='text-muted-foreground text-sm'>No data</p>
      )}
    </PanelFrame>
  );
};
