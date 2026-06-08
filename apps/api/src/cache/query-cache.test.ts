import type { QueryCacheStore } from './query-cache';
import type { PrometheusResponse } from '@graflare/shared/schemas/prometheus';

import { describe, expect, it, vi } from 'vitest';

import { bucketRange, cachedProxyQuery, parseStepSeconds, queryCacheKey } from './query-cache';

// A Map-backed QueryCacheStore so the wrapper's decision logic (hit/miss, ttl=0
// bypass, fail-open, don't-cache-errors) is deterministic and never depends on
// `caches.default` being reachable inside the test isolate.
class FakeStore implements QueryCacheStore {
  // Store the response object directly with an expiry — a real store serializes,
  // but the wrapper's decision logic only cares about hit/miss + value identity.
  readonly entries = new Map<string, { value: PrometheusResponse; expiresAt: number }>();
  matchCalls = 0;
  putCalls = 0;
  now = 0;

  match(key: string): Promise<PrometheusResponse | undefined> {
    this.matchCalls += 1;
    const hit = this.entries.get(key);
    const fresh = hit !== undefined && hit.expiresAt > this.now;
    return Promise.resolve(fresh ? hit.value : undefined);
  }

  put(key: string, value: PrometheusResponse, ttlSeconds: number): Promise<void> {
    this.putCalls += 1;
    this.entries.set(key, { value, expiresAt: this.now + ttlSeconds * 1000 });
    return Promise.resolve();
  }
}

// A store whose match/put always throw, to prove the wrapper fails open.
class ThrowingStore implements QueryCacheStore {
  match(): Promise<PrometheusResponse | undefined> {
    return Promise.reject(new Error('cache match exploded'));
  }
  put(): Promise<void> {
    return Promise.reject(new Error('cache put exploded'));
  }
}

const SUCCESS: PrometheusResponse = {
  status: 'success',
  data: { resultType: 'matrix', result: [{ metric: { __name__: 'up' }, values: [[1_000_000, '1']] }] },
};

describe('parseStepSeconds', () => {
  it('parses a plain-seconds suffix ("15s")', () => {
    expect(parseStepSeconds('15s')).toBe(15);
  });

  it('parses minute/hour/day/week suffixes', () => {
    expect(parseStepSeconds('1m')).toBe(60);
    expect(parseStepSeconds('2h')).toBe(7200);
    expect(parseStepSeconds('1d')).toBe(86_400);
    expect(parseStepSeconds('1w')).toBe(604_800);
  });

  it('parses a bare numeric step as seconds ("30")', () => {
    expect(parseStepSeconds('30')).toBe(30);
  });

  it('returns null for non-positive or unparseable steps', () => {
    expect(parseStepSeconds('0s')).toBeNull();
    expect(parseStepSeconds('-5s')).toBeNull();
    expect(parseStepSeconds('')).toBeNull();
    expect(parseStepSeconds('abc')).toBeNull();
    expect(parseStepSeconds('1y')).toBeNull();
  });
});

