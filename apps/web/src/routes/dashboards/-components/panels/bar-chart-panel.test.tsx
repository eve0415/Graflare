import type { PanelDataResult } from './use-panel-data';
import type { Annotation } from '@graflare/shared/schemas/annotation';
import type { Panel } from '@graflare/shared/schemas/panel';
import type uPlot from 'uplot';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BarChartPanel } from './bar-chart-panel';

// uPlot can't instantiate under jsdom, so the chart wrapper is mocked: the panel's
// job is to hand it well-formed options + data, which we capture and assert.
const mockUPlotChart = vi.fn<(props: { options: uPlot.Options; data: uPlot.AlignedData }) => null>(() => null);
vi.mock('../../../-root/uplot-chart', () => ({ UPlotChart: (props: { options: uPlot.Options; data: uPlot.AlignedData }) => mockUPlotChart(props) }));

const mockUsePanelData = vi.fn<() => { data: PanelDataResult[] | null; isLoading: boolean; error: unknown; refetch: () => void }>();
vi.mock('./use-panel-data', () => ({ usePanelData: () => mockUsePanelData() }));

const barChartPanel = (unit: string): Panel => ({
  id: 'p1',
  type: 'barchart',
  title: 'Requests',
  description: '',
  queries: [{ refId: 'A', expr: 'rate(req[5m])', legendFormat: '', format: 'time_series' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: {},
  fieldConfig: { defaults: { unit, mappings: [] }, overrides: [] },
});

const matrix = (rows: { metric: Record<string, string>; values: [number, number][] }[]): PanelDataResult[] => [
  {
    status: 'success',
    data: { resultType: 'matrix', result: rows.map(r => ({ metric: r.metric, values: r.values.map(([t, v]): [number, string] => [t, String(v)]) })) },
  },
];

const timeRange = { from: 'now-1h', to: 'now' };
const noAnnotations: Annotation[] = [];

afterEach(() => {
  cleanup();
  mockUsePanelData.mockReset();
  mockUPlotChart.mockClear();
});

describe('bar-chart panel', () => {
  it('renders the chart with bar paths and aligned data when there is data', () => {
    mockUsePanelData.mockReturnValue({
      data: matrix([
        {
          metric: { __name__: 'req' },
          values: [
            [1, 5],
            [2, 9],
          ],
        },
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<BarChartPanel panel={barChartPanel('short')} timeRange={timeRange} refetchInterval={false} width={400} height={300} annotations={noAnnotations} />);

    expect(mockUPlotChart).toHaveBeenCalledTimes(1);
    const props = mockUPlotChart.mock.calls[0]?.[0];
    expect(props?.data[0]).toEqual([1, 2]);
    expect(props?.data[1]).toEqual([5, 9]);
    expect(typeof props?.options.series[1]?.paths).toBe('function');
    expect(typeof props?.options.axes?.[1]?.values).toBe('function');
  });

  it('shows a no-data message and skips the chart when there is no data', () => {
    mockUsePanelData.mockReturnValue({ data: null, isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<BarChartPanel panel={barChartPanel('short')} timeRange={timeRange} refetchInterval={false} width={400} height={300} annotations={noAnnotations} />);

    expect(screen.getByText('No data')).toBeDefined();
    expect(mockUPlotChart).not.toHaveBeenCalled();
  });
});
