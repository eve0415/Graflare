import type { DatasourceRow } from '../../datasources/-api';
import type { Variable } from '@graflare/shared/schemas/variable';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { expectNoA11yViolations } from '../../../../tests/a11y';

import { VariableEditor } from './variable-editor';

const NO_DATASOURCES: readonly DatasourceRow[] = [];

const makeVariable = (overrides: Partial<Variable>): Variable => ({
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
  ...overrides,
});

interface Harness {
  onChange: ReturnType<typeof vi.fn<(variables: Variable[]) => void>>;
  container: HTMLElement;
}

const renderEditor = (variables: readonly Variable[]): Harness => {
  const onChange = vi.fn<(variables: Variable[]) => void>();
  const { container } = render(<VariableEditor variables={variables} datasources={NO_DATASOURCES} onChange={onChange} />);
  return { onChange, container };
};

const lastChangeArg = (onChange: Harness['onChange']): Variable[] => {
  const last = onChange.mock.calls.at(-1);
  if (last === undefined) throw new Error('onChange was not called');
  const [variables] = last;
  return variables;
};

afterEach(() => {
  cleanup();
});

describe('variable-editor — list', () => {
  it('shows an empty-state message when there are no variables', () => {
    renderEditor([]);
    expect(screen.getByText(/No variables yet/)).toBeDefined();
  });

  it('renders a row per variable with its name, type badge, and label', () => {
    renderEditor([makeVariable({ name: 'env', type: 'constant', label: 'Environment' })]);
    expect(screen.getByText('env')).toBeDefined();
    expect(screen.getByText('constant')).toBeDefined();
    expect(screen.getByText('Environment')).toBeDefined();
  });
});

describe('variable-editor — add', () => {
  it('appends a new variable to the array on submit', () => {
    const { onChange } = renderEditor([makeVariable({ name: 'existing', type: 'constant' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }));
    // The add form opens with a blank query-type variable; give it a valid name and submit.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'region' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const next = lastChangeArg(onChange);
    expect(next).toHaveLength(2);
    expect(next.map(v => v.name)).toEqual(['existing', 'region']);
  });

  it('blocks adding a variable whose name duplicates an existing one', () => {
    const { onChange } = renderEditor([makeVariable({ name: 'env', type: 'constant' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'env' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('already exists');
  });
});

describe('variable-editor — edit', () => {
  it('updates the edited variable in place', () => {
    const { onChange } = renderEditor([
      makeVariable({ name: 'a', type: 'constant', query: 'one' }),
      makeVariable({ name: 'b', type: 'constant', query: 'two' }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit variable b' }));
    // The constant's value lives in the Value field (mapped to query).
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'two-updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const next = lastChangeArg(onChange);
    expect(next).toHaveLength(2);
    expect(next[0]?.name).toBe('a');
    expect(next[1]?.name).toBe('b');
    expect(next[1]?.query).toBe('two-updated');
  });

  it('allows keeping the same name when editing (own name is excluded from the dup check)', () => {
    const { onChange } = renderEditor([makeVariable({ name: 'keep', type: 'constant' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit variable keep' }));
    // Submit without changing the name — must not be flagged as a duplicate of itself.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastChangeArg(onChange)[0]?.name).toBe('keep');
  });
});

describe('variable-editor — delete', () => {
  it('removes the variable from the array', () => {
    const { onChange } = renderEditor([makeVariable({ name: 'a', type: 'constant' }), makeVariable({ name: 'b', type: 'constant' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete variable a' }));
    const next = lastChangeArg(onChange);
    expect(next).toHaveLength(1);
    expect(next[0]?.name).toBe('b');
  });
});

describe('variable-editor — accessibility', () => {
  it('has no axe violations for the list view', async () => {
    const { container } = renderEditor([makeVariable({ name: 'env', type: 'constant', label: 'Environment' }), makeVariable({ name: 'job', type: 'query' })]);
    await expectNoA11yViolations(container);
  });

  it('has no axe violations for the add form', async () => {
    const { container } = renderEditor([]);
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }));
    await expectNoA11yViolations(container);
  });
});
