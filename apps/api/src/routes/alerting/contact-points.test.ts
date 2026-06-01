import type { AppEnv } from '../../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../../db';
import { contactPoints, organizations } from '../../db/schema';

import { contactPointRoutes } from './contact-points';

const TEST_ORG_ID = 'org-test-123';
const TEST_ENCRYPTION_KEY = btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32))));

const testBindings: AppEnv['Bindings'] = {
  DB: env.DB,
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
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
  app.route('/', contactPointRoutes);
  return app;
};

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('contact-point routes', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(contactPoints);
    await db.delete(organizations);
    await db.insert(organizations).values({
      id: TEST_ORG_ID,
      name: 'Test Org',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('creates an email contact point', async () => {
    const app = createApp();
    const res = await app.request(
      req('/', json({ name: 'Email', type: 'email', settings: { type: 'email', addresses: ['ops@example.com'] } })),
      {},
      testBindings,
    );
    expect(res.status).toBe(201);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('name', 'Email');
    expect(body).toHaveProperty('type', 'email');
  });

  it('creates a webhook contact point with encrypted password', async () => {
    const app = createApp();
    const res = await app.request(
      req('/', json({
        name: 'Webhook',
        type: 'webhook',
        settings: { type: 'webhook', url: 'https://hooks.example.com/alert', password: 'my-secret' },
      })),
      {},
      testBindings,
    );
    expect(res.status).toBe(201);
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null || !('settings' in body)) throw new Error('bad shape');
    const settings = body.settings;
    if (typeof settings !== 'object' || settings === null) throw new Error('bad settings');
    expect(settings).toHaveProperty('password', '******');

    const db = createDb(env.DB);
    const rows = await db.select().from(contactPoints);
    const [row] = rows;
    const dbSettings = row?.settings;
    if (typeof dbSettings !== 'object' || dbSettings === null) throw new Error('bad db settings');
    expect(dbSettings['password']).not.toBe('my-secret');
    expect(dbSettings['password']).not.toBe('******');
  });

  it('lists contact points with redacted credentials', async () => {
    const app = createApp();
    await app.request(
      req('/', json({
        name: 'Webhook',
        type: 'webhook',
        settings: { type: 'webhook', url: 'https://hooks.example.com/alert', password: 'secret' },
      })),
      {},
      testBindings,
    );

    const res = await app.request(req('/'), {}, testBindings);
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    if (!Array.isArray(body) || body.length === 0) throw new Error('expected array');
    const settings = body[0].settings;
    expect(settings.password).toBe('******');
  });

  it('gets a contact point by id', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', json({ name: 'Get Test', type: 'email', settings: { type: 'email', addresses: ['a@b.com'] } })),
      {},
      testBindings,
    );
    const created: unknown = await createRes.json();
    if (typeof created !== 'object' || created === null || !('id' in created)) throw new Error('bad shape');

    const res = await app.request(req(`/${created.id}`), {}, testBindings);
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('name', 'Get Test');
  });

  it('updates a contact point', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', json({ name: 'Before', type: 'email', settings: { type: 'email', addresses: ['a@b.com'] } })),
      {},
      testBindings,
    );
    const created: unknown = await createRes.json();
    if (typeof created !== 'object' || created === null || !('id' in created)) throw new Error('bad shape');

    const res = await app.request(
      req(`/${created.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'After' }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('name', 'After');
  });

  it('deletes a contact point', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', json({ name: 'Delete Me', type: 'email', settings: { type: 'email', addresses: ['a@b.com'] } })),
      {},
      testBindings,
    );
    const created: unknown = await createRes.json();
    if (typeof created !== 'object' || created === null || !('id' in created)) throw new Error('bad shape');

    const res = await app.request(req(`/${created.id}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);
  });
});
