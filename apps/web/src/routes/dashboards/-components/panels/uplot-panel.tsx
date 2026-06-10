import type { AnnotationMarker } from './annotations-plugin';
import type { Panel } from '@graflare/shared/schemas/panel';
import type { ReactNode } from 'react';
import type uPlot from 'uplot';

import { useMemo } from 'react';

import { UPlotChart } from '../../../-root/uplot-chart';

import { annotationsPlugin } from './annotations-plugin';
import { PanelFrame } from './panel-frame';

interface UPlotPanelProps {
  panel: Panel;
  data: uPlot.AlignedData;
  options: uPlot.Options;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  dataTableContent?: ReactNode;
  /** Annotation overlays (epoch-second markers). When non-empty, an annotations plugin is appended to the chart options. */
  annotationMarkers?: readonly AnnotationMarker[];
}

// Shared render shell for the uPlot-backed panels (time-series, bar-chart,
// histogram): a PanelFrame plus the same empty-data guard and "No data" fallback.
// Each panel computes its own aligned data, options and (optional) data table and
// hands them in — only the chrome is shared. Annotation overlays, when present,
// are merged here so all chart panels share one wiring point.
export const UPlotPanel = ({ panel, data, options, isLoading, error, onRetry, dataTableContent, annotationMarkers }: UPlotPanelProps) => {
  // Appending the plugin produces a new options object; memoize it so the chart's
  // create-effect (keyed on `options`) doesn't tear down and rebuild every render.
  const mergedOptions = useMemo((): uPlot.Options => {
    if (annotationMarkers === undefined || annotationMarkers.length === 0) return options;
    return { ...options, plugins: [...(options.plugins ?? []), annotationsPlugin(annotationMarkers)] };
  }, [options, annotationMarkers]);

  return (
    <PanelFrame
      title={panel.title}
      panelId={panel.id}
      repeat={panel.repeat}
      loading={isLoading}
      error={error instanceof Error ? error.message : null}
      onRetry={onRetry}
      dataTableContent={dataTableContent}
    >
      {data[0] !== undefined && data[0].length > 0 ? (
        <UPlotChart options={mergedOptions} data={data} />
      ) : (
        <p className='text-muted-foreground text-sm'>No data</p>
      )}
    </PanelFrame>
  );
};
