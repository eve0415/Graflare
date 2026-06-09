import type { DatasourceRow } from '../../datasources/-api';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MockCodeEditor } from '../../../../tests/mock-code-editor';

import { ExplorePane } from './explore-pane';

const PROM_DS: DatasourceRow = {
  id: 'ds-prom',
  orgId: 'org',
  name: 'Prod Prometheus',
  type: 'prometheus',
  dialect: null,
  url: 'https://prom.example.com',
  authType: 'none',
  queryTimeoutMs: 30000,
  cacheTtl: 0,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

// One non-empty datasource list so the pane's Run/Add affordances are enabled (the global
// setup mock returns [], which disables them).
vi.mock('../../datasources/-queries', () => ({
  datasourcesQueryOptions: () => ({ queryKey: ['datasources'], queryFn: () => Promise.resolve([PROM_DS]) }),
  datasourceQueryOptions: () => ({ queryKey: ['datasource'], queryFn: () => Promise.resolve(null) }),
}));

// Stub the CodeMirror editor (can't construct under jsdom) so each row's query can be typed.
vi.mock('./query-code-editor', () => ({ QueryCodeEditor: MockCodeEditor }));

// uPlot needs a real canvas (jsdom has none → clearRect on null). The overlay is asserted via
// the table view, so the chart only needs to mount without drawing.
vi.mock('../../-root/uplot-chart', () => ({
  UPlotChart: () => <div data-testid='uplot' />,
}));

interface ProxyArgs {
  data: { params: { query: string } };
}
type ProxyResult =
  | { status: string; error: string }
  | { status: string; data: { resultType: string; result: { metric: Record<string, string>; values: [number, string][] }[] } };

// proxyQuery is the prometheus path; echo the query string into a one-sample series so the
// overlay/table can be asserted. A query containing "FAIL" returns an error.
const proxyQuery = vi.fn<(args: ProxyArgs) => Promise<ProxyResult>>(args => {
  const { query } = args.data.params;
  if (query.includes('FAIL')) return Promise.resolve({ status: 'error', error: 'boom' });
  return Promise.resolve({
    status: 'success',
    data: { resultType: 'matrix', result: [{ metric: { __name__: query }, values: [[1000, '1']] }] },
  });
});
vi.mock('../../../lib/proxy', () => ({ proxyQuery: (args: ProxyArgs) => proxyQuery(args) }));
vi.mock('../../../lib/sql-proxy', () => ({ sqlQuery: () => Promise.resolve({ columns: [], rows: [] }) }));

const HISTORY_KEY = 'graflare.explore.queryHistory';
const TIME_RANGE = { from: 'now-1h', to: 'now' };

const renderPane = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={<div>loading</div>}>
        <ExplorePane timeRange={TIME_RANGE} label='Pane' />
      </Suspense>
    </QueryClientProvider>,
  );
};

/** Put row `index` into code mode and type `query` into its editor. */
const typeIntoRow = (index: number, query: string): void => {
  const row = screen.getByRole('group', { name: `Query ${String.fromCodePoint(65 + index)}` });
  fireEvent.click(within(row).getByRole('button', { name: 'Code' }));
  fireEvent.change(within(row).getByRole('textbox', { name: 'Code editor' }), { target: { value: query } });
};

/** The current text in row `index`'s code editor (textarea value), via a typed narrowing. */
const draftOfRow = (index: number): string => {
  const row = screen.getByRole('group', { name: `Query ${String.fromCodePoint(65 + index)}` });
  const el = within(row).getByRole('textbox', { name: 'Code editor' });
  return el instanceof HTMLTextAreaElement ? el.value : '';
};

const readHistory = (): string[] => {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  for (const e of parsed) {
    const entry: unknown = e;
    if (typeof entry === 'object' && entry !== null && 'query' in entry && typeof entry.query === 'string') out.push(entry.query);
  }
  return out;
};

beforeEach(() => {
  localStorage.clear();
  proxyQuery.mockClear();
});

afterEach(cleanup);

