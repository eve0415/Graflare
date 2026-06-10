import type { PanelDataResult } from './use-panel-data';
import type { HeatmapDisplay, Panel } from '@graflare/shared/schemas/panel';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HeatmapPanel } from './heatmap-panel';

// The heatmap renders a pure SVG grid (no uPlot), so only the data hook is mocked. The
// bucketing/color math is covered in heatmap-data.test.ts / heatmap-color.test.ts; here
// we assert the panel turns a grid into an accessible, populated <svg>.
const mockUsePanelData = vi.fn<() => { data: PanelDataResult[] | null; isLoading: boolean; error: unknown; refetch: () => void }>();
vi.mock('./use-panel-data', () => ({ usePanelData: () => mockUsePanelData() }));

const heatmapPanel = (heatmap?: HeatmapDisplay): Panel => ({
  id: 'p1',
  type: 'heatmap',
  title: 'Density',
  description: '',
  queries: [{ refId: 'A', expr: 'latency', legendFormat: '', format: 'time_series' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: heatmap === undefined ? {} : { heatmap },
  fieldConfig: { defaults: { unit: 'short', mappings: [] }, overrides: [] },
  transformations: [],
  repeatDirection: 'h',
  maxPerRow: 4,
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
});

describe('heatmap panel', () => {
  it('renders an accessible svg grid with one rect per occupied cell', () => {
    mockUsePanelData.mockReturnValue({
      data: matrix([
        {
          metric: { __name__: 'latency' },
          values: [
            [0, 0],
            [10, 10],
          ],
        },
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(
      <HeatmapPanel
        panel={heatmapPanel({ xBuckets: 2, yBuckets: 2, colorScheme: 'blues' })}
        timeRange={timeRange}
        refetchInterval={false}
        width={400}
        height={300}
      />,
    );

    // Two samples at opposite corners -> exactly two occupied cells, so two <rect>s.
    // The grid is named via aria-label (no role='img', which the a11y linter rejects on
    // an <svg>), so query it by its accessible name.
    const img = screen.getByLabelText(/Heatmap, 2 cells/);
    expect(img.tagName.toLowerCase()).toBe('svg');
    expect(img.querySelectorAll('rect')).toHaveLength(2);
  });

  it('names the grid with the cell count and peak density', () => {
    mockUsePanelData.mockReturnValue({
      data: matrix([
        {
          metric: { __name__: 'latency' },
          values: [
            [0, 5],
            [0, 5],
            [10, 1],
          ],
        },
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(
      <HeatmapPanel
        panel={heatmapPanel({ xBuckets: 4, yBuckets: 4, colorScheme: 'turbo' })}
        timeRange={timeRange}
        refetchInterval={false}
        width={400}
        height={300}
      />,
    );

    // Two samples share one cell (peak 2), the third lands elsewhere.
    expect(screen.getByLabelText(/Heatmap, 2 cells, peak 2/)).toBeDefined();
  });

  it('shows a no-data message and no svg when there is no data', () => {
    mockUsePanelData.mockReturnValue({ data: null, isLoading: false, error: null, refetch: vi.fn<() => void>() });
    const { container } = render(<HeatmapPanel panel={heatmapPanel()} timeRange={timeRange} refetchInterval={false} width={400} height={300} />);

    expect(screen.getByText('No data')).toBeDefined();
    expect(container.querySelector('svg')).toBeNull();
  });
});
