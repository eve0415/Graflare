import type { AppEnv } from '../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { proxyRoutes } from './proxy';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
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
    c.set('orgId', 'org-test-123');
    c.set('user', { email: 'test@example.com', name: 'Test' });
    await next();
  });
  app.route('/', proxyRoutes);
  return app;
};

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

// Validation runs as middleware before getClient/DB, so these 400s never touch
// the database or an upstream.
const form = (fields: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
});

describe('proxy route validation', () => {
  it('rejects a malformed datasource id on instant query (400)', async () => {
    const res = await createApp().request(req('/not-a-uuid/proxy/api/v1/query', form({ query: 'up' })), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('rejects an instant query with no query field (400)', async () => {
    const res = await createApp().request(req(`/${UUID}/proxy/api/v1/query`, form({})), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('rejects an instant query with an empty query (400)', async () => {
    const res = await createApp().request(req(`/${UUID}/proxy/api/v1/query`, form({ query: '' })), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('rejects a range query missing start (400)', async () => {
    const res = await createApp().request(req(`/${UUID}/proxy/api/v1/query_range`, form({ query: 'up', end: '1716858000', step: '15s' })), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('rejects labels for a malformed datasource id (400)', async () => {
    const res = await createApp().request(req('/not-a-uuid/proxy/api/v1/labels'), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('rejects label values for a malformed datasource id (400)', async () => {
    const res = await createApp().request(req('/not-a-uuid/proxy/api/v1/label/__name__/values'), {}, testBindings);
    expect(res.status).toBe(400);
  });
});
