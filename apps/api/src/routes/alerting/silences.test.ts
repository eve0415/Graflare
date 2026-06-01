import type { AppEnv } from '../../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../../db';
import { organizations, silences } from '../../db/schema';

import { silenceRoutes } from './silences';

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
  app.route('/', silenceRoutes);
  return app;
};

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const silenceInput = () => ({
  matchers: [{ name: 'alertname', operator: '=', value: 'HighCPU' }],
  startsAt: Date.now(),
  endsAt: Date.now() + 3600000,
  comment: 'Maintenance window',
});

describe('silence routes', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(silences);
    await db.delete(organizations);
    await db.insert(organizations).values({
      id: TEST_ORG_ID,
      name: 'Test Org',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('lists silences (empty)', async () => {
    const app = createApp();
    const res = await app.request(req('/'), {}, testBindings);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('creates a silence', async () => {
    const app = createApp();
    const res = await app.request(req('/', json(silenceInput())), {}, testBindings);
    expect(res.status).toBe(201);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('comment', 'Maintenance window');
  });

  it('rejects silence without matchers', async () => {
    const app = createApp();
    const res = await app.request(req('/', json({ ...silenceInput(), matchers: [] })), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('gets a silence by id', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json(silenceInput())), {}, testBindings);
    const created: unknown = await createRes.json();
    if (typeof created !== 'object' || created === null || !('id' in created)) throw new Error('bad shape');

    const res = await app.request(req(`/${created.id}`), {}, testBindings);
    expect(res.status).toBe(200);
  });

  it('updates a silence', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json(silenceInput())), {}, testBindings);
    const created: unknown = await createRes.json();
    if (typeof created !== 'object' || created === null || !('id' in created)) throw new Error('bad shape');

    const res = await app.request(
      req(`/${created.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: 'Updated' }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('comment', 'Updated');
  });

  it('deletes a silence', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json(silenceInput())), {}, testBindings);
    const created: unknown = await createRes.json();
    if (typeof created !== 'object' || created === null || !('id' in created)) throw new Error('bad shape');

    const res = await app.request(req(`/${created.id}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);
  });
});
