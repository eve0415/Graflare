import type { DatasourceRow } from '../../datasources/-api';
import type { Variable } from '@graflare/shared/schemas/variable';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardSettings } from './dashboard-settings';

const NO_DATASOURCES: readonly DatasourceRow[] = [];
const NO_VARIABLES: Variable[] = [];
const TAGS = ['a', 'b'];

const makeVariable = (overrides: Partial<Variable>): Variable => ({
  name: 'v',
  type: 'constant',
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

interface SaveData {
  title: string;
  description: string;
  tags: string[];
  variables: Variable[];
}

const renderSettings = (variables: Variable[]) => {
  const onSave = vi.fn<(data: SaveData) => void>();
  render(
    <DashboardSettings
      open
      onClose={vi.fn<() => void>()}
      dashboardId='11111111-2222-4333-8444-555555555555'
      title='My Dashboard'
      description=''
      tags={TAGS}
      variables={variables}
      datasources={NO_DATASOURCES}
      onSave={onSave}
    />,
  );
  return { onSave };
};

const firstSaveArg = (onSave: ReturnType<typeof vi.fn<(data: SaveData) => void>>): SaveData => {
  const [arg] = onSave.mock.calls[0] ?? [];
  if (arg === undefined) throw new Error('onSave was not called');
  return arg;
};

const openVariablesTab = (): void => {
  fireEvent.click(screen.getByRole('tab', { name: 'Variables' }));
};

afterEach(() => {
  cleanup();
});

describe('dashboard-settings — variables tab', () => {
  it('exposes a Variables tab alongside General and Version History', () => {
    renderSettings(NO_VARIABLES);
    expect(screen.getByRole('tablist')).toBeDefined();
    const general = screen.getByRole('tab', { name: 'General' });
    const variables = screen.getByRole('tab', { name: 'Variables' });
    expect(screen.getByRole('tab', { name: 'Version History' })).toBeDefined();

    // General is the default-active tab; its panel is the visible tabpanel.
    expect(general.getAttribute('aria-selected')).toBe('true');
    expect(variables.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tabpanel')).toBeDefined();

    // Activating Variables moves selection (real arrow-key/tab semantics, not a div toggle).
    fireEvent.click(variables);
    expect(variables.getAttribute('aria-selected')).toBe('true');
    expect(general.getAttribute('aria-selected')).toBe('false');
  });

  it('lists the seeded variables in the Variables tab', () => {
    renderSettings([makeVariable({ name: 'env', label: 'Environment' })]);
    openVariablesTab();
    expect(screen.getByText('env')).toBeDefined();
    expect(screen.getByText('Environment')).toBeDefined();
  });

  it('passes the existing variables through onSave unchanged when nothing is edited', () => {
    const existing = [makeVariable({ name: 'env', query: 'prod' })];
    const { onSave } = renderSettings(existing);
    openVariablesTab();
    // Each tab body has its own Save button; the Variables tab's is the visible one.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const saved = firstSaveArg(onSave);
    expect(saved.variables).toHaveLength(1);
    expect(saved.variables[0]?.name).toBe('env');
    expect(saved.variables[0]?.query).toBe('prod');
    // The other settings fields still ride along.
    expect(saved.title).toBe('My Dashboard');
    expect(saved.tags).toEqual(['a', 'b']);
  });

  it('includes a newly added variable in the onSave payload', () => {
    const { onSave } = renderSettings(NO_VARIABLES);
    openVariablesTab();
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'region' } });
    // The add form's submit button is labelled "Add".
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    // Back on the list; save the dialog.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const saved = firstSaveArg(onSave);
    expect(saved.variables.map(v => v.name)).toEqual(['region']);
  });

  it('reflects a deletion in the onSave payload', () => {
    const { onSave } = renderSettings([makeVariable({ name: 'gone', type: 'constant' })]);
    openVariablesTab();
    fireEvent.click(screen.getByRole('button', { name: 'Delete variable gone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(firstSaveArg(onSave).variables).toEqual([]);
  });
});
