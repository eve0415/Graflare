import { vi } from 'vitest';

// The server-function bridge (src/lib/api.ts) imports `cloudflare:workers`,
// which has no implementation under jsdom. Mock the module with
// contract-accurate stubs so route loaders/components get realistic data and
// the real module (and its Workers-only import) is never loaded.
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
}));
