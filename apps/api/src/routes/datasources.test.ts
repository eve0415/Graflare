import type { AppEnv } from '../index';

import { datasourceSchema } from '@graflare/shared/schemas/datasource';
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

// The route serializes Date columns to ISO strings and uses a non-UUID test
// org id, so the full datasourceSchema does not fit the wire shape. Pick only
// the fields the assertions read; .loose() keeps extra keys so the negative
// "credentials" check stays meaningful.
const datasourceResponseSchema = datasourceSchema.pick({ id: true, name: true }).loose();

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
    const body = datasourceResponseSchema.parse(await res.json());
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
    const created = datasourceResponseSchema.parse(await createRes.json());

    const res = await app.request(req(`/${created.id}`), {}, testBindings);
    expect(res.status).toBe(200);
    const body = datasourceResponseSchema.parse(await res.json());
    expect(body.name).toBe('Get Test');
  });

  it('returns 404 for nonexistent datasource', async () => {
    const app = createApp();
    const res = await app.request(req('/nonexistent-id'), {}, testBindings);
    expect(res.status).toBe(404);
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
    const created = datasourceResponseSchema.parse(await createRes.json());

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
    const body = datasourceResponseSchema.parse(await res.json());
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
    const created = datasourceResponseSchema.parse(await createRes.json());

    const res = await app.request(req(`/${created.id}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);

    const getRes = await app.request(req(`/${created.id}`), {}, testBindings);
    expect(getRes.status).toBe(404);
  });
});