describe('explore pane multi-query', () => {
  it('starts with a single query row that has no remove button', async () => {
    renderPane();
    expect(await screen.findByRole('group', { name: 'Query A' })).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Query B' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove query A' })).toBeNull();
  });

  it('adds rows B, C with Add query and shows remove buttons once past one row', async () => {
    renderPane();
    await screen.findByRole('group', { name: 'Query A' });
    fireEvent.click(screen.getByRole('button', { name: 'Add query' }));
    expect(screen.getByRole('group', { name: 'Query B' })).toBeDefined();
    // Now removal is allowed on every row.
    expect(screen.getByRole('button', { name: 'Remove query A' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Remove query B' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Add query' }));
    expect(screen.getByRole('group', { name: 'Query C' })).toBeDefined();
  });

  it('enforces a minimum of one row (removing down to one hides the remove button)', async () => {
    renderPane();
    await screen.findByRole('group', { name: 'Query A' });
    fireEvent.click(screen.getByRole('button', { name: 'Add query' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove query B' }));
    expect(screen.queryByRole('group', { name: 'Query B' })).toBeNull();
    // Back to one row → no remove affordance.
    expect(screen.queryByRole('button', { name: 'Remove query A' })).toBeNull();
  });

  it("keeps each surviving row's own draft when a middle row is removed (stable-id keying)", async () => {
    renderPane();
    await screen.findByRole('group', { name: 'Query A' });
    fireEvent.click(screen.getByRole('button', { name: 'Add query' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add query' }));

    typeIntoRow(0, 'query_a');
    typeIntoRow(1, 'query_b');
    typeIntoRow(2, 'query_c');

    // Remove the middle row (B). If rows were keyed by index/refId, C's draft would shift onto B.
    fireEvent.click(screen.getByRole('button', { name: 'Remove query B' }));

    // A keeps its own draft; the new B (was C) keeps C's draft — not B's.
    expect(draftOfRow(0)).toBe('query_a');
    expect(draftOfRow(1)).toBe('query_c');
  });

  it('runs every non-empty row concurrently, overlays the results, and records each in history', async () => {
    renderPane();
    await screen.findByRole('group', { name: 'Query A' });
    fireEvent.click(screen.getByRole('button', { name: 'Add query' }));
    typeIntoRow(0, 'metric_one');
    typeIntoRow(1, 'metric_two');

    fireEvent.click(screen.getByRole('button', { name: /^Run$/ }));

    // Both queries ran (concurrently) against the proxy.
    await waitFor(() => {
      expect(proxyQuery).toHaveBeenCalledTimes(2);
    });
    const ranQueries = proxyQuery.mock.calls.map(c => c[0].data.params.query).sort((a, b) => a.localeCompare(b));
    expect(ranQueries).toEqual(['metric_one', 'metric_two']);

    // The overlay shows two series; switch to table view to assert deterministically (no canvas).
    await waitFor(() => {
      expect(screen.getByText(/2 series/)).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Switch to table view' }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('metric_one')).toBeDefined();
    expect(within(table).getByText('metric_two')).toBeDefined();
    // With >1 query the table gains a Query column disambiguating the rows.
    expect(within(table).getByRole('columnheader', { name: 'Query' })).toBeDefined();

    // Each non-empty query is recorded in history.
    const recorded = [...readHistory()].sort((a, b) => a.localeCompare(b));
    expect(recorded).toEqual(['metric_one', 'metric_two']);
  });

  it('shows a combined error naming the failed refId while still rendering the rows that succeeded', async () => {
    renderPane();
    await screen.findByRole('group', { name: 'Query A' });
    fireEvent.click(screen.getByRole('button', { name: 'Add query' }));
    typeIntoRow(0, 'ok_metric');
    typeIntoRow(1, 'FAIL_metric');

    fireEvent.click(screen.getByRole('button', { name: /^Run$/ }));

    // B failed → error banner names B AND preserves the proxy's real message ("boom"); A still
    // rendered as one series (partial success commits both).
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('B: boom');
    });
    expect(screen.getByText(/1 series/)).toBeDefined();
    // Only the successful query is recorded.
    expect(readHistory()).toEqual(['ok_metric']);
  });

  it('re-runs a history entry by collapsing to one seeded row and running it (shared run path)', async () => {
    // Seed a prior history entry; the drawer reads it from localStorage on open.
    const entry = {
      id: 'h1',
      datasourceId: 'ds-prom',
      datasourceType: 'prometheus',
      query: 'seeded_metric',
      comment: '',
      starred: false,
      createdAt: Date.now(),
    };
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry]));

    renderPane();
    await screen.findByRole('group', { name: 'Query A' });
    // Add a second row first to prove the re-run collapses back to a single row.
    fireEvent.click(screen.getByRole('button', { name: 'Add query' }));
    expect(screen.getByRole('group', { name: 'Query B' })).toBeDefined();

    // Open the history drawer and re-run the entry.
    fireEvent.click(screen.getByRole('button', { name: 'Query history' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run query seeded_metric' }));

    // Collapsed to a single row, seeded into code mode with the entry's query…
    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Query B' })).toBeNull();
    });
    expect(draftOfRow(0)).toBe('seeded_metric');
    // …and the same run path executed it against the proxy and re-recorded it.
    await waitFor(() => {
      expect(proxyQuery).toHaveBeenCalledTimes(1);
    });
    expect(proxyQuery.mock.calls[0]?.[0].data.params.query).toBe('seeded_metric');
    expect(readHistory()).toContain('seeded_metric');
  });
});
