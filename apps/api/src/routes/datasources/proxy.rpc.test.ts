import type { AppEnv } from '../../index';

import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb } from '../../db';
import { datasources, organizations } from '../../db/schema';
import { GraflareAPI } from '../../index';
import { resetOrgBootstrapCache } from '../../middleware/org';

// Security regression for the proxyQuery RPC — the path the web worker actually uses. It owns
// three controls from security-invariants.md: the endpoint allowlist, the origin assertion, and
// attaching credentials ONLY after the origin matches the datasource. None had coverage.

const TEST_ENCRYPTION_KEY = btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32))));
const TEST_EMAIL = 'proxy-rpc@example.com';
const DS_ORIGIN = 'https://prom.example.com';
const BEARER_TOKEN = 'super-secret-token';

const testBindings: AppEnv['Bindings'] = {
  ...env,
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
};

const makeApi = (): GraflareAPI => new GraflareAPI(createExecutionContext(), { ...testBindings, DEV_AUTH_EMAIL: TEST_EMAIL });

// Create the datasource through the API so it is stored under the caller's resolved org with
// properly AES-GCM-encrypted credentials — exactly what proxyQuery decrypts at request time.
const seedDatasource = async (api: GraflareAPI): Promise<string> => {
  const ds = await api.createDatasource('jwt', {
    name: 'prom',
    type: 'prometheus',
    url: DS_ORIGIN,
    authType: 'bearer',
    credentials: { token: BEARER_TOKEN },
    queryTimeoutMs: 30_000,
    cacheTtl: 0,
  });
  if (ds === null) throw new Error('failed to seed datasource');
  return ds.id;
};

interface CapturedRequest {
  origin: string;
  authorization: string | undefined;
}

// Capture the upstream origin + Authorization header for each outbound fetch. Storing the parsed
// origin (not the raw URL) keeps the assertions free of optional-index access.
const captureFetch = (): CapturedRequest[] => {
  const captured: CapturedRequest[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const authorization = new Headers(init?.headers).get('Authorization') ?? undefined;
    captured.push({ origin: new URL(url).origin, authorization });
    return Promise.resolve(new Response(JSON.stringify({ status: 'success', data: { resultType: 'vector', result: [] } }), { status: 200 }));
  });
  return captured;
};

describe('proxyQuery RPC security controls', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(datasources);
    await db.delete(organizations);
    resetOrgBootstrapCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an endpoint outside the allowlist without fetching upstream', async () => {
    const api = makeApi();
    const dsId = await seedDatasource(api);
    const captured = captureFetch();

    const res = await api.proxyQuery('jwt', dsId, '/api/v1/admin/secrets', {});

    expect(res).toEqual({ status: 'error', errorType: 'bad_request', error: 'Invalid endpoint' });
    expect(captured).toEqual([]);
  });

  it('fetches an allowlisted query from the datasource origin with credentials attached', async () => {
    const api = makeApi();
    const dsId = await seedDatasource(api);
    const captured = captureFetch();

    await api.proxyQuery('jwt', dsId, '/api/v1/query', { query: 'up' });

    // Credentials go to the datasource's own origin and nowhere else.
    expect(captured).toEqual([{ origin: DS_ORIGIN, authorization: `Bearer ${BEARER_TOKEN}` }]);
  });

  it('allows the label-values endpoint (regex allowlist entry)', async () => {
    const api = makeApi();
    const dsId = await seedDatasource(api);
    const captured = captureFetch();

    await api.proxyQuery('jwt', dsId, '/api/v1/label/job/values', {});

    expect(captured).toEqual([{ origin: DS_ORIGIN, authorization: `Bearer ${BEARER_TOKEN}` }]);
  });

  it('returns not-found for a datasource the caller does not own', async () => {
    const api = makeApi();
    await seedDatasource(api);
    const captured = captureFetch();

    const res = await api.proxyQuery('jwt', crypto.randomUUID(), '/api/v1/query', { query: 'up' });

    expect(res).toEqual({ status: 'error', errorType: 'not_found', error: 'Data source not found' });
    expect(captured).toEqual([]);
  });
});
