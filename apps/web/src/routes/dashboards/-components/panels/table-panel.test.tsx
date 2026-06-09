import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig } from '@graflare/shared/schemas/field-config';
import type { Panel } from '@graflare/shared/schemas/panel';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TablePanel } from './table-panel';

// Mock the data hook (transitively used by usePanelQuery) so we feed exact SQL columns/rows
// and assert purely on the per-column resolved formatting.
const mockUsePanelData = vi.fn<() => { data: PanelDataResult[] | null; isLoading: boolean; error: unknown; refetch: () => void }>();
vi.mock('./use-panel-data', () => ({ usePanelData: () => mockUsePanelData() }));

const tablePanel = (fieldConfig: FieldConfig): Panel => ({
  id: 'p1',
  type: 'table',
  title: 'T',
  description: '',
  queries: [{ refId: 'A', expr: 'select 1', legendFormat: '', format: 'table' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: {},
  fieldConfig,
});

// A SQL response: two columns (a numeric `bytes` and a string `label`), one row. The table
// reads this shape directly (no `status`).
const sqlData = (): PanelDataResult[] => [
  {
    columns: [
      { name: 'bytes', type: 'number' },
      { name: 'label', type: 'string' },
    ],
    rows: [[1536, 'ok']],
  },
];

const timeRange = { from: 'now-1h', to: 'now' };

const renderTable = (fieldConfig: FieldConfig) => {
  mockUsePanelData.mockReturnValue({ data: sqlData(), isLoading: false, error: null, refetch: vi.fn<() => void>() });
  render(<TablePanel panel={tablePanel(fieldConfig)} timeRange={timeRange} refetchInterval={false} />);
};

afterEach(() => {
  cleanup();
  mockUsePanelData.mockReset();
});

describe('table-panel per-field overrides', () => {
  it('renders with defaults when overrides is empty (regression: unchanged from before)', () => {
    // unit 'bytes' on defaults applies to every numeric cell, exactly as a defaults-only panel did.
    renderTable({ defaults: { unit: 'bytes', mappings: [] }, overrides: [] });
    expect(screen.getByText('1.5 KiB')).toBeDefined();
  });

  it('applies a byName override to its matched column only', () => {
    // defaults have no unit; an override targets the `bytes` column with unit 'bytes'.
    renderTable({
      defaults: { unit: '', mappings: [] },
      overrides: [{ matcher: { id: 'byName', options: 'bytes' }, properties: [{ id: 'unit', value: 'bytes' }] }],
    });
    expect(screen.getByText('1.5 KiB')).toBeDefined();
  });

  it('does not apply a byName override to a non-matching column', () => {
    // Override targets a column that doesn't exist; the numeric cell stays raw (no unit).
    renderTable({
      defaults: { unit: '', mappings: [] },
      overrides: [{ matcher: { id: 'byName', options: 'other' }, properties: [{ id: 'unit', value: 'bytes' }] }],
    });
    expect(screen.getByText('1536')).toBeDefined();
    expect(screen.queryByText('1.5 KiB')).toBeNull();
  });

  it('applies a byType override to columns of the matching SQL type', () => {
    // byType 'number' matches the `bytes` column; the string `label` column is untouched.
    renderTable({
      defaults: { unit: '', mappings: [] },
      overrides: [{ matcher: { id: 'byType', options: 'number' }, properties: [{ id: 'unit', value: 'bytes' }] }],
    });
    expect(screen.getByText('1.5 KiB')).toBeDefined();
    expect(screen.getByText('ok')).toBeDefined();
  });
});
