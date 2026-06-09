import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig } from '@graflare/shared/schemas/field-config';
import type { Panel, StatusHistoryDisplay } from '@graflare/shared/schemas/panel';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StatusHistoryPanel } from './status-history-panel';

// The status history renders a pure SVG grid (no uPlot), so only the data hook is
// mocked. The cell/color math is covered in status-history-data.test.ts /
// state-color.test.ts; here we assert the panel turns cells into an accessible,
// populated <svg> of state boxes.
const mockUsePanelData = vi.fn<() => { data: PanelDataResult[] | null; isLoading: boolean; error: unknown; refetch: () => void }>();
vi.mock('./use-panel-data', () => ({ usePanelData: () => mockUsePanelData() }));

const panel = (display?: StatusHistoryDisplay): Panel => ({
  id: 'p1',
  type: 'status-history',
  title: 'History',
  description: '',
  queries: [{ refId: 'A', expr: 'state', legendFormat: '', format: 'time_series' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [
    { value: 0, color: '#22c55e' },
    { value: 1, color: '#ef4444' },
  ],
  displayOptions: display === undefined ? {} : { 'status-history': display },
  fieldConfig: { defaults: { unit: 'short', mappings: [] }, overrides: [] },
  transformations: [],
});

// Same panel but with a full field config so a test can supply per-field overrides.
const panelWithConfig = (config: FieldConfig): Panel => ({
  id: 'p1',
  type: 'status-history',
  title: 'History',
  description: '',
  queries: [{ refId: 'A', expr: 'state', legendFormat: '', format: 'time_series' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: {},
  fieldConfig: config,
  transformations: [],
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

describe('status history panel', () => {
  it('renders an accessible svg with one rect per sample (no merging)', () => {
    mockUsePanelData.mockReturnValue({
      data: matrix([
        {
          metric: { __name__: 'state' },
          values: [
            [0, 1],
            [10, 1],
            [20, 1],
          ],
        },
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<StatusHistoryPanel panel={panel()} timeRange={timeRange} refetchInterval={false} width={400} height={300} />);

    // Three identical samples stay three separate cells (status history never merges).
    const svg = screen.getByLabelText(/Status history, 1 series/);
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.querySelectorAll('rect.gf-status-cell')).toHaveLength(3);
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
    render(<StatusHistoryPanel panel={panel()} timeRange={timeRange} refetchInterval={false} width={400} height={300} />);

    expect(screen.getByLabelText(/Status history, 2 series/)).toBeDefined();
  });

  it('recolors only the lane matched by a byName mappings override', () => {
    // Two single-sample lanes share value 1 with no thresholds. `a` has a byName mappings
    // override coloring 1 green; `b` is unmatched and falls back to the neutral slate.
    // Proves the per-lane mappings reach the SVG color path.
    const config: FieldConfig = {
      defaults: { unit: 'short', mappings: [] },
      overrides: [
        {
          matcher: { id: 'byName', options: 'a' },
          properties: [{ id: 'mappings', value: [{ type: 'value', value: '1', result: { color: '#00ff00' } }] }],
        },
      ],
    };
    mockUsePanelData.mockReturnValue({
      data: matrix([
        { metric: { __name__: 'a' }, values: [[0, 1]] },
        { metric: { __name__: 'b' }, values: [[0, 1]] },
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    const { container } = render(<StatusHistoryPanel panel={panelWithConfig(config)} timeRange={timeRange} refetchInterval={false} width={400} height={300} />);

    const fills = [...container.querySelectorAll('rect.gf-status-cell')].map(r => r.getAttribute('fill'));
    expect(fills).toContain('#00ff00');
    expect(fills).toContain('#64748b');
  });

  it('shows a no-data message and no svg when there is no data', () => {
    mockUsePanelData.mockReturnValue({ data: null, isLoading: false, error: null, refetch: vi.fn<() => void>() });
    const { container } = render(<StatusHistoryPanel panel={panel()} timeRange={timeRange} refetchInterval={false} width={400} height={300} />);

    expect(screen.getByText('No data')).toBeDefined();
    expect(container.querySelector('svg')).toBeNull();
  });
});
