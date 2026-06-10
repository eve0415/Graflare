import type { getDashboard } from '../-api';
import type { Panel } from '@graflare/shared/schemas/panel';
import type { Variable } from '@graflare/shared/schemas/variable';

import { QueryClient, QueryClientProvider, queryOptions } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dashboardQueryOptions } from '../-queries';
import { routeTree } from '../../../routeTree.gen';

// The row shape the (mocked) dashboard query serves — derived from the real server fn so the
// fixture below can't drift from what the route actually consumes.
type DashboardRow = NonNullable<Awaited<ReturnType<typeof getDashboard>>>;

const DASH_ID = 'dash-1';

// Text panels render without any data query, so the route test exercises the expansion + title
// wiring with zero fetch plumbing.
const textPanel = (overrides: Partial<Panel> & Pick<Panel, 'id' | 'title'>): Panel => ({
  type: 'text',
  description: '',
  queries: [],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: { text: { content: 'body', mode: 'markdown' } },
  fieldConfig: { defaults: { unit: '', mappings: [] }, overrides: [] },
  transformations: [],
  repeatDirection: 'h',
  maxPerRow: 4,
  ...overrides,
});

// A multi variable with three selected values — the repeat panel must fan out to three instances.
const jobVariable: Variable = {
  name: 'job',
  type: 'custom',
  label: '',
  query: '',
  regex: '',
  sort: 'disabled',
  multi: true,
  includeAll: false,
  current: ['node', 'api', 'db'],
  allValue: '',
  options: ['node', 'api', 'db'],
  filters: [],
};

const repeatDashboard: DashboardRow = {
  id: DASH_ID,
  orgId: 'org-1',
  folderId: null,
  title: 'Repeat Dash',
  slug: 'repeat-dash',
  description: '',
  tags: [],
  panels: [textPanel({ id: 'p1', title: 'CPU $job', repeat: 'job' })],
  variables: [jobVariable],
  timeRange: { from: 'now-1h', to: 'now', refresh: null },
  version: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const renderDashboardRoute = async (): Promise<void> => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [`/dashboards/${DASH_ID}`] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.mocked(dashboardQueryOptions).mockReturnValue(
    queryOptions({ queryKey: ['dashboard', DASH_ID], queryFn: (): Promise<DashboardRow | null> => Promise.resolve(repeatDashboard) }),
  );
});

afterEach(() => {
  cleanup();
  vi.mocked(dashboardQueryOptions).mockImplementation((id: string) =>
    queryOptions({ queryKey: ['dashboard', id], queryFn: (): Promise<DashboardRow | null> => Promise.resolve(null) }),
  );
});

describe('dashboard view — repeat expansion', () => {
  it('renders one instance per selected value, each titled with its scoped value', async () => {
    await renderDashboardRoute();
    // One region per value of the multi selection; the per-instance scoped map drives the title.
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'CPU node' })).toBeDefined();
    });
    expect(screen.getByRole('region', { name: 'CPU api' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'CPU db' })).toBeDefined();
    // The repeat hint is an edit-mode affordance only.
    expect(screen.queryByText('Repeats: $job')).toBeNull();
  });

  it('renders only the source panel (with the repeat badge) in edit mode', async () => {
    await renderDashboardRoute();
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'CPU node' })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    // Clones collapse to the source panel, previewed with the UNSCOPED values — the multi
    // selection interpolates as the combined regex union — and the repeat badge appears.
    await waitFor(() => {
      expect(screen.getByText('Repeats: $job')).toBeDefined();
    });
    expect(screen.getByRole('region', { name: 'CPU (node|api|db)' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'CPU api' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'CPU db' })).toBeNull();
  });
});
