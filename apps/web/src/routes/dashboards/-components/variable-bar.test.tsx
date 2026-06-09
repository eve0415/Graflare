import type { AdhocFilter, Variable } from '@graflare/shared/schemas/variable';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VariableBar } from './variable-bar';

// The adhoc filter bar resolves its key/value pickers from the labels / label-values introspection.
// Stub those query options so the dropdowns have data without hitting the RPC boundary.
const ADHOC_DS_ID = '33333333-3333-4333-8333-333333333333';

vi.mock('../../-root/introspection-queries', () => ({
  labelsQueryOptions: (datasourceId: string) => ({
    queryKey: ['introspection', 'labels', datasourceId],
    queryFn: () => Promise.resolve({ labels: ['env', 'job', 'region'] }),
    enabled: datasourceId !== '',
  }),
  labelValuesQueryOptions: (datasourceId: string, label: string) => ({
    queryKey: ['introspection', 'labelValues', datasourceId, label],
    queryFn: () => Promise.resolve({ values: ['prod', 'staging'] }),
    enabled: datasourceId !== '' && label !== '',
  }),
}));

// The datasource variable resolves its picker options from this list. Override the shared
// setup.ts mock (which returns []) so the datasource dropdown has something to render.
const PROM_DS_ID = '11111111-1111-4111-8111-111111111111';
const SQL_DS_ID = '22222222-2222-4222-8222-222222222222';

