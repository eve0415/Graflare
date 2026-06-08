import type { AppEnv } from '../../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { datasourceTestRoutes } from './datasources-test';

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
    c.set('orgId', 'org-test-123');
    c.set('user', { email: 'test@example.com', name: 'Test' });
    await next();
  });
  app.route('/', datasourceTestRoutes);
  return app;
};

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

describe('datasource test route validation', () => {
  it('rejects a malformed datasource id with 400', async () => {
    const res = await createApp().request(req('/not-a-uuid/test', { method: 'POST' }), {}, testBindings);
    expect(res.status).toBe(400);
  });
});
