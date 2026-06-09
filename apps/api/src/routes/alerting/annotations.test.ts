import type { AppEnv } from '../../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../../db';
import { annotations, organizations } from '../../db/schema';

import { annotationRoutes } from './annotations';

const TEST_ORG_ID = 'org-test-123';

const testBindings: AppEnv['Bindings'] = {
  ...env,
  ENCRYPTION_KEY: btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32)))),
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
};

const createApp = () => {
  const app = new Hono<AppEnv>();
  app.use('/*', async (c, next) => {
    c.set('orgId', TEST_ORG_ID);
    c.set('user', { kind: 'user', email: 'test@example.com', name: 'Test' });
    await next();
  });
  app.route('/', annotationRoutes);
  return app;
};

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const readId = (value: unknown): string => {
  if (typeof value !== 'object' || value === null || !('id' in value) || typeof value.id !== 'string') {
    throw new Error('bad shape: missing string id');
  }
  return value.id;
};

describe('annotation routes', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(annotations);
    await db.delete(organizations);
    await db.insert(organizations).values({
      id: TEST_ORG_ID,
      name: 'Test Org',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('lists annotations (empty)', async () => {
    const app = createApp();
    const res = await app.request(req('/'), {}, testBindings);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('creates an annotation', async () => {
    const app = createApp();
    const res = await app.request(
      req('/', json({ time: Date.now(), text: 'Alert fired', tags: ['alert'], prevState: 'Normal', newState: 'Firing' })),
      {},
      testBindings,
    );
    expect(res.status).toBe(201);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('text', 'Alert fired');
  });

  it('deletes an annotation', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json({ time: Date.now(), text: 'Delete me' })), {}, testBindings);
    const id = readId(await createRes.json());

    const res = await app.request(req(`/${id}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);
  });

  it('annotations are immutable (no update route)', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json({ time: Date.now(), text: 'Immutable' })), {}, testBindings);
    const id = readId(await createRes.json());

    const res = await app.request(
      req(`/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Changed' }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(404);
  });
});
