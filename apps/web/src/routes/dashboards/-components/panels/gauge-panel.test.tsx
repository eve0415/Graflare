import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig } from '@graflare/shared/schemas/field-config';
import type { Panel } from '@graflare/shared/schemas/panel';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GaugePanel, describeArc } from './gauge-panel';

// Mock the data hook so we feed the gauge an exact Prometheus value and assert purely on the
// formatting/override wiring (the gauge math itself is covered elsewhere).
const mockUsePanelData = vi.fn<() => { data: PanelDataResult[] | null; isLoading: boolean; error: unknown; refetch: () => void }>();
vi.mock('./use-panel-data', () => ({ usePanelData: () => mockUsePanelData() }));

// A single instant-vector series carrying the given metric labels, so a byName/byType/refId
// override can match the field the gauge resolves.
const namedInstant = (metric: Record<string, string>, raw: string): PanelDataResult[] => [
  { status: 'success', data: { resultType: 'vector', result: [{ metric, value: [0, raw] }] } },
];

// A gauge panel with the given fieldConfig and one query (refId 'A').
const gaugePanel = (fieldConfig: FieldConfig): Panel => ({
  id: 'p1',
  type: 'gauge',
  title: 'Mem',
  description: '',
  queries: [{ refId: 'A', expr: 'mem', legendFormat: '', format: 'time_series' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: {},
  fieldConfig,
  transformations: [],
});

const byNameUnit = (seriesName: string): FieldConfig => ({
  defaults: { unit: '', mappings: [] },
  overrides: [{ matcher: { id: 'byName', options: seriesName }, properties: [{ id: 'unit', value: 'bytes' }] }],
});

const timeRange = { from: 'now-1h', to: 'now' };

afterEach(() => {
  cleanup();
  mockUsePanelData.mockReset();
});

describe('gauge-panel formatting', () => {
  it('formats the center value through the configured unit', () => {
    mockUsePanelData.mockReturnValue({ data: namedInstant({ __name__: 'mem' }, '1536'), isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<GaugePanel panel={gaugePanel({ defaults: { unit: 'bytes', mappings: [] }, overrides: [] })} timeRange={timeRange} refetchInterval={false} />);
    expect(screen.getByText('1.5 KiB')).toBeDefined();
  });

  it('applies a byName override matched on the series __name__', () => {
    mockUsePanelData.mockReturnValue({ data: namedInstant({ __name__: 'mem_bytes' }, '1536'), isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<GaugePanel panel={gaugePanel(byNameUnit('mem_bytes'))} timeRange={timeRange} refetchInterval={false} />);
    expect(screen.getByText('1.5 KiB')).toBeDefined();
  });

  it('applies a byName override matched on the DERIVED label of an instance-only series', () => {
    // No __name__: the gauge now keys on the same derived label every per-series panel uses
    // ('web-1'), so an override authored against the displayed label matches — the behavior
    // change this refactor makes intentional (was keyed on '' and never matched).
    mockUsePanelData.mockReturnValue({ data: namedInstant({ instance: 'web-1' }, '1536'), isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<GaugePanel panel={gaugePanel(byNameUnit('web-1'))} timeRange={timeRange} refetchInterval={false} />);
    expect(screen.getByText('1.5 KiB')).toBeDefined();
  });

  it('does not apply an override whose byName matcher does not match', () => {
    mockUsePanelData.mockReturnValue({ data: namedInstant({ __name__: 'cpu' }, '1536'), isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<GaugePanel panel={gaugePanel(byNameUnit('mem_bytes'))} timeRange={timeRange} refetchInterval={false} />);
    // No match → defaults (no unit) → the raw number, never the bytes-formatted string.
    expect(screen.getByText('1536')).toBeDefined();
    expect(screen.queryByText('1.5 KiB')).toBeNull();
  });

  it('shows the em-dash when there is no data', () => {
    mockUsePanelData.mockReturnValue({ data: null, isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<GaugePanel panel={gaugePanel({ defaults: { unit: 'bytes', mappings: [] }, overrides: [] })} timeRange={timeRange} refetchInterval={false} />);
    expect(screen.getByText('—')).toBeDefined();
  });
});

describe('describeArc', () => {
  it('maps the sweep onto the TOP semicircle: min at the left, max at the right', () => {
    // -90deg = min, +90deg = max. The old cos/sin mapping drew the RIGHT half-circle
    // (12 o'clock to 6 o'clock), leaving half the dial outside the 200x130 viewBox.
    expect(describeArc(-90, 90, 80)).toBe('M 20 100 A 80 80 0 0 1 180 100');
  });

  it("puts the midpoint at 12 o'clock", () => {
    expect(describeArc(-90, 0, 80)).toBe('M 20 100 A 80 80 0 0 1 100 20');
  });
});
