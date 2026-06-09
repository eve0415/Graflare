import type { ReactNode } from 'react';

import { vi } from 'vitest';

Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: vi.fn<(query: string) => MediaQueryList>((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn<MediaQueryList['addListener']>(),
    removeListener: vi.fn<MediaQueryList['removeListener']>(),
    addEventListener: vi.fn<MediaQueryList['addEventListener']>(),
    removeEventListener: vi.fn<MediaQueryList['removeEventListener']>(),
    dispatchEvent: vi.fn<MediaQueryList['dispatchEvent']>(),
  })),
});

vi.mock('../src/routes/dashboards/-api', () => ({
  listDashboards: () => Promise.resolve([]),
  getDashboard: () => Promise.resolve(null),
  createDashboard: () => Promise.resolve(null),
  updateDashboard: () => Promise.resolve(null),
  deleteDashboard: () => Promise.resolve(),
  listDashboardVersions: () => Promise.resolve([]),
  restoreDashboardVersion: () => Promise.resolve(null),
  importDashboard: () => Promise.resolve({ dashboard: null, warnings: [] }),
  listAnnotations: () => Promise.resolve([]),
  createAnnotation: () => Promise.resolve({ id: 'test-annotation' }),
  deleteAnnotation: () => Promise.resolve(),
  listFolders: () => Promise.resolve([]),
  createFolder: () => Promise.resolve({ id: 'test-folder', title: 'Test', slug: 'test' }),
  updateFolder: () => Promise.resolve(null),
  deleteFolder: () => Promise.resolve(),
}));

vi.mock('../src/routes/datasources/-api', () => ({
  listDatasources: () => Promise.resolve([]),
  getDatasource: () => Promise.resolve(null),
  createDatasource: () =>
    Promise.resolve({
      id: 'test-id',
      orgId: 'test-org',
      name: 'Test',
      type: 'prometheus',
      dialect: null,
      url: 'https://example.com',
      authType: 'none',
      queryTimeoutMs: 30000,
      cacheTtl: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }),
  updateDatasource: () => Promise.resolve(null),
  deleteDatasource: () => Promise.resolve(),
  testConnection: () => Promise.resolve({ success: true, latencyMs: 0 }),
  testConnectionInline: () => Promise.resolve({ success: true, latencyMs: 0 }),
}));

vi.mock('../src/lib/proxy', () => ({
  proxyQuery: () => Promise.resolve({ status: 'success' }),
}));

vi.mock('../src/lib/sql-proxy', () => ({
  sqlQuery: () => Promise.resolve({ columns: [], rows: [] }),
}));

vi.mock('../src/lib/introspection', () => ({
  listTables: () => Promise.resolve({ tables: [] }),
  describeTable: () => Promise.resolve({ columns: [] }),
  describeDatabase: () => Promise.resolve({ tables: {} }),
  listMetrics: () => Promise.resolve({ metrics: [] }),
  listLabels: () => Promise.resolve({ labels: [] }),
  listLabelValues: () => Promise.resolve({ values: [] }),
}));

const MockGrid = ({ children }: { children: ReactNode }): ReactNode => children;
vi.mock('react-grid-layout', () => ({
  default: MockGrid,
  Responsive: MockGrid,
  WidthProvider: () => MockGrid,
}));

vi.mock('react-grid-layout/css/styles.css', () => ({}));

vi.mock('../src/routes/dashboards/-queries', () => ({
  dashboardsQueryOptions: () => ({ queryKey: ['dashboards'], queryFn: () => Promise.resolve([]) }),
  dashboardQueryOptions: () => ({ queryKey: ['dashboard'], queryFn: () => Promise.resolve(null) }),
  dashboardVersionsQueryOptions: () => ({ queryKey: ['versions'], queryFn: () => Promise.resolve([]) }),
  foldersQueryOptions: () => ({ queryKey: ['folders'], queryFn: () => Promise.resolve([]) }),
  annotationsQueryOptions: () => ({ queryKey: ['annotations'], queryFn: () => Promise.resolve([]) }),
}));

vi.mock('../src/routes/datasources/-queries', () => ({
  datasourcesQueryOptions: () => ({ queryKey: ['datasources'], queryFn: () => Promise.resolve([]) }),
  datasourceQueryOptions: () => ({ queryKey: ['datasource'], queryFn: () => Promise.resolve(null) }),
}));

vi.mock('../src/routes/service-tokens/-api', () => ({
  listServiceTokens: () => Promise.resolve([]),
  // The create result is the ONLY place the secret exists; the mock must include it so the
  // reveal panel has something to show.
  createServiceToken: () =>
    Promise.resolve({
      id: '11111111-2222-4333-8444-555555555555',
      clientId: 'test-client-id.access',
      name: 'Test',
      createdAt: 0,
      expiresAt: null,
      clientSecret: 'test-client-secret',
    }),
  // `vi.fn` (not a plain arrow) so tests can assert the revoke fn was called with the right id.
  revokeServiceToken: vi.fn<(input: { data: { id: string } }) => Promise<void>>(() => Promise.resolve()),
}));

