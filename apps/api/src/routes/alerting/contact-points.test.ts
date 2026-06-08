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
  ...env,
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

const readId = (value: unknown): string => {
  if (typeof value !== 'object' || value === null || !('id' in value) || typeof value.id !== 'string') {
    throw new Error('bad shape: missing string id');
  }
  return value.id;
};

/** Asserts the value is a webhook settings object and returns its password. */
const webhookPassword = (
  settings: { type: 'email'; addresses: string[] } | { type: 'webhook'; url: string; method: 'POST' | 'PUT'; username: string; password: string } | undefined,
): string => {
  if (settings?.type !== 'webhook') throw new Error('expected webhook settings');
  return settings.password;
};

/** Returns the password field from a webhook contact-point response body. */
const readWebhookPassword = async (res: Response): Promise<string> => {
  const body: unknown = await res.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('settings' in body) ||
    typeof body.settings !== 'object' ||
    body.settings === null ||
    !('password' in body.settings) ||
    typeof body.settings.password !== 'string'
  ) {
    throw new Error('bad response shape: missing settings.password string');
  }
  return body.settings.password;
};

const parseJsonArray = async (res: Response): Promise<unknown[]> => {
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error('expected array');
  return body.map((item): unknown => item);
};

/** Returns the settings.password from the first item in an array response. */
const readFirstWebhookPassword = async (res: Response): Promise<string> => {
  const items = await parseJsonArray(res);
  const [first] = items;
  if (
    typeof first !== 'object' ||
    first === null ||
    !('settings' in first) ||
    typeof first.settings !== 'object' ||
    first.settings === null ||
    !('password' in first.settings) ||
    typeof first.settings.password !== 'string'
  ) {
    throw new Error('bad array item shape: missing settings.password string');
  }
  return first.settings.password;
};

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
      req(
        '/',
        json({
          name: 'Webhook',
          type: 'webhook',
          settings: { type: 'webhook', url: 'https://hooks.example.com/alert', password: 'my-secret' },
        }),
      ),
      {},
      testBindings,
    );
    expect(res.status).toBe(201);
    const password = await readWebhookPassword(res);
    expect(password).toBe('******');

    const db = createDb(env.DB);
    const rows = await db.select().from(contactPoints);
    const [row] = rows;
    const storedPassword = webhookPassword(row?.settings);
    expect(storedPassword).not.toBe('my-secret');
    expect(storedPassword).not.toBe('******');
  });

  it('lists contact points with redacted credentials', async () => {
    const app = createApp();
    await app.request(
      req(
        '/',
        json({
          name: 'Webhook',
          type: 'webhook',
          settings: { type: 'webhook', url: 'https://hooks.example.com/alert', password: 'secret' },
        }),
      ),
      {},
      testBindings,
    );

    const res = await app.request(req('/'), {}, testBindings);
    expect(res.status).toBe(200);
    const password = await readFirstWebhookPassword(res);
    expect(password).toBe('******');
  });

  it('gets a contact point by id', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', json({ name: 'Get Test', type: 'email', settings: { type: 'email', addresses: ['a@b.com'] } })),
      {},
      testBindings,
    );
    const id = readId(await createRes.json());

    const res = await app.request(req(`/${id}`), {}, testBindings);
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

  it('deletes a contact point', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', json({ name: 'Delete Me', type: 'email', settings: { type: 'email', addresses: ['a@b.com'] } })),
      {},
      testBindings,
    );
    const id = readId(await createRes.json());

    const res = await app.request(req(`/${id}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);
  });
});
