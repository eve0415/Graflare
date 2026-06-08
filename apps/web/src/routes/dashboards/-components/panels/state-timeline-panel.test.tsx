import type { PanelDataResult } from './use-panel-data';
import type { Panel, StateTimelineDisplay } from '@graflare/shared/schemas/panel';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StateTimelinePanel } from './state-timeline-panel';

// The state timeline renders a pure SVG (no uPlot), so only the data hook is mocked.
// The segment-merge/color math is covered in state-timeline-data.test.ts /
// state-color.test.ts; here we assert the panel turns lanes into an accessible,
// populated <svg> of colored segments.
const mockUsePanelData = vi.fn<() => { data: PanelDataResult[] | null; isLoading: boolean; error: unknown; refetch: () => void }>();
vi.mock('./use-panel-data', () => ({ usePanelData: () => mockUsePanelData() }));

const panel = (display?: StateTimelineDisplay): Panel => ({
  id: 'p1',
  type: 'state-timeline',
  title: 'States',
  description: '',
  queries: [{ refId: 'A', expr: 'state', legendFormat: '', format: 'time_series' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [
    { value: 0, color: '#22c55e' },
    { value: 1, color: '#ef4444' },
  ],
  displayOptions: display === undefined ? {} : { 'state-timeline': display },
  fieldConfig: { defaults: { unit: 'short', mappings: [] }, overrides: [] },
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

describe('state timeline panel', () => {
  it('renders an accessible svg with one rect per merged segment', () => {
    mockUsePanelData.mockReturnValue({
      data: matrix([
        {
          metric: { __name__: 'state' },
          values: [
            [0, 0],
            [10, 1],
            [20, 1],
          ],
        },
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<StateTimelinePanel panel={panel()} timeRange={timeRange} refetchInterval={false} width={400} height={300} />);

    // Two runs (0 then 1, the second 1 merges) -> two segment rects. Queried by the
    // svg's accessible name (no role='img', which the a11y linter rejects on <svg>).
    const svg = screen.getByLabelText(/State timeline, 1 series/);
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.querySelectorAll('rect.gf-state-segment')).toHaveLength(2);
  });

  it('names the svg with the series count', () => {
    mockUsePanelData.mockReturnValue({
      data: matrix([
        { metric: { __name__: 'a' }, values: [[0, 1]] },
        { metric: { __name__: 'b' }, values: [[0, 0]] },
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<StateTimelinePanel panel={panel()} timeRange={timeRange} refetchInterval={false} width={400} height={300} />);

    expect(screen.getByLabelText(/State timeline, 2 series/)).toBeDefined();
  });

  it('shows a no-data message and no svg when there is no data', () => {
    mockUsePanelData.mockReturnValue({ data: null, isLoading: false, error: null, refetch: vi.fn<() => void>() });
    const { container } = render(<StateTimelinePanel panel={panel()} timeRange={timeRange} refetchInterval={false} width={400} height={300} />);

    expect(screen.getByText('No data')).toBeDefined();
    expect(container.querySelector('svg')).toBeNull();
  });
});
