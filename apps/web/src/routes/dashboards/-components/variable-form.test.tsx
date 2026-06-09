import type { DatasourceRow } from '../../datasources/-api';
import type { Variable } from '@graflare/shared/schemas/variable';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { expectNoA11yViolations } from '../../../../tests/a11y';

import { VariableForm } from './variable-form';

const DS_PROM: DatasourceRow = {
  id: '11111111-1111-4111-8111-111111111111',
  orgId: 'org-1',
  name: 'Prom A',
  type: 'prometheus',
  dialect: null,
  url: 'https://example.com',
  authType: 'none',
  queryTimeoutMs: 30000,
  cacheTtl: 0,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const DATASOURCES: readonly DatasourceRow[] = [DS_PROM];
const NO_NAMES: readonly string[] = [];

const baseVariable = (overrides: Partial<Variable>): Variable => ({
  name: 'v',
  type: 'custom',
  label: '',
  query: '',
  regex: '',
  sort: 'disabled',
  multi: false,
  includeAll: false,
  current: '',
  options: [],
  filters: [],
  ...overrides,
});

interface Harness {
  onSubmit: ReturnType<typeof vi.fn<(variable: Variable) => void>>;
  onCancel: ReturnType<typeof vi.fn<() => void>>;
  container: HTMLElement;
}

const renderForm = (initial?: Variable, existingNames: readonly string[] = NO_NAMES): Harness => {
  const onSubmit = vi.fn<(variable: Variable) => void>();
  const onCancel = vi.fn<() => void>();
  const { container } = render(
    <VariableForm initial={initial} existingNames={existingNames} datasources={DATASOURCES} onSubmit={onSubmit} onCancel={onCancel} />,
  );
  return { onSubmit, onCancel, container };
};

// Open a Base UI Select (by its trigger's aria-label) and pick the option with the given text.
// Base UI's Select.Item commits on a pointer interaction, not a bare click, so a plain
// `fireEvent.click` on the option is a no-op under jsdom — drive the full pointer sequence.
const selectOption = async (triggerLabel: string, optionName: string): Promise<void> => {
  fireEvent.click(screen.getByLabelText(triggerLabel));
  const option = await screen.findByRole('option', { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.pointerUp(option);
  fireEvent.click(option);
};

const submit = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /^(Add|Save)$/ }));
};

const firstSubmitArg = (onSubmit: Harness['onSubmit']): Variable => {
  const [arg] = onSubmit.mock.calls[0] ?? [];
  if (arg === undefined) throw new Error('onSubmit was not called');
  return arg;
};

afterEach(() => {
  cleanup();
});

describe('variable-form — per-type fields', () => {
  it('query type shows data source, query, regex, sort, and the two checkboxes', () => {
    renderForm(baseVariable({ type: 'query' }));
    expect(screen.getByLabelText('Data source')).toBeDefined();
    expect(screen.getByLabelText('Query')).toBeDefined();
    expect(screen.getByLabelText('Regex')).toBeDefined();
    expect(screen.getByLabelText('Sort')).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Multi-value' })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Include All option' })).toBeDefined();
  });

  it('custom type shows Values + checkboxes, not query/regex/sort', () => {
    renderForm(baseVariable({ type: 'custom' }));
    expect(screen.getByLabelText('Values')).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Multi-value' })).toBeDefined();
    expect(screen.queryByLabelText('Regex')).toBeNull();
    expect(screen.queryByLabelText('Sort')).toBeNull();
  });

  it('constant type shows only a Value field', () => {
    renderForm(baseVariable({ type: 'constant' }));
    expect(screen.getByLabelText('Value')).toBeDefined();
    expect(screen.queryByLabelText('Multi-value')).toBeNull();
    expect(screen.queryByLabelText('Values')).toBeNull();
  });

  it('textbox type shows a Default value field', () => {
    renderForm(baseVariable({ type: 'textbox' }));
    expect(screen.getByLabelText('Default value')).toBeDefined();
  });

  it('interval type shows an Intervals field', () => {
    renderForm(baseVariable({ type: 'interval' }));
    expect(screen.getByLabelText('Intervals')).toBeDefined();
    // interval is single-choice — no Include All.
    expect(screen.queryByLabelText('Include All option')).toBeNull();
  });

  it('datasource type shows the type-filter field and a Multi-value checkbox', () => {
    renderForm(baseVariable({ type: 'datasource' }));
    expect(screen.getByLabelText('Data source type filter')).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Multi-value' })).toBeDefined();
    expect(screen.queryByLabelText('Include All option')).toBeNull();
  });
});

