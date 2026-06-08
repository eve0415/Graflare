import type { PrometheusResponse } from '@graflare/shared/schemas/prometheus';

import { prometheusResponseSchema } from '@graflare/shared/schemas/prometheus';
import { TIME_MULTIPLIERS } from '@graflare/shared/time/resolve';

// Query-result cache for the Prometheus proxy. Two concerns live here:
//   1. Pure helpers (`parseStepSeconds`, `bucketRange`, `queryCacheKey`) — the
//      cache-correctness core, tested exhaustively in isolation.
//   2. A thin `cachedProxyQuery` wrapper that owns the read/run/write decision
//      logic over an injectable `QueryCacheStore` (Cache API in prod, a fake in
//      tests), so the logic is testable without `caches.default`.
//
// Security: the key is derived from the AUTHENTICATED orgId (never a request
// field) plus the datasource, endpoint, and normalized params. The wrapper is
// only ever called AFTER auth + datasource org-ownership in `proxyQuery`, so a
// cached value can only be served back to the org that stored it.

const KEY_ORIGIN = 'https://qcache.graflare.internal';

/**
 * Parse a Prometheus step (e.g. `"15s"`, `"1m"`, or a bare `"30"`) to a positive
 * integer number of seconds, or `null` if it is not a recognized positive step.
 *
 * The web always sends `<n>s` (from `computeStep`), but a hand-authored step may
 * use any `s/m/h/d/w` suffix, so we reuse the same unit table as time parsing.
 */
export const parseStepSeconds = (step: string): number | null => {
  const suffixMatch = /^(\d+)([smhdw])$/.exec(step);
  if (suffixMatch !== null) {
    const [, amount, unit] = suffixMatch;
    if (amount !== undefined && unit !== undefined) {
      const multiplier = TIME_MULTIPLIERS[unit];
      if (multiplier !== undefined) {
        const seconds = Number(amount) * multiplier;
        return seconds > 0 ? seconds : null;
      }
    }
  }

  if (/^\d+$/.test(step)) {
    const seconds = Number(step);
    return seconds > 0 ? seconds : null;
  }

  return null;
};

const snapDown = (value: string, stepSeconds: number): string => {
  // `start`/`end` are unix-second strings in the dominant case, but the proxy's
  // schema also permits RFC3339 — only snap when the value is a finite number,
  // otherwise leave it untouched so the key (and upstream query) stay valid.
  if (!/^\d+(?:\.\d+)?$/.test(value)) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return String(Math.floor(n / stepSeconds) * stepSeconds);
};

export interface BucketedRange {
  readonly start: string;
  readonly end: string;
  readonly stepSeconds: number | null;
}

/**
 * Step-align a `[start, end]` range by snapping each bound DOWN to the nearest
 * `step` multiple. Within one step window, every auto-refresh of a relative
 * range ("now-1h" → a drifting absolute epoch) yields the same snapped bounds,
 * which is what turns a 0%-hit-rate cache into a useful one. Step-aligned ranges
 * are also canonical for Prometheus, so this is a minor correctness win too.
 *
 * If the step or the bounds are not numeric, the range is returned unchanged.
 */
export const bucketRange = (start: string, end: string, step: string): BucketedRange => {
  const stepSeconds = parseStepSeconds(step);
  if (stepSeconds === null) return { start, end, stepSeconds: null };
  return { start: snapDown(start, stepSeconds), end: snapDown(end, stepSeconds), stepSeconds };
};

const toHex = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
};

/**
 * Deterministically normalize the params bag: sort keys, then join as
 * `k=v` pairs. PromQL is up to 8KB and contains `{}="` characters, so we hash
 * the normalized string (SHA-256) rather than embed it raw in the key — this
 * bounds key length and sidesteps URL-encoding pitfalls.
 */
