import type { PanelQuery } from '@graflare/shared/schemas/panel';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxyQuery } from '../../../../lib/proxy';

import { usePanelData } from './use-panel-data';

// Regression for the cold-cache "No data" bug: on a direct load / refresh of a
// dashboard, the ['datasources'] list is never primed (only the Data Sources route
// fetches it). The old hook only *read* that cache via getQueryData, so the lookup
// failed and the panel silently rendered "No data". The fix fetches the list with
// useQuery(datasourcesQueryOptions()) and gates the panel query on it being loaded.
//
// This test exercises the REAL hook against a NON-seeded QueryClient. The local
// datasources mock resolves a list CONTAINING the panel's datasourceId; the proxy is
// a real spy. With the old (getQueryData) hook the proxy is never called; with the
// fix the list is fetched, the ds resolves, and the proxy IS called.
vi.mock('../../../../lib/proxy', () => ({
  proxyQuery: vi.fn<() => Promise<{ status: string }>>(() => Promise.resolve({ status: 'success' })),
}));

const DATASOURCE_ID = 'ds-prom-1';

vi.mock('../../../datasources/-queries', () => ({
  datasourcesQueryOptions: () => ({
    queryKey: ['datasources'],
    queryFn: () =>
      Promise.resolve([
        {
          id: DATASOURCE_ID,
          orgId: 'org-1',
          name: 'Prom',
          type: 'prometheus',
          dialect: null,
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

const queries: PanelQuery[] = [{ refId: 'A', expr: 'up', legendFormat: '', format: 'time_series' }];
const timeRange = { from: 'now-1h', to: 'now' };

const wrapper = ({ children }: { children: ReactNode }): ReactNode => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

afterEach(() => {
  vi.mocked(proxyQuery).mockClear();
});

describe('usePanelData cold cache', () => {
  it('fetches the datasources list itself and queries the proxy without the cache being primed', async () => {
    // The QueryClient is fresh — nothing seeds ['datasources']. The old hook would
    // read undefined and bail to a "Data source not loaded" result, never touching
    // the proxy. The fix fetches the list, so the lookup succeeds.
    renderHook(() => usePanelData(DATASOURCE_ID, queries, timeRange, false), { wrapper });

    await waitFor(() => {
      expect(vi.mocked(proxyQuery)).toHaveBeenCalledTimes(1);
    });

    const call = vi.mocked(proxyQuery).mock.calls[0]?.[0];
    expect(call?.data.datasourceId).toBe(DATASOURCE_ID);
  });
});
