import type { AppEnv } from '../../index';

import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb } from '../../db';
import { accessServiceTokens, organizations } from '../../db/schema';

import { serviceTokenRoutes } from './service-tokens';

const ORG_A = 'org-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'org-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TEST_ENCRYPTION_KEY = btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32))));

const testBindings: AppEnv['Bindings'] = {
  ...env,
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
};

const createResult = {
  id: 'cf-tok-1',
  client_id: 'client-1',
  client_secret: 'the-secret',
  name: 'ci',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  expires_at: '2027-01-01T00:00:00Z',
  duration: '8760h',
};

interface CfCall {
  url: string;
  method: string;
}

const cfCalls: CfCall[] = [];

const envelope = (result: unknown): Response =>
  new Response(JSON.stringify({ success: true, errors: [], messages: [], result }), { status: 200, headers: { 'Content-Type': 'application/json' } });

// Mock the Cloudflare API at the fetch boundary (the route builds the client
// internally). Records calls so org-scoping can be asserted against them.
const mockCf = (): void => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const req = new Request(input, init);
    cfCalls.push({ url: req.url, method: req.method });
    if (req.method === 'DELETE') return Promise.resolve(envelope({ id: 'cf-tok-1' }));
    return Promise.resolve(envelope(createResult));
  });
};

// Like mockCf, but each POST (create) hands back the next cf token id from the
// list (default 'cf-tok-1' once exhausted). Lets a test mint two tokens that
// share a client_id to force a duplicate-clientId link-insert collision.
const mockCfPostIds = (postTokenIds: string[]): void => {
  let posts = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const r = new Request(input, init);
    cfCalls.push({ url: r.url, method: r.method });
    if (r.method !== 'POST') return Promise.resolve(envelope({ id: 'ok' }));
    const id = postTokenIds[posts] ?? 'cf-tok-1';
    posts += 1;
    return Promise.resolve(envelope({ ...createResult, id }));
  });
};

// Predicate: is this a CF DELETE for the given cf token id? (module scope so the
// `&&` isn't a conditional inside a test body)
const isDeleteOf =
  (cfTokenId: string) =>
  (call: CfCall): boolean =>
    call.method === 'DELETE' && call.url.includes(`/service_tokens/${cfTokenId}`);

const createApp = (orgId: string) => {
  const app = new Hono<AppEnv>();
  app.use('/*', async (c, next) => {
    c.set('orgId', orgId);
    c.set('user', { email: 'test@example.com', name: 'Test' });
    await next();
  });
  app.route('/', serviceTokenRoutes);
  return app;
};

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

const readJson = async (res: Response): Promise<Record<string, unknown>> => {
  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null) throw new Error('expected object body');
  return Object.fromEntries(Object.entries(body));
};

const readArray = async (res: Response): Promise<unknown[]> => {
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error('expected array body');
  const items: unknown[] = body;
  return items;
};

// Predicate: does this (unknown) item carry the given own property?
const hasOwn =
  (key: string) =>
  (item: unknown): boolean =>
    typeof item === 'object' && item !== null && key in item;

// Narrows an (unknown) list item to the metadata wire shape, asserting the
// timestamp fields are epoch-ms numbers (the contract both paths must honor).
const readMetaItem = (item: unknown): { createdAt: number; expiresAt: number | null } => {
  if (typeof item !== 'object' || item === null || !('createdAt' in item) || typeof item.createdAt !== 'number') {
    throw new Error('expected createdAt as a number');
  }
  const expiresAt = 'expiresAt' in item && typeof item.expiresAt === 'number' ? item.expiresAt : null;
  return { createdAt: item.createdAt, expiresAt };
};

afterEach(() => {
  vi.restoreAllMocks();
  cfCalls.length = 0;
});

