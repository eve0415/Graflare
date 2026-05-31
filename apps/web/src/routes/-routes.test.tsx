import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { routeTree } from '../routeTree.gen';

afterEach(cleanup);

const renderWithRouter = async (initialUrl: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

describe('routes', () => {
  it('renders datasource list at /datasources', async () => {
    await renderWithRouter('/datasources');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Data Sources' })).toBeDefined();
    });
  });

  it('renders add data source form at /datasources/new', async () => {
    await renderWithRouter('/datasources/new');
    await waitFor(() => {
      expect(screen.getByText('Add Data Source')).toBeDefined();
      expect(screen.getByLabelText('Name')).toBeDefined();
    });
  });

  it('renders edit page at /datasources/:id', async () => {
    await renderWithRouter('/datasources/test-id-123');
    await waitFor(() => {
      expect(screen.getByText('Data source not found.')).toBeDefined();
    });
  });

  it('renders query test page at /datasources/:id/test', async () => {
    await renderWithRouter('/datasources/test-id-123/test');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Query Test' })).toBeDefined();
    });
  });

  it('renders dashboard list at /dashboards', async () => {
    await renderWithRouter('/dashboards');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboards' })).toBeDefined();
    });
  });

  it('renders empty state when no dashboards exist', async () => {
    await renderWithRouter('/dashboards');
    await waitFor(() => {
      expect(screen.getByText('No dashboards yet')).toBeDefined();
    });
  });

  it('renders new dashboard form at /dashboards/new', async () => {
    await renderWithRouter('/dashboards/new');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'New Dashboard' })).toBeDefined();
      expect(screen.getByLabelText('Title')).toBeDefined();
    });
  });

  it('renders dashboard not found at /dashboards/:id', async () => {
    await renderWithRouter('/dashboards/test-id-123');
    await waitFor(() => {
      expect(screen.getByText('Dashboard not found.')).toBeDefined();
    });
  });

  it('renders import page at /import', async () => {
    await renderWithRouter('/import');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Import Dashboard' })).toBeDefined();
    });
  });

  it('renders import file upload area', async () => {
    await renderWithRouter('/import');
    await waitFor(() => {
      expect(screen.getByText('Drop a JSON file here or click to upload')).toBeDefined();
    });
  });

  it('renders explore page at /explore', async () => {
    await renderWithRouter('/explore');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Explore' })).toBeDefined();
    });
  });

  it('renders search input on dashboard list', async () => {
    await renderWithRouter('/dashboards');
    await waitFor(() => {
      expect(screen.getByLabelText('Search dashboards')).toBeDefined();
    });
  });
});
