import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig, ValueMapping } from '@graflare/shared/schemas/field-config';
import type { Panel } from '@graflare/shared/schemas/panel';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StatPanel } from './stat-panel';

// Mock the data hook so we feed the panel an exact Prometheus value and assert
// purely on the formatting/mapping wiring (the math itself is covered in shared).
const mockUsePanelData = vi.fn<() => { data: PanelDataResult[] | null; isLoading: boolean; error: unknown; refetch: () => void }>();
vi.mock('./use-panel-data', () => ({ usePanelData: () => mockUsePanelData() }));

const fieldConfig = (mappings: ValueMapping[], unit: string): FieldConfig => ({
  defaults: { unit, mappings },
  overrides: [],
});

const statPanel = (unit: string, mappings: ValueMapping[] = []): Panel => ({
  id: 'p1',
  type: 'stat',
  title: 'Mem',
  description: '',
  queries: [{ refId: 'A', expr: 'mem', legendFormat: '', format: 'time_series' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: {},
  fieldConfig: fieldConfig(mappings, unit),
});

const instantValue = (raw: string): PanelDataResult[] => [
  // Minimal Prometheus instant-vector success shape the panel reads.
  { status: 'success', data: { resultType: 'vector', result: [{ metric: {}, value: [0, raw] }] } },
];

const timeRange = { from: 'now-1h', to: 'now' };

afterEach(() => {
  cleanup();
  mockUsePanelData.mockReset();
});

describe('stat-panel formatting', () => {
  it('formats a numeric value through the configured unit', () => {
    mockUsePanelData.mockReturnValue({ data: instantValue('1536'), isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<StatPanel panel={statPanel('bytes')} timeRange={timeRange} refetchInterval={false} />);
    expect(screen.getByText('1.5 KiB')).toBeDefined();
  });

  it('a matching value mapping text overrides the formatted value', () => {
    const mappings: ValueMapping[] = [{ type: 'range', from: 1000, to: 2000, result: { text: 'HIGH', color: '#ff0000' } }];
    mockUsePanelData.mockReturnValue({ data: instantValue('1536'), isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<StatPanel panel={statPanel('bytes', mappings)} timeRange={timeRange} refetchInterval={false} />);
    expect(screen.getByText('HIGH')).toBeDefined();
    expect(screen.queryByText('1.5 KiB')).toBeNull();
  });

  it('keeps a non-numeric raw value raw instead of formatting it as a unit', () => {
    mockUsePanelData.mockReturnValue({ data: instantValue('NaN'), isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<StatPanel panel={statPanel('bytes')} timeRange={timeRange} refetchInterval={false} />);
    // The raw token shows; never "NaN B" or a scaled unit string.
    expect(screen.getByText('NaN')).toBeDefined();
    expect(screen.queryByText(/NaN\s*B/)).toBeNull();
  });

  it('shows the em-dash when there is no data', () => {
    mockUsePanelData.mockReturnValue({ data: null, isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<StatPanel panel={statPanel('bytes')} timeRange={timeRange} refetchInterval={false} />);
    expect(screen.getByText('—')).toBeDefined();
  });
});
