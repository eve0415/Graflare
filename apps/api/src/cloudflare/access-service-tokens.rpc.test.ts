import type { AppEnv } from '../index';
import type { ServiceTokenWithSecret } from '@graflare/shared/schemas/service-token';

import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb } from '../db';
import { accessServiceTokens, organizations } from '../db/schema';
import { GraflareAPI } from '../index';

// The privileged CF client is built behind a JS-private method on GraflareAPI
// (so it is never RPC-exposed), so we can't spy on the method. Instead we mock
// the network boundary (`globalThis.fetch`) and let the real client →
// cfRequest → zod-parse path run, exactly as in production. createServiceToken
// hits POST and revokeServiceToken hits DELETE; listServiceTokens reads D1 only.

const TEST_ENCRYPTION_KEY = btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32))));
const DEV_EMAIL = 'service-token-rpc@example.com';
const OTHER_EMAIL = 'other-org@example.com';

const testBindings: AppEnv['Bindings'] = {
  ...env,
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
  DEV_AUTH_EMAIL: DEV_EMAIL,
};

const makeApi = (overrides?: Partial<AppEnv['Bindings']>): GraflareAPI => new GraflareAPI(createExecutionContext(), { ...testBindings, ...overrides });

const orgIdOf = async (email: string): Promise<string> => {
  const data = new TextEncoder().encode(email.toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `org-${hex.slice(0, 32)}`;
};

const createResult: ServiceTokenWithSecret = {
  id: 'cf-tok-1',
  client_id: 'client-1',
  client_secret: 'the-secret',
  name: 'ci',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  expires_at: '2027-01-01T00:00:00Z',
  duration: '8760h',
};

interface CapturedRequest {
  url: string;
  method: string;
  body: string | null;
}

const captured: CapturedRequest[] = [];
// FIFO of CF create (POST) results; each create dequeues one, falling back to
// the default. Lets a test stage distinct tokens for two orgs in call order.
const createQueue: ServiceTokenWithSecret[] = [];

const envelope = (result: unknown): Response =>
  new Response(JSON.stringify({ success: true, errors: [], messages: [], result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const installFetch = (): void => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const req = new Request(input, init);
    captured.push({ url: req.url, method: req.method, body: typeof init?.body === 'string' ? init.body : null });
    if (req.method === 'POST') {
      return Promise.resolve(envelope(createQueue.shift() ?? createResult));
    }
    // DELETE (revoke) and any GET (list) — RPC list reads D1, so GET is unused.
    return Promise.resolve(envelope({ id: 'ok' }));
  });
};

const must = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error('expected defined value');
  return v;
};

const mustBody = (v: string | null): string => {
  if (v === null) throw new Error('expected a request body');
  return v;
};

const resetDb = async (): Promise<void> => {
  const db = createDb(env.DB);
  await db.delete(accessServiceTokens);
  await db.delete(organizations);
};

