import type { DatasourceRow } from '../../datasources/-api';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, it, vi } from 'vitest';

import { expectNoA11yViolations } from '../../../../tests/a11y';
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

vi.mock('../../datasources/-queries', () => ({
  datasourcesQueryOptions: () => ({ queryKey: ['datasources'], queryFn: () => Promise.resolve([PROM_DS]) }),
  datasourceQueryOptions: () => ({ queryKey: ['datasource'], queryFn: () => Promise.resolve(null) }),
}));

// CodeMirror can't construct under jsdom; the a11y surface under test is the row chrome
// (fieldset labels, add/remove buttons), not the editor, so stub it.
vi.mock('./query-code-editor', () => ({ QueryCodeEditor: MockCodeEditor }));

const TIME_RANGE = { from: 'now-1h', to: 'now' };

afterEach(cleanup);

describe('explore pane multi-row a11y', () => {
  it('has no axe violations with multiple labelled query rows', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <Suspense fallback={<div>loading</div>}>
          <ExplorePane timeRange={TIME_RANGE} label='Explore pane' />
        </Suspense>
      </QueryClientProvider>,
    );
    // Wait for the first row, then add a second so the multi-row chrome (remove buttons, the
    // per-row labelled fieldsets) is present for the audit.
    await screen.findByRole('group', { name: 'Query A' });
    fireEvent.click(screen.getByRole('button', { name: 'Add query' }));

    await expectNoA11yViolations(container);
  });
});