const normalizeParams = (params: Record<string, string>): string =>
  Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k] ?? ''}`)
    .join('&');

export interface QueryCacheKeyInput {
  readonly orgId: string;
  readonly datasourceId: string;
  readonly endpoint: string;
  readonly params: Record<string, string>;
}

/**
 * Build the org-scoped synthetic cache key (a URL string usable directly as a
 * Cache API key). The orgId and datasourceId sit in the PATH for structural
 * tenant isolation; the endpoint and a SHA-256 of the normalized params go in
 * the query string. Two different orgs with an otherwise-identical query get
 * different keys, so one org's cached result can never be served to another.
 */
export const queryCacheKey = async ({ orgId, datasourceId, endpoint, params }: QueryCacheKeyInput): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeParams(params)));
  const paramsHash = toHex(digest);
  const search = new URLSearchParams({ endpoint, params: paramsHash }).toString();
  return `${KEY_ORIGIN}/${encodeURIComponent(orgId)}/${encodeURIComponent(datasourceId)}?${search}`;
};

/** Injectable store so the wrapper's decision logic is testable without `caches.default`. */
export interface QueryCacheStore {
  match(key: string): Promise<PrometheusResponse | undefined>;
  put(key: string, value: PrometheusResponse, ttlSeconds: number): Promise<void>;
}

/**
 * Production store backed by the Workers Cache API (`caches.default`). The value
 * is a JSON `Response` carrying `Cache-Control: max-age=<ttl>` so the edge
 * evicts it on schedule. Cache API `put` requires a GET request — a string key
 * is interpreted as a GET Request URL, which satisfies that.
 */
export class CacheApiStore implements QueryCacheStore {
  readonly #cache: Cache;

  constructor(cache: Cache) {
    this.#cache = cache;
  }

  async match(key: string): Promise<PrometheusResponse | undefined> {
    const hit = await this.#cache.match(key);
    if (hit === undefined) return undefined;
    const body: unknown = await hit.json();
    const parsed = prometheusResponseSchema.safeParse(body);
    return parsed.success ? parsed.data : undefined;
  }

  async put(key: string, value: PrometheusResponse, ttlSeconds: number): Promise<void> {
    const response = new Response(JSON.stringify(value), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `max-age=${String(ttlSeconds)}`,
      },
    });
    await this.#cache.put(key, response);
  }
}

export interface CachedProxyArgs {
  readonly orgId: string;
  readonly datasourceId: string;
  readonly endpoint: string;
  /** Mutated in place: snapped start/end are written back so the upstream query is step-aligned too. */
  readonly params: Record<string, string>;
  readonly cacheTtl: number;
}

/**
 * Wrap a live proxy run with org-scoped read-through caching.
 *
 * - `cacheTtl === 0` → no cache work at all; run live.
 * - Otherwise: step-align start/end (writing the snapped values back into
 *   `params` so the upstream query matches the key), look up; on a hit return
 *   the cached response; on a miss run live and store ONLY a successful response
 *   that carries data.
 * - Fail open: any cache read/write error falls through to a live run; a cache
 *   failure never breaks a query.
 *
 * `run` receives the (possibly snapped) params and performs the real upstream
 * fetch — it stays the sole owner of the security-critical allowlist + origin
 * assertion + credential attachment in `proxyQuery`.
 */
export const cachedProxyQuery = async (
  store: QueryCacheStore,
  { orgId, datasourceId, endpoint, params, cacheTtl }: CachedProxyArgs,
  run: (params: Record<string, string>) => Promise<PrometheusResponse>,
): Promise<PrometheusResponse> => {
  if (cacheTtl <= 0) return run(params);

  // Step-align the range for query_range so relative-range refreshes collapse to
  // one bucket. Other endpoints have no start/end/step and pass through.
  const { start, end, step } = params;
  if (start !== undefined && end !== undefined && step !== undefined) {
    const snapped = bucketRange(start, end, step);
    params['start'] = snapped.start;
    params['end'] = snapped.end;
  }

  const key = await queryCacheKey({ orgId, datasourceId, endpoint, params });

  try {
    const cached = await store.match(key);
    if (cached !== undefined) return cached;
  } catch (error) {
    console.error('query cache read failed (serving live):', error);
    return run(params);
  }

  const result = await run(params);

  // Only cache a genuinely-successful response with data — never an error or an
  // empty success, which would otherwise pin a transient failure for the full TTL.
  if (result.status === 'success' && result.data !== undefined) {
    try {
      await store.put(key, result, cacheTtl);
    } catch (error) {
      console.error('query cache write failed (ignored):', error);
    }
  }

  return result;
};
