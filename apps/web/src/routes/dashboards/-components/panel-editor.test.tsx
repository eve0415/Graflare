import type { Panel } from '@graflare/shared/schemas/panel';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PanelEditor } from './panel-editor';

afterEach(cleanup);

// Base UI's Select doesn't commit a selection on a bare click in jsdom; the pointerDown/Up/click
// sequence does (verified). Open the trigger, then pick the option by its accessible name.
const selectOption = (trigger: HTMLElement, optionName: string) => {
  fireEvent.click(trigger);
  const option = screen.getByRole('option', { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.pointerUp(option);
  fireEvent.click(option);
};

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

  it('shows the threshold color hex as text alongside the swatch', () => {
    const panel = basePanel();
    panel.thresholds = [{ value: 10, color: '#ef4444' }];
    renderEditor(panel, vi.fn<(p: Panel) => void>());

    // The swatch is unreadable for color-blind users; the hex value is surfaced as text.
    expect(screen.getByLabelText('Threshold 1 color')).toBeDefined();
    expect(screen.getByText('#ef4444')).toBeDefined();
  });
});

describe('panel-editor field overrides', () => {
  it('shows an empty-state hint and no override groups when there are none', () => {
    renderEditor(basePanel(), vi.fn<(p: Panel) => void>());
    expect(screen.getByText('Field overrides')).toBeDefined();
    expect(screen.getByText(/No field overrides/)).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Override 1' })).toBeNull();
  });

  it('adds an override defaulting to a byName matcher with empty options and no properties', () => {
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(basePanel(), onSave);

    fireEvent.click(screen.getByRole('button', { name: 'Add field override' }));
    // The new override is a scoped group; its empty-property hint shows.
    const group = screen.getByRole('group', { name: 'Override 1' });
    expect(within(group).getByText(/No properties yet/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].fieldConfig.overrides).toEqual([{ matcher: { id: 'byName', options: '' }, properties: [] }]);
  });

  it('writes a byName matcher + unit property to the exact schema shape', () => {
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(basePanel(), onSave);

    fireEvent.click(screen.getByRole('button', { name: 'Add field override' }));
    const group = screen.getByRole('group', { name: 'Override 1' });

    // byName is the default — set its options via the adaptive "Field name" input.
    fireEvent.change(within(group).getByLabelText('Field name'), { target: { value: 'cpu' } });

    // Add a unit property through the action-menu Select, then pick a unit value.
    selectOption(within(group).getByRole('combobox', { name: 'Add property to Override 1' }), 'Unit');
    const unitProp = within(group).getByRole('group', { name: 'Override 1 Unit' });
    selectOption(within(unitProp).getByRole('combobox'), 'Percent (0-100)');

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].fieldConfig.overrides).toEqual([
      { matcher: { id: 'byName', options: 'cpu' }, properties: [{ id: 'unit', value: 'percent' }] },
    ]);
  });

  it('adds a numeric (min) property whose value is a required number, defaulting to 0', () => {
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(basePanel(), onSave);

    fireEvent.click(screen.getByRole('button', { name: 'Add field override' }));
    const group = screen.getByRole('group', { name: 'Override 1' });
    selectOption(within(group).getByRole('combobox', { name: 'Add property to Override 1' }), 'Min');

    // Freshly added min is 0 (the schema value is required, no undefined slot).
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].fieldConfig.overrides[0]?.properties).toEqual([{ id: 'min', value: 0 }]);

    // Editing it keeps the typed number.
    const minProp = within(group).getByRole('group', { name: 'Override 1 Min' });
    fireEvent.change(within(minProp).getByLabelText('Min'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[1]?.[0].fieldConfig.overrides[0]?.properties).toEqual([{ id: 'min', value: 5 }]);
  });

  // The add-property control is a value={null} action-menu Select: each pick must register even
  // after the previous add re-rendered the row (new properties array, new callback identity). Two
  // sequential adds is the real add-several-properties flow, not just same-option-twice in isolation.
  it('adds multiple properties sequentially to one override', () => {
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(basePanel(), onSave);

    fireEvent.click(screen.getByRole('button', { name: 'Add field override' }));
    const group = screen.getByRole('group', { name: 'Override 1' });
    selectOption(within(group).getByRole('combobox', { name: 'Add property to Override 1' }), 'Unit');
    selectOption(within(group).getByRole('combobox', { name: 'Add property to Override 1' }), 'Min');

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].fieldConfig.overrides[0]?.properties).toEqual([
      { id: 'unit', value: '' },
      { id: 'min', value: 0 },
    ]);
  });

  it('changes the matcher kind and adapts the options label', () => {
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(basePanel(), onSave);

    fireEvent.click(screen.getByRole('button', { name: 'Add field override' }));
    const group = screen.getByRole('group', { name: 'Override 1' });
    // byName shows "Field name"; switching to byRegexp re-labels the same options input to "Regex".
    expect(within(group).getByLabelText('Field name')).toBeDefined();
    selectOption(within(group).getByLabelText('Matcher'), 'By regex');
    expect(within(group).getByLabelText('Regex')).toBeDefined();

    fireEvent.change(within(group).getByLabelText('Regex'), { target: { value: '/cpu.*/' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].fieldConfig.overrides[0]?.matcher).toEqual({ id: 'byRegexp', options: '/cpu.*/' });
  });

  it('removes a property, then removes the override', () => {
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(basePanel(), onSave);

    fireEvent.click(screen.getByRole('button', { name: 'Add field override' }));
    const group = screen.getByRole('group', { name: 'Override 1' });
    selectOption(within(group).getByRole('combobox', { name: 'Add property to Override 1' }), 'Decimals');
    expect(within(group).getByRole('group', { name: 'Override 1 Decimals' })).toBeDefined();

    // Remove the property — back to the empty-property hint.
    fireEvent.click(within(group).getByRole('button', { name: 'Remove Override 1 Decimals' }));
    expect(within(group).getByText(/No properties yet/)).toBeDefined();

    // Remove the whole override — back to the section empty state.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Override 1' }));
    expect(screen.queryByRole('group', { name: 'Override 1' })).toBeNull();
    expect(screen.getByText(/No field overrides/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].fieldConfig.overrides).toEqual([]);
  });

  it('seeds an imported override into editable rows (round-trip)', () => {
    const panel = basePanel();
    panel.fieldConfig.overrides = [
      {
        matcher: { id: 'byRegexp', options: '/cpu.*/' },
        properties: [
          { id: 'unit', value: 'percent' },
          { id: 'decimals', value: 2 },
        ],
      },
    ];
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(panel, onSave);

    const group = screen.getByRole('group', { name: 'Override 1' });
    // The matcher kind seeds to byRegexp (its options input is labelled "Regex") with its value,
    // and both imported properties render as scoped rows.
    const regex = within(group).getByLabelText('Regex');
    expect(regex).toHaveProperty('value', '/cpu.*/');
    expect(within(group).getByRole('group', { name: 'Override 1 Unit' })).toBeDefined();
    const decimals = within(within(group).getByRole('group', { name: 'Override 1 Decimals' })).getByLabelText('Decimals');
    expect(decimals).toHaveProperty('value', '2');

    // Round-trips unchanged through Apply when nothing is edited.
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].fieldConfig.overrides).toEqual(panel.fieldConfig.overrides);
  });
});

