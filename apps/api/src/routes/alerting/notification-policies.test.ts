import type { AppEnv } from '../../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../../db';
import { notificationPolicies, organizations } from '../../db/schema';

import { notificationPolicyRoutes } from './notification-policies';

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
  app.route('/', notificationPolicyRoutes);
  return app;
};

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('notification-policy routes', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(notificationPolicies);
    await db.delete(organizations);
    await db.insert(organizations).values({
      id: TEST_ORG_ID,
      name: 'Test Org',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('lists policies (empty)', async () => {
    const app = createApp();
    const res = await app.request(req('/'), {}, testBindings);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('creates a root policy', async () => {
    const app = createApp();
    const res = await app.request(req('/', json({})), {}, testBindings);
    expect(res.status).toBe(201);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('parentId', null);
    expect(body).toHaveProperty('groupWaitS', 30);
    expect(body).toHaveProperty('repeatIntervalS', 14400);
  });

  it('creates a child policy with matchers', async () => {
    const app = createApp();
    const rootRes = await app.request(req('/', json({})), {}, testBindings);
    const root: unknown = await rootRes.json();
    if (typeof root !== 'object' || root === null || !('id' in root)) throw new Error('bad shape');

    const res = await app.request(
      req(
        '/',
        json({
          parentId: root.id,
          matchers: [{ name: 'severity', operator: '=', value: 'critical' }],
          groupWaitS: 10,
        }),
      ),
      {},
      testBindings,
    );
    expect(res.status).toBe(201);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('parentId', root.id);
    expect(body).toHaveProperty('groupWaitS', 10);
  });

  it('updates a policy', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json({})), {}, testBindings);
    const created: unknown = await createRes.json();
    if (typeof created !== 'object' || created === null || !('id' in created)) throw new Error('bad shape');

    const res = await app.request(
      req(`/${created.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupWaitS: 60 }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('groupWaitS', 60);
  });

  it('deletes a policy', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json({})), {}, testBindings);
    const created: unknown = await createRes.json();
    if (typeof created !== 'object' || created === null || !('id' in created)) throw new Error('bad shape');

    const res = await app.request(req(`/${created.id}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);
  });
});
