import type { Variable } from '@graflare/shared/schemas/variable';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VariableBar } from './variable-bar';

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
};

const makeVariable = (overrides: Partial<Variable>): Variable => ({ ...baseVariable, ...overrides });

// Hoisted so the empty-array / empty-map props keep a stable identity (react-perf).
const EMPTY_VARIABLES: Variable[] = [];
const NO_VALUES = new Map<string, string>();
const noop = vi.fn<(name: string, value: string) => void>();

const renderBar = (variables: Variable[], values = NO_VALUES) => {
  const onChange = vi.fn<(name: string, value: string) => void>();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  render(<VariableBar variables={variables} values={values} onChange={onChange} />, { wrapper });
  return { onChange };
};

afterEach(() => {
  cleanup();
});

describe('variable-bar', () => {
  it('renders nothing when there are no variables', () => {
    const { container } = render(<VariableBar variables={EMPTY_VARIABLES} values={NO_VALUES} onChange={noop} />);
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
});
