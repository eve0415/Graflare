import type { AppEnv } from '../../index';
import type { ContactPointSettings } from '@graflare/shared/schemas/alerting';

import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
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
    c.set('user', { kind: 'user', email: 'test@example.com', name: 'Test' });
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
const webhookPassword = (settings: ContactPointSettings | undefined): string => {
  if (settings?.type !== 'webhook') throw new Error('expected webhook settings');
  return settings.password;
};

/** Asserts the value is slack/discord settings and returns its webhookUrl (the secret). */
const webhookUrlOf = (settings: ContactPointSettings | undefined): string => {
  if (settings?.type !== 'slack' && settings?.type !== 'discord') throw new Error('expected slack/discord settings');
  return settings.webhookUrl;
};

/** Extracts settings.webhookUrl from a parsed contact-point value (response body or list item). */
const extractWebhookUrl = (value: unknown): string => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('settings' in value) ||
    typeof value.settings !== 'object' ||
    value.settings === null ||
    !('webhookUrl' in value.settings) ||
    typeof value.settings.webhookUrl !== 'string'
  ) {
    throw new Error('bad shape: missing settings.webhookUrl string');
  }
  return value.settings.webhookUrl;
};

/** Returns the settings.webhookUrl from a slack/discord contact-point response body. */
const readWebhookUrl = async (res: Response): Promise<string> => extractWebhookUrl(await res.json());

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

  it('preserves the encrypted webhook password when the form resubmits the redaction sentinel', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', json({ name: 'Hook', type: 'webhook', settings: { type: 'webhook', url: 'https://hooks.example.com/a', password: 'secret' } })),
      {},
      testBindings,
    );
    const id = readId(await createRes.json());

    const db = createDb(env.DB);
    const before = await db.select().from(contactPoints).where(eq(contactPoints.id, id));
    const storedBefore = webhookPassword(before[0]?.settings);

    // Edit form sends the unchanged password back as the '******' sentinel; only the name changes.
    const res = await app.request(
      req(`/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hook Renamed', settings: { type: 'webhook', url: 'https://hooks.example.com/a', password: '******' } }),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);

    const after = await db.select().from(contactPoints).where(eq(contactPoints.id, id));
    const [afterRow] = after;
    expect(afterRow?.name).toBe('Hook Renamed');
    // Read directly via the DB (not the redacting API): the stored ciphertext must be untouched.
    expect(webhookPassword(afterRow?.settings)).toBe(storedBefore);
  });

  it('re-encrypts the webhook password when the form submits a real new value', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', json({ name: 'Hook', type: 'webhook', settings: { type: 'webhook', url: 'https://hooks.example.com/a', password: 'secret' } })),
      {},
      testBindings,
    );
    const id = readId(await createRes.json());

    const db = createDb(env.DB);
    const before = await db.select().from(contactPoints).where(eq(contactPoints.id, id));
    const storedBefore = webhookPassword(before[0]?.settings);

    const res = await app.request(
      req(`/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { type: 'webhook', url: 'https://hooks.example.com/a', password: 'rotated' } }),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);

    const after = await db.select().from(contactPoints).where(eq(contactPoints.id, id));
    const storedAfter = webhookPassword(after[0]?.settings);
    expect(storedAfter).not.toBe(storedBefore);
    expect(storedAfter).not.toBe('rotated');
    expect(storedAfter).not.toBe('******');
  });

  it('encrypts and redacts the slack webhookUrl on create + read paths (GET + list)', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', json({ name: 'Slack', type: 'slack', settings: { type: 'slack', webhookUrl: 'https://hooks.slack.com/services/T/B/x', channel: '#ops' } })),
      {},
      testBindings,
    );
    expect(createRes.status).toBe(201);
    const createBody: unknown = await createRes.json();
    const id = readId(createBody);
    // Create response must already be redacted, never the cleartext URL.
    expect(extractWebhookUrl(createBody)).toBe('******');

    // Stored value must be ciphertext, not cleartext and not the sentinel.
    const db = createDb(env.DB);
    const [stored] = await db.select().from(contactPoints).where(eq(contactPoints.id, id));
    const storedUrl = webhookUrlOf(stored?.settings);
    expect(storedUrl).not.toBe('https://hooks.slack.com/services/T/B/x');
    expect(storedUrl).not.toBe('******');

    // GET by id is redacted.
    const getRes = await app.request(req(`/${id}`), {}, testBindings);
    expect(await readWebhookUrl(getRes)).toBe('******');

    // LIST is redacted.
    const listRes = await app.request(req('/'), {}, testBindings);
    const [firstItem] = await parseJsonArray(listRes);
    expect(extractWebhookUrl(firstItem)).toBe('******');
  });

  it('redacts the discord webhookUrl on the read path', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', json({ name: 'Discord', type: 'discord', settings: { type: 'discord', webhookUrl: 'https://discord.com/api/webhooks/1/secret' } })),
      {},
      testBindings,
    );
    expect(createRes.status).toBe(201);
    const id = readId(await createRes.json());

    const getRes = await app.request(req(`/${id}`), {}, testBindings);
    expect(await readWebhookUrl(getRes)).toBe('******');
  });

  it('preserves the encrypted slack webhookUrl when the form resubmits the sentinel', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', json({ name: 'Slack', type: 'slack', settings: { type: 'slack', webhookUrl: 'https://hooks.slack.com/services/T/B/x' } })),
      {},
      testBindings,
    );
    const id = readId(await createRes.json());

    const db = createDb(env.DB);
    const before = await db.select().from(contactPoints).where(eq(contactPoints.id, id));
    const storedBefore = webhookUrlOf(before[0]?.settings);

    // Edit resends the unchanged URL as the sentinel; only the channel changes.
    const res = await app.request(
      req(`/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { type: 'slack', webhookUrl: '******', channel: '#changed' } }),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);

    const after = await db.select().from(contactPoints).where(eq(contactPoints.id, id));
    // Stored ciphertext untouched — sentinel must NOT be encrypted.
    expect(webhookUrlOf(after[0]?.settings)).toBe(storedBefore);
  });

  it('re-encrypts the discord webhookUrl when the form submits a real new value', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', json({ name: 'Discord', type: 'discord', settings: { type: 'discord', webhookUrl: 'https://discord.com/api/webhooks/1/old' } })),
      {},
      testBindings,
    );
    const id = readId(await createRes.json());

    const db = createDb(env.DB);
    const before = await db.select().from(contactPoints).where(eq(contactPoints.id, id));
    const storedBefore = webhookUrlOf(before[0]?.settings);

    const res = await app.request(
      req(`/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { type: 'discord', webhookUrl: 'https://discord.com/api/webhooks/1/new' } }),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);

    const after = await db.select().from(contactPoints).where(eq(contactPoints.id, id));
    const storedAfter = webhookUrlOf(after[0]?.settings);
    expect(storedAfter).not.toBe(storedBefore);
    expect(storedAfter).not.toBe('https://discord.com/api/webhooks/1/new');
    expect(storedAfter).not.toBe('******');
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
