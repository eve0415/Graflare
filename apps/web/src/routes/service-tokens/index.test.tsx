import type { ServiceTokenMetadata } from '@graflare/shared/schemas/service-token';

import { QueryClient, QueryClientProvider, queryOptions } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { routeTree } from '../../routeTree.gen';

import { revokeServiceToken } from './-api';
import { serviceTokensQueryOptions } from './-queries';

afterEach(cleanup);

const TOKEN: ServiceTokenMetadata = {
  id: 'id-1',
  clientId: 'aaaaaaaaaaaaaaaa1111.access',
  name: 'ci-deploy-bot',
  createdAt: Date.UTC(2024, 0, 2),
  expiresAt: null,
};

// Builds a router (and returns it, so a test can spy on `invalidate`) seeded at the given URL.
const makeRouter = (initialUrl: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({ routeTree, context: { queryClient }, history: createMemoryHistory({ initialEntries: [initialUrl] }) });
  return { router, queryClient };
};

describe('service-tokens revoke flow', () => {
  it('revokes via the server fn and invalidates the route on confirm', async () => {
    vi.mocked(serviceTokensQueryOptions).mockReturnValue(
      queryOptions({ queryKey: ['service-tokens'], queryFn: (): Promise<ServiceTokenMetadata[]> => Promise.resolve([TOKEN]) }),
    );
    vi.mocked(revokeServiceToken).mockClear();

    try {
      const { router, queryClient } = makeRouter('/service-tokens');
      const invalidateSpy = vi.spyOn(router, 'invalidate');
      await router.load();
      render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );

      // Open the confirm dialog from the row action, then confirm.
      fireEvent.click(await screen.findByRole('button', { name: 'Revoke ci-deploy-bot' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Revoke token' }));

      await waitFor(() => {
        expect(vi.mocked(revokeServiceToken)).toHaveBeenCalledWith({ data: { id: 'id-1' } });
      });
      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalled();
      });
    } finally {
      vi.mocked(serviceTokensQueryOptions).mockReturnValue(
        queryOptions({ queryKey: ['service-tokens'], queryFn: (): Promise<ServiceTokenMetadata[]> => Promise.resolve([]) }),
      );
    }
  });
});
