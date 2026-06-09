import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MockCodeEditor } from '../../../../tests/mock-code-editor';

import { ExploreQueryRow } from './explore-query-row';

// The row's job is orchestration (mode switch, onChange reporting, the confirm dialog), not the
// editor internals; stub the CodeMirror editor (can't construct under jsdom) with a textarea.
vi.mock('./query-code-editor', () => ({ QueryCodeEditor: MockCodeEditor }));

// Surface the PromQL metric selector's free-text fallback Input (shown only when the metrics
// introspection query errors) so a builder edit can be driven deterministically in jsdom.
vi.mock('../../-root/introspection-queries', () => ({
  tablesQueryOptions: () => ({ queryKey: ['t'], queryFn: () => Promise.resolve({ tables: [] }) }),
  columnsQueryOptions: () => ({ queryKey: ['c'], queryFn: () => Promise.resolve({ columns: [] }) }),
  databaseSchemaQueryOptions: () => ({ queryKey: ['db'], queryFn: () => Promise.resolve({ tables: {} }) }),
  metricsQueryOptions: () => ({ queryKey: ['m'], queryFn: () => Promise.resolve({ metrics: [], error: 'no metrics' }) }),
  labelsQueryOptions: () => ({ queryKey: ['l'], queryFn: () => Promise.resolve({ labels: [], error: 'x' }) }),
  labelValuesQueryOptions: () => ({ queryKey: ['lv'], queryFn: () => Promise.resolve({ values: [] }) }),
}));

const noop = (): void => {};

const renderRow = (
  over: {
    onChange?: (id: string, q: string) => void;
    onRemove?: ((id: string) => void) | undefined;
    initialMode?: 'builder' | 'code';
    initialDraft?: string;
  } = {},
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExploreQueryRow
        id='row-1'
        refId='A'
        datasourceId='ds-prom'
        isSql={false}
        onChange={over.onChange ?? noop}
        onRun={noop}
        {...(over.onRemove === undefined ? {} : { onRemove: over.onRemove })}
        {...(over.initialMode === undefined ? {} : { initialMode: over.initialMode })}
        {...(over.initialDraft === undefined ? {} : { initialDraft: over.initialDraft })}
      />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('explore query row', () => {
  it('labels the row by its refId and shows the builder by default', () => {
    renderRow();
    expect(screen.getByRole('group', { name: 'Query A' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Builder' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('reports the generated query up via onChange when a builder edit is made', async () => {
    const onChange = vi.fn<(id: string, q: string) => void>();
    renderRow({ onChange });
    // The metrics query errors (per-file mock), so the metric free-text Input is shown.
    const metricInput = await screen.findByRole('textbox', { name: 'Metric name' });
    fireEvent.change(metricInput, { target: { value: 'http_requests' } });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('row-1', 'http_requests');
    });
  });

  it('switches to code mode and reports the seeded query on mode change', () => {
    const onChange = vi.fn<(id: string, q: string) => void>();
    renderRow({ onChange });
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(screen.getByRole('button', { name: 'Code' }).getAttribute('aria-pressed')).toBe('true');
    // Builder is empty, so the seeded code draft (and the reported query) is the empty string.
    expect(onChange).toHaveBeenCalledWith('row-1', '');
  });

  it('opens the confirm-reset dialog when leaving non-empty code mode for the builder', () => {
    renderRow({ initialMode: 'code', initialDraft: 'up{job="api"}' });
    fireEvent.click(screen.getByRole('button', { name: 'Builder' }));
    // Code draft differs from the (empty) generated query, so the confirm dialog appears.
    expect(screen.getByText('Switch to Builder?')).toBeDefined();
  });

  it('confirming the reset switches to the builder and reports its generated query', () => {
    const onChange = vi.fn<(id: string, q: string) => void>();
    renderRow({ onChange, initialMode: 'code', initialDraft: 'up{job="api"}' });
    fireEvent.click(screen.getByRole('button', { name: 'Builder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Builder' }));
    // The builder is empty → generated query is ''.
    expect(onChange).toHaveBeenLastCalledWith('row-1', '');
    expect(screen.getByRole('button', { name: 'Builder' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the remove button only when onRemove is provided', () => {
    const onRemove = vi.fn<(id: string) => void>();
    const { rerender } = renderRow({ onRemove });
    fireEvent.click(screen.getByRole('button', { name: 'Remove query A' }));
    expect(onRemove).toHaveBeenCalledWith('row-1');

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <ExploreQueryRow id='row-1' refId='A' datasourceId='ds-prom' isSql={false} onChange={noop} onRun={noop} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Remove query A' })).toBeNull();
  });
});
