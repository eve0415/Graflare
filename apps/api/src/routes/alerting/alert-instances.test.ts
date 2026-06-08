import type { AppEnv } from '../../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../../db';
import { alertInstances, alertRuleGroups, alertRules, organizations } from '../../db/schema';

import { alertInstanceRoutes } from './alert-instances';

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
    c.set('user', { email: 'test@example.com', name: 'Test' });
    await next();
  });
  app.route('/', alertInstanceRoutes);
  return app;
};

const req = (path: string) => new Request(`http://localhost${path}`);

const readArray = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('expected array');
  return value;
};

describe('alert-instance routes', () => {
  let testRuleId: string;

  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(alertInstances);
    await db.delete(alertRules);
    await db.delete(alertRuleGroups);
    await db.delete(organizations);
    await db.insert(organizations).values({
      id: TEST_ORG_ID,
      name: 'Test Org',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const groupId = crypto.randomUUID();
    await db.insert(alertRuleGroups).values({
      id: groupId,
      orgId: TEST_ORG_ID,
      name: 'test-group',
      evalIntervalS: 60,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    testRuleId = crypto.randomUUID();
    await db.insert(alertRules).values({
      id: testRuleId,
      orgId: TEST_ORG_ID,
      groupId,
      title: 'Test Rule',
      queries: [],
      condition: { refId: 'A', reducer: 'last', operator: 'gt', threshold: 80 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('lists instances (empty)', async () => {
    const app = createApp();
    const res = await app.request(req('/'), {}, testBindings);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('lists instances with seed data', async () => {
    const db = createDb(env.DB);
    await db.insert(alertInstances).values({
      id: crypto.randomUUID(),
      orgId: TEST_ORG_ID,
      ruleId: testRuleId,
      labelsHash: 'abc123',
      labels: { job: 'api' },
      state: 'Firing',
      value: '95',
      lastEvalAt: new Date(),
    });

    const app = createApp();
    const res = await app.request(req('/'), {}, testBindings);
    expect(res.status).toBe(200);
    const body = readArray(await res.json());
    expect(body).toHaveLength(1);
    expect(body[0]).toHaveProperty('state', 'Firing');
  });

  it('filters by ruleId', async () => {
    const db = createDb(env.DB);
    await db.insert(alertInstances).values({
      id: crypto.randomUUID(),
      orgId: TEST_ORG_ID,
      ruleId: testRuleId,
      labelsHash: 'abc',
      state: 'Firing',
      value: '90',
      lastEvalAt: new Date(),
    });

    const app = createApp();
    const res = await app.request(req(`/?ruleId=${testRuleId}`), {}, testBindings);
    expect(res.status).toBe(200);
    const body = readArray(await res.json());
    expect(body).toHaveLength(1);

    const emptyRes = await app.request(req(`/?ruleId=${crypto.randomUUID()}`), {}, testBindings);
    expect(await emptyRes.json()).toEqual([]);
  });

  it('filters by state', async () => {
    const db = createDb(env.DB);
    await db.insert(alertInstances).values({
      id: crypto.randomUUID(),
      orgId: TEST_ORG_ID,
      ruleId: testRuleId,
      labelsHash: 'abc',
      state: 'Normal',
      value: '10',
      lastEvalAt: new Date(),
    });

    const app = createApp();
    const firingRes = await app.request(req('/?state=Firing'), {}, testBindings);
    expect(await firingRes.json()).toEqual([]);

    const normalRes = await app.request(req('/?state=Normal'), {}, testBindings);
    const body = readArray(await normalRes.json());
    expect(body).toHaveLength(1);
  });
});
