import type { AlertRuleDO } from '../../alerting/alert-rule-do';
import type { AppEnv } from '../../index';

import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/durable-sqlite';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { config as doConfigTable, instances as doInstances } from '../../alerting/do-schema';
import { createDb } from '../../db';
import { alertRuleGroups, alertRules, folders, organizations } from '../../db/schema';

import { alertRuleGroupRoutes } from './alert-rule-groups';

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
  app.route('/', alertRuleGroupRoutes);
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

// The rule_config the DO holds for a rule, parsed — null when the DO has none.
const readRuleDoConfig = async (ruleId: string): Promise<unknown> => {
  const stub = env.ALERT_RULE.getByName(ruleId);
  return runInDurableObject<AlertRuleDO, unknown>(stub, (_instance, state) => {
    const doDb = drizzle(state.storage, { schema: { instances: doInstances, config: doConfigTable } });
    const rows = doDb.select().from(doConfigTable).all();
    const value = rows[0]?.value;
    if (value === undefined) return null;
    const parsed: unknown = JSON.parse(value);
    return parsed;
  });
};

const seedMemberRule = async (groupId: string): Promise<string> => {
  const db = createDb(env.DB);
  const ruleId = crypto.randomUUID();
  await db.insert(alertRules).values({
    id: ruleId,
    orgId: TEST_ORG_ID,
    groupId,
    title: 'Member rule',
    condition: { refId: 'A', reducer: 'last', operator: 'gt', threshold: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return ruleId;
};

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
    const id = readId(await createRes.json());

    const res = await app.request(req(`/${id}`), {}, testBindings);
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
    const id = readId(await createRes.json());

    const res = await app.request(
      req(`/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'after' }) }),
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
    const id = readId(await createRes.json());

    const res = await app.request(req(`/${id}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);

    const getRes = await app.request(req(`/${id}`), {}, testBindings);
    expect(getRes.status).toBe(404);
  });

  // Regression: deleting a group cascade-deletes its member rules in D1, but
  // their DOs used to keep their alarms — evaluating deleted rules forever.
  it('stops member rule DOs when the group is deleted', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json({ name: 'doomed-group' })), {}, testBindings);
    const groupId = readId(await createRes.json());
    const ruleId = await seedMemberRule(groupId);

    // Seed the member's DO config the way a running rule would have it.
    await app.request(
      req(`/${groupId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evalIntervalS: 120 }) }),
      {},
      testBindings,
    );
    expect(await readRuleDoConfig(ruleId)).not.toBeNull();

    const res = await app.request(req(`/${groupId}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);

    expect(await readRuleDoConfig(ruleId)).toBeNull();
  });

  // Regression: the HTTP group update used to write D1 only — running member
  // DOs kept evaluating on the old interval until each rule was next touched.
  it('propagates an eval-interval change to member rule DOs', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json({ name: 'interval-group' })), {}, testBindings);
    const groupId = readId(await createRes.json());
    const ruleId = await seedMemberRule(groupId);

    const res = await app.request(
      req(`/${groupId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evalIntervalS: 120 }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);

    const config = await readRuleDoConfig(ruleId);
    expect(config).toMatchObject({ ruleId, evalIntervalS: 120 });
  });
});