const textPanel = (): Panel => ({ ...basePanel(), type: 'text', displayOptions: {} });

describe('panel-editor text content', () => {
  it('omits the Content section for a non-text panel', () => {
    renderEditor(basePanel(), vi.fn<(p: Panel) => void>());
    expect(screen.queryByLabelText('Panel content')).toBeNull();
  });

  it('shows the Content section (textarea + mode) for a text panel', () => {
    renderEditor(textPanel(), vi.fn<(p: Panel) => void>());
    expect(screen.getByText('Content')).toBeDefined();
    expect(screen.getByLabelText('Panel content')).toBeDefined();
    expect(screen.getByLabelText('Mode')).toBeDefined();
  });

  it('writes typed content into displayOptions.text, defaulting mode to markdown', () => {
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(textPanel(), onSave);

    fireEvent.change(screen.getByLabelText('Panel content'), { target: { value: '# Title\n- x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onSave.mock.calls[0]?.[0].displayOptions.text).toEqual({ content: '# Title\n- x', mode: 'markdown' });
  });

  it('seeds existing content into the textarea and preserves mode when editing content', () => {
    const panel = textPanel();
    panel.displayOptions = { text: { content: '<b>hi</b>', mode: 'html' } };
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(panel, onSave);

    const textarea = screen.getByLabelText('Panel content');
    expect(textarea).toHaveProperty('value', '<b>hi</b>');

    // Editing content must keep the existing html mode, not reset it to markdown.
    fireEvent.change(textarea, { target: { value: '<i>bye</i>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].displayOptions.text).toEqual({ content: '<i>bye</i>', mode: 'html' });
  });
});