describe('variable-form — type switching', () => {
  it('preserves name + label and resets type-specific fields when the type changes', async () => {
    const { onSubmit } = renderForm(baseVariable({ name: 'keep_me', label: 'Keep', type: 'custom', options: ['a', 'b'], multi: true }));
    // Switch custom → constant; the old options must not survive into the constant variable.
    await selectOption('Type', 'Constant');
    // The Value field appears (constant) and the Values field (custom) is gone.
    expect(screen.getByLabelText('Value')).toBeDefined();
    expect(screen.queryByLabelText('Values')).toBeNull();

    submit();
    const emitted = firstSubmitArg(onSubmit);
    expect(emitted.name).toBe('keep_me');
    expect(emitted.label).toBe('Keep');
    expect(emitted.type).toBe('constant');
    expect(emitted.options).toEqual([]);
    expect(emitted.multi).toBe(false);
  });
});

describe('variable-form — name validation blocks save', () => {
  it('blocks an empty name and shows an alert', () => {
    const { onSubmit } = renderForm(baseVariable({ name: '', type: 'constant' }));
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('required');
  });

  it('blocks a name with illegal characters', () => {
    const { onSubmit } = renderForm(baseVariable({ name: 'bad name', type: 'constant' }));
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('letters');
  });

  it('blocks a duplicate name', () => {
    const { onSubmit } = renderForm(baseVariable({ name: 'env', type: 'constant' }), ['env']);
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('already exists');
  });

  it('clears the error once the name is edited', () => {
    renderForm(baseVariable({ name: '', type: 'constant' }));
    submit();
    expect(screen.getByRole('alert')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'good_name' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('variable-form — field-to-schema mapping', () => {
  it('custom Values are comma-split into options[]', () => {
    const { onSubmit } = renderForm(baseVariable({ name: 'job', type: 'custom' }));
    fireEvent.change(screen.getByLabelText('Values'), { target: { value: 'node, api , web' } });
    submit();
    expect(firstSubmitArg(onSubmit).options).toEqual(['node', 'api', 'web']);
  });

  it('interval Intervals are comma-split into options[]', () => {
    const { onSubmit } = renderForm(baseVariable({ name: 'step', type: 'interval' }));
    fireEvent.change(screen.getByLabelText('Intervals'), { target: { value: '1m, 5m, 1h' } });
    submit();
    expect(firstSubmitArg(onSubmit).options).toEqual(['1m', '5m', '1h']);
  });

  it('constant Value maps to query', () => {
    const { onSubmit } = renderForm(baseVariable({ name: 'env', type: 'constant' }));
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'production' } });
    submit();
    const emitted = firstSubmitArg(onSubmit);
    expect(emitted.query).toBe('production');
  });

  it('textbox Default value seeds both query and current', () => {
    const { onSubmit } = renderForm(baseVariable({ name: 'search', type: 'textbox' }));
    fireEvent.change(screen.getByLabelText('Default value'), { target: { value: 'cpu' } });
    submit();
    const emitted = firstSubmitArg(onSubmit);
    expect(emitted.query).toBe('cpu');
    expect(emitted.current).toBe('cpu');
  });

  it('datasource type-filter maps to query and Multi-value toggles multi', () => {
    const { onSubmit } = renderForm(baseVariable({ name: 'src', type: 'datasource' }));
    fireEvent.change(screen.getByLabelText('Data source type filter'), { target: { value: 'prometheus' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Multi-value' }));
    submit();
    const emitted = firstSubmitArg(onSubmit);
    expect(emitted.query).toBe('prometheus');
    expect(emitted.multi).toBe(true);
  });

  it('query type captures the chosen data source id, query text, and checkboxes', async () => {
    const { onSubmit } = renderForm(baseVariable({ name: 'inst', type: 'query' }));
    await selectOption('Data source', 'Prom A');
    fireEvent.change(screen.getByLabelText('Query'), { target: { value: 'label_values(up, instance)' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include All option' }));
    submit();
    const emitted = firstSubmitArg(onSubmit);
    expect(emitted.datasourceId).toBe(DS_PROM.id);
    expect(emitted.query).toBe('label_values(up, instance)');
    expect(emitted.includeAll).toBe(true);
  });
});

describe('variable-form — actions', () => {
  it('invokes onCancel when Cancel is clicked', () => {
    const { onCancel } = renderForm(baseVariable({ type: 'constant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('labels the submit button "Add" for a new variable and "Save" when editing', () => {
    const { container } = renderForm();
    expect(within(container).getByRole('button', { name: 'Add' })).toBeDefined();
    cleanup();
    renderForm(baseVariable({ name: 'existing', type: 'constant' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
  });
});

describe('variable-form — accessibility', () => {
  it('has no axe violations for the query type (the richest form)', async () => {
    const { container } = renderForm(baseVariable({ name: 'inst', type: 'query' }));
    await expectNoA11yViolations(container);
  });

  it('has no axe violations while showing a name error', async () => {
    const { container } = renderForm(baseVariable({ name: '', type: 'constant' }));
    submit();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
    await expectNoA11yViolations(container);
  });
});