beforeEach(async () => {
  captured.length = 0;
  createQueue.length = 0;
  installFetch();
  await resetDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createServiceToken RPC', () => {
  it('returns the secret once and forwards name+duration to Cloudflare', async () => {
    const api = makeApi();

    const result = await api.createServiceToken('jwt', { name: 'ci', duration: '8760h' });

    expect(result.clientSecret).toBe('the-secret');
    expect(result.clientId).toBe('client-1');
    expect(result.name).toBe('ci');

    const post = must(captured.find(r => r.method === 'POST'));
    expect(JSON.parse(mustBody(post.body))).toEqual({ name: 'ci', duration: '8760h' });
  });

  it('stores a link row that contains no secret', async () => {
    const api = makeApi();

    await api.createServiceToken('jwt', { name: 'ci' });

    const rows = await createDb(env.DB).select().from(accessServiceTokens);
    expect(rows).toHaveLength(1);
    const row = must(rows[0]);
    expect(row.cfTokenId).toBe('cf-tok-1');
    expect(row.clientId).toBe('client-1');
    expect(JSON.stringify(row)).not.toContain('the-secret');
    expect('clientSecret' in row).toBe(false);
    expect('client_secret' in row).toBe(false);
  });

  it('persists expiresAt as null when CF omits expires_at', async () => {
    const api = makeApi();
    const { expires_at: _e, ...noExpiry } = createResult;
    createQueue.push(noExpiry);

    const result = await api.createServiceToken('jwt', { name: 'ci' });
    expect(result.expiresAt).toBeNull();

    const rows = await createDb(env.DB).select().from(accessServiceTokens);
    expect(must(rows[0]).expiresAt).toBeNull();
  });

  it('rolls back the CF token (best-effort delete) when the link insert fails', async () => {
    const api = makeApi();
    // Force the link insert to fail: clientId has a unique index, so a second
    // create whose CF result reuses client_id 'client-1' (only the cf token id
    // differs) collides and throws — exercising the orphan-rollback path.
    createQueue.push(createResult, { ...createResult, id: 'cf-tok-dup' });
    await api.createServiceToken('jwt', { name: 'first' });

    await expect(api.createServiceToken('jwt', { name: 'dup' })).rejects.toThrow('Failed to create service token');

    // The orphan-avoidance path revoked the just-created CF token at Cloudflare.
    const del = must(captured.find(r => r.method === 'DELETE'));
    expect(del.url).toContain('/service_tokens/cf-tok-dup');
    // Only the first token's link row survives.
    const rows = await createDb(env.DB).select().from(accessServiceTokens);
    expect(rows).toHaveLength(1);
    expect(must(rows[0]).cfTokenId).toBe('cf-tok-1');
  });
});

describe('listServiceTokens RPC', () => {
  it('returns metadata only — never a secret or cf token id', async () => {
    const api = makeApi();
    await api.createServiceToken('jwt', { name: 'ci' });

    const list = await api.listServiceTokens('jwt');
    expect(list).toHaveLength(1);
    const item = must(list[0]);
    expect(item.clientId).toBe('client-1');
    expect('clientSecret' in item).toBe(false);
    expect('client_secret' in item).toBe(false);
    expect('cfTokenId' in item).toBe(false);
    expect(JSON.stringify(list)).not.toContain('the-secret');
  });

  it('only returns the caller org rows', async () => {
    createQueue.push(createResult, { ...createResult, id: 'cf-tok-2', client_id: 'client-2' });

    const mine = makeApi();
    await mine.createServiceToken('jwt', { name: 'mine' });

    const theirs = makeApi({ DEV_AUTH_EMAIL: OTHER_EMAIL });
    await theirs.createServiceToken('jwt', { name: 'theirs' });

    const mineList = await mine.listServiceTokens('jwt');
    expect(mineList).toHaveLength(1);
    expect(must(mineList[0]).clientId).toBe('client-1');
  });
});

describe('revokeServiceToken RPC', () => {
  it('calls Cloudflare delete with the cf token id and removes the link', async () => {
    const api = makeApi();
    const created = await api.createServiceToken('jwt', { name: 'ci' });

    await api.revokeServiceToken('jwt', created.id);

    const del = must(captured.find(r => r.method === 'DELETE'));
    expect(del.url).toContain('/service_tokens/cf-tok-1');
    expect(await createDb(env.DB).select().from(accessServiceTokens)).toHaveLength(0);
  });

  it('is org-scoped: another org cannot revoke (no CF delete, row preserved)', async () => {
    const mine = makeApi();
    const created = await mine.createServiceToken('jwt', { name: 'mine' });

    const theirs = makeApi({ DEV_AUTH_EMAIL: OTHER_EMAIL });
    await theirs.revokeServiceToken('jwt', created.id);

    // theirs' revoke found no row for its org → returned before any CF call.
    expect(captured.some(r => r.method === 'DELETE')).toBe(false);

    const orgAId = await orgIdOf(DEV_EMAIL);
    const rows = await createDb(env.DB)
      .select()
      .from(accessServiceTokens)
      .where(and(eq(accessServiceTokens.id, created.id), eq(accessServiceTokens.orgId, orgAId)));
    expect(rows).toHaveLength(1);
  });
});
