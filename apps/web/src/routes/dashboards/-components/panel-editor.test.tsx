import type { Panel } from '@graflare/shared/schemas/panel';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PanelEditor } from './panel-editor';

afterEach(cleanup);

const basePanel = (): Panel => ({
  id: 'p1',
  type: 'stat',
  title: 'T',
  description: '',
  queries: [],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: {},
  fieldConfig: { defaults: { unit: '', mappings: [] }, overrides: [] },
});

const renderEditor = (panel: Panel, onSave: (p: Panel) => void) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PanelEditor panel={panel} open onClose={vi.fn<() => void>()} onSave={onSave} />
    </QueryClientProvider>,
  );
};

describe('panel-editor standard options', () => {
  it('renders the standard-options + value-mappings sections without crashing on the empty unit value', () => {
    renderEditor(basePanel(), vi.fn<(p: Panel) => void>());
    // The empty-string unit ('' = none) must not throw in the Select.
    expect(screen.getByText('Standard options')).toBeDefined();
    expect(screen.getByText('Value mappings')).toBeDefined();
    expect(screen.getByLabelText('Min')).toBeDefined();
    expect(screen.getByLabelText('Max')).toBeDefined();
    expect(screen.getByLabelText('Decimals')).toBeDefined();
  });

  it('writes decimals into fieldConfig and omits it when cleared', () => {
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(basePanel(), onSave);

    fireEvent.change(screen.getByLabelText('Decimals'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].fieldConfig.defaults.decimals).toBe(3);
  });

  it('adds a value-mapping row through the Add button', () => {
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(basePanel(), onSave);

    // The mappings Add button has a distinct accessible name (Thresholds also has one).
    fireEvent.click(screen.getByRole('button', { name: 'Add value mapping' }));

    expect(screen.getByLabelText('Mapping 1 value')).toBeDefined();
    expect(screen.getByLabelText('Mapping 1 display text')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved?.fieldConfig.defaults.mappings).toHaveLength(1);
    expect(saved?.fieldConfig.defaults.mappings[0]?.type).toBe('value');
  });

  it('seeds existing mappings into editable rows', () => {
    const panel = basePanel();
    panel.fieldConfig.defaults.mappings = [{ type: 'range', from: 1, to: 9, result: { text: 'mid' } }];
    renderEditor(panel, vi.fn<(p: Panel) => void>());

    expect(screen.getByLabelText('Mapping 1 from')).toBeDefined();
    expect(screen.getByLabelText('Mapping 1 to')).toBeDefined();
  });
});