vi.mock('../src/routes/service-tokens/-queries', () => ({
  // `vi.fn` so a test can override the token list for the revoke flow.
  serviceTokensQueryOptions: vi.fn<() => { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }>(() => ({
    queryKey: ['service-tokens'],
    queryFn: () => Promise.resolve([]),
  })),
}));

vi.mock('../src/routes/-root/introspection-queries', () => ({
  tablesQueryOptions: () => ({ queryKey: ['introspection', 'tables'], queryFn: () => Promise.resolve({ tables: [] }), enabled: false }),
  columnsQueryOptions: () => ({ queryKey: ['introspection', 'columns'], queryFn: () => Promise.resolve({ columns: [] }), enabled: false }),
  databaseSchemaQueryOptions: () => ({ queryKey: ['introspection', 'database'], queryFn: () => Promise.resolve({ tables: {} }), enabled: false }),
  metricsQueryOptions: () => ({ queryKey: ['introspection', 'metrics'], queryFn: () => Promise.resolve({ metrics: [] }), enabled: false }),
  labelsQueryOptions: () => ({ queryKey: ['introspection', 'labels'], queryFn: () => Promise.resolve({ labels: [] }), enabled: false }),
  labelValuesQueryOptions: () => ({ queryKey: ['introspection', 'labelValues'], queryFn: () => Promise.resolve({ values: [] }), enabled: false }),
}));

vi.mock('../src/routes/alerting/-api', () => ({
  listAlertRuleGroups: () => Promise.resolve([]),
  getAlertRuleGroup: () => Promise.resolve(null),
  createAlertRuleGroup: () => Promise.resolve({ id: 'test-group', name: 'Test' }),
  updateAlertRuleGroup: () => Promise.resolve(null),
  deleteAlertRuleGroup: () => Promise.resolve(),
  listAlertRules: () => Promise.resolve([]),
  getAlertRule: () => Promise.resolve(null),
  createAlertRule: () => Promise.resolve(null),
  updateAlertRule: () => Promise.resolve(null),
  deleteAlertRule: () => Promise.resolve(),
  listAlertInstances: () => Promise.resolve([]),
  listContactPoints: () => Promise.resolve([]),
  getContactPoint: () => Promise.resolve(null),
  createContactPoint: () => Promise.resolve(null),
  updateContactPoint: () => Promise.resolve(null),
  deleteContactPoint: () => Promise.resolve(),
  listNotificationPolicies: () => Promise.resolve([]),
  createNotificationPolicy: () => Promise.resolve(null),
  updateNotificationPolicy: () => Promise.resolve(null),
  deleteNotificationPolicy: () => Promise.resolve(),
  listSilences: () => Promise.resolve([]),
  getSilence: () => Promise.resolve(null),
  createSilence: () => Promise.resolve(null),
  updateSilence: () => Promise.resolve(null),
  deleteSilence: () => Promise.resolve(),
  listMuteTimings: () => Promise.resolve([]),
  getMuteTiming: () => Promise.resolve(null),
  createMuteTiming: () => Promise.resolve(null),
  updateMuteTiming: () => Promise.resolve(null),
  deleteMuteTiming: () => Promise.resolve(),
  listAnnotations: () => Promise.resolve([]),
  createAnnotation: () => Promise.resolve(null),
  deleteAnnotation: () => Promise.resolve(),
}));

vi.mock('../src/routes/alerting/-queries', () => ({
  alertRuleGroupsQueryOptions: () => ({ queryKey: ['alert-rule-groups'], queryFn: () => Promise.resolve([]) }),
  alertRuleGroupQueryOptions: () => ({ queryKey: ['alert-rule-group'], queryFn: () => Promise.resolve(null) }),
  alertRulesQueryOptions: () => ({ queryKey: ['alert-rules'], queryFn: () => Promise.resolve([]) }),
  alertRuleQueryOptions: vi.fn<(id: string) => { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }>((id: string) => ({
    queryKey: ['alert-rule', id],
    queryFn: () => Promise.resolve(null),
  })),
  alertInstancesQueryOptions: () => ({ queryKey: ['alert-instances'], queryFn: () => Promise.resolve([]) }),
  contactPointsQueryOptions: () => ({ queryKey: ['contact-points'], queryFn: () => Promise.resolve([]) }),
  contactPointQueryOptions: vi.fn<(id: string) => { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }>((id: string) => ({
    queryKey: ['contact-point', id],
    queryFn: () => Promise.resolve(null),
  })),
  notificationPoliciesQueryOptions: vi.fn<() => { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }>(() => ({
    queryKey: ['notification-policies'],
    queryFn: () => Promise.resolve([]),
  })),
  silencesQueryOptions: () => ({ queryKey: ['silences'], queryFn: () => Promise.resolve([]) }),
  silenceQueryOptions: () => ({ queryKey: ['silence'], queryFn: () => Promise.resolve(null) }),
  muteTimingsQueryOptions: () => ({ queryKey: ['mute-timings'], queryFn: () => Promise.resolve([]) }),
  muteTimingQueryOptions: () => ({ queryKey: ['mute-timing'], queryFn: () => Promise.resolve(null) }),
}));
