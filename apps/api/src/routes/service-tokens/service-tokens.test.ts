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
