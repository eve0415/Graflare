import type { DatasourceRow } from '../../datasources/-api';
import type { QueryHistoryEntry } from './query-history-store';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, it } from 'vitest';

import { expectNoA11yViolations } from '../../../../tests/a11y';

import { QueryHistoryDrawer } from './query-history-drawer';

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
];

const ENTRIES: QueryHistoryEntry[] = [
  { id: 'e1', datasourceId: 'ds-prom', datasourceType: 'prometheus', query: 'up', comment: 'liveness', starred: true, createdAt: Date.now() - 60_000 },
  {
    id: 'e2',
    datasourceId: 'ds-prom',
    datasourceType: 'prometheus',
    query: 'rate(errors_total[5m])',
    comment: '',
    starred: false,
    createdAt: Date.now() - 3_600_000,
  },
];

const noop = (): void => {};

afterEach(cleanup);

describe('query-history-drawer a11y', () => {
  it('has no axe violations (labelled controls, tabs, action buttons)', async () => {
    // The Sheet portals to document.body, so assert over baseElement, not the (empty) container.
    const { baseElement } = render(
      <QueryHistoryDrawer
        open
        onOpenChange={noop}
        entries={ENTRIES}
        datasources={DATASOURCES}
        now={Date.now()}
        onRun={noop}
        onToggleStar={noop}
        onSetComment={noop}
        onRemove={noop}
      />,
    );
    await expectNoA11yViolations(baseElement);
  });
});
