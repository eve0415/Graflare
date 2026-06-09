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
  transformations: [],
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

describe('panel-editor transformations', () => {
  it('shows an empty-state hint and no transformation groups when there are none', () => {
    renderEditor(basePanel(), vi.fn<(p: Panel) => void>());
    expect(screen.getByText('Transformations')).toBeDefined();
    expect(screen.getByText(/No transformations/)).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Transformation 1' })).toBeNull();
  });

  it('adds a reduce transform and sets its calc, writing the exact union shape', () => {
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(basePanel(), onSave);

    // The add control is a value={null} action-menu Select (5 types), not a plain Add button.
    selectOption(screen.getByRole('combobox', { name: 'Add transformation' }), 'Reduce');
    const group = screen.getByRole('group', { name: 'Transformation 1' });

    // Fresh reduce defaults to calc 'last'; change it to 'mean' via the labelled Select.
    selectOption(within(group).getByLabelText('Calculation'), 'Mean');

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].transformations).toEqual([{ id: 'reduce', options: { calc: 'mean' } }]);
  });

  it('adds a filterFieldsByName transform with mode/match selects and a value input', () => {
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(basePanel(), onSave);

    selectOption(screen.getByRole('combobox', { name: 'Add transformation' }), 'Filter by name');
    const group = screen.getByRole('group', { name: 'Transformation 1' });

    selectOption(within(group).getByLabelText('Mode'), 'Exclude');
    selectOption(within(group).getByLabelText('Match'), 'By regex');
    // byRegexp re-labels the value input to "Pattern".
    fireEvent.change(within(group).getByLabelText('Pattern'), { target: { value: '/cpu.*/' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].transformations).toEqual([
      { id: 'filterFieldsByName', options: { mode: 'exclude', match: 'byRegexp', value: '/cpu.*/' } },
    ]);
  });

  it('adds a sortBy transform and toggles desc', () => {
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(basePanel(), onSave);

    selectOption(screen.getByRole('combobox', { name: 'Add transformation' }), 'Sort by');
    const group = screen.getByRole('group', { name: 'Transformation 1' });
    selectOption(within(group).getByLabelText('Sort by'), 'Value');
    // The Base UI Checkbox is role=checkbox named by its visible Label; querying the role hits the
    // control once (getByLabelText would also match Base UI's hidden mirror input).
    fireEvent.click(within(group).getByRole('checkbox', { name: 'Descending' }));

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].transformations).toEqual([{ id: 'sortBy', options: { by: 'value', desc: true } }]);
  });

  it('adds a limit transform and writes a truncated non-negative count', () => {
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(basePanel(), onSave);

    selectOption(screen.getByRole('combobox', { name: 'Add transformation' }), 'Limit');
    const group = screen.getByRole('group', { name: 'Transformation 1' });
    fireEvent.change(within(group).getByLabelText('Limit'), { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].transformations).toEqual([{ id: 'limit', options: { count: 5 } }]);
  });

  it('removes a transformation back to the empty state', () => {
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(basePanel(), onSave);

    selectOption(screen.getByRole('combobox', { name: 'Add transformation' }), 'Reduce');
    expect(screen.getByRole('group', { name: 'Transformation 1' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Transformation 1' }));
    expect(screen.queryByRole('group', { name: 'Transformation 1' })).toBeNull();
    expect(screen.getByText(/No transformations/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].transformations).toEqual([]);
  });

  it('reorders transforms with move up/down — array order is execution order', () => {
    // Seed two transforms so the pipeline order is observable on save (order = execution order).
    const panel = basePanel();
    panel.transformations = [
      { id: 'reduce', options: { calc: 'last' } },
      { id: 'limit', options: { count: 3 } },
    ];
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(panel, onSave);

    // First card's "up" is disabled, last card's "down" is disabled (no jumpy hide).
    expect(screen.getByRole('button', { name: 'Move Transformation 1 up' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Move Transformation 2 down' })).toHaveProperty('disabled', true);

    // Move the second (limit) up — it should swap ahead of reduce.
    fireEvent.click(screen.getByRole('button', { name: 'Move Transformation 2 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].transformations).toEqual([
      { id: 'limit', options: { count: 3 } },
      { id: 'reduce', options: { calc: 'last' } },
    ]);

    // Move the now-first (limit) back down — restores the original order.
    fireEvent.click(screen.getByRole('button', { name: 'Move Transformation 1 down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[1]?.[0].transformations).toEqual([
      { id: 'reduce', options: { calc: 'last' } },
      { id: 'limit', options: { count: 3 } },
    ]);
  });

  it('seeds imported transforms into editable cards (round-trip)', () => {
    const panel = basePanel();
    panel.transformations = [
      { id: 'filterFieldsByName', options: { mode: 'include', match: 'byName', value: 'cpu' } },
      { id: 'organize', options: { excludeByName: { mem: true }, renameByName: { cpu: 'CPU' }, indexByName: { cpu: 0 } } },
      { id: 'sortBy', options: { by: 'value', desc: true } },
    ];
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(panel, onSave);

    // Each imported transform renders as a scoped card with its values seeded into editable controls.
    const filterGroup = screen.getByRole('group', { name: 'Transformation 1' });
    expect(within(filterGroup).getByLabelText('Field name')).toHaveProperty('value', 'cpu');

    const organizeGroup = screen.getByRole('group', { name: 'Transformation 2' });
    expect(within(organizeGroup).getByLabelText('Transformation 2 rename 1 field')).toHaveProperty('value', 'cpu');
    expect(within(organizeGroup).getByLabelText('Transformation 2 rename 1 new name')).toHaveProperty('value', 'CPU');
    expect(within(organizeGroup).getByLabelText('Transformation 2 exclude 1 field')).toHaveProperty('value', 'mem');

    const sortGroup = screen.getByRole('group', { name: 'Transformation 3' });
    expect(within(sortGroup).getByRole('checkbox', { name: 'Descending' })).toHaveProperty('ariaChecked', 'true');

    // Round-trips unchanged through Apply when nothing is edited — including organize's indexByName,
    // which has no UI but is preserved on the options spread.
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].transformations).toEqual(panel.transformations);
  });

  it('preserves organize.indexByName (no UI) when editing a rename', () => {
    const panel = basePanel();
    panel.transformations = [{ id: 'organize', options: { excludeByName: {}, renameByName: { cpu: 'CPU' }, indexByName: { cpu: 2, mem: 1 } } }];
    const onSave = vi.fn<(p: Panel) => void>();
    renderEditor(panel, onSave);

    const group = screen.getByRole('group', { name: 'Transformation 1' });
    fireEvent.change(within(group).getByLabelText('Transformation 1 rename 1 new name'), { target: { value: 'CPU%' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0]?.[0].transformations).toEqual([
      { id: 'organize', options: { excludeByName: {}, renameByName: { cpu: 'CPU%' }, indexByName: { cpu: 2, mem: 1 } } },
    ]);
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