describe('bucketRange', () => {
  // step-60 buckets near 1e6: 999_960, 1_000_020, 1_000_080.
  it('snaps start and end DOWN to step multiples', () => {
    // start 999_970 -> 999_960 ; end 1_000_030 -> 1_000_020
    expect(bucketRange('999970', '1000030', '60s')).toEqual({ start: '999960', end: '1000020', stepSeconds: 60 });
  });

  it('two different ends within the same step window snap to the SAME range (the HIT case)', () => {
    // The make-or-break property: a relative range re-loaded a few seconds later
    // (different absolute end) must bucket identically. Both ends fall in
    // [1_000_020, 1_000_080) and both starts fall in [999_960, 1_000_020).
    const first = bucketRange('999970', '1000030', '60s'); // -> 999960 / 1000020
    const second = bucketRange('999995', '1000055', '60s'); // 25s later -> 999960 / 1000020
    expect(second).toEqual(first);
  });

  it('an end that crosses into the next step window snaps DIFFERENTLY (proves real bucketing)', () => {
    // end 1_000_085 -> 1_000_080, a different bucket than 1_000_020. Without this
    // discriminator a constant-returning impl would pass the HIT test above.
    const inBucket = bucketRange('999970', '1000030', '60s'); // end -> 1000020
    const nextBucket = bucketRange('999970', '1000085', '60s'); // end -> 1000080
    expect(nextBucket.end).toBe('1000080');
    expect(nextBucket.end).not.toBe(inBucket.end);
  });

  it('snaps start independently across windows', () => {
    expect(bucketRange('1000025', '1000025', '60s').start).toBe('1000020');
    expect(bucketRange('999970', '1000085', '60s').start).toBe('999960');
  });

  it('returns the range unchanged when step is unparseable', () => {
    expect(bucketRange('999970', '1000030', 'bogus')).toEqual({ start: '999970', end: '1000030', stepSeconds: null });
  });

  it('returns the range unchanged when start/end are not numeric (e.g. RFC3339)', () => {
    const rfc = bucketRange('2026-05-29T00:00:00Z', '2026-05-29T01:00:00Z', '60s');
    expect(rfc).toEqual({ start: '2026-05-29T00:00:00Z', end: '2026-05-29T01:00:00Z', stepSeconds: 60 });
  });
});

describe('queryCacheKey', () => {
  const base = { orgId: 'org-a', datasourceId: 'ds-1', endpoint: '/api/v1/query_range', params: { query: 'up', start: '999960', end: '1000000', step: '60s' } };

  it('is stable for identical inputs', async () => {
    const a = await queryCacheKey(base);
    const b = await queryCacheKey({ ...base, params: { ...base.params } });
    expect(a).toBe(b);
  });

  it('produces a DIFFERENT key for a different org (cross-tenant isolation)', async () => {
    const a = await queryCacheKey(base);
    const b = await queryCacheKey({ ...base, orgId: 'org-b' });
    expect(a).not.toBe(b);
  });

  it('produces a DIFFERENT key for a different datasource', async () => {
    const a = await queryCacheKey(base);
    const b = await queryCacheKey({ ...base, datasourceId: 'ds-2' });
    expect(a).not.toBe(b);
  });

  it('produces a DIFFERENT key for a different endpoint', async () => {
    const a = await queryCacheKey(base);
    const b = await queryCacheKey({ ...base, endpoint: '/api/v1/query' });
    expect(a).not.toBe(b);
  });

  it('is independent of param key ordering', async () => {
    const a = await queryCacheKey({ ...base, params: { query: 'up', start: '999960', end: '1000000', step: '60s' } });
    const b = await queryCacheKey({ ...base, params: { step: '60s', end: '1000000', start: '999960', query: 'up' } });
    expect(a).toBe(b);
  });

  it('changes when the snapped time changes', async () => {
    const a = await queryCacheKey(base);
    const b = await queryCacheKey({ ...base, params: { ...base.params, end: '1000060' } });
    expect(a).not.toBe(b);
  });

  it('does not collide when a param value contains the k=v delimiters (PromQL has = everywhere)', async () => {
    // Without per-component encoding, `{a:'1&b=2'}` and `{a:'1', b:'2'}` both
    // serialize to "a=1&b=2" and hash to the same key — a same-tenant cache mixup.
    const a = await queryCacheKey({ ...base, params: { a: '1&b=2' } });
    const b = await queryCacheKey({ ...base, params: { a: '1', b: '2' } });
    expect(a).not.toBe(b);
  });

  it('carries the org id in the key path so two orgs are structurally separated', async () => {
    const a = await queryCacheKey(base);
    expect(a).toContain('/org-a/');
    expect(a).not.toContain('/org-b/');
  });
});

