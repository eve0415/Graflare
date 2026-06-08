import type { Panel } from '@graflare/shared/schemas/panel';
import type { ReactNode } from 'react';
import type uPlot from 'uplot';

import { UPlotChart } from '../../../-root/uplot-chart';

import { PanelFrame } from './panel-frame';

interface UPlotPanelProps {
  panel: Panel;
  data: uPlot.AlignedData;
  options: uPlot.Options;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  dataTableContent?: ReactNode;
}

// Shared render shell for the uPlot-backed panels (time-series, bar-chart,
// histogram): a PanelFrame plus the same empty-data guard and "No data" fallback.
// Each panel computes its own aligned data, options and (optional) data table and
// hands them in — only the chrome is shared.
export const UPlotPanel = ({ panel, data, options, isLoading, error, onRetry, dataTableContent }: UPlotPanelProps) => (
  <PanelFrame
    title={panel.title}
    panelId={panel.id}
    loading={isLoading}
    error={error instanceof Error ? error.message : null}
    onRetry={onRetry}
    dataTableContent={dataTableContent}
  >
    {data[0] !== undefined && data[0].length > 0 ? <UPlotChart options={options} data={data} /> : <p className='text-muted-foreground text-sm'>No data</p>}
  </PanelFrame>
);