describe('service-token routes', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(accessServiceTokens);
    await db.delete(organizations);
    const now = new Date();
    await db.insert(organizations).values([
      { id: ORG_A, name: 'A', createdAt: now, updatedAt: now },
      { id: ORG_B, name: 'B', createdAt: now, updatedAt: now },
    ]);
  });

  it('lists tokens (empty)', async () => {
    const res = await createApp(ORG_A).request(req('/'), {}, testBindings);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('creates a token: returns the secret once, stores a link with no secret', async () => {
    mockCf();
    const res = await createApp(ORG_A).request(
      req('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'ci', duration: '8760h' }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body['clientSecret']).toBe('the-secret');
    expect(body['clientId']).toBe('client-1');

    // CF was called to create.
    expect(cfCalls.some(c => c.method === 'POST')).toBe(true);

    // Stored row carries no secret.
    const rows = await createDb(env.DB).select().from(accessServiceTokens).where(eq(accessServiceTokens.orgId, ORG_A));
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('the-secret');
  });

  it('list never includes a secret', async () => {
    mockCf();
    await createApp(ORG_A).request(
      req('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'ci' }) }),
      {},
      testBindings,
    );

    const res = await createApp(ORG_A).request(req('/'), {}, testBindings);
    const items = await readArray(res);
    expect(items).toHaveLength(1);
    expect(JSON.stringify(items)).not.toContain('the-secret');
    expect(items.some(item => hasOwn('clientSecret')(item))).toBe(false);
    expect(items.some(item => hasOwn('cfTokenId')(item))).toBe(false);
  });

  it('list returns timestamps as epoch-ms numbers (HTTP matches the RPC contract)', async () => {
    mockCf();
    await createApp(ORG_A).request(
      req('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'ci' }) }),
      {},
      testBindings,
    );

    const res = await createApp(ORG_A).request(req('/'), {}, testBindings);
    const items = await readArray(res);
    expect(items).toHaveLength(1);
    const item = readMetaItem(items[0]);
    expect(typeof item.createdAt).toBe('number');
    // expires_at was provided by CF, so it must serialize as a number too (not an ISO string).
    expect(typeof item.expiresAt).toBe('number');
  });

  it('rejects an empty name with 400', async () => {
    const res = await createApp(ORG_A).request(
      req('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '' }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(400);
  });

  it('revokes a token: calls CF delete and removes the row', async () => {
    mockCf();
    const createRes = await createApp(ORG_A).request(
      req('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'ci' }) }),
      {},
      testBindings,
    );
    const { id } = await readJson(createRes);
    cfCalls.length = 0;

    const res = await createApp(ORG_A).request(req(`/${String(id)}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);
    expect(cfCalls.some(c => c.method === 'DELETE')).toBe(true);

    const rows = await createDb(env.DB).select().from(accessServiceTokens).where(eq(accessServiceTokens.orgId, ORG_A));
    expect(rows).toHaveLength(0);
  });

  it('is org-scoped: org B cannot revoke org A token (404, no CF delete, row preserved)', async () => {
    mockCf();
    const createRes = await createApp(ORG_A).request(
      req('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'ci' }) }),
      {},
      testBindings,
    );
    const { id } = await readJson(createRes);
    cfCalls.length = 0;

    const res = await createApp(ORG_B).request(req(`/${String(id)}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(404);
    expect(cfCalls.some(c => c.method === 'DELETE')).toBe(false);

    const rows = await createDb(env.DB)
      .select()
      .from(accessServiceTokens)
      .where(and(eq(accessServiceTokens.id, String(id)), eq(accessServiceTokens.orgId, ORG_A)));
    expect(rows).toHaveLength(1);
  });

  it('rejects a malformed id on DELETE with 400', async () => {
    const res = await createApp(ORG_A).request(req('/not-a-uuid', { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('rolls back the CF token when the link insert fails (no orphaned credential)', async () => {
    // First create succeeds; the second reuses client_id 'client-1' (unique
    // index) with a fresh cf token id, so its link insert collides and the route
    // must revoke the just-minted CF token instead of leaving it orphaned.
    mockCfPostIds(['cf-tok-1', 'cf-tok-dup']);

    await createApp(ORG_A).request(
      req('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'first' }) }),
      {},
      testBindings,
    );
    const res = await createApp(ORG_A).request(
      req('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'dup' }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(500);

    // The route revoked the orphaned CF token (cf-tok-dup) at Cloudflare.
    expect(cfCalls.some(call => isDeleteOf('cf-tok-dup')(call))).toBe(true);

    // Only the first token's link row survives.
    const rows = await createDb(env.DB).select().from(accessServiceTokens).where(eq(accessServiceTokens.orgId, ORG_A));
    expect(rows.map(r => r.cfTokenId)).toEqual(['cf-tok-1']);
  });

  it('returns 502 when Cloudflare create fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ success: false, errors: [{ code: 1001, message: 'nope' }], messages: [], result: null }), { status: 403 })),
    );
    const res = await createApp(ORG_A).request(
      req('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'ci' }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(502);
    const rows = await createDb(env.DB).select().from(accessServiceTokens).where(eq(accessServiceTokens.orgId, ORG_A));
    expect(rows).toHaveLength(0);
  });
});