describe('cachedProxyQuery wrapper', () => {
  type RunFn = (params: Record<string, string>) => Promise<PrometheusResponse>;

  const args = {
    orgId: 'org-a',
    datasourceId: 'ds-1',
    endpoint: '/api/v1/query_range',
    params: { query: 'up', start: '999970', end: '1000030', step: '60s' },
    cacheTtl: 300,
  };

  it('returns the live result on a miss and stores it', async () => {
    const store = new FakeStore();
    const run = vi.fn<RunFn>(() => Promise.resolve(SUCCESS));

    const result = await cachedProxyQuery(store, args, run);
    expect(result).toEqual(SUCCESS);
    expect(run).toHaveBeenCalledTimes(1);
    expect(store.putCalls).toBe(1);
  });

  it('serves a HIT on a second relative-range load a few seconds later (different end, same bucket)', async () => {
    const store = new FakeStore();
    const run = vi.fn<RunFn>(() => Promise.resolve(SUCCESS));

    // First load: start 999970 / end 1000030 -> bucket 999960 / 1000020.
    await cachedProxyQuery(store, args, run);
    // Second load 25s later: start 999995 / end 1000055 still snaps to 999960 / 1000020 -> HIT.
    const second = await cachedProxyQuery(store, { ...args, params: { ...args.params, start: '999995', end: '1000055' } }, run);

    expect(second).toEqual(SUCCESS);
    expect(run).toHaveBeenCalledTimes(1); // only the first load hit upstream
  });

  it('does NOT hit when the range crosses into the next bucket', async () => {
    const store = new FakeStore();
    const run = vi.fn<RunFn>(() => Promise.resolve(SUCCESS));

    await cachedProxyQuery(store, args, run);
    // end 1000085 snaps to 1000080 -> different key -> live run again.
    await cachedProxyQuery(store, { ...args, params: { ...args.params, end: '1000085' } }, run);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('writes snapped start/end back into the params passed to the live runner', async () => {
    const store = new FakeStore();
    let seen: Record<string, string> | undefined;
    const run = vi.fn<RunFn>((p: Record<string, string>) => {
      seen = { ...p };
      return Promise.resolve(SUCCESS);
    });

    await cachedProxyQuery(store, args, run);
    expect(seen?.['start']).toBe('999960');
    expect(seen?.['end']).toBe('1000020');
    expect(seen?.['step']).toBe('60s');
  });

  it('bypasses the cache entirely when cacheTtl is 0', async () => {
    const store = new FakeStore();
    const run = vi.fn<RunFn>(() => Promise.resolve(SUCCESS));

    await cachedProxyQuery(store, { ...args, cacheTtl: 0 }, run);
    await cachedProxyQuery(store, { ...args, cacheTtl: 0 }, run);

    expect(store.matchCalls).toBe(0);
    expect(store.putCalls).toBe(0);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does NOT cache an error upstream response', async () => {
    const store = new FakeStore();
    const errorResponse: PrometheusResponse = { status: 'error', errorType: 'timeout', error: 'boom' };
    const run = vi.fn<RunFn>(() => Promise.resolve(errorResponse));

    const result = await cachedProxyQuery(store, args, run);
    expect(result).toEqual(errorResponse);
    expect(store.putCalls).toBe(0);
  });

  it('does NOT cache a success response that carries no data', async () => {
    const store = new FakeStore();
    const emptyResponse: PrometheusResponse = { status: 'success' };
    const run = vi.fn<RunFn>(() => Promise.resolve(emptyResponse));

    await cachedProxyQuery(store, args, run);
    expect(store.putCalls).toBe(0);
  });

  it('fails open and runs live when the cache read/write throws', async () => {
    const store = new ThrowingStore();
    const run = vi.fn<RunFn>(() => Promise.resolve(SUCCESS));

    const result = await cachedProxyQuery(store, args, run);
    expect(result).toEqual(SUCCESS);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
