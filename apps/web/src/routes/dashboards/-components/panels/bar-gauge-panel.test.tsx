import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig, ValueMapping } from '@graflare/shared/schemas/field-config';
import type { Panel } from '@graflare/shared/schemas/panel';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BarGaugePanel } from './bar-gauge-panel';

// Mock the data hook so the panel sees an exact set of series and we assert on the
// rendered bars (labels, formatted values, a11y). The fill geometry is SVG/CSS and
// not asserted here — the segment math is covered in bar-gauge-data.test.ts.
const mockUsePanelData = vi.fn<() => { data: PanelDataResult[] | null; isLoading: boolean; error: unknown; refetch: () => void }>();
vi.mock('./use-panel-data', () => ({ usePanelData: () => mockUsePanelData() }));

const fieldConfig = (unit: string, mappings: ValueMapping[], min?: number, max?: number): FieldConfig => ({
  defaults: min === undefined && max === undefined ? { unit, mappings } : { unit, mappings, min: min ?? 0, max: max ?? 100 },
  overrides: [],
});

const barGaugePanel = (unit: string, mappings: ValueMapping[] = [], min?: number, max?: number): Panel => ({
  id: 'p1',
  type: 'bargauge',
  title: 'Per-instance',
  description: '',
  queries: [{ refId: 'A', expr: 'mem', legendFormat: '', format: 'time_series' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: {},
  fieldConfig: fieldConfig(unit, mappings, min, max),
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

describe('bar-gauge panel', () => {
  it('renders one labelled bar per series with formatted values', () => {
    mockUsePanelData.mockReturnValue({
      data: vector([
        { metric: { __name__: 'mem', instance: 'a' }, value: 1536 },
        { metric: { __name__: 'mem', instance: 'b' }, value: 3072 },
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<BarGaugePanel panel={barGaugePanel('bytes')} timeRange={timeRange} refetchInterval={false} />);

    const meters = screen.getAllByRole('meter');
    expect(meters).toHaveLength(2);
    expect(screen.getByText('1.5 KiB')).toBeDefined();
    expect(screen.getByText('3 KiB')).toBeDefined();
  });

  it('exposes value/min/max on each bar for assistive tech', () => {
    mockUsePanelData.mockReturnValue({
      data: vector([{ metric: { instance: 'web' }, value: 40 }]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<BarGaugePanel panel={barGaugePanel('', [], 0, 80)} timeRange={timeRange} refetchInterval={false} />);

    // Native <meter> carries the value/min/max as element attributes; the label
    // pairs the series name with its formatted value.
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('value')).toBe('40');
    expect(meter.getAttribute('min')).toBe('0');
    expect(meter.getAttribute('max')).toBe('80');
    expect(meter.getAttribute('aria-label')).toBe('web: 40');
  });

  it('a matching value mapping text overrides the formatted value', () => {
    const mappings: ValueMapping[] = [{ type: 'range', from: 1000, to: 2000, result: { text: 'HIGH', color: '#ff0000' } }];
    mockUsePanelData.mockReturnValue({
      data: vector([{ metric: { __name__: 'mem' }, value: 1536 }]),
      isLoading: false,
      error: null,
      refetch: vi.fn<() => void>(),
    });
    render(<BarGaugePanel panel={barGaugePanel('bytes', mappings)} timeRange={timeRange} refetchInterval={false} />);

    expect(screen.getByText('HIGH')).toBeDefined();
    expect(screen.queryByText('1.5 KiB')).toBeNull();
  });

  it('shows a no-data message when there are no series', () => {
    mockUsePanelData.mockReturnValue({ data: null, isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<BarGaugePanel panel={barGaugePanel('bytes')} timeRange={timeRange} refetchInterval={false} />);
    expect(screen.getByText('No data')).toBeDefined();
  });
});
