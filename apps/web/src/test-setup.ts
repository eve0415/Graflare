import { vi } from 'vitest';

Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('./lib/api', () => ({
  listDatasources: () => Promise.resolve([]),
  getDatasource: () => Promise.resolve(null),
  createDatasource: () =>
    Promise.resolve({
      id: 'test-id',
      orgId: 'test-org',
      name: 'Test',
      type: 'prometheus',
      url: 'https://example.com',
      authType: 'none',
      queryTimeoutMs: 30000,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }),
  updateDatasource: () => Promise.resolve(null),
  deleteDatasource: () => Promise.resolve(),
  testConnection: () => Promise.resolve({ success: true, latencyMs: 0 }),
  proxyQuery: () => Promise.resolve({ status: 'success' }),
  listDashboards: () => Promise.resolve([]),
  getDashboard: () => Promise.resolve(null),
  createDashboard: () => Promise.resolve(null),
  updateDashboard: () => Promise.resolve(null),
  deleteDashboard: () => Promise.resolve(),
  listDashboardVersions: () => Promise.resolve([]),
  restoreDashboardVersion: () => Promise.resolve(null),
  importDashboard: () => Promise.resolve({ dashboard: null, warnings: [] }),
  listFolders: () => Promise.resolve([]),
  createFolder: () => Promise.resolve({ id: 'test-folder', title: 'Test', slug: 'test' }),
  updateFolder: () => Promise.resolve(null),
  deleteFolder: () => Promise.resolve(),
}));

vi.mock('./lib/query-options', () => ({
  dashboardsQueryOptions: () => ({ queryKey: ['dashboards'], queryFn: () => Promise.resolve([]) }),
  dashboardQueryOptions: () => ({ queryKey: ['dashboard'], queryFn: () => Promise.resolve(null) }),
  dashboardVersionsQueryOptions: () => ({ queryKey: ['versions'], queryFn: () => Promise.resolve([]) }),
  datasourcesQueryOptions: () => ({ queryKey: ['datasources'], queryFn: () => Promise.resolve([]) }),
  datasourceQueryOptions: () => ({ queryKey: ['datasource'], queryFn: () => Promise.resolve(null) }),
  foldersQueryOptions: () => ({ queryKey: ['folders'], queryFn: () => Promise.resolve([]) }),
}));
