import type { DatasourceRow } from '../../datasources/-api';
import type { QueryHistoryEntry } from './query-history-store';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QueryHistoryDrawer } from './query-history-drawer';

const NOW = Date.UTC(2024, 5, 1, 12, 0, 0);
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const DATASOURCES: DatasourceRow[] = [
  {
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
  },
  {
    id: 'ds-sql',
    orgId: 'org',
    name: 'Analytics DB',
    type: 'sql',
    dialect: 'postgres',
    url: 'https://db.example.com',
    authType: 'none',
    queryTimeoutMs: 30000,
    cacheTtl: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  },
];

const ENTRIES: QueryHistoryEntry[] = [
  {
    id: 'e1',
    datasourceId: 'ds-prom',
    datasourceType: 'prometheus',
    query: 'rate(http_requests_total[5m])',
    comment: '',
    starred: false,
    createdAt: NOW - 5 * MINUTE,
  },
  {
    id: 'e2',
    datasourceId: 'ds-sql',
    datasourceType: 'sql',
    query: 'SELECT count(*) FROM events',
    comment: 'event volume',
    starred: true,
    createdAt: NOW - 2 * HOUR,
  },
  { id: 'e3', datasourceId: 'ds-prom', datasourceType: 'prometheus', query: 'up', comment: '', starred: false, createdAt: NOW - 3 * HOUR },
];

const noop = (): void => {};

/** Text of the first query block (`<pre>`) in DOM order — used to assert sort order. */
const firstQueryText = (): string => {
  const [pre] = Array.from(document.querySelectorAll('pre'));
  return pre?.textContent ?? '';
};

interface Overrides {
  entries?: QueryHistoryEntry[];
  onRun?: (entry: QueryHistoryEntry) => void;
  onToggleStar?: (id: string) => void;
  onSetComment?: (id: string, comment: string) => void;
  onRemove?: (id: string) => void;
}

const renderDrawer = (over: Overrides = {}) =>
  render(
    <QueryHistoryDrawer
      open
      onOpenChange={noop}
      entries={over.entries ?? ENTRIES}
      datasources={DATASOURCES}
      now={NOW}
      onRun={over.onRun ?? noop}
      onToggleStar={over.onToggleStar ?? noop}
      onSetComment={over.onSetComment ?? noop}
      onRemove={over.onRemove ?? noop}
    />,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('query-history-drawer', () => {
  it('renders a row per entry with its query text and datasource type badge', () => {
    renderDrawer();
    expect(screen.getByText('rate(http_requests_total[5m])')).toBeDefined();
    expect(screen.getByText('SELECT count(*) FROM events')).toBeDefined();
    expect(screen.getByText('up')).toBeDefined();
    // Two prometheus + one SQL badge.
    expect(screen.getAllByText('Prometheus')).toHaveLength(2);
    expect(screen.getByText('SQL')).toBeDefined();
  });

  it('filters by query text via the search box', () => {
    renderDrawer();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search query history' }), { target: { value: 'SELECT' } });
    expect(screen.getByText('SELECT count(*) FROM events')).toBeDefined();
    expect(screen.queryByText('up')).toBeNull();
  });

  it('filters by comment text too', () => {
    renderDrawer();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search query history' }), { target: { value: 'event volume' } });
    expect(screen.getByText('SELECT count(*) FROM events')).toBeDefined();
    expect(screen.queryByText('rate(http_requests_total[5m])')).toBeNull();
  });

  it('toggles sort order from newest-first to oldest-first', () => {
    renderDrawer();
    // Default newest-first: e1 (5m ago) is the first query block.
    expect(firstQueryText()).toBe('rate(http_requests_total[5m])');

    fireEvent.click(screen.getByRole('button', { name: 'Sort oldest first' }));
    // Oldest-first: e3 (3h ago) is now first.
    expect(firstQueryText()).toBe('up');
  });

  it('shows only starred entries on the Starred tab', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Starred' }));
    expect(screen.getByText('SELECT count(*) FROM events')).toBeDefined();
    expect(screen.queryByText('up')).toBeNull();
    expect(screen.queryByText('rate(http_requests_total[5m])')).toBeNull();
  });

  it('fires onRun with the entry when Run is clicked', () => {
    const onRun = vi.fn<(entry: QueryHistoryEntry) => void>();
    renderDrawer({ onRun });
    fireEvent.click(screen.getByRole('button', { name: 'Run query up' }));
    expect(onRun).toHaveBeenCalledWith(ENTRIES[2]);
  });

  it('fires onToggleStar with the id when the star button is clicked', () => {
    const onToggleStar = vi.fn<(id: string) => void>();
    renderDrawer({ onToggleStar });
    fireEvent.click(screen.getByRole('button', { name: 'Star query up' }));
    expect(onToggleStar).toHaveBeenCalledWith('e3');
  });

  it('fires onRemove with the id when Delete is clicked', () => {
    const onRemove = vi.fn<(id: string) => void>();
    renderDrawer({ onRemove });
    fireEvent.click(screen.getByRole('button', { name: 'Delete query up' }));
    expect(onRemove).toHaveBeenCalledWith('e3');
  });

  it('copies the query to the clipboard via the labelled copy button', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    try {
      renderDrawer();
      fireEvent.click(screen.getByRole('button', { name: 'Copy query up' }));
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('up');
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('edits a comment inline and saves it', () => {
    const onSetComment = vi.fn<(id: string, comment: string) => void>();
    renderDrawer({ onSetComment });
    fireEvent.click(screen.getByRole('button', { name: 'Add comment to query up' }));
    const input = screen.getByRole('textbox', { name: 'Comment for query up' });
    fireEvent.change(input, { target: { value: 'a note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));
    expect(onSetComment).toHaveBeenCalledWith('e3', 'a note');
  });

  it('shows the datasource name next to the badge', () => {
    renderDrawer();
    expect(screen.getByText('Analytics DB')).toBeDefined();
    expect(screen.getAllByText('Prod Prometheus')).toHaveLength(2);
  });

  it('shows an empty state when there are no entries', () => {
    renderDrawer({ entries: [] });
    expect(screen.getByText(/No queries yet/)).toBeDefined();
  });

  it('shows a distinct empty state on the Starred tab when nothing is starred', () => {
    const unstarred = ENTRIES.map(e => ({ ...e, starred: false }));
    renderDrawer({ entries: unstarred });
    fireEvent.click(screen.getByRole('button', { name: 'Starred' }));
    expect(screen.getByText(/No starred queries yet/)).toBeDefined();
  });

  it('renders an existing comment as text when not editing', () => {
    renderDrawer();
    // e2 carries a comment; it renders as static text (not an input) while not editing.
    expect(screen.getByText('event volume')).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'Comment for query SELECT count(*) FROM events' })).toBeNull();
  });
});
