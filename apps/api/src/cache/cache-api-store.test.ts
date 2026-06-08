import type { PrometheusResponse } from '@graflare/shared/schemas/prometheus';

import { describe, expect, it } from 'vitest';

import { CacheApiStore, queryCacheKey } from './query-cache';

// In-isolate smoke test of the production store against the real Workers Cache
// API (`caches.default`, available in workerd via the vitest-pool-workers pool).
// FakeStore covers the wrapper's decision logic; this verifies the one contract
// read from docs rather than exercised: that a JSON Response with
// `Cache-Control: max-age` round-trips through put -> match -> schema parse, and
// that the schema accepts its own serialized output.
//
// If the pool's cross-isolate semantics ever make a freshly-put entry invisible
// to match in the same test, prefer skipping with a note over a flaky assertion.

const SUCCESS: PrometheusResponse = {
  status: 'success',
  data: { resultType: 'matrix', result: [{ metric: { __name__: 'up', job: 'api' }, values: [[1_000_000, '1']] }] },
};

describe('cacheApiStore (real Cache API round-trip)', () => {
  it('stores a success response and reads it back, parsed', async () => {
    const store = new CacheApiStore(caches.default);
    const key = await queryCacheKey({
      orgId: 'org-smoke',
      datasourceId: '550e8400-e29b-41d4-a716-446655440000',
      endpoint: '/api/v1/query_range',
      params: { query: 'up', start: '999960', end: '1000020', step: '60s' },
    });

    expect(await store.match(key)).toBeUndefined();

    await store.put(key, SUCCESS, 300);

    const hit = await store.match(key);
    expect(hit).toEqual(SUCCESS);
  });

  it('returns undefined for a never-stored key', async () => {
    const store = new CacheApiStore(caches.default);
    const key = await queryCacheKey({
      orgId: 'org-smoke',
      datasourceId: '550e8400-e29b-41d4-a716-446655440000',
      endpoint: '/api/v1/query',
      params: { query: 'absent_metric_xyz', time: '1000000' },
    });

    expect(await store.match(key)).toBeUndefined();
  });
});
