import { QueryClient, QueryClientProvider, queryOptions } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { routeTree } from '../routeTree.gen';

import { alertRuleQueryOptions, contactPointQueryOptions, notificationPoliciesQueryOptions } from './alerting/-queries';

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

  it('renders new alert rule form at /alerting/rules/new', async () => {
    await renderWithRouter('/alerting/rules/new');
    await waitFor(() => {
      expect(screen.getByText('New Alert Rule')).toBeDefined();
      expect(screen.getByLabelText('Title')).toBeDefined();
    });
  });

  it('renders alert rule not found at /alerting/rules/:id when missing', async () => {
    await renderWithRouter('/alerting/rules/missing-rule-id');
    await waitFor(() => {
      expect(screen.getByText('Rule not found.')).toBeDefined();
    });
  });

  it('renders the edit form pre-filled at /alerting/rules/:id', async () => {
    const rule = {
      id: 'rule-1',
      orgId: 'org-1',
      groupId: 'group-1',
      title: 'High CPU usage',
      queries: [{ refId: 'A', datasourceId: 'ds-1', expr: 'up', legendFormat: '' }],
      condition: { refId: 'A', reducer: 'avg', operator: 'gt', threshold: 80 },
      labels: { severity: 'critical' },
      annotations: { summary: 'CPU high' },
      forDurationS: 300,
      noDataState: 'OK',
      execErrState: 'KeepLastState',
      isPaused: false,
      createdAt: 0,
      updatedAt: 0,
    };
    vi.mocked(alertRuleQueryOptions).mockReturnValue(
      queryOptions({ queryKey: ['alert-rule', rule.id], queryFn: (): Promise<typeof rule | null> => Promise.resolve(rule) }),
    );

    try {
      await renderWithRouter('/alerting/rules/rule-1');
      await waitFor(() => {
        expect(screen.getByLabelText('Title')).toBe(screen.getByDisplayValue('High CPU usage'));
      });
    } finally {
      vi.mocked(alertRuleQueryOptions).mockImplementation((id: string) =>
        queryOptions({ queryKey: ['alert-rule', id], queryFn: (): Promise<typeof rule | null> => Promise.resolve(null) }),
      );
    }
  });

  it('renders the edit form pre-filled at /alerting/notifications/contact-points/:id', async () => {
    const contactPoint = {
      id: 'cp-1',
      orgId: 'org-1',
      name: 'On-call Webhook',
      type: 'webhook',
      // Settings as the redacting API returns them: password is the '******' sentinel when set.
      settings: { type: 'webhook', url: 'https://hooks.example.com/alert', method: 'POST', username: '', password: '******' },
      createdAt: 0,
      updatedAt: 0,
    };
    vi.mocked(contactPointQueryOptions).mockReturnValue(
      queryOptions({ queryKey: ['contact-point', contactPoint.id], queryFn: (): Promise<typeof contactPoint | null> => Promise.resolve(contactPoint) }),
    );

    try {
      await renderWithRouter('/alerting/notifications/contact-points/cp-1');
      await waitFor(() => {
        expect(screen.getByLabelText('Name')).toBe(screen.getByDisplayValue('On-call Webhook'));
        expect(screen.getByLabelText('URL')).toBe(screen.getByDisplayValue('https://hooks.example.com/alert'));
      });
    } finally {
      vi.mocked(contactPointQueryOptions).mockImplementation((id: string) =>
        queryOptions({ queryKey: ['contact-point', id], queryFn: (): Promise<typeof contactPoint | null> => Promise.resolve(null) }),
      );
    }
  });

  it('renders new notification policy form at /alerting/notifications/policies/new', async () => {
    await renderWithRouter('/alerting/notifications/policies/new');
    await waitFor(() => {
      expect(screen.getByText('New Notification Policy')).toBeDefined();
      expect(screen.getByLabelText('Repeat interval (seconds)')).toBeDefined();
    });
  });

  it('renders the edit form pre-filled at /alerting/notifications/policies/:id', async () => {
    const policy = {
      id: 'policy-1',
      orgId: 'org-1',
      parentId: null,
      contactPointId: null,
      groupBy: ['alertname', 'cluster'],
      matchers: [{ name: 'severity', operator: '=', value: 'critical' }],
      muteTimingIds: [],
      groupWaitS: 30,
      groupIntervalS: 300,
      repeatIntervalS: 7200,
      continueMatching: false,
      createdAt: 0,
      updatedAt: 0,
    };
    // The edit route loads the policy LIST and `.find`s by id, so the mock returns an array.
    vi.mocked(notificationPoliciesQueryOptions).mockReturnValue(
      queryOptions({ queryKey: ['notification-policies'], queryFn: (): Promise<(typeof policy)[]> => Promise.resolve([policy]) }),
    );

    try {
      await renderWithRouter('/alerting/notifications/policies/policy-1');
      await waitFor(() => {
        expect(screen.getByLabelText('Repeat interval (seconds)')).toBe(screen.getByDisplayValue('7200'));
        expect(screen.getByDisplayValue('critical')).toBeDefined();
      });
    } finally {
      vi.mocked(notificationPoliciesQueryOptions).mockReturnValue(
        queryOptions({ queryKey: ['notification-policies'], queryFn: (): Promise<(typeof policy)[]> => Promise.resolve([]) }),
      );
    }
  });
});
