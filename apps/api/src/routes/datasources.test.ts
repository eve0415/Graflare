import type { AppEnv } from '../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../db';
import { datasources, organizations } from '../db/schema';

import { datasourceRoutes } from './datasources';

const TEST_ORG_ID = 'org-test-123';
const TEST_ENCRYPTION_KEY = btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32))));

const testBindings: AppEnv['Bindings'] = {
  DB: env.DB,
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
};

// The route serializes Date columns to ISO strings and uses a non-UUID test org
// id, so the full datasourceSchema does not fit the wire shape. Read only the
// fields the assertions touch via `in`-narrowing (no unsafe cast). The negative
// "credentials" check below runs against the raw json, so it stays meaningful.
const readBody = async (res: Response): Promise<{ id: string; name: string }> => {
  const body: unknown = await res.json();
  if (typeof body === 'object' && body !== null && 'id' in body && 'name' in body) {
    return { id: String(body.id), name: String(body.name) };
  }
  throw new Error('unexpected datasource response shape');
};

const createApp = () => {
  const app = new Hono<AppEnv>();
  app.use('/*', async (c, next) => {
    c.set('orgId', TEST_ORG_ID);
    c.set('user', { email: 'test@example.com', name: 'Test' });
    await next();
  });
  app.route('/', datasourceRoutes);
  return app;
};

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

describe('datasource routes', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(datasources);
    await db.delete(organizations);
    await db.insert(organizations).values({
      id: TEST_ORG_ID,
      name: 'Test Org',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('lists datasources (empty)', async () => {
    const app = createApp();
    const res = await app.request(req('/'), {}, testBindings);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('creates a datasource', async () => {
    const app = createApp();
    const res = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Prom',
          type: 'prometheus',
          url: 'https://prom.example.com',
          authType: 'none',
        }),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(201);
    const body = await readBody(res);
    expect(body.name).toBe('Test Prom');
    expect(body.id).toBeDefined();
    expect(body).not.toHaveProperty('credentials');
  });

  it('creates with credentials (encrypted)', async () => {
    const app = createApp();
    const res = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Authed Prom',
          type: 'prometheus',
          url: 'https://prom.example.com',
          authType: 'bearer',
          credentials: { token: 'my-secret-token' },
        }),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(201);

    const db = createDb(env.DB);
    const rows = await db.select().from(datasources);
    const [row] = rows;
    expect(row?.credentials).toBeDefined();
    expect(row?.credentials).not.toContain('my-secret-token');
  });

  it('rejects invalid create input', async () => {
    const app = createApp();
    const res = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', type: 'invalid' }),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(400);
  });

  it('gets a datasource by id', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Get Test',
          type: 'prometheus',
          url: 'https://prom.example.com',
          authType: 'none',
        }),
      }),
      {},
      testBindings,
    );
    const created = await readBody(createRes);

    const res = await app.request(req(`/${created.id}`), {}, testBindings);
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.name).toBe('Get Test');
  });

  it('returns 404 for a well-formed but nonexistent datasource id', async () => {
    const app = createApp();
    const res = await app.request(req('/550e8400-e29b-41d4-a716-446655440000'), {}, testBindings);
    expect(res.status).toBe(404);
  });

  it('rejects a malformed id on GET with 400 (before the 404 lookup)', async () => {
    const app = createApp();
    const res = await app.request(req('/not-a-uuid'), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('rejects a malformed id on PUT with 400', async () => {
    const app = createApp();
    const res = await app.request(
      req('/not-a-uuid', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x' }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a malformed id on DELETE with 400', async () => {
    const app = createApp();
    const res = await app.request(req('/not-a-uuid', { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('updates a datasource', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Before Update',
          type: 'prometheus',
          url: 'https://prom.example.com',
          authType: 'none',
        }),
      }),
      {},
      testBindings,
    );
    const created = await readBody(createRes);

    const res = await app.request(
      req(`/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'After Update' }),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.name).toBe('After Update');
  });

  it('deletes a datasource', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'To Delete',
          type: 'prometheus',
          url: 'https://prom.example.com',
          authType: 'none',
        }),
      }),
      {},
      testBindings,
    );
    const created = await readBody(createRes);

    const res = await app.request(req(`/${created.id}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);

    const getRes = await app.request(req(`/${created.id}`), {}, testBindings);
    expect(getRes.status).toBe(404);
  });
});
