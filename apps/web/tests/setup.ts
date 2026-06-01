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
      url: 'https://example.com',
      authType: 'none',
      queryTimeoutMs: 30000,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }),
  updateDatasource: () => Promise.resolve(null),
  deleteDatasource: () => Promise.resolve(),
  testConnection: () => Promise.resolve({ success: true, latencyMs: 0 }),
}));

vi.mock('../src/lib/proxy', () => ({
  proxyQuery: () => Promise.resolve({ status: 'success' }),
}));

const MockGrid = ({ children }: { children: React.ReactNode }) => children;
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
}));

vi.mock('../src/routes/datasources/-queries', () => ({
  datasourcesQueryOptions: () => ({ queryKey: ['datasources'], queryFn: () => Promise.resolve([]) }),
  datasourceQueryOptions: () => ({ queryKey: ['datasource'], queryFn: () => Promise.resolve(null) }),
}));
