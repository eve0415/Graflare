import type { AppEnv } from '../../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../../db';
import { muteTimings, organizations } from '../../db/schema';

import { muteTimingRoutes } from './mute-timings';

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
  app.route('/', muteTimingRoutes);
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

describe('mute-timing routes', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(muteTimings);
    await db.delete(organizations);
    await db.insert(organizations).values({
      id: TEST_ORG_ID,
      name: 'Test Org',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('lists mute timings (empty)', async () => {
    const app = createApp();
    const res = await app.request(req('/'), {}, testBindings);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('creates a mute timing', async () => {
    const app = createApp();
    const res = await app.request(
      req('/', json({ name: 'Weekends', intervals: [{ weekdays: [0, 6], startTime: '00:00', endTime: '24:00' }] })),
      {},
      testBindings,
    );
    expect(res.status).toBe(201);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('name', 'Weekends');
  });

  it('gets a mute timing by id', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json({ name: 'Get Test' })), {}, testBindings);
    const id = readId(await createRes.json());

    const res = await app.request(req(`/${id}`), {}, testBindings);
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('name', 'Get Test');
  });

  it('updates a mute timing', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json({ name: 'Before' })), {}, testBindings);
    const id = readId(await createRes.json());

    const res = await app.request(
      req(`/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'After' }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('name', 'After');
  });

  it('deletes a mute timing', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json({ name: 'Delete Me' })), {}, testBindings);
    const id = readId(await createRes.json());

    const res = await app.request(req(`/${id}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);
  });
});
