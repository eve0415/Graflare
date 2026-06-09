import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig, ValueMapping } from '@graflare/shared/schemas/field-config';
import type { Panel } from '@graflare/shared/schemas/panel';
import type { PieDisplay } from '@graflare/shared/schemas/panel';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PiePanel } from './pie-panel';

// Mock the data hook so the panel sees an exact set of series; the slice geometry is
// SVG and covered in pie-data.test.ts — here we assert labels, formatted values,
// percentages and the accessible name.
const mockUsePanelData = vi.fn<() => { data: PanelDataResult[] | null; isLoading: boolean; error: unknown; refetch: () => void }>();
vi.mock('./use-panel-data', () => ({ usePanelData: () => mockUsePanelData() }));

const fieldConfig = (unit: string, mappings: ValueMapping[]): FieldConfig => ({ defaults: { unit, mappings }, overrides: [] });

const piePanel = (unit: string, mappings: ValueMapping[] = [], pie?: PieDisplay): Panel => ({
  id: 'p1',
  type: 'pie',
  title: 'Share',
  description: '',
  queries: [{ refId: 'A', expr: 'up', legendFormat: '', format: 'time_series' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: pie === undefined ? {} : { pie },
  fieldConfig: fieldConfig(unit, mappings),
});

// Same panel but with a full field config, so a test can supply per-field overrides.
const piePanelWithConfig = (config: FieldConfig): Panel => ({
  id: 'p1',
  type: 'pie',
  title: 'Share',
  description: '',
  queries: [{ refId: 'A', expr: 'up', legendFormat: '', format: 'time_series' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: {},
  fieldConfig: config,
});

const vector = (samples: { metric: Record<string, string>; value: number }[]): PanelDataResult[] => [
  {
    status: 'success',
    data: {
      resultType: 'vector',
      result: samples.map((s): { metric: Record<string, string>; value: [number, string] } => ({ metric: s.metric, value: [0, String(s.value)] })),
    },
  },
];

const timeRange = { from: 'now-1h', to: 'now' };

afterEach(() => {
  cleanup();
  mockUsePanelData.mockReset();
});

describe('pie panel', () => {
  it('renders one legend row per series with formatted values and percentages', () => {
    mockUsePanelData.mockReturnValue({
      data: vector([
        { metric: { __name__: 'a' }, value: 60 },
        { metric: { __name__: 'b' }, value: 40 },
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<PiePanel panel={piePanel('short')} timeRange={timeRange} refetchInterval={false} />);

    expect(screen.getByText('60')).toBeDefined();
    expect(screen.getByText('40')).toBeDefined();
    expect(screen.getByText('60%')).toBeDefined();
    expect(screen.getByText('40%')).toBeDefined();
  });

  it('exposes the slice breakdown through an accessibly-named list', () => {
    mockUsePanelData.mockReturnValue({
      data: vector([
        { metric: { __name__: 'a' }, value: 60 },
        { metric: { __name__: 'b' }, value: 40 },
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<PiePanel panel={piePanel('short')} timeRange={timeRange} refetchInterval={false} />);

    // The legend list carries the accessible representation (the SVG is decorative).
    const list = screen.getByRole('list', { name: 'Pie chart, Share' });
    expect(list).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders a full circle for a single series and names the donut variant', () => {
    mockUsePanelData.mockReturnValue({
      data: vector([{ metric: { __name__: 'only' }, value: 5 }]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    const { container } = render(
      <PiePanel panel={piePanel('short', [], { display: 'donut', legend: 'right' })} timeRange={timeRange} refetchInterval={false} />,
    );

    expect(screen.getByRole('list', { name: 'Donut chart, Share' })).toBeDefined();
    // A single full-circle slice is drawn as <circle>, not a degenerate wedge <path>.
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.querySelector('path')).toBeNull();
    // Two circles: the full-circle slice plus the donut hole.
    expect(svg?.querySelectorAll('circle')).toHaveLength(2);
  });

  it('lets a matching value mapping override the formatted value in the legend', () => {
    const mappings: ValueMapping[] = [{ type: 'range', from: 50, to: 70, result: { text: 'MOST', color: '#ff0000' } }];
    mockUsePanelData.mockReturnValue({
      data: vector([
        { metric: { __name__: 'a' }, value: 60 },
        { metric: { __name__: 'b' }, value: 40 },
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<PiePanel panel={piePanel('short', mappings)} timeRange={timeRange} refetchInterval={false} />);

    expect(screen.getByText('MOST')).toBeDefined();
    expect(screen.queryByText('60')).toBeNull();
  });

  it('keeps the breakdown list accessible (sr-only) when the legend is hidden', () => {
    mockUsePanelData.mockReturnValue({
      data: vector([{ metric: { __name__: 'a' }, value: 10 }]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<PiePanel panel={piePanel('short', [], { display: 'pie', legend: 'none' })} timeRange={timeRange} refetchInterval={false} />);

    // `none` still renders the list for assistive tech, just visually hidden (sr-only).
    const list = screen.getByRole('list', { name: 'Pie chart, Share' });
    expect(list.className).toContain('sr-only');
  });

  it('renders distinct slices when series share a metric name', () => {
    // Common Prometheus shape: one __name__, many series split by an instance label.
    // The label alone isn't a stable React key, so this would warn on duplicate keys
    // if the renderer didn't disambiguate — assert both slices still render.
    mockUsePanelData.mockReturnValue({
      data: vector([
        { metric: { __name__: 'mem', instance: 'a' }, value: 60 },
        { metric: { __name__: 'mem', instance: 'b' }, value: 40 },
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<PiePanel panel={piePanel('short')} timeRange={timeRange} refetchInterval={false} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('applies a byName unit override to its matched slice only', () => {
    // `a` gets the bytes unit via override (1536 -> "1.5 KiB"); `b` keeps the empty
    // default (512 shows raw). The override formats only the matched legend row.
    const config: FieldConfig = {
      defaults: { unit: '', mappings: [] },
      overrides: [{ matcher: { id: 'byName', options: 'a' }, properties: [{ id: 'unit', value: 'bytes' }] }],
    };
    mockUsePanelData.mockReturnValue({
      data: vector([
        { metric: { __name__: 'a' }, value: 1536 },
        { metric: { __name__: 'b' }, value: 512 },
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<PiePanel panel={piePanelWithConfig(config)} timeRange={timeRange} refetchInterval={false} />);

    expect(screen.getByText('1.5 KiB')).toBeDefined();
    // `b` is unmatched: it stays the raw value, never the bytes-formatted string.
    expect(screen.getByText('512')).toBeDefined();
    expect(screen.queryByText('0.5 KiB')).toBeNull();
  });

  it('does not apply a byName override to a non-matching slice (regression: unchanged from defaults)', () => {
    // The override targets a series that isn't present; both slices keep the empty
    // default, so the values render raw exactly as a defaults-only panel did.
    const config: FieldConfig = {
      defaults: { unit: '', mappings: [] },
      overrides: [{ matcher: { id: 'byName', options: 'missing' }, properties: [{ id: 'unit', value: 'bytes' }] }],
    };
    mockUsePanelData.mockReturnValue({
      data: vector([{ metric: { __name__: 'a' }, value: 1536 }]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<PiePanel panel={piePanelWithConfig(config)} timeRange={timeRange} refetchInterval={false} />);

    expect(screen.getByText('1536')).toBeDefined();
    expect(screen.queryByText('1.5 KiB')).toBeNull();
  });

  it('shows a no-data message when there are no series', () => {
    mockUsePanelData.mockReturnValue({ data: null, isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<PiePanel panel={piePanel('short')} timeRange={timeRange} refetchInterval={false} />);
    expect(screen.getByText('No data')).toBeDefined();
  });
});
