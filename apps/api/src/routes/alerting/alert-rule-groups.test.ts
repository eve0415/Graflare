import type { AppEnv } from '../../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../../db';
import { alertRuleGroups, folders, organizations } from '../../db/schema';

import { alertRuleGroupRoutes } from './alert-rule-groups';

const TEST_ORG_ID = 'org-test-123';

const testBindings: AppEnv['Bindings'] = {
  DB: env.DB,
  ENCRYPTION_KEY: btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32)))),
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
};

const createApp = () => {
  const app = new Hono<AppEnv>();
  app.use('/*', async (c, next) => {
    c.set('orgId', TEST_ORG_ID);
    c.set('user', { email: 'test@example.com', name: 'Test' });
    await next();
  });
  app.route('/', alertRuleGroupRoutes);
  return app;
};

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('alert-rule-group routes', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(alertRuleGroups);
    await db.delete(folders);
    await db.delete(organizations);
    await db.insert(organizations).values({
      id: TEST_ORG_ID,
      name: 'Test Org',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('lists groups (empty)', async () => {
    const app = createApp();
    const res = await app.request(req('/'), {}, testBindings);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('creates a group', async () => {
    const app = createApp();
    const res = await app.request(req('/', json({ name: 'test-group' })), {}, testBindings);
    expect(res.status).toBe(201);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('name', 'test-group');
    expect(body).toHaveProperty('evalIntervalS', 60);
  });

  it('creates a group in a folder', async () => {
    const db = createDb(env.DB);
    const folderId = crypto.randomUUID();
    await db.insert(folders).values({
      id: folderId,
      orgId: TEST_ORG_ID,
      title: 'Alerts',
      slug: 'alerts',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const app = createApp();
    const res = await app.request(req('/', json({ name: 'in-folder', folderId })), {}, testBindings);
    expect(res.status).toBe(201);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('folderId', folderId);
  });

  it('rejects invalid input', async () => {
    const app = createApp();
    const res = await app.request(req('/', json({ name: '' })), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('gets a group by id', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json({ name: 'get-test' })), {}, testBindings);
    const created: unknown = await createRes.json();
    if (typeof created !== 'object' || created === null || !('id' in created)) throw new Error('bad shape');

    const res = await app.request(req(`/${created.id}`), {}, testBindings);
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('name', 'get-test');
  });

  it('returns 404 for nonexistent group', async () => {
    const app = createApp();
    const res = await app.request(req('/550e8400-e29b-41d4-a716-446655440000'), {}, testBindings);
    expect(res.status).toBe(404);
  });

  it('rejects malformed id with 400', async () => {
    const app = createApp();
    const res = await app.request(req('/not-a-uuid'), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('updates a group', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json({ name: 'before' })), {}, testBindings);
    const created: unknown = await createRes.json();
    if (typeof created !== 'object' || created === null || !('id' in created)) throw new Error('bad shape');

    const res = await app.request(
      req(`/${created.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'after' }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('name', 'after');
  });

  it('deletes a group', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json({ name: 'to-delete' })), {}, testBindings);
    const created: unknown = await createRes.json();
    if (typeof created !== 'object' || created === null || !('id' in created)) throw new Error('bad shape');

    const res = await app.request(req(`/${created.id}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);

    const getRes = await app.request(req(`/${created.id}`), {}, testBindings);
    expect(getRes.status).toBe(404);
  });
});
