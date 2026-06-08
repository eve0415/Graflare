import type { PanelDataResult } from './use-panel-data';
import type { HistogramDisplay, Panel } from '@graflare/shared/schemas/panel';
import type uPlot from 'uplot';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HistogramPanel } from './histogram-panel';

// uPlot can't instantiate under jsdom, so the chart wrapper is mocked: the panel's
// job is to hand it well-formed options + data, which we capture and assert. The
// bucketing math itself is covered in histogram-data.test.ts.
const mockUPlotChart = vi.fn<(props: { options: uPlot.Options; data: uPlot.AlignedData }) => null>(() => null);
vi.mock('../../../-root/uplot-chart', () => ({ UPlotChart: (props: { options: uPlot.Options; data: uPlot.AlignedData }) => mockUPlotChart(props) }));

const mockUsePanelData = vi.fn<() => { data: PanelDataResult[] | null; isLoading: boolean; error: unknown; refetch: () => void }>();
vi.mock('./use-panel-data', () => ({ usePanelData: () => mockUsePanelData() }));

const histogramPanel = (unit: string, histogram?: HistogramDisplay): Panel => ({
  id: 'p1',
  type: 'histogram',
  title: 'Distribution',
  description: '',
  queries: [{ refId: 'A', expr: 'latency', legendFormat: '', format: 'time_series' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: histogram === undefined ? {} : { histogram },
  fieldConfig: { defaults: { unit, mappings: [] }, overrides: [] },
});

const matrix = (rows: { metric: Record<string, string>; values: [number, number][] }[]): PanelDataResult[] => [
  {
    status: 'success',
    data: { resultType: 'matrix', result: rows.map(r => ({ metric: r.metric, values: r.values.map(([t, v]): [number, string] => [t, String(v)]) })) },
  },
];

const timeRange = { from: 'now-1h', to: 'now' };

afterEach(() => {
  cleanup();
  mockUsePanelData.mockReset();
  mockUPlotChart.mockClear();
});

describe('histogram panel', () => {
  it('buckets the samples and renders bars with midpoint x and count y', () => {
    mockUsePanelData.mockReturnValue({
      data: matrix([
        {
          metric: { __name__: 'latency' },
          values: [
            [1, 0],
            [2, 10],
          ],
        },
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<HistogramPanel panel={histogramPanel('short', { bucketCount: 2 })} timeRange={timeRange} refetchInterval={false} width={400} height={300} />);

    expect(mockUPlotChart).toHaveBeenCalledTimes(1);
    const props = mockUPlotChart.mock.calls[0]?.[0];
    // values 0 and 10, bucketCount 2 -> bins [0,5) and [5,10], midpoints 2.5 / 7.5.
    expect(props?.data[0]).toEqual([2.5, 7.5]);
    expect(props?.data[1]).toEqual([1, 1]);
    // The count series uses the bars path-builder; the x-axis formats the bucket bounds.
    expect(typeof props?.options.series[1]?.paths).toBe('function');
    expect(typeof props?.options.axes?.[0]?.values).toBe('function');
  });

  it('shows a no-data message and skips the chart when there is no data', () => {
    mockUsePanelData.mockReturnValue({ data: null, isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<HistogramPanel panel={histogramPanel('short')} timeRange={timeRange} refetchInterval={false} width={400} height={300} />);

    expect(screen.getByText('No data')).toBeDefined();
    expect(mockUPlotChart).not.toHaveBeenCalled();
  });
});