vi.mock('../../datasources/-queries', () => ({
  datasourcesQueryOptions: () => ({
    queryKey: ['datasources'],
    queryFn: () =>
      Promise.resolve([
        {
          id: PROM_DS_ID,
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
        },
        {
          id: SQL_DS_ID,
          orgId: 'org-1',
          name: 'SQL B',
          type: 'sql',
          dialect: 'postgres',
          url: 'https://example.com',
          authType: 'none',
          queryTimeoutMs: 30000,
          cacheTtl: 0,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      ]),
  }),
  datasourceQueryOptions: () => ({ queryKey: ['datasource'], queryFn: () => Promise.resolve(null) }),
}));

const baseVariable: Variable = {
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
};

const makeVariable = (overrides: Partial<Variable>): Variable => ({ ...baseVariable, ...overrides });

// Hoisted so the empty-array / empty-map props keep a stable identity (react-perf).
const EMPTY_VARIABLES: Variable[] = [];
const NO_VALUES = new Map<string, string>();
const NO_ADHOC: readonly Variable[] = [];
const noop = vi.fn<(name: string, value: string) => void>();
const noopFilters = vi.fn<(name: string, filters: AdhocFilter[]) => void>();

const renderBar = (variables: Variable[], values = NO_VALUES, adhocVariables: readonly Variable[] = NO_ADHOC) => {
  const onChange = vi.fn<(name: string, value: string) => void>();
  const onAdhocFiltersChange = vi.fn<(name: string, filters: AdhocFilter[]) => void>();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  render(
    <VariableBar variables={variables} values={values} onChange={onChange} adhocVariables={adhocVariables} onAdhocFiltersChange={onAdhocFiltersChange} />,
    { wrapper },
  );
  return { onChange, onAdhocFiltersChange };
};

afterEach(() => {
  cleanup();
});

describe('variable-bar', () => {
  it('renders nothing when there are no variables', () => {
    const { container } = render(
      <VariableBar variables={EMPTY_VARIABLES} values={NO_VALUES} onChange={noop} adhocVariables={NO_ADHOC} onAdhocFiltersChange={noopFilters} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a constant variable as static text with no control', () => {
    renderBar([makeVariable({ name: 'env', type: 'constant', current: 'production' })], new Map([['env', 'production']]));
    expect(screen.getByText('production')).toBeDefined();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  describe('textbox', () => {
    it('renders a labelled text input seeded with the current value', () => {
      renderBar([makeVariable({ name: 'search', type: 'textbox', label: 'Search', current: 'foo' })], new Map([['search', 'foo']]));
      // The element found by the variable's label is the same one displaying the seeded value.
      expect(screen.getByLabelText('Variable Search')).toBe(screen.getByDisplayValue('foo'));
    });

    it('commits the typed value to onChange on blur', () => {
      const { onChange } = renderBar([makeVariable({ name: 'search', type: 'textbox' })], new Map([['search', '']]));
      const input = screen.getByLabelText('Variable search');
      fireEvent.change(input, { target: { value: 'cpu' } });
      // No commit yet on change — only on blur/Enter.
      expect(onChange).not.toHaveBeenCalled();
      fireEvent.blur(input);
      expect(onChange).toHaveBeenCalledWith('search', 'cpu');
    });

    it('commits the typed value to onChange on Enter', () => {
      const { onChange } = renderBar([makeVariable({ name: 'search', type: 'textbox' })], new Map([['search', '']]));
      const input = screen.getByLabelText('Variable search');
      fireEvent.change(input, { target: { value: 'mem' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onChange).toHaveBeenCalledWith('search', 'mem');
    });

    it('does not fire onChange when the value is unchanged', () => {
      const { onChange } = renderBar([makeVariable({ name: 'search', type: 'textbox', current: 'foo' })], new Map([['search', 'foo']]));
      const input = screen.getByLabelText('Variable search');
      fireEvent.blur(input);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('interval', () => {
    it('renders a labelled select whose trigger shows the seeded interval', () => {
      renderBar([makeVariable({ name: 'step', type: 'interval', label: 'Step', options: ['1m', '5m', '1h'], current: '5m' })], new Map([['step', '5m']]));
      const trigger = screen.getByLabelText('Variable Step');
      expect(trigger.getAttribute('role')).toBe('combobox');
      expect(trigger.textContent).toContain('5m');
    });

    it('never offers an "All" option even when includeAll is set', () => {
      renderBar([makeVariable({ name: 'step', type: 'interval', options: ['1m', '5m'], includeAll: true, current: '1m' })], new Map([['step', '1m']]));
      const trigger = screen.getByLabelText('Variable step');
      fireEvent.click(trigger);
      expect(screen.queryByText('All')).toBeNull();
    });
  });

  describe('datasource', () => {
    it('renders a labelled select whose trigger shows the seeded datasource name', async () => {
      renderBar([makeVariable({ name: 'ds', type: 'datasource', label: 'Source', current: PROM_DS_ID })], new Map([['ds', PROM_DS_ID]]));
      const trigger = screen.getByLabelText('Variable Source');
      expect(trigger.getAttribute('role')).toBe('combobox');
      // The trigger resolves the datasource id to its name via the `items` prop once the list loads.
      await waitFor(() => {
        expect(trigger.textContent).toContain('Prom A');
      });
    });

    it('lists every datasource of the requested type when the dropdown opens', async () => {
      renderBar([makeVariable({ name: 'ds', type: 'datasource', query: 'prometheus', current: PROM_DS_ID })], new Map([['ds', PROM_DS_ID]]));
      const trigger = screen.getByLabelText('Variable ds');
      await waitFor(() => {
        expect(trigger.textContent).toContain('Prom A');
      });
      fireEvent.click(trigger);
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Prom A' })).toBeDefined();
      });
      // The SQL datasource is filtered out by the `prometheus` type filter.
      expect(screen.queryByRole('option', { name: 'SQL B' })).toBeNull();
    });
  });

  describe('query/custom', () => {
    it('still renders the options dropdown with an All entry when includeAll is set', () => {
      renderBar([makeVariable({ name: 'job', type: 'query', options: ['node', 'api'], includeAll: true, current: 'node' })], new Map([['job', 'node']]));
      const trigger = screen.getByLabelText('Variable job');
      expect(trigger.getAttribute('role')).toBe('combobox');
      fireEvent.click(trigger);
      expect(screen.getByText('All')).toBeDefined();
    });
  });

  describe('adhoc', () => {
    const adhocVar = (filters: AdhocFilter[]): Variable =>
      makeVariable({ name: 'filters', type: 'adhoc', label: 'Filters', datasourceId: ADHOC_DS_ID, filters });

    it('renders a labelled filter list with an add affordance and no chips when empty', async () => {
      const v = adhocVar([]);
      renderBar([v], NO_VALUES, [v]);
      // `findBy*` flushes the row's labels introspection so its async resolve lands inside the test.
      expect(await screen.findByRole('list', { name: 'Ad hoc filters: Filters' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Add filter to Filters' })).toBeDefined();
      // No filter chips yet → no remove buttons.
      expect(screen.queryByRole('button', { name: /^Remove filter/ })).toBeNull();
    });

    it('renders an existing filter as an editable chip with key, operator, value, and remove', async () => {
      const v = adhocVar([{ key: 'env', operator: '=', value: 'prod' }]);
      renderBar([v], NO_VALUES, [v]);
      expect(await screen.findByRole('listitem')).toBeDefined();
      expect(screen.getByLabelText('Filter key')).toBeDefined();
      expect(screen.getByLabelText('Filter operator')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Remove filter env = prod' })).toBeDefined();
    });

    it('adds a new filter (operator =, empty value) via the add affordance', async () => {
      const v = adhocVar([]);
      const { onAdhocFiltersChange } = renderBar([v], NO_VALUES, [v]);
      const addButton = await screen.findByRole('button', { name: 'Add filter to Filters' });
      fireEvent.click(addButton);
      // One filter appended with the default `=` operator and an empty value; the key is seeded
      // from the first introspected label when loaded, else empty (both acceptable here).
      expect(onAdhocFiltersChange).toHaveBeenCalledTimes(1);
      expect(onAdhocFiltersChange).toHaveBeenCalledWith('filters', [expect.objectContaining({ operator: '=', value: '' })]);
    });

    it('seeds the new filter key from the first label once introspection resolves', async () => {
      const v = adhocVar([{ key: 'env', operator: '=', value: 'prod' }]);
      const { onAdhocFiltersChange } = renderBar([v], NO_VALUES, [v]);
      // Opening the existing chip's key Select proves the labels resolved; then add appends a
      // filter whose key is the first resolved label.
      fireEvent.click(screen.getByLabelText('Filter key'));
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'env' })).toBeDefined();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add filter to Filters' }));
      // The appended filter (last element) is seeded with the first resolved label 'env'.
      expect(onAdhocFiltersChange).toHaveBeenLastCalledWith('filters', expect.arrayContaining([{ key: 'env', operator: '=', value: '' }]));
    });

    it('removes a filter by its chip remove button', async () => {
      const v = adhocVar([
        { key: 'env', operator: '=', value: 'prod' },
        { key: 'job', operator: '!=', value: 'api' },
      ]);
      const { onAdhocFiltersChange } = renderBar([v], NO_VALUES, [v]);
      const removeButton = await screen.findByRole('button', { name: 'Remove filter env = prod' });
      fireEvent.click(removeButton);
      expect(onAdhocFiltersChange).toHaveBeenCalledWith('filters', [{ key: 'job', operator: '!=', value: 'api' }]);
    });
  });
});
