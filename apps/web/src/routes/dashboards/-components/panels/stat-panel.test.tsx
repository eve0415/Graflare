import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig, ValueMapping } from '@graflare/shared/schemas/field-config';
import type { Panel } from '@graflare/shared/schemas/panel';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { barGaugeSegments } from './bar-gauge-data';
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
  transformations: [],
});

const instantValue = (raw: string): PanelDataResult[] => [
  // Minimal Prometheus instant-vector success shape the panel reads.
  { status: 'success', data: { resultType: 'vector', result: [{ metric: {}, value: [0, raw] }] } },
];

// Same shape but with a series name (__name__), so a byName override can match the field.
const namedInstantValue = (name: string, raw: string): PanelDataResult[] => [
  { status: 'success', data: { resultType: 'vector', result: [{ metric: { __name__: name }, value: [0, raw] }] } },
];

// An instant series carrying an explicit metric label set (no __name__), so the derived
// label (first other label value) is what an override must key on.
const labelledInstant = (metric: Record<string, string>, raw: string): PanelDataResult[] => [
  { status: 'success', data: { resultType: 'vector', result: [{ metric, value: [0, raw] }] } },
];

// A stat panel whose defaults set no unit, but a byName override targets `seriesName`.
const statPanelWithOverride = (seriesName: string): Panel => ({
  id: 'p1',
  type: 'stat',
  title: 'Mem',
  description: '',
  queries: [{ refId: 'A', expr: 'mem', legendFormat: '', format: 'time_series' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: {},
  fieldConfig: {
    defaults: { unit: '', mappings: [] },
    overrides: [{ matcher: { id: 'byName', options: seriesName }, properties: [{ id: 'unit', value: 'bytes' }] }],
  },
  transformations: [],
});

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

  it('applies a byName override (matched on the series __name__) to format the value', () => {
    // defaults set no unit; the override gives the `mem_bytes` field the bytes unit.
    mockUsePanelData.mockReturnValue({ data: namedInstantValue('mem_bytes', '1536'), isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<StatPanel panel={statPanelWithOverride('mem_bytes')} timeRange={timeRange} refetchInterval={false} />);
    expect(screen.getByText('1.5 KiB')).toBeDefined();
  });

  it('does not apply an override whose byName matcher does not match the series', () => {
    mockUsePanelData.mockReturnValue({ data: namedInstantValue('cpu_secs', '1536'), isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<StatPanel panel={statPanelWithOverride('mem_bytes')} timeRange={timeRange} refetchInterval={false} />);
    // No match → defaults (no unit) → raw number, never the bytes-formatted string.
    expect(screen.getByText('1536')).toBeDefined();
    expect(screen.queryByText('1.5 KiB')).toBeNull();
  });

  it('applies a byName override matched on the DERIVED label of an instance-only series', () => {
    // No __name__: stat now keys on the same derived label ('web-1') the per-series panels
    // use, so an override authored against the displayed label matches. This is the intended
    // behavior change — stat previously keyed on '' and never matched such a series.
    mockUsePanelData.mockReturnValue({ data: labelledInstant({ instance: 'web-1' }, '1536'), isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<StatPanel panel={statPanelWithOverride('web-1')} timeRange={timeRange} refetchInterval={false} />);
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

describe('cross-panel override consistency', () => {
  // The latent bug this refactor fixes: stat/gauge keyed overrides on `metric.__name__ ?? ''`
  // while the per-series panels keyed on a derived label, so the SAME byName override matched
  // DIFFERENTLY across panel types. Both now route through the shared `seriesDescriptor`, so a
  // byName override on the displayed label of an instance-only series matches identically.
  it('a byName override on an instance-only series matches the same way in stat and bar-gauge', () => {
    // The SAME panel + override drives both assertions, so we're proving one config matches
    // identically across panel types. The instance-only series displays 'web-1', which the
    // override targets — the case where stat used to key on '' and silently miss.
    const panel = statPanelWithOverride('web-1');
    const data = labelledInstant({ instance: 'web-1' }, '1536');

    // Per-series panel (bar-gauge): the matched segment resolves the bytes unit.
    const segments = barGaugeSegments(data, panel.fieldConfig);
    expect(segments[0]?.config.unit).toBe('bytes');

    // Single-value panel (stat): the same override now matches too — it formats 1536 bytes as
    // "1.5 KiB" rather than the raw number it would have shown under the old '' keying.
    mockUsePanelData.mockReturnValue({ data, isLoading: false, error: null, refetch: vi.fn<() => void>() });
    render(<StatPanel panel={panel} timeRange={timeRange} refetchInterval={false} />);
    expect(screen.getByText('1.5 KiB')).toBeDefined();
  });
});
